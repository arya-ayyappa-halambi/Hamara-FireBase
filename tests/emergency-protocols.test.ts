// ─────────────────────────────────────────────────────────────────────────────
//  tests/emergency-protocols.test.ts
//  FlareBase — Emergency Protocols, Panic Mode & Maintenance Windows Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { emergencyControlService } from '../src/services/emergency-control.service';
import fs from 'fs';

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

async function runEmergencyProtocolTests() {
  console.log('================================================================');
  console.log('🧪 Running Emergency Protocols, Panic Mode & Maintenance Tests');
  console.log('================================================================\n');

  initSqlite();

  // Reset to normal before testing
  emergencyControlService.setEmergencyLevel('normal');
  emergencyControlService.setMaintenanceWindow({ enabled: false });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Initial Normal State & Status Inspection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Initial State & Level Status ---');
  const initial = emergencyControlService.getStatus();
  assert(initial.level === 'normal', 'Initial emergency level is "normal"');
  assert(initial.maintenanceEnabled === false, 'Initial maintenance mode is disabled');

  // Evaluate normal request
  const normalCheck = emergencyControlService.evaluateRequest({
    method: 'POST',
    path: '/api/v1/db/collections/users/documents',
    clientIp: '192.168.31.50'
  });
  assert(normalCheck.allowed === true, 'Normal request is allowed through');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Level 1: Read-Only Shield
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Level 1: Read-Only Shield ---');
  emergencyControlService.setEmergencyLevel('read_only', 'Database schema migration in progress');
  const readOnlyStatus = emergencyControlService.getStatus();
  assert(readOnlyStatus.level === 'read_only', 'Emergency level updated to "read_only"');
  assert(readOnlyStatus.reason === 'Database schema migration in progress', 'Reason preserved');

  // Write operation (POST) should be blocked with 423
  const writeBlocked = emergencyControlService.evaluateRequest({
    method: 'POST',
    path: '/api/v1/db/collections/users/documents',
    clientIp: '192.168.31.50'
  });
  assert(writeBlocked.allowed === false, 'POST write mutation blocked under Read-Only Shield');
  assert(writeBlocked.statusCode === 423, 'Status code is 423 Locked');
  assert(writeBlocked.code === 'EMERGENCY_READ_ONLY_LOCKDOWN', 'Code is EMERGENCY_READ_ONLY_LOCKDOWN');

  // Delete operation (DELETE) should also be blocked
  const deleteBlocked = emergencyControlService.evaluateRequest({
    method: 'DELETE',
    path: '/api/v1/db/collections/users/documents/doc-1',
    clientIp: '192.168.31.50'
  });
  assert(deleteBlocked.allowed === false, 'DELETE write mutation blocked under Read-Only Shield');

  // Read query (GET) should remain ALLOWED
  const readAllowed = emergencyControlService.evaluateRequest({
    method: 'GET',
    path: '/api/v1/db/collections/users/documents',
    clientIp: '192.168.31.50'
  });
  assert(readAllowed.allowed === true, 'GET query allowed under Read-Only Shield');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Level 2: LAN Quarantine
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Level 2: LAN Quarantine ---');
  emergencyControlService.setEmergencyLevel('lan_only', 'External DDoS investigation');
  const lanStatus = emergencyControlService.getStatus();
  assert(lanStatus.level === 'lan_only', 'Emergency level updated to "lan_only"');

  // Public WAN IP should be blocked with 403
  const wanBlocked = emergencyControlService.evaluateRequest({
    method: 'GET',
    path: '/api/v1/db/collections/users/documents',
    clientIp: '185.220.101.5' // Public WAN IP
  });
  assert(wanBlocked.allowed === false, 'Public WAN IP blocked under LAN Quarantine');
  assert(wanBlocked.statusCode === 403, 'Status code is 403 Forbidden');
  assert(wanBlocked.code === 'EMERGENCY_LAN_QUARANTINE', 'Code is EMERGENCY_LAN_QUARANTINE');

  // Private Wi-Fi LAN IP should be allowed
  const lanAllowed = emergencyControlService.evaluateRequest({
    method: 'GET',
    path: '/api/v1/db/collections/users/documents',
    clientIp: '192.168.31.18'
  });
  assert(lanAllowed.allowed === true, 'Private LAN IP allowed under LAN Quarantine');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Level 3: Full Air-Gap Freeze & Emergency Snapshot
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Level 3: Air-Gap Freeze & Snapshot ---');
  emergencyControlService.setEmergencyLevel('air_gap', 'Critical security breach containment');
  const airGapStatus = emergencyControlService.getStatus();
  assert(airGapStatus.level === 'air_gap', 'Emergency level updated to "air_gap"');

  // Non-localhost client blocked with 503
  const airGapClientBlocked = emergencyControlService.evaluateRequest({
    method: 'GET',
    path: '/api/v1/db/collections/users/documents',
    clientIp: '192.168.31.18'
  });
  assert(airGapClientBlocked.allowed === false, 'LAN client blocked under Air-Gap Freeze');
  assert(airGapClientBlocked.statusCode === 503, 'Status code is 503 Service Unavailable');
  assert(airGapClientBlocked.code === 'EMERGENCY_AIR_GAP_FREEZE', 'Code is EMERGENCY_AIR_GAP_FREEZE');

  // GUARANTEE: Localhost Super Admin ALWAYS retains access to admin endpoints
  const adminAllowed = emergencyControlService.evaluateRequest({
    method: 'POST',
    path: '/api/v1/admin/emergency/lockdown',
    clientIp: '127.0.0.1',
    isSuperAdmin: true
  });
  assert(adminAllowed.allowed === true, 'Localhost Super Admin allowed to access Admin APIs to disarm emergency');

  // Test Emergency Snapshot Generation
  const snapResult = emergencyControlService.createPanicSnapshot('Automated test snapshot');
  assert(snapResult.success === true, 'Panic snapshot creation succeeded');
  assert(fs.existsSync(snapResult.snapshotPath), 'Snapshot file created on disk in backups/');
  assert(snapResult.sizeBytes > 0, 'Snapshot file size is non-zero');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Scheduled Maintenance Window (503 & Retry-After)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Scheduled Maintenance Window ---');
  // Reset level to normal
  emergencyControlService.setEmergencyLevel('normal');

  emergencyControlService.setMaintenanceWindow({
    enabled: true,
    message: 'System is updating database indexes.',
    retryAfterSeconds: 180
  });

  const maintCheck = emergencyControlService.evaluateRequest({
    method: 'GET',
    path: '/api/v1/db/collections/users/documents',
    clientIp: '192.168.31.50'
  });
  assert(maintCheck.allowed === false, 'Client request blocked during active Maintenance Window');
  assert(maintCheck.statusCode === 503, 'Status code is 503 Service Unavailable');
  assert(maintCheck.code === 'MAINTENANCE_MODE_ACTIVE', 'Code is MAINTENANCE_MODE_ACTIVE');
  assert(maintCheck.retryAfter === 180, 'Retry-After header value is 180s');
  assert(maintCheck.message === 'System is updating database indexes.', 'Custom maintenance message returned');

  // Disarm maintenance mode
  emergencyControlService.setMaintenanceWindow({ enabled: false });
  const disarmedMaintCheck = emergencyControlService.evaluateRequest({
    method: 'GET',
    path: '/api/v1/db/collections/users/documents',
    clientIp: '192.168.31.50'
  });
  assert(disarmedMaintCheck.allowed === true, 'Disarming maintenance window restores normal operations');

  // ─────────────────────────────────────────────────────────────────────────
  // Final Reset & Summary
  // ─────────────────────────────────────────────────────────────────────────
  emergencyControlService.setEmergencyLevel('normal');
  emergencyControlService.setMaintenanceWindow({ enabled: false });

  console.log('\n================================================================');
  console.log(`📊 Emergency Protocol Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runEmergencyProtocolTests().catch(err => {
  console.error('Fatal emergency test error:', err);
  process.exit(1);
});
