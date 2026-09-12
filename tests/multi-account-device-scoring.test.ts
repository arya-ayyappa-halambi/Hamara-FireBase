// ─────────────────────────────────────────────────────────────────────────────
//  tests/multi-account-device-scoring.test.ts
//  FlareBase — Multi-Account Prevention, Device Fingerprinting & Shared Wi-Fi Safety
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";
process.env.RECOVERY_PIN = process.env.RECOVERY_PIN || "948201";

import { initSqlite, getDb, cleanupDemoAccounts } from '../src/db/sqlite.connection';
import { antiAbuseService } from '../src/services/anti-abuse.service';
import { threatDetectionService } from '../src/services/threat-detection.service';
import { registerUser } from '../src/auth/auth.service';
import { projectAuthService } from '../src/project-auth/project-auth.service';
import { projectService } from '../src/project/project.service';
import { userStore } from '../src/store/user.store';

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

async function runMultiAccountDeviceScoringTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🛡️  Running FlareBase Multi-Account & Shared Wi-Fi Safety Test Suite');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 1: Demo Account Cleanup & Super Admin / Whitelist Preservation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Demo Account Cleanup & Super Admin Whitelist Preservation ---');

  // Insert mock demo user
  const mockDemoId = 'demo_user_to_purge';
  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
    VALUES (?, 'demo_tester@mock.com', 'hash_demo_mock', 'Demo Tester', 'hash', 0, datetime('now'), datetime('now'))
  `).run(mockDemoId);

  // Insert super admin accounts
  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
    VALUES ('admin_1_id', 'admin@aegis.dev', 'hash_admin1', 'Super Admin 1', 'hash', 1, datetime('now'), datetime('now')),
           ('admin_2_id', 'admin@aegisdb.dev', 'hash_admin2', 'Super Admin 2', 'hash', 1, datetime('now'), datetime('now'))
  `).run();

  // Insert arya account
  const aryaId = 'arya_owner_id';
  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
    VALUES (?, 'aryaayyappahalambi@gmail.com', 'hash_arya_email', 'Arya Halambi', 'hash', 1, datetime('now'), datetime('now'))
  `).run(aryaId);

  // Run cleanup routine
  cleanupDemoAccounts(db);

  const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo_tester@mock.com');
  assert(!demoUser, 'Demo account purged from database');

  const admin1 = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@aegis.dev');
  assert(!!admin1, 'Super Admin 1 (admin@aegis.dev) preserved in database');

  const admin2 = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@aegisdb.dev');
  assert(!!admin2, 'Super Admin 2 (admin@aegisdb.dev) preserved in database');

  const arya = db.prepare('SELECT id FROM users WHERE email = ?').get('aryaayyappahalambi@gmail.com');
  assert(!!arya, 'Target owner (aryaayyappahalambi@gmail.com) preserved in database');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 2: Physical Device Fingerprinting & Velocity Throttling
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Physical Device Fingerprinting & Velocity Throttling ---');

  const testDeviceFp = `dfp_canvas_webgl_${Date.now()}_core8`;
  
  // 1st Registration from this physical device
  const devCheck1 = antiAbuseService.checkDeviceRegistrationVelocity(testDeviceFp, 2, 86400000);
  assert(devCheck1.allowed === true, '1st registration from physical device allowed');
  antiAbuseService.recordDeviceRegistration(testDeviceFp, 'user_1', '192.168.1.100');

  // 2nd Registration from this physical device
  const devCheck2 = antiAbuseService.checkDeviceRegistrationVelocity(testDeviceFp, 2, 86400000);
  assert(devCheck2.allowed === true, '2nd registration from physical device allowed (limit 2)');
  antiAbuseService.recordDeviceRegistration(testDeviceFp, 'user_2', '192.168.1.100');

  // 3rd Registration from this physical device (Trigger Device Throttle)
  const devCheck3 = antiAbuseService.checkDeviceRegistrationVelocity(testDeviceFp, 2, 86400000);
  assert(devCheck3.allowed === false, '3rd registration from physical device is throttled/blocked');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 3: Shared Wi-Fi (NAT / University / Cafe) Zero False Positives
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Shared Wi-Fi / NAT Confidence & Zero False Positives ---');

  const sharedPublicIp = '203.0.113.88';
  // Simulate 10 distinct people registering from the same university Wi-Fi on 10 distinct laptops
  for (let i = 0; i < 10; i++) {
    const studentDevice = `student_laptop_${Date.now()}_${i}_gpu${i}`;
    antiAbuseService.recordDeviceRegistration(studentDevice, `student_user_${i}`, sharedPublicIp);
  }

  const sharedConfidence = antiAbuseService.calculateSharedIpConfidence(sharedPublicIp);
  assert(sharedConfidence.isSharedNetwork === true, 'Shared Wi-Fi / NAT detected with high confidence');
  assert(sharedConfidence.uniquenessRatio === 1.0, '100% device uniqueness ratio on shared Wi-Fi');
  assert(sharedConfidence.distinctDevices >= 10, '10 distinct physical hardware devices recognized on single IP');

  // Evaluate registration for 11th distinct student on the same Wi-Fi
  const student11Device = `student_laptop_${Date.now()}_11_new`;
  const student11Eval = antiAbuseService.evaluateRegistrationRisk({
    email: `student11_${Date.now()}@university.edu`,
    clientIp: sharedPublicIp,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    deviceFingerprint: student11Device
  });

  assert(student11Eval.isSubnetSpam === false, 'Subnet rate limit safely bypassed for distinct device on shared Wi-Fi');
  assert(student11Eval.riskScore < 40, `Low risk score for genuine student on shared Wi-Fi (${student11Eval.riskScore}/100)`);
  assert(student11Eval.isSharedNetwork === true, 'Shared network flag correctly attached');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 4: Canonical Email Duplicate Collision Detection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Canonical Email Blind-Index Duplicate Collision ---');

  const randomSuffix = Math.floor(Math.random() * 1000000);
  const rootEmail = `developer${randomSuffix}@gmail.com`;
  const canonicalRoot = antiAbuseService.canonicalizeEmail(rootEmail);

  // Register primary developer
  const primaryDev = await registerUser({
    email: rootEmail,
    password: 'SecurePassword123!',
    name: 'Primary Developer',
    deviceFingerprint: `primary_device_${Date.now()}`,
    clientIp: '198.51.100.20'
  });
  assert(!!primaryDev.token, 'Primary developer registered successfully');

  // Check collision with alias: d.e.v.e.l.o.p.e.r<suffix>+spam123@gmail.com
  const aliasEmail = `d.e.v.e.l.o.p.e.r${randomSuffix}+spam123@gmail.com`;
  const aliasCanonical = antiAbuseService.canonicalizeEmail(aliasEmail);

  const collisionCheck = antiAbuseService.checkCanonicalEmailCollision(canonicalRoot.canonicalHash);
  assert(collisionCheck.hasCollision === true, 'Canonical collision detected against existing account');
  assert(collisionCheck.collisionType === 'platform_user', 'Collision correctly identified as platform_user');

  // Evaluate registration risk for alias attempt
  const aliasRisk = antiAbuseService.evaluateRegistrationRisk({
    email: aliasEmail,
    clientIp: '198.51.100.21',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    deviceFingerprint: `abuser_device_${Date.now()}`
  });

  assert(aliasRisk.isCanonicalCollision === true, 'Canonical collision flagged in risk evaluation');
  assert(aliasRisk.riskScore >= 60, `Elevated risk score for multi-account alias flood (${aliasRisk.riskScore}/100)`);

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 5: Project End-User Device Scoping & Multi-Account Integrity
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Project End-User Device Scoping & Multi-Account Integrity ---');

  const { project } = projectService.createProject(primaryDev.user.id, 'Multi-Account Test Project');
  const projUserEmail = `client_${Date.now()}@yahoo.com`;
  const projUserDevice = `mobile_iphone_${Date.now()}`;

  const projUserRes = await projectAuthService.registerUser(
    project.id,
    projUserEmail,
    'ClientPass123!',
    'email',
    '198.51.100.25',
    projUserDevice
  );

  assert(!!projUserRes.token, 'Project end-user registered with device binding');

  const projUserRow = db.prepare('SELECT canonicalEmailHash, deviceFingerprint, lastRegistrationIp FROM project_users WHERE id = ?')
    .get(projUserRes.user.id) as any;

  assert(!!projUserRow.canonicalEmailHash, 'Project user canonicalEmailHash stored');
  assert(projUserRow.deviceFingerprint === projUserDevice, 'Project user deviceFingerprint stored');
  assert(projUserRow.lastRegistrationIp === '198.51.100.25', 'Project user lastRegistrationIp stored');

  // ───────────────────────────────────────────────────────────────────────────
  //  SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`🏁 Multi-Account & Shared Wi-Fi Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runMultiAccountDeviceScoringTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
