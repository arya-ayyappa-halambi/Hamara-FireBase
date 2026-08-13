const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const { getDb, initSqlite } = require('./dist/db/sqlite.connection');
require('dotenv').config();

initSqlite();
const db = getDb();
const users = db.prepare("SELECT * FROM users").all();

for (const user of users) {
  let email = envelopeEncryptionService.decryptField(JSON.parse(user.email), 'SYSTEM');
  const trueHash = envelopeEncryptionService.hashBlindIndex(email);
  db.prepare("UPDATE users SET emailHash = ? WHERE id = ?").run(trueHash, user.id);
}
console.log("Fixed email hashes for users.");
