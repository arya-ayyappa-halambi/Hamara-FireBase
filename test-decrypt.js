const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const { getDb, initSqlite } = require('./dist/db/sqlite.connection');
require('dotenv').config();

initSqlite();
const db = getDb();
const userRow = db.prepare("SELECT * FROM users LIMIT 1").get();
let email = userRow.email;
let iterations = 0;
while (typeof email === 'string' && email.startsWith('{')) {
  email = envelopeEncryptionService.decryptField(JSON.parse(email), 'SYSTEM');
  iterations++;
}
console.log("Decrypted email:", email);
console.log("Iterations:", iterations);
