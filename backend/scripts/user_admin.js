#!/usr/bin/env node
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'app.db');
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function ensureUsersTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      display_name TEXT,
      external INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const cols = await all("PRAGMA table_info('users')");
  const names = new Set((cols || []).map((c) => c.name));
  if (!names.has('external')) {
    try {
      await run('ALTER TABLE users ADD COLUMN external INTEGER DEFAULT 0');
    } catch (err) {
      // Best-effort migration for older DBs.
    }
  }
}

function usage() {
  console.log('User admin helper');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/user_admin.js list');
  console.log('  node scripts/user_admin.js add <username> <password> [display_name]');
  console.log('  node scripts/user_admin.js passwd <username> <new_password>');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/user_admin.js add jsmith P@ssw0rd "John Smith"');
  console.log('  node scripts/user_admin.js passwd jsmith NewP@ssw0rd');
  console.log('');
  console.log('NPM aliases from backend/:');
  console.log('  npm run user:list');
  console.log('  npm run user:add -- <username> <password> [display_name]');
  console.log('  npm run user:passwd -- <username> <new_password>');
}

async function listUsers() {
  const users = await all(
    'SELECT id, username, display_name, external, created_at FROM users ORDER BY username COLLATE NOCASE ASC'
  );

  if (!users.length) {
    console.log('No users found.');
    return;
  }

  console.log('Users:');
  for (const u of users) {
    const label = u.display_name ? ` (${u.display_name})` : '';
    const ext = Number(u.external) === 1 ? ' [external]' : '';
    console.log(`- ${u.id}: ${u.username}${label}${ext}`);
  }
}

async function addUser(username, password, displayName) {
  if (!username || !password) {
    throw new Error('add requires <username> <password> [display_name]');
  }

  const existing = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    throw new Error(`User already exists: ${username}`);
  }

  const hash = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const result = await run(
    'INSERT INTO users (username, password_hash, display_name, external, created_at) VALUES (?, ?, ?, ?, ?)',
    [username, hash, displayName || username, 0, createdAt]
  );

  console.log(`Created user ${username} with id ${result.lastID}.`);
}

async function setPassword(username, newPassword) {
  if (!username || !newPassword) {
    throw new Error('passwd requires <username> <new_password>');
  }

  const existing = await get('SELECT id, external FROM users WHERE username = ?', [username]);
  if (!existing) {
    throw new Error(`User not found: ${username}`);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await run('UPDATE users SET password_hash = ?, external = 0 WHERE username = ?', [hash, username]);
  console.log(`Password updated for ${username}.`);
}

async function main() {
  const [cmd, a, b, c] = process.argv.slice(2);

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    usage();
    process.exit(0);
  }

  await ensureUsersTable();

  if (cmd === 'list') {
    await listUsers();
    process.exit(0);
  }

  if (cmd === 'add') {
    await addUser(a, b, c);
    process.exit(0);
  }

  if (cmd === 'passwd') {
    await setPassword(a, b);
    process.exit(0);
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main()
  .catch((err) => {
    console.error(err && err.message ? err.message : err);
    usage();
    process.exit(1);
  })
  .finally(() => {
    db.close();
  });
