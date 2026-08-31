// ─────────────────────────────────────────────────────────────────────────────
//  tests/passkeys.test.ts
//  Test Suite for WebAuthn / Passkeys (FIDO2) Biometric Authentication
// ─────────────────────────────────────────────────────────────────────────────

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { passkeyService } from '../src/services/passkey.service';
import crypto from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

async function runPasskeyTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running WebAuthn / Passkeys (FIDO2) Test Suite');
  console.log('================================================================\n');

  initSqlite();

  const db = getDb();
  const testUser = db.prepare('SELECT id, email, name FROM users LIMIT 1').get() as any;
  const userId = testUser.id;
  const email = testUser.email;
  const name = testUser.name;

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Generate Registration Options (Ceremony Step 1)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. WebAuthn Registration Options ---');
  const regOptions = passkeyService.generateRegistrationOptions(userId, email, name, 'localhost:3000');

  assert(typeof regOptions.challenge === 'string', 'Challenge is generated');
  assert(regOptions.rp.name.includes('AegisDB'), 'RP name contains AegisDB');
  assert(regOptions.rp.id === 'localhost', 'RP ID matches hostname');
  assert(regOptions.user?.name === email, 'User email preserved in registration challenge');
  assert(Array.isArray(regOptions.pubKeyCredParams), 'pubKeyCredParams array defined');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Verify Registration Response & Save Passkey (Ceremony Step 2)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Verify Registration & Persist Passkey ---');
  const fakeCredId = `cred_${crypto.randomBytes(16).toString('base64url')}`;
  const fakePubKey = `pub_${crypto.randomBytes(32).toString('base64url')}`;

  const passkey = passkeyService.verifyRegistrationResponse({
    userId,
    challenge: regOptions.challenge,
    credentialId: fakeCredId,
    publicKey: fakePubKey,
    deviceName: 'MacBook Pro TouchID',
    transports: ['internal']
  });

  assert(passkey.userId === userId, 'Passkey associated with correct userId');
  assert(passkey.credentialId === fakeCredId, 'Credential ID preserved');
  assert(passkey.deviceName === 'MacBook Pro TouchID', 'Device name preserved');
  assert(passkey.counter === 0, 'Initial counter is 0');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Generate Login Options
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. WebAuthn Login Options ---');
  const loginOptions = passkeyService.generateLoginOptions('localhost:3000', email);

  assert(typeof loginOptions.challenge === 'string', 'Login challenge generated');
  assert(Array.isArray(loginOptions.allowCredentials), 'allowCredentials populated for existing user');
  assert(Boolean(loginOptions.allowCredentials?.some(c => c.id === fakeCredId)), 'Registered credential included in allowCredentials');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Verify Login Assertion (Ceremony Step 3)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Verify Login Assertion ---');
  const loginResult = passkeyService.verifyLoginAssertion({
    challenge: loginOptions.challenge,
    credentialId: fakeCredId,
    counter: 1
  });

  assert(loginResult.userId === userId, 'Login assertion verified correct user');
  assert(loginResult.passkey.counter === 1, 'Counter updated to 1');
  assert(loginResult.passkey.lastUsedAt !== null, 'lastUsedAt updated');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Clone Detection (Counter Rollback Prevention)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Clone Detection & Anti-Replay ---');
  const cloneChallenge = passkeyService.generateLoginOptions('localhost:3000');
  let cloneError: any = null;
  try {
    passkeyService.verifyLoginAssertion({
      challenge: cloneChallenge.challenge,
      credentialId: fakeCredId,
      counter: 1 // Counter didn't advance!
    });
  } catch (err: any) {
    cloneError = err;
  }
  assert(cloneError !== null, 'Counter rollback / replay attack blocked');
  assert(cloneError.message.includes('counter rollback'), 'Reason explains counter rollback');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: List & Delete Passkey
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. List and Delete Passkey ---');
  const list = passkeyService.listUserPasskeys(userId);
  assert(list.some(p => p.id === passkey.id), 'Passkey present in user passkeys list');

  const deleted = passkeyService.deletePasskey(userId, passkey.id);
  assert(deleted === true, 'Passkey successfully deleted');

  const listAfter = passkeyService.listUserPasskeys(userId);
  assert(!listAfter.some(p => p.id === passkey.id), 'Passkey no longer in list after deletion');

  console.log('\n================================================================');
  console.log(`📊 Passkey Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runPasskeyTests().catch(err => {
  console.error('Fatal error in passkey test suite:', err);
  process.exit(1);
});
