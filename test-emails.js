const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const { getDb, initSqlite } = require('./dist/db/sqlite.connection');
require('dotenv').config();
initSqlite();
const db = getDb();
const users = db.prepare("SELECT emailHash, email FROM users").all();
for (const user of users) {
  let email = envelopeEncryptionService.decryptField(JSON.parse(user.email), 'SYSTEM');
  console.log("Email:", email, "Hash:", user.emailHash, "Expected Hash:", envelopeEncryptionService.hashBlindIndex(email));
}
