// Lightweight SQLite helper used by the REST API.
// The DB file is `data/app.db` (created automatically when the server runs).
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const {
  canonicalizeRole,
  normalizeModuleAccess,
  normalizePermissionAccess,
  buildAccessProfile,
  setRoleTemplates,
  listDefaultRoles,
  listRoles,
} = require('../config/access');

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

function normalizeText(value, fallback = '') {
  const normalized = String(value == null ? '' : value).trim();
  return normalized || fallback;
}

function normalizeAccountStatus(value) {
  return String(value || '').trim().toLowerCase() === 'disabled' ? 'disabled' : 'active';
}

function hasText(value) {
  return String(value == null ? '' : value).trim() !== '';
}

function buildDeletedUsername(baseUsername, userId, attempt = 0) {
  const normalizedBase = String(baseUsername || `user${userId}`)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]+/g, '_')
    .slice(0, 40) || `user${userId}`;
  const stamp = `${Date.now()}${attempt > 0 ? `_${attempt}` : ''}`;
  return `deleted_${normalizedBase}_${userId}_${stamp}`;
}

function toDbTimestamp(date = new Date()) {
  return new Date(date).toISOString().replace('T', ' ').replace('Z', '');
}

function serializeModuleAccess(moduleAccess) {
  if (moduleAccess == null || moduleAccess === '') return null;
  const normalized = normalizeModuleAccess(moduleAccess);
  return JSON.stringify(normalized);
}

function serializePermissionAccess(permissionAccess) {
  if (permissionAccess == null || permissionAccess === '') return null;
  const normalized = normalizePermissionAccess(permissionAccess);
  return JSON.stringify(normalized);
}

