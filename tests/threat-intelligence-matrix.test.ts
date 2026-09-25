// ─────────────────────────────────────────────────────────────────────────────
//  tests/threat-intelligence-matrix.test.ts
//  FlareBase — Live Threat Intelligence & User Security Matrix Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";
process.env.RECOVERY_PIN = process.env.RECOVERY_PIN || "948201";

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { threatDetectionService } from '../src/services/threat-detection.service';
import { antiAbuseService } from '../src/services/anti-abuse.service';
import { registerUser } from '../src/auth/auth.service';
import { projectAuthService } from '../src/project-auth/project-auth.service';
import { projectService } from '../src/project/project.service';
import { wsService } from '../src/realtime/websocket.service';

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

async function runThreatIntelligenceMatrixTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🛡️  Running FlareBase Live Threat Intelligence & Security Matrix Tests');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 1: Seed Clean Developer and Abusive Users
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Seed Clean Platform Users & Simulated Compromised Accounts ---');

  const cleanEmail = `legit_dev_${Date.now()}@gmail.com`;
  const cleanUser = await registerUser({
    email: cleanEmail,
    password: 'SecurePassword123!',
    name: 'Clean Developer',
    deviceFingerprint: `legit_device_${Date.now()}`,
    clientIp: '198.51.100.30'
  });
  assert(!!cleanUser.token, 'Clean platform developer registered');

  const badEmail = `bad_actor_${Date.now()}@malicious.net`;
  const badUser = await registerUser({
    email: badEmail,
    password: 'AttackerPassword123!',
    name: 'Bad Actor',
    deviceFingerprint: `hacker_rig_${Date.now()}`,
    clientIp: '203.0.113.199'
  });
  assert(!!badUser.token, 'Simulated bad actor registered');

  // Trigger automated threat flagging on bad actor
  const threatTrigger = await threatDetectionService.evaluateThreat({
    userId: badUser.user.id,
    userEmail: badEmail,
    ipAddress: '203.0.113.199',
    eventType: 'malicious_payload_probe',
    payload: { query: 'UNION SELECT * FROM platform_settings' }
  });
  assert(threatTrigger.isFlagged === true, 'Automated threat engine flagged bad actor');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 2: Live User Security Threat Matrix Retrieval & Enrichment
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Live User Security Threat Matrix Retrieval & Enrichment ---');

  const matrix = threatDetectionService.getUserSecurityMatrix();
  assert(matrix.total >= 2, 'Threat matrix contains all registered platform accounts');
  assert(matrix.summary.flagged >= 1, 'Summary reflects at least 1 quarantined account');

  const foundBad = matrix.users.find(u => u.id === badUser.user.id);
  assert(!!foundBad, 'Flagged user found in threat matrix');
  assert(foundBad?.isFlagged === true, 'Flagged user has isFlagged = true');
  assert(foundBad?.riskScore >= 70, `Flagged user has critical risk score (${foundBad?.riskScore}/100)`);
  assert(foundBad?.threatLevel === 'critical', 'Threat level categorised as critical');
  assert(foundBad?.threatCategories.length > 0, 'Active threat categories attached');
  assert(!!foundBad?.deviceFingerprint, 'Hardware device fingerprint attached');

  const foundClean = matrix.users.find(u => u.id === cleanUser.user.id);
  assert(!!foundClean, 'Clean user found in threat matrix');
  assert(foundClean?.isFlagged === false, 'Clean user has isFlagged = false');
  assert(foundClean?.riskScore < 40, `Clean user has low risk score (${foundClean?.riskScore}/100)`);
  assert(foundClean?.threatLevel === 'safe', 'Clean user categorised as safe');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 3: Platform Threat Intelligence Stats & Latency Metric
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Platform Threat Intelligence Stats & Benchmarks ---');

  const stats = threatDetectionService.getThreatIntelligenceStats();
  assert(stats.totalUsers >= 2, 'Stats total users count is accurate');
  assert(stats.flaggedUsersCount >= 1, 'Stats flagged users count is accurate');
  assert(stats.criticalThreatsIntercepted >= 1, 'Stats critical threats count is accurate');
  assert(stats.avgInspectionLatencyMs <= 0.01, 'Inspection latency is under 0.01ms (sub-microsecond)');
  assert(stats.recentThreatFeed.length > 0, 'Recent rolling threat feed contains events');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 4: Instant Unflag / Restore Account Action
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Instant Unflag & Account Restoration ---');

  const unflagResult = threatDetectionService.unflagUser(badUser.user.id, 'admin_super', 'admin@flarebase.dev');
  assert(unflagResult.success === true, 'User unflagged successfully');

  const postUnflagMatrix = threatDetectionService.getUserSecurityMatrix();
  const unflaggedUser = postUnflagMatrix.users.find(u => u.id === badUser.user.id);
  assert(unflaggedUser?.isFlagged === false, 'User status immediately updated to unflagged');
  assert(unflaggedUser?.riskScore === 0, 'User risk score reset to 0');
  assert(unflaggedUser?.threatLevel === 'safe', 'User threat level restored to safe');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 5: Manual Quarantine & Security Flags
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Manual Quarantine Action ---');

  const manualFlag = threatDetectionService.quarantineUser(
    cleanUser.user.id,
    'admin_super',
    'admin@flarebase.dev',
    'spam',
    'high',
    'Investigating suspicious alias churn'
  );
  assert(!!manualFlag.id, 'Manual security flag created');
  assert(manualFlag.status === 'active', 'Security flag is active');

  const postQuarantineMatrix = threatDetectionService.getUserSecurityMatrix();
  const quarantinedClean = postQuarantineMatrix.users.find(u => u.id === cleanUser.user.id);
  assert(quarantinedClean?.isFlagged === true, 'Account successfully marked as quarantined');
  assert(quarantinedClean?.riskScore >= 70, 'Quarantined account risk score elevated');

  // Restore clean user
  threatDetectionService.unflagUser(cleanUser.user.id, 'admin_super', 'admin@flarebase.dev');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 6: Platform Security Audit Execution
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. On-Demand Platform Security Audit ---');

  const auditResult = threatDetectionService.runPlatformSecurityAudit('admin_super', 'admin@flarebase.dev');
  assert(auditResult.scannedCount >= 2, `Scanned all registered accounts (${auditResult.scannedCount})`);
  assert(!!auditResult.auditTimestamp, 'Audit timestamp recorded');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 7: Threat Intelligence Export (JSON & CSV)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Threat Intelligence Report Export ---');

  const jsonExport = threatDetectionService.exportThreatIntelligenceReport('json');
  assert(jsonExport.contentType === 'application/json', 'JSON export content type is valid');
  assert(jsonExport.data.includes('FlareBase Threat Intelligence'), 'JSON export contains header data');

  const csvExport = threatDetectionService.exportThreatIntelligenceReport('csv');
  assert(csvExport.contentType === 'text/csv', 'CSV export content type is valid');
  assert(csvExport.data.includes('User ID,Email,Name'), 'CSV export contains CSV headers');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 8: Purge Resolved Incident Logs
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Purge Resolved Historical Incident Flags ---');

  const purgeRes = threatDetectionService.purgeResolvedIncidents('admin_super', 'admin@flarebase.dev');
  assert(purgeRes.purgedCount >= 1, `Successfully purged resolved incident records (${purgeRes.purgedCount})`);

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 9: Envelope-Encrypted User Decryption & Anti-Abuse Defensiveness
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Envelope-Encrypted Identity Decryption in Threat Matrix ---');

  const { envelopeEncryptionService } = await import('../src/services/envelope-encryption.service');
  const encEmailObj = envelopeEncryptionService.encryptField('encrypted_hero@domain.com', 'SYSTEM');
  const encNameObj = envelopeEncryptionService.encryptField('Encrypted Hero', 'SYSTEM');

  const encUserId = `enc_user_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, isFlagged, riskScore, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 0, 0, 10, datetime('now'), datetime('now'))
  `).run(
    encUserId,
    JSON.stringify(encEmailObj),
    envelopeEncryptionService.hashBlindIndex('encrypted_hero@domain.com'),
    JSON.stringify(encNameObj),
    'dummy_hash'
  );

  const decryptedMatrix = threatDetectionService.getUserSecurityMatrix();
  const foundEncryptedUser = decryptedMatrix.users.find(u => u.id === encUserId);
  assert(!!foundEncryptedUser, 'Encrypted user found in threat matrix');
  assert(foundEncryptedUser?.email === 'encrypted_hero@domain.com', `Decrypted user email is clean (${foundEncryptedUser?.email})`);
  assert(foundEncryptedUser?.name === 'Encrypted Hero', `Decrypted user name is clean (${foundEncryptedUser?.name})`);
  assert(!foundEncryptedUser?.email.includes('_encrypted'), 'Email does not contain raw _encrypted payload');
  assert(!foundEncryptedUser?.name.includes('_encrypted'), 'Name does not contain raw _encrypted payload');

  // Verify anti-abuse canonicalization and scan with weird input objects
  const canonObj = antiAbuseService.canonicalizeEmail(encEmailObj as any);
  assert(canonObj.canonicalEmail === 'encrypted_hero@domain.com', 'canonicalizeEmail safely decrypts encrypted object');

  const canonJsonStr = antiAbuseService.canonicalizeEmail(JSON.stringify(encEmailObj));
  assert(canonJsonStr.canonicalEmail === 'encrypted_hero@domain.com', 'canonicalizeEmail safely handles stringified encrypted payload');

  const canonNull = antiAbuseService.canonicalizeEmail(null);
  assert(canonNull.canonicalEmail === '', 'canonicalizeEmail safely handles null');

  const canonUndefined = antiAbuseService.canonicalizeEmail(undefined);
  assert(canonUndefined.canonicalEmail === '', 'canonicalizeEmail safely handles undefined');

  const encAudit = threatDetectionService.runPlatformSecurityAudit('admin_super', 'admin@flarebase.dev');
  assert(encAudit.scannedCount >= 3, `Security audit successfully completed across ${encAudit.scannedCount} users without error`);

  // ───────────────────────────────────────────────────────────────────────────
  //  SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`🏁 Threat Intelligence Matrix Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runThreatIntelligenceMatrixTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
