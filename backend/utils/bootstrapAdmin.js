async function bootstrapDefaultAdmin({ db, bcrypt }) {
  try {
    const existing = await db.getUserByUsername('admin');
    if (existing) return existing;
    const hash = await bcrypt.hash('admin', 10);
    const id = await db.createUser({
      username: 'admin',
      password_hash: hash,
      display_name: 'Administrator',
      role: 'Admin',
    });
    return db.getUserById(id);
  } catch (error) {
    console.error('failed to bootstrap default admin user', error && error.message ? error.message : error);
    return null;
  }
}

module.exports = {
  bootstrapDefaultAdmin,
};
