require('dotenv').config();
const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const db = require('better-sqlite3')('flarebase.db');

// Test 1: Verify emailHash lookup and decryption
const targetEmail = 'admin@flarebase.dev';
const targetEmailHash = envelopeEncryptionService.hashBlindIndex(targetEmail);
console.log(`Computed emailHash for ${targetEmail}: ${targetEmailHash}`);

const userRow = db.prepare('SELECT id, email, name FROM users WHERE emailHash = ?').get(targetEmailHash);
if (userRow) {
  try {
    const rawEmail = envelopeEncryptionService.decryptField(JSON.parse(userRow.email), 'SYSTEM');
    const rawName = envelopeEncryptionService.decryptField(JSON.parse(userRow.name), 'SYSTEM');
    console.log(`✅ Lookup successful. Decrypted Name: ${rawName}, Decrypted Email: ${rawEmail}`);
  } catch (err) {
    console.error(`❌ Decryption failed: ${err.message}`);
  }
} else {
  console.log(`❌ User not found by emailHash.`);
}

// Test 2: Project Keys count vs DISTINCT projectId
const projectKeysCount = db.prepare('SELECT count(*) as count FROM project_keys').get().count;
const distinctProjectUsersCount = db.prepare('SELECT count(DISTINCT projectId) as count FROM project_users').get().count;
const distinctDocumentsCount = db.prepare('SELECT count(DISTINCT projectId) as count FROM documents').get().count;

console.log(`\nproject_keys count: ${projectKeysCount}`);
console.log(`DISTINCT projectId in project_users: ${distinctProjectUsersCount}`);
console.log(`DISTINCT projectId in documents: ${distinctDocumentsCount}`);

const projectUsersIds = db.prepare('SELECT DISTINCT projectId FROM project_users').all().map(r => r.projectId);
const documentProjectIds = db.prepare('SELECT DISTINCT projectId FROM documents').all().map(r => r.projectId);
const keyProjectIds = db.prepare('SELECT projectId FROM project_keys').all().map(r => r.projectId);

// Find projects with keys but no users
const keysWithoutUsers = keyProjectIds.filter(id => !projectUsersIds.includes(id));
console.log(`Keys for projects without users:`, keysWithoutUsers);

// Find projects with users but no keys
const usersWithoutKeys = projectUsersIds.filter(id => !keyProjectIds.includes(id));
console.log(`Projects with users but NO keys:`, usersWithoutKeys);

