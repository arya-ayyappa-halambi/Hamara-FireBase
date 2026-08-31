// ─────────────────────────────────────────────────────────────────────────────
//  tests/user-sessions.test.ts
//  Test Suite for User Active Sessions, Remote Logout & Security Logs
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { userSessionService } from '../src/services/user-session.service';

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

async function runSessionTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running User Active Sessions & Remote Device Logout Test Suite');
  console.log('================================================================\n');

  initSqlite();

  const db = getDb();
  const userId = `usr_sess_test_${Date.now()}`;
  const sessEmail = `sess.tester.${Date.now()}@aegisdb.dev`;
  const sessHash = require('crypto').createHash('sha256').update(sessEmail).digest('hex');
  db.prepare(`
    INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
    VALUES (?, ?, ?, 'Session Tester', 'fake_hash', 0, ?, ?)
  `).run(userId, sessEmail, sessHash, new Date().toISOString(), new Date().toISOString());

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Register Sessions across Devices
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Register Active Sessions ---');
  const session1 = userSessionService.registerSession({
    userId,
    refreshToken: 'ref_token_desktop_11111111111111111111111111111111',
    ipAddress: '192.168.1.50',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    countryCode: 'IN'
  });

  const session2 = userSessionService.registerSession({
    userId,
    refreshToken: 'ref_token_mobile_22222222222222222222222222222222',
    ipAddress: '49.207.210.15',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    countryCode: 'US'
  });

  assert(session1.id.startsWith('sess_'), 'Session 1 created with sess_ ID');
  assert(session1.deviceType === 'desktop', 'Desktop device parsed correctly');
  assert(session2.deviceType === 'mobile', 'Mobile iPhone device parsed correctly');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: List User Sessions
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. List Active Sessions ---');
  const sessions = userSessionService.listUserSessions(userId, 'ref_token_desktop_11111111111111111111111111111111');
  assert(sessions.length >= 2, 'Lists registered sessions');

  const current = sessions.find(s => s.id === session1.id);
  assert(current?.isCurrent === true, 'Current session detected via refreshToken');

  const remote = sessions.find(s => s.id === session2.id);
  assert(remote?.isCurrent === false, 'Remote mobile session is marked not current');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: 1-Click Revoke Specific Remote Session
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Revoke Specific Remote Device Session ---');
  const revoked = userSessionService.revokeSession(userId, session2.id);
  assert(revoked === true, 'Revoked mobile session successfully');

  const sessionsAfterRevoke = userSessionService.listUserSessions(userId);
  assert(!sessionsAfterRevoke.some(s => s.id === session2.id), 'Revoked session is removed from active sessions');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Revoke All Other Devices
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Revoke All Other Sessions ---');
  // Register another session to test bulk revocation
  userSessionService.registerSession({
    userId,
    refreshToken: 'ref_token_tablet_33333333333333333333333333333333',
    ipAddress: '10.0.0.99',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
    countryCode: 'GB'
  });

  const count = userSessionService.revokeAllOtherSessions(userId, 'ref_token_desktop_11111111111111111111111111111111');
  assert(count >= 1, 'Revoked all other devices');

  const remaining = userSessionService.listUserSessions(userId, 'ref_token_desktop_11111111111111111111111111111111');
  assert(remaining.length === 1 && remaining[0].id === session1.id, 'Only current session remains active');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Security Activity Logs
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. User Security & Activity Logs ---');
  userSessionService.logSecurityAction({
    userId,
    actionType: 'password_changed',
    ipAddress: '127.0.0.1',
    details: 'User changed account password'
  });

  const logs = userSessionService.listUserSecurityLogs(userId);
  assert(logs.length > 0, 'Security logs returned for user');
  assert(logs.some(l => l.actionType === 'password_changed'), 'password_changed event recorded');
  assert(logs.some(l => l.actionType === 'session_revoked'), 'session_revoked event recorded');

  console.log('\n================================================================');
  console.log(`📊 User Sessions Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runSessionTests().catch(err => {
  console.error('Fatal error in user-sessions test suite:', err);
  process.exit(1);
});
