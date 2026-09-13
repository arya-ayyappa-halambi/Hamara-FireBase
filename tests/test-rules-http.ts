import 'dotenv/config';
import axios from 'axios';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { getDb, initSqlite } from '../src/db/sqlite.connection';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('Testing HTTP Endpoints on Port 3000 for Collection & Document Rules...\n');

  initSqlite();
  const db = getDb();

  // 1. Get or create a developer user
  const devUser = db.prepare('SELECT * FROM users LIMIT 1').get() as any;
  const devUserId = devUser.id;
  const devToken = jwt.sign(
    { sub: devUserId, email: devUser.email, isProjectUser: false },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );

  // 2. Create a test project
  const rawApiKey = `flare_pk_test_${Date.now()}`;
  const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
  const rawServiceKey = `flare_sk_test_${Date.now()}`;
  const serviceKeyHash = crypto.createHash('sha256').update(rawServiceKey).digest('hex');
  const projId = `proj_rules_${Date.now()}`;

  db.prepare(`
    INSERT INTO projects (id, ownerId, name, apiKeyHash, serviceKeyHash, createdAt, updatedAt)
    VALUES (?, ?, 'E2E Rules Project', ?, ?, ?, ?)
  `).run(projId, devUserId, apiKeyHash, serviceKeyHash, new Date().toISOString(), new Date().toISOString());

  // 3. Create two project users: Alice & Bob
  const { envelopeEncryptionService } = await import('../src/services/envelope-encryption.service');
  const aliceId = `puser_alice_${Date.now()}`;
  const bobId = `puser_bob_${Date.now()}`;
  const aliceHash = envelopeEncryptionService.hashBlindIndex('alice@app.com');
  const bobHash = envelopeEncryptionService.hashBlindIndex('bob@app.com');

  db.prepare(`
    INSERT INTO project_users (id, projectId, email, emailHash, passwordHash, role, createdAt, updatedAt)
    VALUES (?, ?, 'alice@app.com', ?, 'hash', 'user', ?, ?)
  `).run(aliceId, projId, aliceHash, new Date().toISOString(), new Date().toISOString());

  db.prepare(`
    INSERT INTO project_users (id, projectId, email, emailHash, passwordHash, role, createdAt, updatedAt)
    VALUES (?, ?, 'bob@app.com', ?, 'hash', 'admin', ?, ?)
  `).run(bobId, projId, bobHash, new Date().toISOString(), new Date().toISOString());

  const aliceToken = jwt.sign(
    { sub: aliceId, id: aliceId, projectId: projId, email: 'alice@app.com', role: 'user', isProjectUser: true },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );

  const bobToken = jwt.sign(
    { sub: bobId, id: bobId, projectId: projId, email: 'bob@app.com', role: 'admin', isProjectUser: true },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );

  const colName = `posts_${Date.now()}`;

  // ── STEP 1: Developer creates collection with granular & scoped rules ──
  console.log('1. Creating collection with security rules...');
  const createColRes = await axios.post(
    `${BASE_URL}/api/v1/db/collections`,
    {
      name: colName,
      description: 'Posts collection with RLS',
      rules: {
        list: true, // public list
        get: 'auth != null', // auth required to get
        create: 'auth != null',
        update: 'auth.id == resource.authorId || auth.role == "admin"',
        delete: 'auth.role == "admin"',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${devToken}`,
        'x-flarebase-project-id': projId,
      },
    }
  );
  assert.strictEqual(createColRes.status, 201);
  console.log('   ✅ Collection created with security rules');

  // ── STEP 2: Unauthenticated client cannot insert document ──
  console.log('2. Testing unauthenticated document insert rejection...');
  try {
    await axios.post(
      `${BASE_URL}/api/v1/db/collections/${colName}/documents`,
      { data: { title: 'Anon post' } },
      { headers: { 'x-flarebase-api-key': rawApiKey } }
    );
    assert.fail('Should have failed with 403');
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 403);
    console.log('   ✅ Unauthenticated insert correctly rejected with HTTP 403 Forbidden');
  }

  // ── STEP 3: Alice inserts a document with custom row security (_rules) ──
  console.log('3. Alice inserting document with Row-Level Security (_rules)...');
  const insertAliceRes = await axios.post(
    `${BASE_URL}/api/v1/db/collections/${colName}/documents`,
    {
      data: {
        title: "Alice's Secret Journal",
        authorId: aliceId,
        _rules: {
          read: "auth.id == '" + aliceId + "'",
          write: "auth.id == '" + aliceId + "'",
        },
      },
    },
    {
      headers: {
        'x-flarebase-api-key': rawApiKey,
        Authorization: `Bearer ${aliceToken}`,
      },
    }
  );
  assert.strictEqual(insertAliceRes.status, 201);
  const aliceDocId = insertAliceRes.data.data._id;
  assert.ok(aliceDocId);
  console.log('   ✅ Document inserted with _rules, docId:', aliceDocId);

  // ── STEP 4: Bob inserts a public document (no custom _rules) ──
  console.log('4. Bob inserting a public document...');
  const insertBobRes = await axios.post(
    `${BASE_URL}/api/v1/db/collections/${colName}/documents`,
    {
      data: {
        title: 'Public Announcement by Admin Bob',
        authorId: bobId,
      },
    },
    {
      headers: {
        'x-flarebase-api-key': rawApiKey,
        Authorization: `Bearer ${bobToken}`,
      },
    }
  );
  assert.strictEqual(insertBobRes.status, 201);
  const bobDocId = insertBobRes.data.data._id;
  console.log('   ✅ Bob inserted public document, docId:', bobDocId);

  // ── STEP 5: Alice reads her private document (200 OK) ──
  console.log('5. Alice reading her private document...');
  const getAliceDocRes = await axios.get(
    `${BASE_URL}/api/v1/db/collections/${colName}/documents/${aliceDocId}`,
    {
      headers: {
        'x-flarebase-api-key': rawApiKey,
        Authorization: `Bearer ${aliceToken}`,
      },
    }
  );
  assert.strictEqual(getAliceDocRes.status, 200);
  assert.strictEqual(getAliceDocRes.data.data.title, "Alice's Secret Journal");
  console.log('   ✅ Alice successfully read her private document');

  // ── STEP 6: Bob attempts to read Alice's private document (403 Forbidden) ──
  console.log("6. Bob attempting to read Alice's private document (must be 403)...");
  try {
    await axios.get(
      `${BASE_URL}/api/v1/db/collections/${colName}/documents/${aliceDocId}`,
      {
        headers: {
          'x-flarebase-api-key': rawApiKey,
          Authorization: `Bearer ${bobToken}`,
        },
      }
    );
    assert.fail('Bob should have been denied access to Alice private doc');
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 403);
    console.log("   ✅ Bob denied access to Alice's private doc with HTTP 403 Forbidden");
  }

  // ── STEP 7: Query filtering (Row-Level Security on queryDocuments) ──
  console.log('7. Testing query filtering for Bob vs Alice...');
  // Bob queries collection
  const bobQueryRes = await axios.get(
    `${BASE_URL}/api/v1/db/collections/${colName}/documents`,
    {
      headers: {
        'x-flarebase-api-key': rawApiKey,
        Authorization: `Bearer ${bobToken}`,
      },
    }
  );
  assert.strictEqual(bobQueryRes.status, 200);
  // Bob should ONLY see his public document, NOT Alice's private document!
  const bobDocs = bobQueryRes.data.data.documents;
  assert.strictEqual(bobDocs.length, 1);
  assert.strictEqual(bobDocs[0]._id, bobDocId);
  console.log("   ✅ Bob's query correctly excluded Alice's private document (1 doc returned)");

  // Alice queries collection
  const aliceQueryRes = await axios.get(
    `${BASE_URL}/api/v1/db/collections/${colName}/documents`,
    {
      headers: {
        'x-flarebase-api-key': rawApiKey,
        Authorization: `Bearer ${aliceToken}`,
      },
    }
  );
  assert.strictEqual(aliceQueryRes.status, 200);
  // Alice should see BOTH her private document AND the public document!
  const aliceDocs = aliceQueryRes.data.data.documents;
  assert.strictEqual(aliceDocs.length, 2);
  console.log('   ✅ Alice query returned all 2 documents (private + public)');

  // ── STEP 8: Patch document _rules to share with Bob ──
  console.log("8. Alice updating document _rules to grant Bob read access...");
  const patchRulesRes = await axios.patch(
    `${BASE_URL}/api/v1/db/collections/${colName}/documents/${aliceDocId}`,
    {
      data: {
        _rules: {
          read: "auth.id == '" + aliceId + "' || auth.id == '" + bobId + "'",
          write: "auth.id == '" + aliceId + "'",
        },
      },
    },
    {
      headers: {
        'x-flarebase-api-key': rawApiKey,
        Authorization: `Bearer ${aliceToken}`,
      },
    }
  );
  assert.strictEqual(patchRulesRes.status, 200);
  console.log('   ✅ Document _rules updated successfully');

  // ── STEP 9: Bob can now read Alice document ──
  console.log("9. Bob reading Alice's document after rules update (must be 200 OK)...");
  const bobReadAliceNowRes = await axios.get(
    `${BASE_URL}/api/v1/db/collections/${colName}/documents/${aliceDocId}`,
    {
      headers: {
        'x-flarebase-api-key': rawApiKey,
        Authorization: `Bearer ${bobToken}`,
      },
    }
  );
  assert.strictEqual(bobReadAliceNowRes.status, 200);
  assert.strictEqual(bobReadAliceNowRes.data.data.title, "Alice's Secret Journal");
  console.log("   ✅ Bob now successfully reads Alice's shared document!");

  // ── STEP 10: Delete operation rule check (Admin Bob can delete, Alice cannot delete Bob's doc) ──
  console.log("10. Testing delete permissions (Bob admin delete vs Alice delete)...");
  try {
    await axios.delete(
      `${BASE_URL}/api/v1/db/collections/${colName}/documents/${bobDocId}`,
      {
        headers: {
          'x-flarebase-api-key': rawApiKey,
          Authorization: `Bearer ${aliceToken}`, // Alice is non-admin
        },
      }
    );
    assert.fail('Alice should not be able to delete Bob document');
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 403);
    console.log('   ✅ Non-admin Alice blocked from deleting with HTTP 403 Forbidden');
  }

  // Admin Bob deletes Bob's document (allowed)
  const deleteBobDocRes = await axios.delete(
    `${BASE_URL}/api/v1/db/collections/${colName}/documents/${bobDocId}`,
    {
      headers: {
        'x-flarebase-api-key': rawApiKey,
        Authorization: `Bearer ${bobToken}`, // Bob is admin
      },
    }
  );
  assert.strictEqual(deleteBobDocRes.status, 200);
  console.log('   ✅ Admin Bob successfully deleted document');

  // Clean up
  console.log('\n🧹 Cleaning up test project and collection...');
  db.prepare('DELETE FROM collections WHERE name = ?').run(colName);
  db.prepare('DELETE FROM documents WHERE collectionName = ?').run(colName);
  db.prepare('DELETE FROM project_users WHERE projectId = ?').run(projId);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projId);
  console.log('   ✅ Cleanup complete.');

  console.log('\n🎉 ALL HTTP END-TO-END SECURITY RULES TESTS PASSED ON PORT 3000!');
}

main().catch((err) => {
  console.error('❌ E2E Test Failed:', err.message, err.response?.data || '');
  process.exit(1);
});
