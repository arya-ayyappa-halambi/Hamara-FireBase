// ─────────────────────────────────────────────────────────────────────────────
//  tests/ip-blocking-and-ranges.test.ts
//  Dedicated Test Suite: IP Range Setting, Wi-Fi Extender Subnets & IP Blocking
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite } from '../src/db/sqlite.connection';
import { networkAccessService } from '../src/services/network-access.service';

function runIpBlockingAndRangeTests(): void {
  console.log('================================================================');
  console.log('🧪 Running Dedicated IP Blocking & Range Setting Test Suite');
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

  // ── SCENARIO 1: IP Range Setting (e.g. 192.168.31.100 - 192.168.31.150) ───
  console.log('--- SCENARIO 1: IP Range Whitelisting (192.168.31.100-192.168.31.150) ---');
  // Enable strict whitelist mode
  networkAccessService.updateNetworkSettings({ ipFilteringEnabled: true, ipFilterDefaultPolicy: 'deny' });

  const rangeRule = networkAccessService.addRule({
    ipPattern: '192.168.31.100-192.168.31.150',
    label: 'Guest Room Extender DHCP Pool',
    action: 'allow'
  });

  assert(rangeRule.ruleType === 'range', 'Auto-detected ruleType as "range"');

  // Test Boundary & Internal IPs
  const inside1 = networkAccessService.isAccessAllowed('192.168.31.100');
  assert(inside1.allowed === true, 'Start boundary IP (192.168.31.100) is allowed');

  const inside2 = networkAccessService.isAccessAllowed('192.168.31.125');
  assert(inside2.allowed === true, 'Middle IP (192.168.31.125) inside range is allowed');

  const inside3 = networkAccessService.isAccessAllowed('192.168.31.150');
  assert(inside3.allowed === true, 'End boundary IP (192.168.31.150) is allowed');

  const outsideBelow = networkAccessService.isAccessAllowed('192.168.31.99');
  assert(outsideBelow.allowed === false, 'IP below range (192.168.31.99) is denied');

  const outsideAbove = networkAccessService.isAccessAllowed('192.168.31.151');
  assert(outsideAbove.allowed === false, 'IP above range (192.168.31.151) is denied');

  // Cleanup range rule
  networkAccessService.deleteRule(rangeRule.id);


  // ── SCENARIO 2: Entire Wi-Fi Extender Subnet (CIDR /24) ────────────────────
  console.log('\n--- SCENARIO 2: Wi-Fi Extender Subnet Whitelisting (192.168.2.0/24) ---');
  const subnetRule = networkAccessService.addRule({
    ipPattern: '192.168.2.0/24',
    label: 'Upstairs Wi-Fi Extender Subnet',
    action: 'allow'
  });

  assert(subnetRule.ruleType === 'cidr', 'Auto-detected ruleType as "cidr"');

  const extDevice1 = networkAccessService.isAccessAllowed('192.168.2.1');
  assert(extDevice1.allowed === true, 'Extender Gateway device (192.168.2.1) is allowed');

  const extDevice2 = networkAccessService.isAccessAllowed('192.168.2.55');
  assert(extDevice2.allowed === true, 'Phone on extender (192.168.2.55) is allowed');

  const extDevice3 = networkAccessService.isAccessAllowed('192.168.2.254');
  assert(extDevice3.allowed === true, 'Last IP on extender subnet (192.168.2.254) is allowed');

  const mainRouterDevice = networkAccessService.isAccessAllowed('192.168.1.55');
  assert(mainRouterDevice.allowed === false, 'Different subnet IP (192.168.1.55) is denied');

  networkAccessService.deleteRule(subnetRule.id);


  // ── SCENARIO 3: Explicit 1-Click Device IP Blocking ────────────────────────
  console.log('\n--- SCENARIO 3: Explicit Device IP Blocking (1-Click Admin Block) ---');
  // Reset to Open LAN (where all devices are normally allowed)
  networkAccessService.updateNetworkSettings({ ipFilteringEnabled: false, ipFilterDefaultPolicy: 'allow' });

  const targetIp = '192.168.31.77';

  // 1. Device connects and is active
  networkAccessService.recordDeviceActivity({
    ipAddress: targetIp,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
    userEmail: 'attacker@example.com'
  });

  const beforeBlock = networkAccessService.isAccessAllowed(targetIp);
  assert(beforeBlock.allowed === true, 'Device has access before being blocked');

  // 2. Admin explicitly blocks this IP
  const blockResult = networkAccessService.toggleBlockDevice(targetIp, true);
  assert(blockResult.isBlocked === true, 'toggleBlockDevice returns isBlocked = true');

  // 3. Verify access is now rejected even in Open LAN mode
  const afterBlock = networkAccessService.isAccessAllowed(targetIp);
  assert(afterBlock.allowed === false, 'Blocked device is rejected with HTTP 403 even in Open LAN mode');
  assert(afterBlock.reason.includes('explicitly blocked'), 'Rejection reason states device is explicitly blocked');

  // 4. Admin unblocks the device
  const unblockResult = networkAccessService.toggleBlockDevice(targetIp, false);
  assert(unblockResult.isBlocked === false, 'toggleBlockDevice returns isBlocked = false');

  const afterUnblock = networkAccessService.isAccessAllowed(targetIp);
  assert(afterUnblock.allowed === true, 'Unblocked device immediately regains access');


  // ── SCENARIO 4: Deny Rule for a Problematic Extender / Range ───────────────
  console.log('\n--- SCENARIO 4: Blacklisting an Extender Subnet via DENY Rule ---');
  // Open LAN is on, but admin wants to explicitly block everyone on Extender 2 (192.168.5.0/24)
  const denyExtenderRule = networkAccessService.addRule({
    ipPattern: '192.168.5.0/24',
    label: 'Blocked Neighbor Extender',
    action: 'deny'
  });

  const deviceOnBlockedExtender = networkAccessService.isAccessAllowed('192.168.5.42');
  assert(deviceOnBlockedExtender.allowed === false, 'Device on blacklisted extender is denied');
  assert(deviceOnBlockedExtender.reason.includes('Blocked Neighbor Extender'), 'Rejection reason specifies matched deny rule label');

  const deviceOnMainWifi = networkAccessService.isAccessAllowed('192.168.1.42');
  assert(deviceOnMainWifi.allowed === true, 'Device on main Wi-Fi remains allowed');

  networkAccessService.deleteRule(denyExtenderRule.id);

  console.log('\n================================================================');
  console.log(`📊 All IP Blocking & Range Setting Tests Passed: ${passedCount} passed, ${failedCount} failed`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runIpBlockingAndRangeTests();
