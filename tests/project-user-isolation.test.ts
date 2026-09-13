// ─────────────────────────────────────────────────────────────────────────────
//  tests/project-user-isolation.test.ts
//  Test Suite for Strict Project End-User vs Platform User Isolation & Perimeter
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { projectAuthService } from '../src/project-auth/project-auth.service';
import { registerUser } from '../src/auth/auth.service';
import { userStore } from '../src/store/user.store';
import { adminService } from '../src/admin/admin.service';
import { requireAdminPermission } from '../src/middleware/admin.middleware';
import crypto from 'crypto';

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

async function runIsolationTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running Project User vs Platform User Isolation Test Suite');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();

  // 1. Create a Test Project with API Key
  console.log('--- 1. Seed Dedicated Test Project & Platform Developer ---');
  const devEmail = `developer_${Date.now()}@flarebase.dev`;
  const regResult = await registerUser({
    email: devEmail,
    password: 'Password123!',
    name: 'Platform Dev'
  });

  const devUser = await userStore.findByEmail(devEmail);
  assert(!!devUser && !!regResult.user, 'Platform developer registered in users table');

  const projectId = 'proj-iso-' + Date.now();
  const apiKey = 'flare_pk_iso_' + crypto.randomBytes(16).toString('hex');
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  db.prepare(`
    INSERT INTO projects (id, ownerId, name, apiKeyHash, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(projectId, devUser!.id, 'Isolation Test App', apiKeyHash);

  // 2. Register End-User under Project
  console.log('\n--- 2. Register Project End-User ---');
  const clientEmail = `customer_${Date.now()}@testclient.com`;
  const pUserAuth = await projectAuthService.registerUser(projectId, clientEmail, 'ClientPass123!');
  assert(pUserAuth.user.email === clientEmail, 'Project user registration returned valid response');
  assert(pUserAuth.accessToken.length > 20, 'Generated project user access token');

  // Verify DB Storage Isolation
  const pUserInProjectTable = db.prepare('SELECT id, projectId FROM project_users WHERE projectId = ?').all(projectId) as any[];
  assert(pUserInProjectTable.length === 1, 'Project user is present in project_users table');

  const clientEmailHash = crypto.createHash('sha256').update(clientEmail.toLowerCase().trim()).digest('hex');
  const pUserInPlatformTable = db.prepare('SELECT id FROM users WHERE emailHash = ?').all(clientEmailHash) as any[];
  assert(pUserInPlatformTable.length === 0, 'Project user is NOT present in platform users table');

  // 3. Verify Admin Console User Listing Isolation
  console.log('\n--- 3. Platform Admin Console User List Isolation ---');
  const allPlatformUsers = await adminService.getUsers();
  const foundInPlatformList = allPlatformUsers.some((u: any) => u.email === clientEmail || u.email?.includes('customer_'));
  assert(!foundInPlatformList, 'Project end-user does NOT appear in platform admin user management list');

  // 4. Verify Project User Token Cannot Access Admin Routes
  console.log('\n--- 4. Project User Perimeter Authorization Block ---');
  const middleware = requireAdminPermission('user_management');
  let rejected: any = false;
  let rejectionError: any = null;

  const mockReq: any = {
    user: {
      sub: pUserAuth.user.id,
      id: pUserAuth.user.id,
      projectId,
      isProjectUser: true
    },
    headers: {}
  };
  const mockRes: any = {};
  const mockNext = (err?: any) => {
    if (err) {
      rejected = true;
      rejectionError = err;
    }
  };

  middleware(mockReq, mockRes, mockNext);
  assert(rejected, 'Project user token is blocked by admin middleware');
  assert(rejectionError?.statusCode === 403, 'Blocked with HTTP 403 Forbidden');

  // 5. Verify Project User Cannot Perform Super Admin Actions
  console.log('\n--- 5. Super Admin Permission Invariants ---');
  const superAdminMiddleware = requireAdminPermission();
  let superAdminRejected: any = false;
  superAdminMiddleware(mockReq, mockRes, (err?: any) => {
    if (err) superAdminRejected = true;
  });
  assert(superAdminRejected, 'Project user token cannot execute Super Admin root operations');

  console.log('\n================================================================');
  console.log(`📊 Isolation Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runIsolationTests().catch(err => {
  console.error('Fatal isolation test error:', err);
  process.exit(1);
});
