import 'dotenv/config';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { networkAccessService } from '../src/services/network-access.service';
import { loginUser } from '../src/auth/auth.service';
import { userStore } from '../src/store/user.store';
import argon2 from 'argon2';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`, detail || '');
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Testing Rate Limit Settings & Super Admin Perimeter Isolation');
  console.log('================================================================\n');

  const db = getDb();
  const passwordHash = await argon2.hash('Admin@123');

  // Ensure super admin user exists
  if (!await userStore.findByEmail('admin@flarebase.dev')) {
    await userStore.create({
      id: 'admin-test-id',
      email: 'admin@flarebase.dev',
      name: 'Super Admin',
      passwordHash,
      isSuperAdmin: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // Ensure regular non-admin user exists
  if (!await userStore.findByEmail('dev@flarebase.dev')) {
    await userStore.create({
      id: 'regular-test-id',
      email: 'dev@flarebase.dev',
      name: 'Dev User',
      passwordHash,
      isSuperAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Subnet Rate Limiting Toggle Persistence
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Subnet Rate Limiting Toggle Persistence in Settings ---');

  const updated1 = networkAccessService.updateNetworkSettings({
    enableSubnetRateLimiting: true,
    defaultSubnetRequestsPerMin: 180
  });

  assert(updated1.enableSubnetRateLimiting === true, 'enableSubnetRateLimiting updated to true');
  assert(updated1.defaultSubnetRequestsPerMin === 180, 'defaultSubnetRequestsPerMin updated to 180');

  // Query DB directly
  const readDb = networkAccessService.getNetworkSettings();
  assert(readDb.enableSubnetRateLimiting === true, 'getNetworkSettings reads enableSubnetRateLimiting = true from DB');
  assert(readDb.defaultSubnetRequestsPerMin === 180, 'getNetworkSettings reads defaultSubnetRequestsPerMin = 180 from DB');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Super Admin Perimeter Lock at Login
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Super Admin Perimeter Lock at Authentication ---');

  // Enable Admin Perimeter Lock (restricted strictly to 127.0.0.1)
  networkAccessService.updateNetworkSettings({
    adminEndpointIpLockEnabled: true,
    adminAllowedSubnet: '127.0.0.1'
  });

  // Attempt 1: Super Admin logging in from external IP (e.g. Windows on 192.168.31.18) -> MUST BE BLOCKED
  let blocked = false;
  try {
    await loginUser({
      email: 'admin@flarebase.dev',
      password: 'Admin@123',
      clientIp: '192.168.31.18'
    });
  } catch (err: any) {
    if (err.statusCode === 403 && err.details?.code === 'ADMIN_PERIMETER_RESTRICTED') {
      blocked = true;
    } else {
      console.error('Unexpected error on external admin login:', err);
    }
  }
  assert(blocked === true, 'Super Admin login from external Windows IP (192.168.31.18) was REJECTED with 403 ADMIN_PERIMETER_RESTRICTED');

  // Attempt 2: Regular non-admin developer logging in from external IP -> MUST BE ALLOWED
  let regularAllowed = false;
  try {
    const regRes = await loginUser({
      email: 'dev@flarebase.dev',
      password: 'Admin@123',
      clientIp: '192.168.31.18'
    });
    if (regRes.token) regularAllowed = true;
  } catch (err) {
    console.error('Regular user login failed:', err);
  }
  assert(regularAllowed === true, 'Regular user (non-admin) login from external Windows IP (192.168.31.18) was ALLOWED');

  // Attempt 3: Super Admin logging in from local host machine (127.0.0.1) -> MUST BE ALLOWED
  let adminHostAllowed = false;
  try {
    const adminRes = await loginUser({
      email: 'admin@flarebase.dev',
      password: 'Admin@123',
      clientIp: '127.0.0.1'
    });
    if (adminRes.token) adminHostAllowed = true;
  } catch (err) {
    console.error('Localhost super admin login failed:', err);
  }
  assert(adminHostAllowed === true, 'Super Admin login from local host machine (127.0.0.1) was ALLOWED');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Endpoint Scoping on /api/v1/admin/* for External Devices
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Endpoint Scoping on /api/v1/admin/* ---');

  const extAdminAccess = networkAccessService.isEndpointAccessAllowed({
    clientIp: '192.168.31.18',
    path: '/api/v1/admin/platform-settings',
    method: 'GET'
  });
  assert(extAdminAccess.allowed === false, 'External IP blocked from /api/v1/admin/* endpoint');
  assert(extAdminAccess.code === 'ADMIN_PERIMETER_RESTRICTED', 'Error code is ADMIN_PERIMETER_RESTRICTED');

  const locAdminAccess = networkAccessService.isEndpointAccessAllowed({
    clientIp: '127.0.0.1',
    path: '/api/v1/admin/platform-settings',
    method: 'GET'
  });
  assert(locAdminAccess.allowed === true, 'Localhost allowed on /api/v1/admin/* endpoint');

  console.log('\n================================================================');
  console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
