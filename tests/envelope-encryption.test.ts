// ─────────────────────────────────────────────────────────────────────────────
//  tests/envelope-encryption.test.ts
//  Integration Test Suite: Two-Tier Envelope Encryption (DEK / KEK) & Key Rotation
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { getDb } from '../src/db/sqlite.connection';
import { envelopeEncryptionService } from '../src/services/envelope-encryption.service';
import crypto from 'crypto';

function runIntegrationTests(): void {
  console.log('================================================================');
  console.log('🧪 Running Envelope Encryption Integration Test Suite');
  console.log('================================================================\n');

  const db = getDb();
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failedCount++;
    }
  }

  // 1. Create a dummy project for testing
  const testProjectId = `test_proj_${crypto.randomBytes(4).toString('hex')}`;
  const testOwnerId = `test_owner_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  // Insert owner & project into database
  db.prepare(`
    INSERT INTO users (id, email, passwordHash, name, isSuperAdmin, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(testOwnerId, `${testOwnerId}@example.com`, 'hash', 'Test Owner', 0, now, now);

  db.prepare(`
    INSERT INTO projects (id, ownerId, name, apiKeyHash, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testProjectId, testOwnerId, 'Test Project', `hash_${testProjectId}`, now, now);

  console.log(`📌 Created temporary test project: ${testProjectId}\n`);

  try {
    // --- Test Case 1: Project DEK Generation & Wrapping ---
    console.log('--- Test Case 1: Project DEK Generation & Wrapping ---');
    const dek1 = envelopeEncryptionService.getOrCreateProjectDek(testProjectId);
    assert(Buffer.isBuffer(dek1) && dek1.length === 32, 'DEK is a valid 256-bit Buffer');

    const keyRecord = db.prepare('SELECT dekEncrypted, dekIv, dekTag FROM project_keys WHERE projectId = ?').get(testProjectId) as any;
    assert(!!keyRecord, 'DEK record stored in `project_keys` table');
    assert(typeof keyRecord.dekEncrypted === 'string' && keyRecord.dekEncrypted.length > 0, 'DEK is encrypted at rest using KEK');

    // Retrieve again to ensure idempotency & decryption
    const dek2 = envelopeEncryptionService.getOrCreateProjectDek(testProjectId);
    assert(dek1.equals(dek2), 'Subsequent DEK fetch returns matching decrypted key');

    // --- Test Case 2: Field Encryption & Decryption ---
    console.log('\n--- Test Case 2: Field Encryption & Decryption ---');
    const samplePayload = {
      ssn: '123-456-7890',
      biometrics: { fingerprintHash: 'a1b2c3d4e5' },
      userNote: 'Confidential Patient Data'
    };

    const encryptedField = envelopeEncryptionService.encryptField(samplePayload, testProjectId);
    assert(encryptedField._encrypted === true, 'Encrypted output contains `_encrypted: true` marker');
    assert(typeof encryptedField.v === 'string' && typeof encryptedField.iv === 'string' && typeof encryptedField.tag === 'string', 'Encrypted output has AES-256-GCM ciphertext, IV, and auth tag');

    const decryptedField = envelopeEncryptionService.decryptField(encryptedField, testProjectId);
    assert(JSON.stringify(decryptedField) === JSON.stringify(samplePayload), 'Decrypted payload matches original payload exactly');

    // --- Test Case 3: Key Rotation (DEK Re-wrapping) ---
    console.log('\n--- Test Case 3: Key Rotation & Data Recovery ---');
    const rotResult = envelopeEncryptionService.rotateProjectKey(testProjectId);
    assert(rotResult.status === 'success', 'rotateProjectKey executed successfully');

    const dek3 = envelopeEncryptionService.getOrCreateProjectDek(testProjectId);
    assert(!dek1.equals(dek3), 'Rotated DEK is a new distinct 256-bit key');

  } catch (err: any) {
    console.error('❌ Test execution error:', err.message);
    failedCount++;
  } finally {
    // Cleanup temporary test project
    db.prepare('DELETE FROM projects WHERE id = ?').run(testProjectId);
    db.prepare('DELETE FROM users WHERE id = ?').run(testOwnerId);
    console.log(`\n🧹 Cleaned up temporary test project ${testProjectId}.`);
  }

  console.log('\n================================================================');
  console.log(`📊 Test Results: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runIntegrationTests();
}
