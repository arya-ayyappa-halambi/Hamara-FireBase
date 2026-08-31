// ─────────────────────────────────────────────────────────────────────────────
//  tests/tunnel-manager.test.ts
//  Test Suite for 1-Click Global Public Tunneling Manager & Zero-Elevation Guards
// ─────────────────────────────────────────────────────────────────────────────

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { tunnelManagerService } from '../src/services/tunnel-manager.service';
import { disallowOttSessionMutation } from '../src/middleware/admin.middleware';

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

async function runTunnelManagerTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running Global Public Tunneling Manager Test Suite');
  console.log('================================================================\n');

  initSqlite();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Initial Tunnel Status & Settings
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Initial Status & Configuration ---');
  const initial = tunnelManagerService.getTunnelStatus();
  assert(initial.status === 'offline' || initial.status === 'online', 'Initial status is valid');
  assert(typeof initial.autoCloseMinutes === 'number', 'autoCloseMinutes is a number');
  assert(initial.provider === 'localtunnel' || initial.provider === 'ngrok', 'Provider is valid');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Update Tunnel Preferences
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Update Preferences ---');
  tunnelManagerService.updateSettings({
    provider: 'ngrok',
    authToken: 'test_ngrok_token_1234567890',
    customDomain: 'test-aegis-domain',
    autoCloseMinutes: 120
  });

  const updated = tunnelManagerService.getTunnelStatus();
  assert(updated.provider === 'ngrok', 'Provider updated to ngrok');
  assert(updated.customDomain === 'test-aegis-domain', 'Custom domain preserved');
  assert(updated.autoCloseMinutes === 120, 'autoCloseMinutes updated to 120');
  assert(updated.authTokenConfigured === true, 'authTokenConfigured is true');
  assert(updated.maskedAuthToken.includes('••••'), 'Auth token is masked for security');

  // Reset back to localtunnel
  tunnelManagerService.updateSettings({
    provider: 'localtunnel',
    authToken: '',
    customDomain: '',
    autoCloseMinutes: 60
  });
  const reset = tunnelManagerService.getTunnelStatus();
  assert(reset.provider === 'localtunnel', 'Provider reset to localtunnel');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Traffic Recording
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Tunnel Traffic Telemetry Recording ---');
  const preTraffic = tunnelManagerService.getTunnelStatus();
  const preReqs = preTraffic.stats.totalRequests;
  const preBytes = preTraffic.stats.bytesTransferred;

  tunnelManagerService.recordTraffic(4096);
  const postTraffic = tunnelManagerService.getTunnelStatus();
  assert(postTraffic.stats.totalRequests === preReqs + 1, 'Total requests incremented');
  assert(postTraffic.stats.bytesTransferred === preBytes + 4096, 'Bytes transferred incremented');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Stop Tunnel State Reset
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Stop Tunnel State Cleanliness ---');
  const stopped = await tunnelManagerService.stopTunnel();
  assert(stopped.status === 'offline', 'Status is offline after stopTunnel');
  assert(stopped.publicUrl === null, 'publicUrl is null');
  assert(stopped.startedAt === null, 'startedAt is cleared');
  assert(stopped.expiresAt === null, 'expiresAt is cleared');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Strict Zero-Elevation Invariant for OTT Sessions
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Zero-Elevation Guard for OTT Sessions ---');
  let errReturned: any = null;
  const mockReqOtt: any = {
    user: {
      sub: 'admin-1',
      isSuperAdmin: true,
      isOttLogin: true,
      ottId: 'ott_test_123'
    }
  };
  const mockRes: any = {};

  disallowOttSessionMutation(mockReqOtt, mockRes, (err?: any) => {
    errReturned = err;
  });

  assert(errReturned !== null, 'OTT session blocked from modifying tunnel');
  assert(errReturned?.statusCode === 403, 'Returns 403 Forbidden');
  assert(errReturned?.details?.code === 'OTT_IMMUTABLE_SESSION', 'Code is OTT_IMMUTABLE_SESSION');

  console.log('\n================================================================');
  console.log(`📊 Tunnel Manager Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTunnelManagerTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
