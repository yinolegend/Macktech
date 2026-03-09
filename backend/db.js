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
db.serialize(() => {
  db.run(`
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
  // Users table for authentication. Passwords are stored as bcrypt hashes.
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      display_name TEXT,
      external INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: if the `external` column is missing (older DB), add it.
  db.get("PRAGMA table_info('users')", (err, row) => {
    // If querying table_info returns no rows, skip — table might be missing temporarily.
    if (err || !row) return;
    db.all("PRAGMA table_info('users')", (e, cols) => {
      if (e || !cols) return;
      const hasExternal = cols.some(c => c.name === 'external');
      if (!hasExternal) {
        try {
          db.run("ALTER TABLE users ADD COLUMN external INTEGER DEFAULT 0");
        } catch (ex) {
          // ignore; best-effort migration
        }
      }
    });
  });

  // Ticket events table: records actions/comments on tickets
  db.run(`
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      actor TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: add computer & location columns to tickets if missing
  db.all("PRAGMA table_info('tickets')", (err, cols) => {
    if (err || !cols) return;
    const names = cols.map(c => c.name);
    if (!names.includes('computer')) {
      try { db.run("ALTER TABLE tickets ADD COLUMN computer TEXT"); } catch (e) {}
    }
    if (!names.includes('location')) {
      try { db.run("ALTER TABLE tickets ADD COLUMN location TEXT"); } catch (e) {}
    }
    if (!names.includes('category')) {
      try { db.run("ALTER TABLE tickets ADD COLUMN category TEXT"); } catch (e) {}
    }
    if (!names.includes('hold_reason')) {
      try { db.run("ALTER TABLE tickets ADD COLUMN hold_reason TEXT"); } catch (e) {}
    }
    if (!names.includes('due_date')) {
      try { db.run("ALTER TABLE tickets ADD COLUMN due_date TEXT"); } catch (e) {}
    }
    if (!names.includes('assigned_to')) {
      try { db.run("ALTER TABLE tickets ADD COLUMN assigned_to INTEGER"); } catch (e) {}
    }
    if (!names.includes('assigned_at')) {
      try { db.run("ALTER TABLE tickets ADD COLUMN assigned_at TEXT"); } catch (e) {}
    }
  });
});

// Expose a small set of helpers used by the API layer.
module.exports = {
  // Create a ticket and return the inserted row id.
  createTicket: async ({ title, description, requester }) => {
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
    return await all(`SELECT * FROM tickets ORDER BY created_at DESC`);
  },

  // Get a single ticket by id.
  getTicket: async (id) => {
    return await get(`SELECT * FROM tickets WHERE id = ?`, [id]);
  },

  // Update allowed fields on a ticket. Only title/description/requester/status
  // are accepted in this minimal API. `updated_at` is set automatically.
  updateTicket: async (id, fields) => {
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
    const id = await run(
      `INSERT INTO ticket_events (ticket_id, type, actor, message, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [ticket_id, type, actor, message]
    );
    return id;
  },
  // Get events for a ticket, newest first
  getTicketEvents: async (ticket_id) => {
    return await all(`SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at DESC`, [ticket_id]);
  },
  // Create a new user. `password_hash` should be a bcrypt hash.
  createUser: async ({ username, password_hash, display_name }) => {
    // Some older DBs may be missing the `external` column. Detect table columns
    // at runtime and build an INSERT that only references existing columns.
    const cols = await all("PRAGMA table_info('users')");
    const names = cols.map(c => c.name);
    const fields = ['username', 'password_hash', 'display_name'];
    const vals = [username, password_hash, display_name];
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
    return await get(`SELECT * FROM users WHERE username = ?`, [username]);
  },
  // Find user by id
  getUserById: async (id) => {
    return await get(`SELECT id, username, display_name, external, created_at FROM users WHERE id = ?`, [id]);
  }
  ,
  // Return all users (id, username, display_name)
  allUsers: async () => {
    return await all(`SELECT id, username, display_name FROM users ORDER BY username`);
  }
};
