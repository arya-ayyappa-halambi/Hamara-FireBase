// ─────────────────────────────────────────────────────────────────────────────
//  tests/endpoint-scoping-and-tenant-ip.test.ts
//  AegisDB — Phase 2: Endpoint-Level IP Scoping & Tenant Isolation Test Suite
// ─────────────────────────────────────────────────────────────────────────────

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
  console.log('🧪 Running Phase 2: Endpoint Scoping & Per-Project IP Whitelist Tests');
  console.log('================================================================\n');

  const db = getDb();
  // Clear any existing test rules
  db.prepare('DELETE FROM network_access_rules').run();
  db.prepare('DELETE FROM jailed_ip_records').run();

  // Reset platform settings to defaults
  networkAccessService.updateNetworkSettings({
    ipFilteringEnabled: false,
    ipFilterDefaultPolicy: 'allow',
    adminEndpointIpLockEnabled: false,
    adminAllowedSubnet: '127.0.0.1',
    requireWriteIpWhitelist: false
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Super Admin Endpoint Perimeter Isolation (/api/v1/admin/*)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Super Admin Endpoint Perimeter Lock (/api/v1/admin/*) ---');

  const externalClientIp = '192.168.1.100';
  const managementIp = '192.168.31.50';

  // Before lock: Open LAN allows access
  const beforeLock = networkAccessService.isEndpointAccessAllowed({
    clientIp: externalClientIp,
    path: '/api/v1/admin/platform-settings',
    method: 'GET'
  });
  assert(beforeLock.allowed === true, 'External IP allowed on admin endpoints when perimeter lock is disabled');

  // Enable Admin Endpoint Perimeter Lock
  networkAccessService.updateNetworkSettings({
    adminEndpointIpLockEnabled: true,
    adminAllowedSubnet: '127.0.0.1, 192.168.31.50/32'
  });

  // External IP trying to access /api/v1/admin/* must be BLOCKED
  const adminBlocked = networkAccessService.isEndpointAccessAllowed({
    clientIp: externalClientIp,
    path: '/api/v1/admin/platform-settings',
    method: 'GET'
  });
  assert(adminBlocked.allowed === false, 'External IP blocked from /api/v1/admin/* when perimeter lock is enabled');
  assert(adminBlocked.code === 'ADMIN_PERIMETER_RESTRICTED', 'Error code is ADMIN_PERIMETER_RESTRICTED');

  // External IP accessing public DB / user endpoints remains ALLOWED
  const publicAllowed = networkAccessService.isEndpointAccessAllowed({
    clientIp: externalClientIp,
    path: '/api/v1/db/collections',
    method: 'GET'
  });
  assert(publicAllowed.allowed === true, 'External IP remains allowed on non-admin client DB endpoints');

  // Management IP (192.168.31.50) is ALLOWED on /api/v1/admin/*
  const mgmtAllowed = networkAccessService.isEndpointAccessAllowed({
    clientIp: managementIp,
    path: '/api/v1/admin/platform-settings',
    method: 'GET'
  });
  assert(mgmtAllowed.allowed === true, 'Designated Management IP is allowed on /api/v1/admin/*');

  // Localhost (127.0.0.1) is always ALLOWED on /api/v1/admin/*
  const localhostAllowed = networkAccessService.isEndpointAccessAllowed({
    clientIp: '127.0.0.1',
    path: '/api/v1/admin/platform-settings',
    method: 'GET'
  });
  assert(localhostAllowed.allowed === true, 'Localhost 127.0.0.1 host machine bypass is always allowed');

  // Add an admin_only rule for external IP and test it grants admin access
  const adminRule = networkAccessService.addRule({
    ipPattern: externalClientIp,
    label: 'DevOps Lead Remote Admin Access',
    scope: 'admin_only',
    action: 'allow'
  });
  const externalNowAllowed = networkAccessService.isEndpointAccessAllowed({
    clientIp: externalClientIp,
    path: '/api/v1/admin/platform-settings',
    method: 'GET'
  });
  assert(externalNowAllowed.allowed === true, 'Admin-scoped allow rule grants external IP access to admin endpoints');
  networkAccessService.deleteRule(adminRule.id);

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: DB Write Operations Mutation Shield (POST/PATCH/DELETE)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Database Write-Operation IP Mutation Shield ---');

  // Reset admin lock, enable write-operation whitelist
  networkAccessService.updateNetworkSettings({
    adminEndpointIpLockEnabled: false,
    requireWriteIpWhitelist: true
  });

  const guestIp = '192.168.1.75';

  // Read request (GET) is ALLOWED
  const readAllowed = networkAccessService.isEndpointAccessAllowed({
    clientIp: guestIp,
    path: '/api/v1/db/my-collection',
    method: 'GET'
  });
  assert(readAllowed.allowed === true, 'Read (GET) requests are allowed without write whitelist');

  // Write request (POST) is BLOCKED
  const postBlocked = networkAccessService.isEndpointAccessAllowed({
    clientIp: guestIp,
    path: '/api/v1/db/my-collection',
    method: 'POST'
  });
  assert(postBlocked.allowed === false, 'Write (POST) requests are blocked when requireWriteIpWhitelist is active');
  assert(postBlocked.code === 'WRITE_MUTATION_RESTRICTED', 'Error code is WRITE_MUTATION_RESTRICTED');

  // Write request (DELETE) is BLOCKED
  const deleteBlocked = networkAccessService.isEndpointAccessAllowed({
    clientIp: guestIp,
    path: '/api/v1/db/my-collection/doc-123',
    method: 'DELETE'
  });
  assert(deleteBlocked.allowed === false, 'Write (DELETE) requests are blocked when requireWriteIpWhitelist is active');

  // Add db_write_only allow rule for guestIp
  const writeRule = networkAccessService.addRule({
    ipPattern: guestIp,
    label: 'Backend Microservice Write Pass',
    scope: 'db_write_only',
    action: 'allow'
  });

  const postNowAllowed = networkAccessService.isEndpointAccessAllowed({
    clientIp: guestIp,
    path: '/api/v1/db/my-collection',
    method: 'POST'
  });
  assert(postNowAllowed.allowed === true, 'Write mutations allowed after adding db_write_only rule');
  networkAccessService.deleteRule(writeRule.id);

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Per-Project Tenant IP Whitelist Isolation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Per-Project Tenant IP Whitelisting ---');

  // Reset write requirement
  networkAccessService.updateNetworkSettings({
    requireWriteIpWhitelist: false
  });

  const projAlphaId = 'proj_alpha_secure';
  const projBetaId = 'proj_beta_open';
  const officeIp = '10.0.0.45';
  const outsideIp = '192.168.1.55';

  // Add project-scoped rule for proj_alpha
  const projRule = networkAccessService.addRule({
    ipPattern: '10.0.0.0/24',
    label: 'Office VPN Subnet for Alpha Project',
    scope: 'project',
    projectId: projAlphaId,
    action: 'allow'
  });

  // Office IP requesting proj_alpha is ALLOWED
  const officeProjAlpha = networkAccessService.isEndpointAccessAllowed({
    clientIp: officeIp,
    path: '/api/v1/db/alpha-docs',
    method: 'GET',
    projectId: projAlphaId
  });
  assert(officeProjAlpha.allowed === true, 'Office VPN IP (10.0.0.45) allowed on Project Alpha');

  // Outside IP requesting proj_alpha is REJECTED
  const outsideProjAlpha = networkAccessService.isEndpointAccessAllowed({
    clientIp: outsideIp,
    path: '/api/v1/db/alpha-docs',
    method: 'GET',
    projectId: projAlphaId
  });
  assert(outsideProjAlpha.allowed === false, 'Outside IP (192.168.1.55) denied on Project Alpha');
  assert(outsideProjAlpha.code === 'PROJECT_IP_RESTRICTED', 'Error code is PROJECT_IP_RESTRICTED');

  // Outside IP requesting proj_beta (no custom rules) is ALLOWED
  const outsideProjBeta = networkAccessService.isEndpointAccessAllowed({
    clientIp: outsideIp,
    path: '/api/v1/db/beta-docs',
    method: 'GET',
    projectId: projBetaId
  });
  assert(outsideProjBeta.allowed === true, 'Outside IP allowed on Project Beta with no project-specific restrictions');

  // Add project deny rule inside proj_alpha
  const projDenyRule = networkAccessService.addRule({
    ipPattern: '10.0.0.99',
    label: 'Compromised Office Terminal in Alpha',
    scope: 'project',
    projectId: projAlphaId,
    action: 'deny'
  });

  const blacklistedOfficeIp = networkAccessService.isEndpointAccessAllowed({
    clientIp: '10.0.0.99',
    path: '/api/v1/db/alpha-docs',
    method: 'GET',
    projectId: projAlphaId
  });
  assert(blacklistedOfficeIp.allowed === false, 'Explicitly denied IP (10.0.0.99) rejected in Project Alpha');

  // Cleanup
  networkAccessService.deleteRule(projRule.id);
  networkAccessService.deleteRule(projDenyRule.id);

  console.log('\n================================================================');
  console.log(`📊 Phase 2 Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
