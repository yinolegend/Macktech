// Lightweight SQLite helper used by the REST API.
// The DB file is `data/app.db` (created automatically when the server runs).
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

// Ensure the parent directory for the DB exists so SQLite can create the file.
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Open a persistent SQLite connection. sqlite3 will create the file if it doesn't exist.
const db = new sqlite3.Database(DB_PATH);

// Helper that wraps `db.run` in a Promise and resolves with `lastID`.
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

// Helper that wraps `db.all` in a Promise and returns rows.
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Helper that wraps `db.get` in a Promise and returns a single row.
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// Initialize DB schema. This is idempotent (`CREATE TABLE IF NOT EXISTS`).
const ready = (async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      requester TEXT,
      computer TEXT,
      location TEXT,
      category TEXT,
      hold_reason TEXT,
      due_date TEXT,
      assigned_to INTEGER,
      assigned_at TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      display_name TEXT,
      role TEXT DEFAULT 'User',
      external INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  let userColumns = [];
  try {
    userColumns = await all("PRAGMA table_info('users')");
  } catch (error) {
    userColumns = [];
  }

  const userColumnNames = userColumns.map((column) => column.name);
  if (!userColumnNames.includes('external')) {
    try {
      await run("ALTER TABLE users ADD COLUMN external INTEGER DEFAULT 0");
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('role')) {
    try {
      await run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'User'");
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  try {
    userColumns = await all("PRAGMA table_info('users')");
  } catch (error) {
    userColumns = [];
  }

  if (userColumns.some((column) => column.name === 'role')) {
    try {
      await run(
        "UPDATE users SET role = CASE WHEN lower(username) = 'admin' THEN 'Admin' ELSE COALESCE(NULLIF(role, ''), 'User') END WHERE role IS NULL OR role = ''"
      );
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  await run(`
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      actor TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  let ticketColumns = [];
  try {
    ticketColumns = await all("PRAGMA table_info('tickets')");
  } catch (error) {
    ticketColumns = [];
  }

  const ticketColumnNames = ticketColumns.map((column) => column.name);
  const ticketMigrations = [
    ['computer', 'TEXT'],
    ['location', 'TEXT'],
    ['category', 'TEXT'],
    ['hold_reason', 'TEXT'],
    ['due_date', 'TEXT'],
    ['assigned_to', 'INTEGER'],
    ['assigned_at', 'TEXT'],
  ];

  for (const [columnName, columnType] of ticketMigrations) {
    if (ticketColumnNames.includes(columnName)) continue;
    try {
      await run(`ALTER TABLE tickets ADD COLUMN ${columnName} ${columnType}`);
    } catch (error) {
      // ignore; best-effort migration
    }
  }
})();

// Expose a small set of helpers used by the API layer.
module.exports = {
  ready,
  // Create a ticket and return the inserted row id.
  createTicket: async ({ title, description, requester }) => {
    await ready;
    const computer = arguments[0].computer || null;
    const location = arguments[0].location || null;
    const category = arguments[0].category || null;
    const hold_reason = arguments[0].hold_reason || null;
    const due_date = arguments[0].due_date || null;
    const assigned_to = arguments[0].assigned_to || null;
    const assigned_at = arguments[0].assigned_at || null;
    const id = await run(
      `INSERT INTO tickets (title, description, requester, computer, location, category, hold_reason, due_date, assigned_to, assigned_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))`,
      [title, description, requester, computer, location, category, hold_reason, due_date, assigned_to, assigned_at]
    );
    return id;
  },

  // Return all tickets ordered by creation time (newest first).
  allTickets: async () => {
    await ready;
    return await all(`SELECT * FROM tickets ORDER BY created_at DESC`);
  },

  // Get a single ticket by id.
  getTicket: async (id) => {
    await ready;
    return await get(`SELECT * FROM tickets WHERE id = ?`, [id]);
  },

  // Update allowed fields on a ticket. Only title/description/requester/status
  // are accepted in this minimal API. `updated_at` is set automatically.
  updateTicket: async (id, fields) => {
    await ready;
    const up = [];
    const vals = [];
    for (const k of ['title', 'description', 'requester', 'status', 'category', 'hold_reason', 'due_date', 'assigned_to', 'assigned_at']) {
      if (fields[k] !== undefined) {
        up.push(`${k} = ?`);
        vals.push(fields[k]);
      }
    }
    if (up.length === 0) return;
    vals.push(id);
    await run(`UPDATE tickets SET ${up.join(', ')}, updated_at = datetime('now') WHERE id = ?`, vals);
  },
  // Record an event/comment on a ticket
  createTicketEvent: async ({ ticket_id, type, actor, message }) => {
    await ready;
    const id = await run(
      `INSERT INTO ticket_events (ticket_id, type, actor, message, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [ticket_id, type, actor, message]
    );
    return id;
  },
  // Get events for a ticket, newest first
  getTicketEvents: async (ticket_id) => {
    await ready;
    return await all(`SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at DESC`, [ticket_id]);
  },
  // Create a new user. `password_hash` should be a bcrypt hash.
  createUser: async ({ username, password_hash, display_name, role }) => {
    await ready;
    // Some older DBs may be missing the `external` column. Detect table columns
    // at runtime and build an INSERT that only references existing columns.
    const cols = await all("PRAGMA table_info('users')");
    const names = cols.map(c => c.name);
    const fields = ['username', 'password_hash', 'display_name'];
    const vals = [username, password_hash, display_name];
    if (names.includes('role')) {
      fields.push('role');
      vals.push(role || 'User');
    }
    if (names.includes('external')) {
      fields.push('external');
      vals.push(arguments[0].external ? 1 : 0);
    }
    fields.push('created_at');
    vals.push(new Date().toISOString().replace('T', ' ').replace('Z', ''));

    const placeholders = fields.map(_ => '?').join(', ');
    const sql = `INSERT INTO users (${fields.join(', ')}) VALUES (${placeholders})`;
    const id = await run(sql, vals);
    return id;
  },
  // Find user by username
  getUserByUsername: async (username) => {
    await ready;
    return await get(`SELECT * FROM users WHERE username = ?`, [username]);
  },
  // Find user by id
  getUserById: async (id) => {
    await ready;
    return await get(`SELECT id, username, display_name, role, external, created_at FROM users WHERE id = ?`, [id]);
  }
  ,
  // Return all users (id, username, display_name)
  allUsers: async () => {
    await ready;
    return await all(`SELECT id, username, display_name, role FROM users ORDER BY username`);
  }
};
