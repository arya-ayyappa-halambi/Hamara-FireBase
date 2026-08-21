// ─────────────────────────────────────────────────────────────────────────────
//  tests/security-rules.test.ts
//  Comprehensive test suite for AegisDB Collection-Wise and Document-Wise Security Rules.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import assert from 'assert';
import { getDb, initSqlite } from '../src/db/sqlite.connection';
import { userStore } from '../src/store/user.store';
import { dbStore } from '../src/db/db.service';
import {
  evaluateRuleExpression,
  evaluateCollectionAccess,
  evaluateDocumentAccess,
  shouldEnforceRules,
} from '../src/db/db.controller';
import { Collection, Document } from '../src/types/db.types';

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🛡️  AEGISDB SECURITY RULES SUITE — COLLECTION & DOCUMENT ACCESS');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  process.env.JWT_SECRET = 'super_secret_jwt_key_for_testing_123456789';
  initSqlite();
  const db = getDb();

  const testOwnerId = `owner_${Date.now()}`;
  const testProjectId = `proj_${Date.now()}`;

  // Create test user
  await userStore.create({
    id: testOwnerId,
    email: `owner_${Date.now()}@test.internal`,
    name: 'Rules Test Owner',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dGVzdA$dGVzdA',
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create test project
  db.prepare(`
    INSERT INTO projects (id, ownerId, name, apiKeyHash, serviceKeyHash, createdAt, updatedAt)
    VALUES (?, ?, 'Rules Test Project', 'hash_anon', 'hash_service', ?, ?)
  `).run(testProjectId, testOwnerId, new Date().toISOString(), new Date().toISOString());

  let passCount = 0;
  function pass(testName: string) {
    passCount++;
    console.log(`  ✅ [PASS] ${testName}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Rule Expression Sandbox Evaluation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 1: Rule Expression Sandbox Evaluation');

  const aliceAuth = { id: 'user_alice', sub: 'user_alice', uid: 'user_alice', email: 'alice@example.com', role: 'member' };
  const bobAuth = { id: 'user_bob', sub: 'user_bob', uid: 'user_bob', email: 'bob@example.com', role: 'admin' };

  // 1.1 Boolean rules
  assert.strictEqual(evaluateRuleExpression(true, { auth: null, data: null, resource: null, request: {} }), true);
  assert.strictEqual(evaluateRuleExpression(false, { auth: null, data: null, resource: null, request: {} }), false);
  pass('Boolean true/false rules evaluate correctly');

  // 1.2 Auth null check
  assert.strictEqual(evaluateRuleExpression('auth != null', { auth: aliceAuth, data: null, resource: null, request: {} }), true);
  assert.strictEqual(evaluateRuleExpression('auth != null', { auth: null, data: null, resource: null, request: {} }), false);
  pass('auth != null properly checks authentication status');

  // 1.3 Field matching with auth.id, auth.uid, auth.sub
  const resourceAlice = { id: 'doc_1', ownerId: 'user_alice', title: 'Alice Post' };
  assert.strictEqual(evaluateRuleExpression('auth.id == resource.ownerId', { auth: aliceAuth, data: null, resource: resourceAlice, request: {} }), true);
  assert.strictEqual(evaluateRuleExpression('auth.uid == resource.ownerId', { auth: aliceAuth, data: null, resource: resourceAlice, request: {} }), true);
  assert.strictEqual(evaluateRuleExpression('auth.sub == resource.ownerId', { auth: aliceAuth, data: null, resource: resourceAlice, request: {} }), true);
  assert.strictEqual(evaluateRuleExpression('auth.id == resource.ownerId', { auth: bobAuth, data: null, resource: resourceAlice, request: {} }), false);
  pass('auth.id / auth.uid / auth.sub aliases match resource fields');

  // 1.4 Role-based rules
  assert.strictEqual(evaluateRuleExpression("auth.role == 'admin'", { auth: bobAuth, data: null, resource: null, request: {} }), true);
  assert.strictEqual(evaluateRuleExpression("auth.role == 'admin'", { auth: aliceAuth, data: null, resource: resourceAlice, request: {} }), false);
  pass('Role-based rule expressions match user role');

  // 1.5 Fail-closed on syntax errors
  assert.strictEqual(evaluateRuleExpression('this is invalid javascript %%%', { auth: aliceAuth, data: null, resource: null, request: {} }), false);
  pass('Invalid JavaScript rule syntax fails closed (false)');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Collection-Level Access Control (Enable / Disable)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 2: Collection-Level Access Control (Enable / Disable)');

  const mockReqApiKeyAnon = {
    user: { email: 'api-key::test_proj', sub: testOwnerId },
    isServiceRole: false,
    projectUser: null,
  } as any;

  const mockReqApiKeyAlice = {
    user: { email: 'api-key::test_proj', sub: testOwnerId },
    isServiceRole: false,
    projectUser: aliceAuth,
  } as any;

  const mockReqApiKeyBobAdmin = {
    user: { email: 'api-key::test_proj', sub: testOwnerId },
    isServiceRole: false,
    projectUser: bobAuth,
  } as any;

  // 2.1 Collection with read: false, write: false
  const closedCol: Collection = {
    name: 'closed_col',
    description: '',
    ownerId: testOwnerId,
    documentCount: 0,
    rules: JSON.stringify({ read: false, write: false }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.strictEqual(evaluateCollectionAccess(closedCol, 'list', mockReqApiKeyAlice), false);
  assert.strictEqual(evaluateDocumentAccess(closedCol, 'create', mockReqApiKeyAlice, null, { title: 'test' }), false);
  pass('Collection with read: false, write: false disables all access');

  // 2.2 Collection with read: "auth != null", write: "auth.role == 'admin'"
  const roleCol: Collection = {
    name: 'role_col',
    description: '',
    ownerId: testOwnerId,
    documentCount: 0,
    rules: JSON.stringify({ read: 'auth != null', write: "auth.role == 'admin'" }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.strictEqual(evaluateCollectionAccess(roleCol, 'list', mockReqApiKeyAnon), false);
  assert.strictEqual(evaluateCollectionAccess(roleCol, 'list', mockReqApiKeyAlice), true);
  assert.strictEqual(evaluateDocumentAccess(roleCol, 'create', mockReqApiKeyAlice, null, { title: 'test' }), false);
  assert.strictEqual(evaluateDocumentAccess(roleCol, 'create', mockReqApiKeyBobAdmin, null, { title: 'test' }), true);
  pass('Collection rules enforce auth requirement for read and admin role for write');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Granular Operations (create, read, get, list, update, delete)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 3: Granular Operations (create, read, get, list, update, delete)');

  const granularCol: Collection = {
    name: 'granular_col',
    description: '',
    ownerId: testOwnerId,
    documentCount: 0,
    rules: JSON.stringify({
      list: true, // public listing
      get: 'auth != null', // authenticated detail
      create: 'auth != null',
      update: 'auth.id == resource.authorId',
      delete: "auth.role == 'admin'",
    }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleDoc = { id: 'd1', authorId: 'user_alice', content: 'Alice draft' } as any;

  // List (public)
  assert.strictEqual(evaluateCollectionAccess(granularCol, 'list', mockReqApiKeyAnon), true);
  // Get (auth required)
  assert.strictEqual(evaluateDocumentAccess(granularCol, 'get', mockReqApiKeyAnon, sampleDoc, null), false);
  assert.strictEqual(evaluateDocumentAccess(granularCol, 'get', mockReqApiKeyAlice, sampleDoc, null), true);
  // Update (author only)
  assert.strictEqual(evaluateDocumentAccess(granularCol, 'update', mockReqApiKeyAlice, sampleDoc, { content: 'updated' }), true);
  assert.strictEqual(evaluateDocumentAccess(granularCol, 'update', mockReqApiKeyBobAdmin, sampleDoc, { content: 'updated' }), false);
  // Delete (admin only)
  assert.strictEqual(evaluateDocumentAccess(granularCol, 'delete', mockReqApiKeyAlice, sampleDoc, null), false);
  assert.strictEqual(evaluateDocumentAccess(granularCol, 'delete', mockReqApiKeyBobAdmin, sampleDoc, null), true);
  pass('Granular operations (list, get, create, update, delete) enforced individually');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Scoped Rules ({ collection: {...}, document: {...} })
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 4: Scoped Rules ({ collection: {...}, document: {...} })');

  const scopedCol: Collection = {
    name: 'scoped_col',
    description: '',
    ownerId: testOwnerId,
    documentCount: 0,
    rules: JSON.stringify({
      collection: {
        list: true,
        write: "auth.role == 'admin'",
      },
      document: {
        read: 'auth != null',
        update: 'auth.id == resource.ownerId',
        delete: "auth.role == 'admin' || auth.id == resource.ownerId",
      },
    }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const scopedDoc = { id: 'sd1', ownerId: 'user_alice', title: 'Scoped doc' } as any;

  assert.strictEqual(evaluateCollectionAccess(scopedCol, 'list', mockReqApiKeyAnon), true);
  assert.strictEqual(evaluateDocumentAccess(scopedCol, 'get', mockReqApiKeyAnon, scopedDoc, null), false);
  assert.strictEqual(evaluateDocumentAccess(scopedCol, 'get', mockReqApiKeyAlice, scopedDoc, null), true);
  assert.strictEqual(evaluateDocumentAccess(scopedCol, 'update', mockReqApiKeyAlice, scopedDoc, { title: 'new' }), true);
  assert.strictEqual(evaluateDocumentAccess(scopedCol, 'update', mockReqApiKeyBobAdmin, scopedDoc, { title: 'new' }), false);
  assert.strictEqual(evaluateDocumentAccess(scopedCol, 'delete', mockReqApiKeyBobAdmin, scopedDoc, null), true);
  pass('Scoped rules (collection.* vs document.*) evaluated with exact hierarchy');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Document-Level Row Security (_rules attached to document)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 5: Document-Level Row Security (_rules attached to document)');

  // Baseline collection is permissive (read: true, write: true)
  const baselineCol: Collection = {
    name: 'rls_col',
    description: '',
    ownerId: testOwnerId,
    documentCount: 0,
    rules: JSON.stringify({ read: true, write: true }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Document 1 has custom _rules restricting read to Alice only
  const privateDocForAlice: Document = {
    _id: 'doc_alice_private',
    _ownerId: testOwnerId,
    _createdAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
    title: 'Secret Notes for Alice',
    _rules: {
      read: "auth.id == 'user_alice'",
      write: "auth.id == 'user_alice'",
    },
  };

  // Document 2 has no custom _rules (inherits collection baseline)
  const publicDoc: Document = {
    _id: 'doc_public',
    _ownerId: testOwnerId,
    _createdAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
    title: 'Public announcement',
  };

  // Alice can read her private doc
  assert.strictEqual(evaluateDocumentAccess(baselineCol, 'get', mockReqApiKeyAlice, privateDocForAlice, null), true);
  // Bob CANNOT read Alice's private doc even though collection default is read: true!
  assert.strictEqual(evaluateDocumentAccess(baselineCol, 'get', mockReqApiKeyBobAdmin, privateDocForAlice, null), false);
  // Unauthenticated caller CANNOT read Alice's private doc
  assert.strictEqual(evaluateDocumentAccess(baselineCol, 'get', mockReqApiKeyAnon, privateDocForAlice, null), false);

  // Both Alice and Bob and Anon can read public doc
  assert.strictEqual(evaluateDocumentAccess(baselineCol, 'get', mockReqApiKeyAlice, publicDoc, null), true);
  assert.strictEqual(evaluateDocumentAccess(baselineCol, 'get', mockReqApiKeyBobAdmin, publicDoc, null), true);
  assert.strictEqual(evaluateDocumentAccess(baselineCol, 'get', mockReqApiKeyAnon, publicDoc, null), true);
  pass('Document-level _rules take strict precedence over collection defaults (Row-Level Security)');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: SQLite Database Store Persistence of _rules
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 6: SQLite Database Store Persistence of _rules');

  const colName = `test_col_${Date.now()}`;
  dbStore.createCollection(testOwnerId, testProjectId, {
    name: colName,
    rules: JSON.stringify({ read: true, write: true }),
  });

  // Insert document with _rules
  const inserted = dbStore.insertDocument(testOwnerId, testProjectId, colName, {
    title: 'Doc with custom rules',
    _rules: {
      read: "auth.id == 'user_alice'",
      write: "auth.id == 'user_alice'",
    },
  });

  assert.ok(inserted._rules, 'Inserted document must preserve _rules');
  assert.strictEqual((inserted._rules as any).read, "auth.id == 'user_alice'");

  // Fetch document from DB
  const fetched = dbStore.getDocument(testOwnerId, testProjectId, colName, inserted._id);
  assert.ok(fetched._rules, 'Fetched document from DB must contain _rules');
  assert.strictEqual((fetched._rules as any).read, "auth.id == 'user_alice'");

  // Update _rules via patch
  const updated = dbStore.updateDocument(testOwnerId, testProjectId, colName, inserted._id, {
    _rules: {
      read: "auth.id == 'user_alice' || auth.id == 'user_bob'",
      write: "auth.id == 'user_alice'",
    },
  });

  assert.strictEqual((updated._rules as any).read, "auth.id == 'user_alice' || auth.id == 'user_bob'");

  // Bob is now allowed to read after update
  assert.strictEqual(evaluateDocumentAccess(baselineCol, 'get', mockReqApiKeyBobAdmin, updated, null), true);
  pass('Document _rules stored, fetched, and patched in SQLite without errors');

  // Clear _rules by setting _rules: null
  const cleared = dbStore.updateDocument(testOwnerId, testProjectId, colName, inserted._id, {
    _rules: null,
  });
  assert.strictEqual(cleared._rules, undefined, '_rules: null must clear custom rules');
  pass('Setting _rules: null successfully removes custom row rules');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Service Role Key Bypass
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 7: Service Role Key Bypass');

  const mockServiceRoleReq = {
    isServiceRole: true,
    user: { email: 'service-role::test_proj', sub: testOwnerId },
  } as any;

  assert.strictEqual(shouldEnforceRules(mockServiceRoleReq), false, 'Service role key must bypass rules');
  assert.strictEqual(evaluateCollectionAccess(closedCol, 'list', mockServiceRoleReq), true);
  assert.strictEqual(evaluateDocumentAccess(closedCol, 'create', mockServiceRoleReq, null, { title: 'admin data' }), true);
  pass('Service role keys bypass all rules for administrative access');

  // ───────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n🧹 Cleaning up test database artifacts...');
  db.prepare('DELETE FROM collections WHERE name = ?').run(colName);
  db.prepare('DELETE FROM documents WHERE collectionName = ?').run(colName);
  db.prepare('DELETE FROM projects WHERE id = ?').run(testProjectId);
  db.prepare('DELETE FROM users WHERE id = ?').run(testOwnerId);
  console.log('   ✅ Cleaned up temporary test data.');

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`🎉 ALL ${passCount} SECURITY RULES TESTS PASSED SUCCESSFULLY!`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
