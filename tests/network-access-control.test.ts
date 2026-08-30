// ─────────────────────────────────────────────────────────────────────────────
//  tests/network-access-control.test.ts
//  Integration Test Suite: IP Whitelisting, Subnet Matching & Device Tracking
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite } from '../src/db/sqlite.connection';
import { networkAccessService } from '../src/services/network-access.service';

function runNetworkAccessTests(): void {
  console.log('================================================================');
  console.log('🧪 Running Network Access Control & Device Tracking Test Suite');
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

  // ── 1. IP Utilities & Subnet Matcher ──────────────────────────────────────
  console.log('--- 1. IP Pattern, CIDR & Range Matching ---');
  assert(networkAccessService.normalizeIp('::ffff:192.168.1.100') === '192.168.1.100', 'Normalizes IPv6-mapped IPv4');
  assert(networkAccessService.normalizeIp('::1') === '127.0.0.1', 'Normalizes IPv6 localhost to 127.0.0.1');
  assert(networkAccessService.isLocalhost('127.0.0.1') === true, 'Identifies 127.0.0.1 as localhost');
  assert(networkAccessService.isLocalhost('::1') === true, 'Identifies ::1 as localhost');
  assert(networkAccessService.isLocalhost('192.168.31.50') === false, 'Rejects external IP as localhost');

  assert(networkAccessService.matchIpPattern('192.168.31.50', '192.168.31.50') === true, 'Exact IP match');
  assert(networkAccessService.matchIpPattern('192.168.31.51', '192.168.31.50') === false, 'Exact IP mismatch');
  assert(networkAccessService.matchIpPattern('10.0.0.1', '*') === true, 'Wildcard * matches any IP');

  assert(networkAccessService.matchIpPattern('192.168.31.50', '192.168.31.0/24') === true, 'CIDR /24 subnet match inside range');
  assert(networkAccessService.matchIpPattern('192.168.31.254', '192.168.31.0/24') === true, 'CIDR /24 subnet match end boundary');
  assert(networkAccessService.matchIpPattern('192.168.32.1', '192.168.31.0/24') === false, 'CIDR /24 subnet mismatch outside range');
  assert(networkAccessService.matchIpPattern('10.0.5.20', '10.0.0.0/16') === true, 'CIDR /16 subnet match');

  assert(networkAccessService.matchIpPattern('192.168.31.150', '192.168.31.100-192.168.31.200') === true, 'IP Range match inside range');
  assert(networkAccessService.matchIpPattern('192.168.31.99', '192.168.31.100-192.168.31.200') === false, 'IP Range mismatch below range');
  assert(networkAccessService.matchIpPattern('192.168.31.201', '192.168.31.100-192.168.31.200') === false, 'IP Range mismatch above range');

  // ── 2. User-Agent Device Parser ───────────────────────────────────────────
  console.log('\n--- 2. User-Agent Fingerprinting & Parsing ---');
  const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const iosParsed = networkAccessService.parseUserAgent(iosUa);
  assert(iosParsed.osName === 'iOS' && iosParsed.deviceType === 'mobile' && iosParsed.browserName === 'Apple Safari', 'Parses iOS Safari on iPhone');

  const androidUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
  const androidParsed = networkAccessService.parseUserAgent(androidUa);
  assert(androidParsed.osName === 'Android' && androidParsed.deviceType === 'mobile' && androidParsed.browserName === 'Google Chrome', 'Parses Android Chrome on Pixel');

  const winUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0';
  const winParsed = networkAccessService.parseUserAgent(winUa);
  assert(winParsed.osName === 'Windows' && winParsed.deviceType === 'desktop' && winParsed.browserName === 'Microsoft Edge', 'Parses Windows Microsoft Edge');

  // ── 3. Access Verification & Localhost Lockout Prevention ─────────────────
  console.log('\n--- 3. Access Verification & Localhost Lockout Prevention ---');
  networkAccessService.updateNetworkSettings({ ipFilteringEnabled: true, ipFilterDefaultPolicy: 'deny' });
  const localhostResult = networkAccessService.isAccessAllowed('127.0.0.1');
  assert(localhostResult.allowed === true, 'Localhost (127.0.0.1) is unconditionally allowed even under strict whitelist');

  const unlistedResult = networkAccessService.isAccessAllowed('192.168.31.88');
  assert(unlistedResult.allowed === false, 'Unlisted LAN IP is blocked when whitelist is enforced');

  const rule = networkAccessService.addRule({
    ipPattern: '192.168.31.88',
    label: 'Test Dev Phone',
    action: 'allow'
  });
  const whitelistedResult = networkAccessService.isAccessAllowed('192.168.31.88');
  assert(whitelistedResult.allowed === true, 'Whitelisted IP is granted access after adding rule');

  networkAccessService.deleteRule(rule.id);
  const removedResult = networkAccessService.isAccessAllowed('192.168.31.88');
  assert(removedResult.allowed === false, 'Access revoked after deleting rule');

  let blockedLocalhostCaught = false;
  try {
    networkAccessService.toggleBlockDevice('127.0.0.1', true);
  } catch (err: any) {
    blockedLocalhostCaught = err.message.includes('Localhost');
  }
  assert(blockedLocalhostCaught === true, 'Prevent blocking localhost device');

  // Restore open LAN
  networkAccessService.updateNetworkSettings({ ipFilteringEnabled: false, ipFilterDefaultPolicy: 'allow' });
  const openLanResult = networkAccessService.isAccessAllowed('192.168.31.99');
  assert(openLanResult.allowed === true, 'Open LAN mode restored allowing connections');

  console.log('\n================================================================');
  console.log(`📊 Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runNetworkAccessTests();
