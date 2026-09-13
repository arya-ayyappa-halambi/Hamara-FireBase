// ─────────────────────────────────────────────────────────────────────────────
//  tests/ip-jail-and-ttl-passes.test.ts
//  Test Suite: Automated IP Jail, Brute-Force Shield & Temporary TTL Passes
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite } from '../src/db/sqlite.connection';
import { networkAccessService } from '../src/services/network-access.service';

function runIpJailAndTtlTests(): void {
  console.log('================================================================');
  console.log('🧪 Running Automated IP Jail, Brute-Force Shield & TTL Passes Tests');
  console.log('================================================================\n');

  initSqlite();

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failedCount++;
    }
  }

  // ── 1. Automated Brute-Force Detection & IP Jail ─────────────────────────
  console.log('--- 1. Automated Brute-Force Detection & IP Jail ---');

  const attackerIp = '198.51.100.77';

  // 4 failed attempts should not jail yet
  for (let i = 1; i <= 4; i++) {
    const res = networkAccessService.recordFailedAuthAttempt(attackerIp, 'victim@example.com');
    assert(res.jailed === false, `Attempt ${i}: IP is not jailed yet (${res.remainingUntilJail} left)`);
  }

  // 5th failed attempt triggers jail
  const jailTrigger = networkAccessService.recordFailedAuthAttempt(attackerIp, 'victim@example.com');
  assert(jailTrigger.jailed === true, 'Attempt 5: IP is automatically jailed by Brute-Force Guard');
  assert(jailTrigger.jailRecord !== undefined, 'Jail record object returned with details');
  assert(jailTrigger.jailRecord?.status === 'active', 'Jail status is active');

  // Verify access is blocked for jailed IP
  const accessCheck = networkAccessService.isAccessAllowed(attackerIp);
  assert(accessCheck.allowed === false, 'Access denied for quarantined IP');
  assert(accessCheck.reason.includes('quarantined in jail'), 'Denial reason mentions quarantine jail');

  // Verify getJailedIps lists the attacker IP
  const jailedList = networkAccessService.getJailedIps();
  const found = jailedList.find(j => j.ipAddress === attackerIp && j.status === 'active');
  assert(found !== undefined, 'getJailedIps() includes active attacker record');

  // ── 2. Localhost & Host Interface Protection Invariant ───────────────────
  console.log('\n--- 2. Localhost & Host Interface Anti-Lockout Invariant ---');

  const localRes = networkAccessService.recordFailedAuthAttempt('127.0.0.1', 'admin@flarebase.dev');
  assert(localRes.jailed === false, 'Localhost 127.0.0.1 can NEVER be jailed');

  let localJailError = false;
  try {
    networkAccessService.jailIpManually({ ipAddress: '127.0.0.1', reason: 'Test' });
  } catch {
    localJailError = true;
  }
  assert(localJailError === true, 'jailIpManually throws error when trying to jail localhost');

  // ── 3. Pardon / Unjail Flow ──────────────────────────────────────────────
  console.log('\n--- 3. Pardon / Unjail Flow ---');

  const pardonResult = networkAccessService.pardonJailedIp(attackerIp, 'Super Admin');
  assert(pardonResult === true, 'pardonJailedIp returns true');

  const postPardonCheck = networkAccessService.isIpJailed(attackerIp);
  assert(postPardonCheck.jailed === false, 'Attacker IP is no longer marked as jailed');

  // ── 4. Temporary / Time-Expiring IP Whitelist Passes (TTL) ─────────────────
  console.log('\n--- 4. Temporary / Time-Expiring IP Passes (TTL) ---');

  // Set strict whitelist mode
  networkAccessService.updateNetworkSettings({ ipFilteringEnabled: true, ipFilterDefaultPolicy: 'deny' });

  const tempGuestIp = '192.168.31.222';

  // Add a temporary 60-minute pass
  const tempRule = networkAccessService.addRule({
    ipPattern: tempGuestIp,
    label: 'Guest Contractor Tablet',
    action: 'allow',
    durationMinutes: 60
  });

  assert(tempRule.isTemporary === true, 'Rule is marked as temporary');
  assert(tempRule.expiresAt !== null, 'Rule has an expiresAt timestamp');

  const allowedCheck = networkAccessService.isAccessAllowed(tempGuestIp);
  assert(allowedCheck.allowed === true, 'Guest IP is allowed while temporary pass is active');

  // Test expired temporary pass
  const expiredPastIso = new Date(Date.now() - 10000).toISOString(); // 10s in past
  const expiredRule = networkAccessService.addRule({
    ipPattern: '192.168.31.223',
    label: 'Expired Temp Guest',
    action: 'allow',
    expiresAt: expiredPastIso
  });

  const expiredCheck = networkAccessService.isAccessAllowed('192.168.31.223');
  assert(expiredCheck.allowed === false, 'Expired temporary rule is ignored and access is denied');

  // Test Auto-Pruning
  networkAccessService.pruneExpiredRulesAndJails();
  const rulesAfterPrune = networkAccessService.getRules();
  const expiredFound = rulesAfterPrune.find(r => r.id === expiredRule.id);
  assert(expiredFound === undefined, 'Expired rule was cleanly pruned from database by pruneExpiredRulesAndJails()');

  // Cleanup
  networkAccessService.deleteRule(tempRule.id);
  networkAccessService.clearAllJails();
  networkAccessService.updateNetworkSettings({ ipFilteringEnabled: false, ipFilterDefaultPolicy: 'allow' });

  console.log('\n================================================================');
  console.log(`📊 Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runIpJailAndTtlTests();
