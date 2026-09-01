// ─────────────────────────────────────────────────────────────────────────────
//  tests/storage-quota.test.ts
//  Test Suite for User Storage Quota Computation and Enforcement
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { getUserStorageQuota } from '../src/storage/storage.service';

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

async function runStorageQuotaTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running User Storage Quota Test Suite');
  console.log('================================================================\n');

  initSqlite();

  const db = getDb();
  let testUser = db.prepare('SELECT id FROM users LIMIT 1').get() as any;
  if (!testUser) {
    db.prepare(`
      INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
      VALUES (?, ?, ?, 'Storage User', 'fake_pass', 0, datetime('now'), datetime('now'))
    `).run('storage-user-id', 'storage@aegisdb.dev', 'storage_hash');
    testUser = { id: 'storage-user-id' };
  }
  const userId = testUser.id;

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Compute Storage Quota
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Compute User Storage Quota ---');
  const quota = getUserStorageQuota(userId, 500 * 1024 * 1024);

  assert(typeof quota.usedBytes === 'number', 'usedBytes is a number');
  assert(quota.maxBytes === 500 * 1024 * 1024, 'maxBytes is 500 MB');
  assert(typeof quota.fileCount === 'number', 'fileCount is a number');
  assert(typeof quota.percentage === 'number' && quota.percentage >= 0 && quota.percentage <= 100, 'Percentage is between 0 and 100');

  console.log('\n================================================================');
  console.log(`📊 Storage Quota Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runStorageQuotaTests().catch(err => {
  console.error('Fatal error in storage quota test suite:', err);
  process.exit(1);
});
