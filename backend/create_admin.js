// Small helper to create an initial admin user from the command line.
// Usage: node create_admin.js adminUser adminPassword "Display Name"
const bcrypt = require('bcryptjs');
const db = require('./db');

async function main(){
  const [,, username, password, display_name] = process.argv;
  if (!username || !password) {
    console.error('Usage: node create_admin.js <username> <password> [display_name]');
    process.exit(2);
  }
  const hash = await bcrypt.hash(password, 10);
  try{
    const id = await db.createUser({ username, password_hash: hash, display_name: display_name || username });
    console.log('Created user id', id);
    process.exit(0);
  }catch(err){
    console.error('Failed to create user', err);
    process.exit(1);
  }
}

main();
