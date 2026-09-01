// ─────────────────────────────────────────────────────────────────────────────
//  tests/user-pats.test.ts
//  Test Suite for Scoped Personal Access Tokens (PATs)
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { patService } from '../src/services/pat.service';

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

async function runPatTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running Personal Access Tokens (PATs) Test Suite');
  console.log('================================================================\n');

  initSqlite();

  const db = getDb();
  let testUser = db.prepare('SELECT id FROM users LIMIT 1').get() as any;
  if (!testUser) {
    db.prepare(`
      INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
      VALUES (?, ?, ?, 'PAT Tester', 'fake_hash', 0, datetime('now'), datetime('now'))
    `).run('pat-test-user-id', 'pat.tester@aegisdb.dev', 'pat_hash');
    testUser = { id: 'pat-test-user-id' };
  }
  const userId = testUser.id;

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Generate Scoped PAT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Create Scoped PAT ---');
  const pat = patService.createPat({
    userId,
    name: 'GitHub CI Pipeline Key',
    scopes: ['db:read', 'storage:read'],
    expirationDays: 30
  });

  assert(pat.rawToken !== undefined && pat.rawToken.startsWith('pat_'), 'Raw PAT starts with pat_ prefix');
  assert(pat.tokenPrefix.includes('••••'), 'Token prefix is masked');
  assert(pat.scopes.includes('db:read'), 'db:read scope assigned');
  assert(pat.scopes.includes('storage:read'), 'storage:read scope assigned');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Validate Token with Permitted Scope
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Validate Allowed Scope ---');
  const validated = patService.validatePat(pat.rawToken!, 'db:read');
  assert(validated.userId === userId, 'Validated user ID matches token owner');
  assert(validated.scopes.includes('db:read'), 'Scope db:read authorized');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Validate Token with Forbidden Scope
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Enforce Scope Isolation ---');
  let scopeError: any = null;
  try {
    patService.validatePat(pat.rawToken!, 'db:write'); // Not granted!
  } catch (err: any) {
    scopeError = err;
  }
  assert(scopeError !== null, 'Access denied for unauthorized scope (db:write)');
  assert(scopeError.statusCode === 403, 'Returns 403 Forbidden');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Wildcard Scope PAT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Full Access Wildcard Scope ---');
  const adminPat = patService.createPat({
    userId,
    name: 'Full Admin CLI Key',
    scopes: ['*'],
    expirationDays: 90
  });
  const validAdmin = patService.validatePat(adminPat.rawToken!, 'db:write');
  assert(validAdmin.userId === userId, 'Wildcard token permits db:write');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Revoke PAT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Revoke Token ---');
  const revoked = patService.revokePat(userId, pat.id);
  assert(revoked === true, 'PAT revoked successfully');

  let revokedError: any = null;
  try {
    patService.validatePat(pat.rawToken!, 'db:read');
  } catch (err: any) {
    revokedError = err;
  }
  assert(revokedError !== null, 'Revoked PAT cannot authenticate');

  console.log('\n================================================================');
  console.log(`📊 PAT Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runPatTests().catch(err => {
  console.error('Fatal error in PAT test suite:', err);
  process.exit(1);
});
