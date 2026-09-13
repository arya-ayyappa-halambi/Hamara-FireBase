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
  assert(initial.provider === 'localtunnel' || initial.provider === 'ngrok' || initial.provider === 'cloudflare', 'Provider is valid');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Update Tunnel Preferences
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Update Preferences ---');
  tunnelManagerService.updateSettings({
    provider: 'cloudflare',
    authToken: '',
    customDomain: '',
    autoCloseMinutes: 60
  });
  const cfReport = tunnelManagerService.getTunnelStatus();
  assert(cfReport.provider === 'cloudflare', 'Provider updated to cloudflare');

  tunnelManagerService.updateSettings({
    provider: 'ngrok',
    authToken: 'test_ngrok_token_1234567890',
    customDomain: 'test-flarebase-domain',
    autoCloseMinutes: 120
  });

  const updated = tunnelManagerService.getTunnelStatus();
  assert(updated.provider === 'ngrok', 'Provider updated to ngrok');
  assert(updated.customDomain === 'test-flarebase-domain', 'Custom domain preserved');
  assert(updated.autoCloseMinutes === 120, 'autoCloseMinutes updated to 120');
  assert(updated.authTokenConfigured === true, 'authTokenConfigured is true');
  assert(updated.maskedAuthToken.includes('••••'), 'Auth token is masked for security');

  // Reset back to cloudflare (default)
  tunnelManagerService.updateSettings({
    provider: 'cloudflare',
    authToken: '',
    customDomain: '',
    autoCloseMinutes: 60
  });
  const reset = tunnelManagerService.getTunnelStatus();
  assert(reset.provider === 'cloudflare', 'Provider reset to cloudflare');

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

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Adopt External Live Tunnel URL
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Adopt External Live Tunnel URL ---');
  const adopted = tunnelManagerService.adoptExternalTunnel('https://quotes-brussels-origin-officer.trycloudflare.com', 'cloudflare');
  assert(adopted.status === 'online', 'Adopted tunnel status is online');
  assert(adopted.publicUrl === 'https://quotes-brussels-origin-officer.trycloudflare.com', 'Adopted publicUrl matches');
  assert(adopted.provider === 'cloudflare', 'Adopted provider is cloudflare');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: Global Network Ingress Disabled Killswitch
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Global Network Disabled Killswitch Enforcement ---');
  const { networkAccessService } = await import('../src/services/network-access.service');

  // Stop tunnel so tunnelEnabled is 0 in platform_settings
  await tunnelManagerService.stopTunnel();

  const disabledCheck = networkAccessService.isEndpointAccessAllowed({
    clientIp: '198.51.100.22',
    path: '/api/v1/db/collections/items/documents',
    method: 'GET',
    isTunnel: true,
    hostHeader: 'quotes-brussels-origin-officer.trycloudflare.com'
  });

  assert(disabledCheck.allowed === false, 'Blocked WAN tunnel traffic when tunnel is disabled');
  assert(disabledCheck.code === 'GLOBAL_NETWORK_DISABLED', 'Error code is GLOBAL_NETWORK_DISABLED');

  // Re-enable tunnel
  tunnelManagerService.adoptExternalTunnel('https://quotes-brussels-origin-officer.trycloudflare.com', 'cloudflare');
  const enabledCheck = networkAccessService.isEndpointAccessAllowed({
    clientIp: '198.51.100.22',
    path: '/api/v1/db/collections/items/documents',
    method: 'GET',
    isTunnel: true,
    hostHeader: 'quotes-brussels-origin-officer.trycloudflare.com'
  });
  assert(enabledCheck.allowed === true, 'Permitted project database access over global tunnel when enabled');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Flexible API Key Extraction for Global Tunnel Ingress
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Flexible Project API Key Authentication ---');
  const { authenticateApiKeyOrJwt } = await import('../src/middleware/apikey.middleware');
  const { projectService } = await import('../src/project/project.service');

  const db = getDb();
  let testUser = db.prepare('SELECT id FROM users LIMIT 1').get() as any;
  if (!testUser) {
    db.prepare(`
      INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
      VALUES ('tunnel-owner-id', 'tunnel@flarebase.dev', 'thash', 'Tunnel User', 'pass', 0, datetime('now'), datetime('now'))
    `).run();
    testUser = { id: 'tunnel-owner-id' };
  }

  const proj = await projectService.createProject(testUser.id, 'Global Tunnel App');
  const rawKey = proj.rawApiKey;

  // Test header x-api-key
  let nextCalled1 = false;
  const mockReq1: any = {
    headers: { 'x-api-key': rawKey },
    query: {},
    path: '/api/v1/db/collections/tasks/documents',
    method: 'GET'
  };
  authenticateApiKeyOrJwt(mockReq1, {} as any, (err?: any) => {
    if (!err) nextCalled1 = true;
  });
  assert(nextCalled1 && mockReq1.project?.id === proj.project.id, 'Authenticated via x-api-key header');

  // Test query parameter apiKey
  let nextCalled2 = false;
  const mockReq2: any = {
    headers: {},
    query: { apiKey: rawKey },
    path: '/api/v1/db/collections/tasks/documents',
    method: 'GET'
  };
  authenticateApiKeyOrJwt(mockReq2, {} as any, (err?: any) => {
    if (!err) nextCalled2 = true;
  });
  assert(nextCalled2 && mockReq2.project?.id === proj.project.id, 'Authenticated via apiKey query param');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: Host OS Lifecycle & Recovery Isolation over WAN
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Host OS Lifecycle & Recovery Isolation ---');
  
  const shutdownCheck = networkAccessService.isEndpointAccessAllowed({
    clientIp: '198.51.100.22',
    path: '/api/v1/admin/server/shutdown',
    method: 'POST',
    isTunnel: true,
    hostHeader: 'quotes-brussels-origin-officer.trycloudflare.com'
  });
  assert(shutdownCheck.allowed === false, 'Hard-blocked server shutdown from external global tunnel');
  assert(shutdownCheck.code === 'HOST_ISOLATION_PROTECTED', 'Error code is HOST_ISOLATION_PROTECTED');

  const restoreCheck = networkAccessService.isEndpointAccessAllowed({
    clientIp: '198.51.100.22',
    path: '/api/v1/system/restore',
    method: 'POST',
    isTunnel: true,
    hostHeader: 'quotes-brussels-origin-officer.trycloudflare.com'
  });
  assert(restoreCheck.allowed === false, 'Hard-blocked system restore from external global tunnel');
  assert(restoreCheck.code === 'HOST_ISOLATION_PROTECTED', 'Error code is HOST_ISOLATION_PROTECTED');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: Google Auth .env Dynamic Resolution & Secret Protection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 10. Google Auth .env Dynamic Resolution ---');
  process.env.GOOGLE_CLIENT_ID = 'test-env-google-id.apps.googleusercontent.com';
  
  const { verifyGoogleToken } = await import('../src/auth/auth.google');
  let googleErr: any = null;
  try {
    // Attempt verification with a dummy token to confirm client initialized with process.env.GOOGLE_CLIENT_ID
    await verifyGoogleToken('dummy_invalid_token');
  } catch (err: any) {
    googleErr = err;
  }
  assert(googleErr !== null, 'Google verification executed and rejected dummy token');
  assert(googleErr?.statusCode === 401, 'Returns 401 for invalid token instead of 403/500 misconfiguration');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 11: Storage Driver Directory Traversal Protection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 11. Storage Driver Directory Traversal Guard ---');
  const { LocalStorageDriver } = await import('../src/storage/local-storage.driver');
  const driver = new LocalStorageDriver();
  
  let traversalErr: any = null;
  try {
    await driver.getFileStream('../../etc/passwd');
  } catch (err: any) {
    traversalErr = err;
  }
  assert(traversalErr !== null, 'Blocked path traversal attempt in storage driver');

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
