// ─────────────────────────────────────────────────────────────────────────────
//  tests/subnet-rate-limiting.test.ts
//  AegisDB — Phase 4: Adaptive Subnet Rate Limiting & Throttling Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { subnetRateLimiterService } from '../src/services/subnet-rate-limiter.service';
import { networkAccessService } from '../src/services/network-access.service';
import { getDb } from '../src/db/sqlite.connection';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`, detail || '');
    failedTests++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Running Phase 4: Subnet Rate Limiting & Throttling Test Suite');
  console.log('================================================================\n');

  const db = getDb();
  db.prepare('DELETE FROM subnet_rate_limit_policies').run();
  db.prepare('DELETE FROM network_access_rules').run();
  db.prepare('DELETE FROM jailed_ip_records').run();
  db.prepare('DELETE FROM tracked_client_devices').run();

  // Reset platform settings to defaults
  networkAccessService.updateNetworkSettings({
    ipFilteringEnabled: false,
    ipFilterDefaultPolicy: 'allow',
    adminEndpointIpLockEnabled: false,
    adminAllowedSubnet: '127.0.0.1',
    requireWriteIpWhitelist: false,
    enableSubnetRateLimiting: false,
    defaultSubnetRequestsPerMin: 300
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Subnet Policy CRUD Operations
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Subnet Policy Management & Persistence ---');

  const policy1 = subnetRateLimiterService.addPolicy({
    subnetPattern: '192.168.31.0/24',
    label: 'Home Wi-Fi Subnet Cap',
    requestsPerMinute: 60,
    burstLimit: 15,
    bandwidthLimitKbps: 5000,
    actionOnExceed: 'block'
  });

  assert(policy1.subnetPattern === '192.168.31.0/24', 'Created subnet policy with pattern 192.168.31.0/24');
  assert(policy1.requestsPerMinute === 60, 'Policy requestsPerMinute is 60');
  assert(policy1.actionOnExceed === 'block', 'Policy actionOnExceed is "block"');

  const allPolicies = subnetRateLimiterService.getPolicies();
  assert(allPolicies.some(p => p.id === policy1.id), 'Policy persisted in database and retrieved');

  const updatedPolicy = subnetRateLimiterService.updatePolicy(policy1.id, {
    requestsPerMinute: 120,
    actionOnExceed: 'throttle'
  });
  assert(updatedPolicy?.requestsPerMinute === 120, 'Updated policy requestsPerMinute to 120');
  assert(updatedPolicy?.actionOnExceed === 'throttle', 'Updated policy actionOnExceed to "throttle"');

  // Clean up policy1 for subsequent tests
  subnetRateLimiterService.deletePolicy(policy1.id);
  assert(!subnetRateLimiterService.getPolicies().some(p => p.id === policy1.id), 'Policy successfully deleted');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Hard Block Quota Enforcement per Subnet
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Subnet Rate Quota Enforcement (Action: Block) ---');

  const blockPolicy = subnetRateLimiterService.addPolicy({
    subnetPattern: '10.200.0.0/16',
    label: 'Restricted Branch Office Subnet',
    requestsPerMinute: 3,
    burstLimit: 5,
    actionOnExceed: 'block'
  });

  const ipClient = '10.200.5.50';

  // Request 1: Allowed (Remaining: 2)
  const res1 = subnetRateLimiterService.checkRateLimit(ipClient);
  assert(res1.allowed === true, 'Request 1/3 allowed');
  assert(res1.remaining === 2, 'Remaining quota is 2');

  // Request 2: Allowed (Remaining: 1)
  const res2 = subnetRateLimiterService.checkRateLimit(ipClient);
  assert(res2.allowed === true, 'Request 2/3 allowed');
  assert(res2.remaining === 1, 'Remaining quota is 1');

  // Request 3: Allowed (Remaining: 0)
  const res3 = subnetRateLimiterService.checkRateLimit(ipClient);
  assert(res3.allowed === true, 'Request 3/3 allowed');
  assert(res3.remaining === 0, 'Remaining quota reached 0');

  // Request 4: Blocked!
  const res4 = subnetRateLimiterService.checkRateLimit(ipClient);
  assert(res4.allowed === false, 'Request 4 is BLOCKED after exceeding 3 req/min');
  assert(res4.throttled === false, 'Request is not throttled (it is blocked)');
  assert(res4.matchedSubnet === '10.200.0.0/16', 'Matched subnet is 10.200.0.0/16');

  // Different IP outside the policy subnet is unaffected
  const outsideRes = subnetRateLimiterService.checkRateLimit('172.16.10.5');
  assert(outsideRes.allowed === true, 'Unrestricted external IP is allowed');

  subnetRateLimiterService.deletePolicy(blockPolicy.id);

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Adaptive Artificial Delay Throttling (Action: Throttle)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Adaptive Delay Throttling (Action: Throttle) ---');

  const throttlePolicy = subnetRateLimiterService.addPolicy({
    subnetPattern: '172.25.0.0/16',
    label: 'Throttled Partner Subnet',
    requestsPerMinute: 2,
    burstLimit: 10,
    actionOnExceed: 'throttle'
  });

  const throttledClient = '172.25.1.99';

  // Request 1 & 2
  subnetRateLimiterService.checkRateLimit(throttledClient);
  subnetRateLimiterService.checkRateLimit(throttledClient);

  // Request 3 (Exceeds 2 req/min): Allowed but with artificial delay!
  const throttleCheck = subnetRateLimiterService.checkRateLimit(throttledClient);
  assert(throttleCheck.allowed === true, 'Throttled request is allowed to complete');
  assert(throttleCheck.throttled === true, 'Request is marked as throttled');
  assert(typeof throttleCheck.delayMs === 'number' && throttleCheck.delayMs > 0, `Artificial delay applied: ${throttleCheck.delayMs}ms`);

  subnetRateLimiterService.deletePolicy(throttlePolicy.id);

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Localhost & Host Machine Anti-Lockout Exemption
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Localhost Anti-Lockout Exemption ---');

  const catchAllPolicy = subnetRateLimiterService.addPolicy({
    subnetPattern: '*',
    label: 'Global Strict Policy',
    requestsPerMinute: 2,
    actionOnExceed: 'block'
  });

  // Localhost sends 10 requests in a row
  let localhostAllAllowed = true;
  for (let i = 0; i < 10; i++) {
    const locRes = subnetRateLimiterService.checkRateLimit('127.0.0.1');
    if (!locRes.allowed) localhostAllAllowed = false;
  }
  assert(localhostAllAllowed === true, 'Localhost (127.0.0.1) sent 10 requests without being blocked (Exempt)');

  subnetRateLimiterService.deletePolicy(catchAllPolicy.id);

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Live Subnet Metrics & Telemetry
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Real-Time Subnet Traffic & Bandwidth Telemetry ---');

  const metrics = subnetRateLimiterService.getLiveSubnetMetrics();
  assert(Array.isArray(metrics), 'Live subnet metrics returned as array');
  assert(metrics.length > 0, 'Live metrics captured recent client request telemetry');

  console.log('\n================================================================');
  console.log(`📊 Phase 4 Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
