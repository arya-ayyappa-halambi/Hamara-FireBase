const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const Database = require('better-sqlite3');
require('dotenv').config();

const db = new Database('flarebase.db', { readonly: true });
const users = db.prepare('SELECT id, email, name FROM users').all();

console.log(`Verifying ${users.length} users...`);
for (const u of users) {
  try {
    const rawEmail = envelopeEncryptionService.decryptField(JSON.parse(u.email), 'SYSTEM');
    const rawName = envelopeEncryptionService.decryptField(JSON.parse(u.name), 'SYSTEM');
    console.log(`✅ [${u.id}] Email: ${rawEmail}, Name: ${rawName}`);
  } catch (err) {
    console.error(`❌ [${u.id}] Failed to decrypt: ${err.message}`);
  }
}
