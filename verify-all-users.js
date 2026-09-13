const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const Database = require('better-sqlite3');
require('dotenv').config();

const db = new Database('flarebase.db.restored', { readonly: true });
const projectUsers = db.prepare('SELECT id, email, mfaSecret, projectId FROM project_users').all();

console.log(`Verifying ${projectUsers.length} project_users...`);
let successCount = 0;
let failCount = 0;

for (const pu of projectUsers) {
  try {
    const rawEmail = envelopeEncryptionService.decryptField(JSON.parse(pu.email), pu.projectId);
    let rawMfa = null;
    if (pu.mfaSecret) {
      rawMfa = envelopeEncryptionService.decryptField(JSON.parse(pu.mfaSecret), pu.projectId);
    }
    // Only check if it decrypted correctly to a single layer (a string that's not JSON)
    if (typeof rawEmail === 'string' && !rawEmail.startsWith('{"_encrypted"')) {
      successCount++;
    } else {
      failCount++;
    }
  } catch (err) {
    console.error(`❌ [${pu.id}] Failed to decrypt: ${err.message}`);
    failCount++;
  }
}

console.log(`Verification complete: ${successCount} successes, ${failCount} failures.`);
