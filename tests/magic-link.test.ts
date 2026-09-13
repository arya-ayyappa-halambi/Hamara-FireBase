// ─────────────────────────────────────────────────────────────────────────────
//  tests/magic-link.test.ts
//  Test Suite for Passwordless Magic Links & 6-Digit Email OTP Login
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { magicLinkService } from '../src/services/magic-link.service';

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

async function runMagicLinkTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running Passwordless Magic Link & Email OTP Test Suite');
  console.log('================================================================\n');

  initSqlite();

  const testEmail = 'magic.tester@flarebase.dev';

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Generate Magic Link Token & OTP Code
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Generate Magic Link & OTP ---');
  const authData = magicLinkService.generateMagicAuth(testEmail, 15);

  assert(authData.magicToken.startsWith('magic_'), 'Token starts with magic_ prefix');
  assert(authData.otpCode.length === 6, 'OTP is exactly 6 digits');
  assert(/^\d{6}$/.test(authData.otpCode), 'OTP is purely numeric');
  assert(typeof authData.userId === 'string', 'User ID returned');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Verify via 6-Digit OTP Code
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Verify via 6-Digit Numeric Code ---');
  const verified = magicLinkService.verifyMagicAuth({
    email: testEmail,
    otpCode: authData.otpCode
  });
  assert(verified.userId === authData.userId, 'Verified user ID matches generated user ID');
  assert(verified.email === testEmail, 'Verified email matches');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Single-Use Invariant (Token Replay Prevention)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Single-Use Invariant (Auto-Burn) ---');
  let replayError: any = null;
  try {
    magicLinkService.verifyMagicAuth({
      email: testEmail,
      otpCode: authData.otpCode
    });
  } catch (err: any) {
    replayError = err;
  }
  assert(replayError !== null, 'Re-using burnt OTP code is rejected');
  assert(replayError.message.includes('already been used'), 'Reason states code already used');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Verify via Magic Link Token
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Verify via Magic Link URL Token ---');
  const authData2 = magicLinkService.generateMagicAuth(testEmail, 15);
  const verifiedToken = magicLinkService.verifyMagicAuth({
    token: authData2.magicToken
  });
  assert(verifiedToken.userId === authData.userId, 'Magic token verified successfully');

  // Second attempt with token should fail
  let tokenReplayError: any = null;
  try {
    magicLinkService.verifyMagicAuth({
      token: authData2.magicToken
    });
  } catch (err: any) {
    tokenReplayError = err;
  }
  assert(tokenReplayError !== null, 'Magic URL token burned after first use');

  console.log('\n================================================================');
  console.log(`📊 Magic Link Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runMagicLinkTests().catch(err => {
  console.error('Fatal error in magic-link test suite:', err);
  process.exit(1);
});
