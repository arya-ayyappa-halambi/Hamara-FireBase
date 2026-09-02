// ─────────────────────────────────────────────────────────────────────────────
//  tests/mesh-vpn.test.ts
//  Test Suite for Private Peer-to-Peer Mesh VPN (n2n, Tailscale, WireGuard, ZeroTier)
// ─────────────────────────────────────────────────────────────────────────────

import { initSqlite } from '../src/db/sqlite.connection';
import { meshVpnService } from '../src/services/mesh-vpn.service';
import { networkAccessService } from '../src/services/network-access.service';

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

async function runMeshVpnTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running Private Mesh VPN (n2n / Tailscale / WireGuard) Test Suite');
  console.log('================================================================\n');

  initSqlite();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Initial Mesh Status & Network Interface Scan
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Initial Status & Interface Scanner ---');
  const initial = meshVpnService.getMeshStatus(3000);
  assert(typeof initial.enabled === 'boolean', 'Enabled is boolean');
  assert(initial.status === 'online' || initial.status === 'standby' || initial.status === 'disabled', 'Status is valid');
  assert(Array.isArray(initial.detectedInterfaces), 'Detected interfaces is an array');
  assert(typeof initial.commandsGuide.n2n === 'string', 'n2n command guide available');
  assert(typeof initial.commandsGuide.tailscale === 'string', 'Tailscale command guide available');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Mesh & Private IP Range Classification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Mesh IP Classification ---');
  assert(meshVpnService.isTailscaleIp('100.64.0.5') === true, '100.64.0.5 is identified as Tailscale CGNAT IP');
  assert(meshVpnService.isTailscaleIp('100.120.50.1') === true, '100.120.50.1 is identified as Tailscale CGNAT IP');
  assert(meshVpnService.isTailscaleIp('8.8.8.8') === false, '8.8.8.8 is NOT a Tailscale IP');
  assert(meshVpnService.isTailscaleIp('192.168.1.1') === false, '192.168.1.1 is NOT a Tailscale IP');

  assert(meshVpnService.isMeshOrPrivateIp('10.1.0.5') === true, '10.1.0.5 (n2n overlay) is identified as Mesh/Private IP');
  assert(meshVpnService.isMeshOrPrivateIp('100.100.100.100') === true, 'Tailscale 100.100.100.100 is identified as Mesh/Private IP');
  assert(meshVpnService.isMeshOrPrivateIp('192.168.31.57') === true, '192.168.31.57 is identified as Mesh/Private IP');
  assert(meshVpnService.isMeshOrPrivateIp('93.184.216.34') === false, 'Public IP 93.184.216.34 is NOT a Mesh/Private IP');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Custom Mesh IP Configuration & Status Update
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Custom Mesh IP & Overlay Persistence ---');
  const customReport = meshVpnService.updateMeshSettings({
    enabled: true,
    protocol: 'n2n',
    customIp: '10.1.0.42',
    autoWhitelist: true
  });

  assert(customReport.status === 'online', 'Status is online with custom mesh IP');
  assert(customReport.meshIp === '10.1.0.42', 'Mesh IP set to 10.1.0.42');
  assert(customReport.meshDirectUrl === 'http://10.1.0.42:3000', 'Direct URL is http://10.1.0.42:3000');
  assert(customReport.autoWhitelistEnabled === true, 'Auto-whitelist is enabled');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Auto-Whitelist Integration with Network Access Control
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Network Access Control Mesh Auto-Whitelist ---');
  // Enable admin perimeter lock
  networkAccessService.updateNetworkSettings({ adminEndpointIpLockEnabled: true, adminAllowedSubnet: '127.0.0.1' });

  // A request from mesh IP 10.1.0.42 to /api/v1/admin/stats
  const meshAccessCheck = networkAccessService.isEndpointAccessAllowed({
    clientIp: '10.1.0.42',
    path: '/api/v1/admin/stats',
    method: 'GET'
  });
  assert(meshAccessCheck.allowed === true, 'Mesh IP 10.1.0.42 is authorized for admin perimeter via mesh auto-whitelist');

  // A random foreign public IP is denied
  const publicAccessCheck = networkAccessService.isEndpointAccessAllowed({
    clientIp: '198.51.100.77',
    path: '/api/v1/admin/stats',
    method: 'GET'
  });
  assert(publicAccessCheck.allowed === false, 'Foreign public IP 198.51.100.77 is blocked by perimeter lock');

  // Disable auto-whitelist and verify mesh IP is now subject to strict subnet lock
  meshVpnService.updateMeshSettings({ autoWhitelist: false });
  const meshAccessWithoutWhitelist = networkAccessService.isEndpointAccessAllowed({
    clientIp: '10.1.0.42',
    path: '/api/v1/admin/stats',
    method: 'GET'
  });
  assert(meshAccessWithoutWhitelist.allowed === false, 'Mesh IP is blocked when auto-whitelist is disabled');

  // Reset to auto-whitelist enabled
  meshVpnService.updateMeshSettings({ autoWhitelist: true });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Peer Reachability Probe
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Peer Latency Probe ---');
  // Probe non-existent IP with short timeout
  const probe = await meshVpnService.probePeerReachability('10.254.254.254', 3000, 300);
  assert(typeof probe.reachable === 'boolean', 'Probe returned reachability status');
  assert(probe.target === '10.254.254.254:3000', 'Target host and port formatted properly');

  console.log('\n================================================================');
  console.log(`📊 Mesh VPN Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runMeshVpnTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
