// ─────────────────────────────────────────────────────────────────────────────
//  tests/token-family.test.ts
//  Unit tests for Refresh Token Family Rotation & Reuse Detection.
// ─────────────────────────────────────────────────────────────────────────────

import assert from 'assert';
import { initSqlite } from '../src/db/sqlite.connection';
import { userStore } from '../src/store/user.store';
import { tokenFamilyService } from '../src/services/token-family.service';

async function runTokenFamilyTests() {
  console.log('🧪 Starting Refresh Token Family Rotation & Reuse Detection Unit Tests...\n');

  process.env.JWT_SECRET = 'super_secret_jwt_key_for_testing_123456789';

  // Initialize SQLite Database in test environment
  initSqlite();

  // Create a test user in database
  const email = `token_family_test_${Date.now()}@flarebase.dev`;
  const userId = `user_tf_${Date.now()}`;
  const user = await userStore.create({
    id: userId,
    email,
    name: 'Token Family Test User',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQ$dGVzdGhhc2g',
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`1. Created Test User: ${user.email} (ID: ${user.id})`);

  // Test 1: Generate initial token family
  console.log('2. Generating Initial Refresh Token Family...');
  const session1 = tokenFamilyService.createTokenFamily(user.id);
  assert.ok(session1.refreshToken, 'Raw refresh token must be issued');
  assert.ok(session1.familyId, 'Family ID must be generated');
  console.log(`   ✅ Token 1 issued in Family: ${session1.familyId}`);

  // Check DB state
  let rec1 = tokenFamilyService.getTokenFamilyRecord(session1.refreshToken);
  assert.ok(rec1, 'Token record 1 must exist in DB');
  assert.strictEqual(rec1?.isSpent, 0, 'Token 1 must initially be active (isSpent = 0)');
  assert.strictEqual(rec1?.isRevoked, 0, 'Token 1 must initially be valid (isRevoked = 0)');

  // Test 2: Rotate token 1 -> receive token 2 in same family
  console.log('3. Rotating Token 1 to issue Token 2...');
  const rotateRes1 = await tokenFamilyService.rotateRefreshToken(session1.refreshToken);
  assert.ok(rotateRes1.accessToken, 'New short-lived access JWT must be issued');
  assert.ok(rotateRes1.refreshToken, 'New refresh token 2 must be issued');
  assert.strictEqual(rotateRes1.familyId, session1.familyId, 'Token 2 must belong to the SAME familyId');
  console.log('   ✅ Token 1 rotated successfully to Token 2.');

  // Verify Token 1 is now marked as SPENT
  rec1 = tokenFamilyService.getTokenFamilyRecord(session1.refreshToken);
  assert.strictEqual(rec1?.isSpent, 1, 'Token 1 must now be marked as SPENT (isSpent = 1)');

  // Verify Token 2 is ACTIVE
  let rec2 = tokenFamilyService.getTokenFamilyRecord(rotateRes1.refreshToken);
  assert.ok(rec2, 'Token record 2 must exist in DB');
  assert.strictEqual(rec2?.isSpent, 0, 'Token 2 must be active (isSpent = 0)');
  assert.strictEqual(rec2?.familyId, session1.familyId, 'Token 2 familyId must match');

  // Test 3: Rotate Token 2 -> receive Token 3
  console.log('4. Rotating Token 2 to issue Token 3...');
  const rotateRes2 = await tokenFamilyService.rotateRefreshToken(rotateRes1.refreshToken);
  assert.strictEqual(rotateRes2.familyId, session1.familyId, 'Token 3 must belong to same familyId');
  console.log('   ✅ Token 2 rotated successfully to Token 3.');

  // Verify Token 2 is now marked as SPENT
  rec2 = tokenFamilyService.getTokenFamilyRecord(rotateRes1.refreshToken);
  assert.strictEqual(rec2?.isSpent, 1, 'Token 2 must now be marked as SPENT');

  // Test 4: 🚨 REUSE DETECTION TEST 🚨
  // Replaying SPENT Token 1 must detect theft and REVOKE the ENTIRE FAMILY!
  console.log('5. 🚨 Testing Token Reuse Detection (Replaying spent Token 1)...');
  try {
    await tokenFamilyService.rotateRefreshToken(session1.refreshToken);
    assert.fail('Should have detected refresh token reuse and thrown 401');
  } catch (err: any) {
    assert.strictEqual(err.statusCode, 401, 'Should return HTTP 401');
    assert.ok(
      err.message.includes('Refresh token reuse detected'),
      'Message must indicate token reuse security alert'
    );
    console.log(`   ✅ Security Exception Triggered: ${err.message}`);
  }

  // Verify ALL tokens in family are now REVOKED!
  rec1 = tokenFamilyService.getTokenFamilyRecord(session1.refreshToken);
  rec2 = tokenFamilyService.getTokenFamilyRecord(rotateRes1.refreshToken);
  let rec3 = tokenFamilyService.getTokenFamilyRecord(rotateRes2.refreshToken);

  assert.strictEqual(rec1?.isRevoked, 1, 'Token 1 must be revoked');
  assert.strictEqual(rec2?.isRevoked, 1, 'Token 2 must be revoked');
  assert.strictEqual(rec3?.isRevoked, 1, 'Token 3 in family MUST BE REVOKED due to reuse attack!');
  console.log('   ✅ Verified ENTIRE Token Family was revoked upon reuse detection.');

  // Test 5: Replaying active Token 3 after family revocation must be rejected
  console.log('6. Verifying Token 3 rejection post-revocation...');
  try {
    await tokenFamilyService.rotateRefreshToken(rotateRes2.refreshToken);
    assert.fail('Token 3 should be rejected because family is revoked');
  } catch (err: any) {
    assert.strictEqual(err.statusCode, 401);
    assert.ok(err.message.includes('revoked'));
    console.log('   ✅ Token 3 rejected due to revoked family status.');
  }

  console.log('\n🎉 ALL REFRESH TOKEN FAMILY ROTATION & REUSE TESTS PASSED!\n');
}

runTokenFamilyTests().catch((err) => {
  console.error('❌ Token Family Unit Test Failed:', err);
  process.exit(1);
});
