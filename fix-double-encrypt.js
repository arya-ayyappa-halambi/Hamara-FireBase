const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const { getDb, initSqlite } = require('./dist/db/sqlite.connection');
require('dotenv').config();

initSqlite();
const db = getDb();
const users = db.prepare("SELECT * FROM users").all();

for (const user of users) {
  let email = user.email;
  while (typeof email === 'string' && email.startsWith('{')) {
    email = envelopeEncryptionService.decryptField(JSON.parse(email), 'SYSTEM');
  }
  let name = user.name;
  while (typeof name === 'string' && name.startsWith('{')) {
    name = envelopeEncryptionService.decryptField(JSON.parse(name), 'SYSTEM');
  }
  
  const singleEncEmail = envelopeEncryptionService.encryptField(email, 'SYSTEM');
  const singleEncName = envelopeEncryptionService.encryptField(name, 'SYSTEM');
  
  db.prepare("UPDATE users SET email = ?, name = ? WHERE id = ?").run(JSON.stringify(singleEncEmail), JSON.stringify(singleEncName), user.id);
}
console.log("Fixed double-encryption on users.");
