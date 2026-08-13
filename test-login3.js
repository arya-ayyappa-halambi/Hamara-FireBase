const { loginUser, hashPassword } = require('./dist/auth/auth.service');
const { getDb, initSqlite } = require('./dist/db/sqlite.connection');
require('dotenv').config();

async function run() {
  initSqlite();
  const db = getDb();
  
  const newHash = await hashPassword("password123");
  db.prepare("UPDATE users SET passwordHash = ? WHERE emailHash = ?").run(newHash, 'c7b53e0e16fa5a52ba11092144312abcfc396ea38586626cefcb2ff99912f1a7');
  
  try {
    const res = await loginUser({ email: 'testuser@gmail.com', password: 'password123' });
    console.log("Login successful! Token:", res.token.substring(0, 15) + '...');
  } catch(e) {
    console.error("Login failed:", e);
  }
}
run();
