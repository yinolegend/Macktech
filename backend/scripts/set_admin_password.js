const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const password = process.argv[2] || process.env.ADMIN_PASSWORD;
if (!password) {
  console.error('Usage: node set_admin_password.js <password>');
  process.exit(1);
}

// db.js places the DB at `path.join(__dirname, '..', 'data', 'app.db')` when
// run from the `backend` directory. This script lives in `backend/scripts`,
// so walk up one more level to reach the same `data/app.db` path.
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'app.db');
const db = new sqlite3.Database(DB_PATH);

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('bcrypt error', err);
    process.exit(1);
  }
  db.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'admin'], function (err) {
    if (err) {
      console.error('DB error', err);
      process.exit(1);
    }
    if (this.changes === 0) {
      const created_at = new Date().toISOString().replace('T', ' ').replace('Z', '');
      db.run('INSERT INTO users (username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)', ['admin', hash, 'Administrator', 'Admin', created_at], function (err2) {
        if (err2) {
          console.error('Insert failed', err2);
          process.exit(1);
        }
        console.log('Admin user created with id', this.lastID);
        process.exit(0);
      });
    } else {
      console.log('Admin password updated');
      process.exit(0);
    }
  });
});
