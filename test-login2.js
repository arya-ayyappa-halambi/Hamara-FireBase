const { loginUser, hashPassword } = require('./dist/auth/auth.service');
const { getDb, initSqlite } = require('./dist/db/sqlite.connection');
require('dotenv').config();

async function run() {
  initSqlite();
  const db = getDb();
  
  // Set password to "password123" for the first user
  const newHash = await hashPassword("password123");
  db.prepare("UPDATE users SET passwordHash = ? WHERE emailHash = ?").run(newHash, '72498660455152325dfdf60c3be7562c025d57d4');
  
  try {
    const res = await loginUser({ email: 'testuser@gmail.com', password: 'password123' });
    console.log("Login successful! Token:", res.token.substring(0, 15) + '...');
  } catch(e) {
    console.error("Login failed:", e);
  }
}
run();