function formatRoleTemplateRow(row) {
  if (!row) return null;
  const key = canonicalizeRole(row.role_key || row.key);

  return {
    key,
    label: normalizeText(row.label, key),
    description: normalizeText(row.description),
    modules: normalizeModuleAccess(row.modules),
    permissions: normalizePermissionAccess(row.permissions),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function listRoleTemplateRows() {
  const rows = await all(`SELECT role_key, label, description, modules, permissions, created_at, updated_at FROM role_templates ORDER BY role_key ASC`);
  return rows.map((row) => formatRoleTemplateRow(row)).filter(Boolean);
}

async function getRoleTemplateByKey(roleKey) {
  const key = canonicalizeRole(roleKey);
  const row = await get(`SELECT role_key, label, description, modules, permissions, created_at, updated_at FROM role_templates WHERE role_key = ?`, [key]);
  return formatRoleTemplateRow(row);
}

async function syncRoleTemplatesFromDb() {
  const templates = await listRoleTemplateRows();
  setRoleTemplates(templates);
  return listRoles();
}

function formatUserRecord(row, options = {}) {
  if (!row) return null;

  const explicitModuleAccessProvided = row.module_access != null && String(row.module_access).trim() !== '';
  const explicitPermissionAccessProvided = row.permission_access != null && String(row.permission_access).trim() !== '';
  const deletedAt = hasText(row.deleted_at) ? String(row.deleted_at).trim() : null;
  const baseUser = {
    id: row.id,
    username: row.username,
    display_name: normalizeText(row.display_name, row.username || ''),
    role: canonicalizeRole(row.role),
    external: Number(row.external) ? 1 : 0,
    department: normalizeText(row.department),
    account_status: normalizeAccountStatus(row.account_status),
    module_access: normalizeModuleAccess(row.module_access),
    module_access_provided: explicitModuleAccessProvided,
    permission_access: normalizePermissionAccess(row.permission_access),
    permission_access_provided: explicitPermissionAccessProvided,
    deleted_at: deletedAt,
    deleted_by: row.deleted_by == null ? null : Number(row.deleted_by),
    deleted_reason: normalizeText(row.deleted_reason),
    original_username: normalizeText(row.original_username),
    is_deleted: Boolean(deletedAt),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };

  const access = buildAccessProfile(baseUser);
  const formatted = {
    ...baseUser,
    role: access.role,
    role_label: access.roleLabel,
    role_description: access.roleDescription,
    modules: access.modules,
    permissions: access.permissions,
    landing_route: access.landingRoute,
  };

  if (options.includeSecret) {
    formatted.password_hash = row.password_hash || null;
  }

  return formatted;
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

  if (!userColumnNames.includes('department')) {
    try {
      await run("ALTER TABLE users ADD COLUMN department TEXT DEFAULT ''");
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('account_status')) {
    try {
      await run("ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active'");
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('module_access')) {
    try {
      await run('ALTER TABLE users ADD COLUMN module_access TEXT');
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('permission_access')) {
    try {
      await run('ALTER TABLE users ADD COLUMN permission_access TEXT');
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('updated_at')) {
    try {
      await run('ALTER TABLE users ADD COLUMN updated_at TEXT');
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('deleted_at')) {
    try {
      await run('ALTER TABLE users ADD COLUMN deleted_at TEXT');
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('deleted_by')) {
    try {
      await run('ALTER TABLE users ADD COLUMN deleted_by INTEGER');
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('deleted_reason')) {
    try {
      await run('ALTER TABLE users ADD COLUMN deleted_reason TEXT');
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (!userColumnNames.includes('original_username')) {
    try {
      await run('ALTER TABLE users ADD COLUMN original_username TEXT');
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
        "UPDATE users SET role = CASE WHEN lower(username) = 'admin' THEN 'Admin' ELSE COALESCE(NULLIF(role, ''), 'Viewer') END WHERE role IS NULL OR role = ''"
      );
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (userColumns.some((column) => column.name === 'account_status')) {
    try {
      await run("UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR trim(account_status) = ''");
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  if (userColumns.some((column) => column.name === 'updated_at')) {
    try {
      await run("UPDATE users SET updated_at = COALESCE(updated_at, created_at, datetime('now'))");
    } catch (error) {
      // ignore; best-effort migration
    }
  }

  await run(`
    CREATE TABLE IF NOT EXISTS role_templates (
      role_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      modules TEXT NOT NULL,
      permissions TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )
  `);

  try {
    await run("UPDATE role_templates SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL OR trim(updated_at) = ''");
  } catch (error) {
    // ignore; best-effort migration
  }

  try {
    const roleTemplateCount = await get('SELECT COUNT(*) AS total FROM role_templates');
    if (!roleTemplateCount || Number(roleTemplateCount.total || 0) <= 0) {
      const defaults = listDefaultRoles();
      for (const role of defaults) {
        await run(
          `INSERT OR REPLACE INTO role_templates (role_key, label, description, modules, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            role.key,
            role.label,
            role.description || '',
            JSON.stringify(normalizeModuleAccess(role.modules)),
            JSON.stringify(normalizePermissionAccess(role.permissions)),
            toDbTimestamp(),
            toDbTimestamp(),
          ]
        );
      }
    }

    await syncRoleTemplatesFromDb();
  } catch (error) {
    console.error('role template bootstrap', error && error.message ? error.message : error);
    setRoleTemplates(listDefaultRoles());
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
  createUser: async ({ username, password_hash, display_name, role, external, department, account_status, module_access, permission_access }) => {
    await ready;
    const cols = await all("PRAGMA table_info('users')");
    const names = cols.map((column) => column.name);
    const fields = ['username', 'password_hash', 'display_name'];
    const vals = [normalizeText(username), password_hash || null, normalizeText(display_name, normalizeText(username))];
    if (names.includes('role')) {
      fields.push('role');
      vals.push(canonicalizeRole(role));
    }
    if (names.includes('external')) {
      fields.push('external');
      vals.push(external ? 1 : 0);
    }
    if (names.includes('department')) {
      fields.push('department');
      vals.push(normalizeText(department));
    }
    if (names.includes('account_status')) {
      fields.push('account_status');
      vals.push(normalizeAccountStatus(account_status));
    }
    if (names.includes('module_access')) {
      fields.push('module_access');
      vals.push(serializeModuleAccess(module_access));
    }
    if (names.includes('permission_access')) {
      fields.push('permission_access');
      vals.push(permission_access === null ? null : serializePermissionAccess(permission_access));
    }
    if (names.includes('updated_at')) {
      fields.push('updated_at');
      vals.push(toDbTimestamp());
    }
    fields.push('created_at');
    vals.push(toDbTimestamp());

    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO users (${fields.join(', ')}) VALUES (${placeholders})`;
    const id = await run(sql, vals);
    return id;
  },
  // Find user by username
  getUserByUsername: async (username) => {
    await ready;
    const row = await get(
      `SELECT * FROM users WHERE lower(username) = lower(?) AND (deleted_at IS NULL OR trim(deleted_at) = '') ORDER BY id ASC LIMIT 1`,
      [normalizeText(username)]
    );
    return formatUserRecord(row, { includeSecret: true });
  },
  // Find user by id
  getUserById: async (id) => {
    await ready;
    const row = await get(`SELECT * FROM users WHERE id = ? AND (deleted_at IS NULL OR trim(deleted_at) = '')`, [id]);
    return formatUserRecord(row);
  },
  getUserRecordById: async (id) => {
    await ready;
    const row = await get(`SELECT * FROM users WHERE id = ? AND (deleted_at IS NULL OR trim(deleted_at) = '')`, [id]);
    return formatUserRecord(row, { includeSecret: true });
  },
  updateUser: async (id, fields) => {
    await ready;
    const columns = await all("PRAGMA table_info('users')");
    const available = new Set(columns.map((column) => column.name));
    const updates = [];
    const values = [];

    const mappings = [
      ['username', normalizeText(fields.username)],
      ['display_name', normalizeText(fields.display_name, fields.username ? normalizeText(fields.username) : '')],
      ['role', fields.role ? canonicalizeRole(fields.role) : undefined],
      ['external', fields.external === undefined ? undefined : (fields.external ? 1 : 0)],
      ['department', fields.department === undefined ? undefined : normalizeText(fields.department)],
      ['account_status', fields.account_status === undefined ? undefined : normalizeAccountStatus(fields.account_status)],
      ['module_access', fields.module_access === undefined ? undefined : serializeModuleAccess(fields.module_access)],
      ['permission_access', fields.permission_access === undefined
        ? undefined
        : (fields.permission_access === null ? null : serializePermissionAccess(fields.permission_access))],
    ];

    for (const [column, value] of mappings) {
      if (!available.has(column) || value === undefined) continue;
      updates.push(`${column} = ?`);
      values.push(value);
    }

    if (available.has('updated_at')) {
      updates.push('updated_at = ?');
      values.push(toDbTimestamp());
    }

    if (!updates.length) return;

    values.push(id);
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  },
  setUserPassword: async (id, password_hash) => {
    await ready;
    const columns = await all("PRAGMA table_info('users')");
    const available = new Set(columns.map((column) => column.name));
    const updates = ['password_hash = ?'];
    const values = [password_hash || null];
    if (available.has('updated_at')) {
      updates.push('updated_at = ?');
      values.push(toDbTimestamp());
    }
    values.push(id);
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  },
  softDeleteUser: async (id, actorId, reason) => {
    await ready;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error('invalid user id');
    }

    const existing = await get(`SELECT * FROM users WHERE id = ? AND (deleted_at IS NULL OR trim(deleted_at) = '')`, [userId]);
    if (!existing) {
      throw new Error('user not found');
    }

    const columns = await all("PRAGMA table_info('users')");
    const available = new Set(columns.map((column) => column.name));
    let candidateUsername = buildDeletedUsername(existing.username, userId, 0);
    let attempt = 1;

    while (true) {
      const duplicate = await get(
        `SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ? LIMIT 1`,
        [candidateUsername, userId]
      );
      if (!duplicate) break;
      candidateUsername = buildDeletedUsername(existing.username, userId, attempt);
      attempt += 1;
    }

    const updates = [];
    const values = [];

    if (available.has('username')) {
      updates.push('username = ?');
      values.push(candidateUsername);
    }

    if (available.has('original_username')) {
      updates.push('original_username = CASE WHEN original_username IS NULL OR trim(original_username) = ? THEN ? ELSE original_username END');
      values.push('');
      values.push(normalizeText(existing.original_username, normalizeText(existing.username)));
    }

    if (available.has('password_hash')) {
      updates.push('password_hash = NULL');
    }

    if (available.has('account_status')) {
      updates.push("account_status = 'disabled'");
    }

    if (available.has('deleted_at')) {
      updates.push('deleted_at = ?');
      values.push(toDbTimestamp());
    }

    if (available.has('deleted_by')) {
      const deletedBy = Number(actorId);
      updates.push('deleted_by = ?');
      values.push(Number.isInteger(deletedBy) && deletedBy > 0 ? deletedBy : null);
    }

    if (available.has('deleted_reason')) {
      updates.push('deleted_reason = ?');
      values.push(normalizeText(reason));
    }

    if (available.has('updated_at')) {
      updates.push('updated_at = ?');
      values.push(toDbTimestamp());
    }

    if (!updates.length) {
      throw new Error('unable to soft delete user');
    }

    values.push(userId);
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    const row = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
    return formatUserRecord(row, { includeSecret: true });
  },
  // Return all users (id, username, display_name)
  allUsers: async () => {
    await ready;
    const rows = await all(`SELECT * FROM users WHERE (deleted_at IS NULL OR trim(deleted_at) = '') ORDER BY username`);
    return rows.map((row) => formatUserRecord(row));
  },
  listUsersDetailed: async () => {
    await ready;
    const rows = await all(`SELECT * FROM users WHERE (deleted_at IS NULL OR trim(deleted_at) = '') ORDER BY username`);
    return rows.map((row) => formatUserRecord(row));
  },
  listRoleTemplates: async () => {
    await ready;
    return listRoleTemplateRows();
  },
  getRoleTemplateByKey: async (roleKey) => {
    await ready;
    return getRoleTemplateByKey(roleKey);
  },
  upsertRoleTemplate: async ({ key, label, description, modules, permissions }) => {
    await ready;
    const roleKey = canonicalizeRole(key);
    const roleLabel = normalizeText(label, roleKey);
    const roleDescription = normalizeText(description);
    const normalizedModules = normalizeModuleAccess(modules);
    const normalizedPermissions = normalizePermissionAccess(permissions);
    const existing = await get(`SELECT role_key FROM role_templates WHERE role_key = ?`, [roleKey]);

    if (existing) {
      await run(
        `UPDATE role_templates SET label = ?, description = ?, modules = ?, permissions = ?, updated_at = ? WHERE role_key = ?`,
        [
          roleLabel,
          roleDescription,
          JSON.stringify(normalizedModules),
          JSON.stringify(normalizedPermissions),
          toDbTimestamp(),
          roleKey,
        ]
      );
    } else {
      await run(
        `INSERT INTO role_templates (role_key, label, description, modules, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          roleKey,
          roleLabel,
          roleDescription,
          JSON.stringify(normalizedModules),
          JSON.stringify(normalizedPermissions),
          toDbTimestamp(),
          toDbTimestamp(),
        ]
      );
    }

    await syncRoleTemplatesFromDb();
    return getRoleTemplateByKey(roleKey);
  },
};
