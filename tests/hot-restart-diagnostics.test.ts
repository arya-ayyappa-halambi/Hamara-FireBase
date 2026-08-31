// ─────────────────────────────────────────────────────────────────────────────
//  tests/hot-restart-diagnostics.test.ts
//  AegisDB — Zero-Downtime Hot Restart & Cluster Port Diagnostics Matrix Tests
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite } from '../src/db/sqlite.connection';
import { networkDiagnosticsService } from '../src/services/network-diagnostics.service';
import { networkAccessService } from '../src/services/network-access.service';

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

async function runHotRestartDiagnosticsTests() {
  console.log('================================================================');
  console.log('🧪 Running Hot Restart & Cluster Port Diagnostics Matrix Tests');
  console.log('================================================================\n');

  initSqlite();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Cluster Diagnostics Report Generation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Cluster Diagnostics Report ---');
  const report = await networkDiagnosticsService.getClusterDiagnosticsReport(3000, '0.0.0.0');

  assert(typeof report.hostname === 'string' && report.hostname.length > 0, 'Hostname detected');
  assert(typeof report.platform === 'string', 'Platform OS detected');
  assert(typeof report.nodeVersion === 'string', 'Node.js runtime version detected');
  assert(report.uptimeSeconds >= 0, 'Uptime tracked in seconds');
  assert(report.memoryUsageMb > 0, 'Process RSS memory tracked in MB');
  assert(report.cpuCores > 0, 'CPU core count detected');
  assert(Array.isArray(report.interfaces) && report.interfaces.length > 0, 'Network interfaces enumerated');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Multi-Port Probe Matrix
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Port Probe Matrix ---');
  assert(Array.isArray(report.portMatrix) && report.portMatrix.length >= 5, 'Port matrix has candidate ports scanned');

  const activeMaster = report.portMatrix.find(p => p.port === 3000);
  assert(activeMaster !== undefined, 'Current port (3000) included in matrix');
  assert(activeMaster?.status === 'active_aegis', 'Current port marked as active_aegis');
  assert(typeof activeMaster?.latencyMs === 'number', 'Probe latency computed in milliseconds');

  const otherPort = report.portMatrix.find(p => p.port === 3002);
  assert(otherPort !== undefined, 'Candidate port 3002 probed');
  assert(otherPort?.status === 'free' || otherPort?.status === 'occupied', 'Candidate status is valid enum (free or occupied)');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Edge Cases: Privileged & Out-of-Range Ports
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Port Boundary Validations ---');
  const invalidLow = await networkDiagnosticsService.checkPortAvailability(-5);
  assert(invalidLow.available === false, 'Negative port (-5) rejected');

  const invalidHigh = await networkDiagnosticsService.checkPortAvailability(99999);
  assert(invalidHigh.available === false, 'Out-of-range port (99999) rejected');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Zero-Downtime Hot Restart Buffer Flush
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Zero-Downtime Hot Restart & State Preservation ---');
  // Record device activity
  networkAccessService.recordDeviceActivity({
    ipAddress: '192.168.31.222',
    userAgent: 'Mozilla/5.0 Hot-Restart Test Client',
    userEmail: 'admin@aegisdb.dev'
  });

  // Flush buffer
  networkAccessService.flushDevicesToDb();

  const devices = networkAccessService.getTrackedDevices();
  const foundDevice = devices.find(d => d.ipAddress === '192.168.31.222');
  assert(foundDevice !== undefined, 'In-memory dirty buffers flushed to persistent SQLite store before restart');

  console.log('\n================================================================');
  console.log(`📊 Hot Restart & Diagnostics Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runHotRestartDiagnosticsTests().catch(err => {
  console.error('Fatal Hot Restart test error:', err);
  process.exit(1);
});
