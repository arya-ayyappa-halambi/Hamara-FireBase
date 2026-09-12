// ─────────────────────────────────────────────────────────────────────────────
//  tests/load-concurrency-performance.test.ts
//  FlareBase — High Concurrency, Latency, Multi-Tenant Isolation & Load Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { dbStore } from '../src/db/db.service';
import { projectService } from '../src/project/project.service';
import { registerUser } from '../src/auth/auth.service';
import { userStore } from '../src/store/user.store';
import { projectAuthService } from '../src/project-auth/project-auth.service';
import { rateLimiterService } from '../src/services/rate-limiter.service';
import { wsService } from '../src/realtime/websocket.service';
import { AppError } from '../src/types/auth.types';
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

async function runLoadAndConcurrencyTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🚀 Running FlareBase Concurrency, Latency & Load Test Suite');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();

  // 1. Seed Platform Developer & Projects
  console.log('--- 1. Seed Developer & Multi-Tenant Projects ---');
  const devEmail = `dev_load_${Date.now()}@flarebase.dev`;
  await registerUser({
    email: devEmail,
    password: 'SecurePassword123!',
    name: 'FlareBase Load Tester'
  });
  const devUser = await userStore.findByEmail(devEmail);
  assert(!!devUser, 'Seed platform developer created');

  const numProjects = 5;
  const projectIds: string[] = [];
  for (let i = 0; i < numProjects; i++) {
    const { project } = projectService.createProject(devUser!.id, `Tenant App ${i + 1}`);
    projectIds.push(project.id);
  }
  assert(projectIds.length === 5, 'Created 5 distinct multi-tenant test projects');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 2: 500 Concurrent Document Operations (CRUD Under SQLite WAL)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. High Concurrency: 500 Parallel Operations ---');
  const primaryProjectId = projectIds[0];
  const collName = 'orders';

  dbStore.createCollection(devUser!.id, primaryProjectId, {
    name: collName,
    description: 'High-throughput concurrency test collection'
  });

  const totalOps = 500;
  const writeStartTime = Date.now();
  const writePromises = Array.from({ length: totalOps }, (_, idx) => {
    return Promise.resolve().then(() => {
      return dbStore.insertDocument(devUser!.id, primaryProjectId, collName, {
        orderId: `ord_${idx}`,
        amount: (idx * 1.5) + 10,
        status: idx % 2 === 0 ? 'completed' : 'pending',
        customerRef: `cust_${idx % 25}`,
        itemsCount: (idx % 5) + 1
      }, `doc_order_${idx}`);
    });
  });

  const writeResults = await Promise.all(writePromises);
  const writeDuration = Date.now() - writeStartTime;
  console.log(`  ⏱️  500 Parallel Writes completed in ${writeDuration}ms (${(500 / (writeDuration / 1000)).toFixed(1)} ops/sec)`);

  assert(writeResults.length === totalOps, 'All 500 parallel writes resolved successfully with zero errors');

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM documents WHERE ownerId = ? AND projectId = ? AND collectionName = ?')
    .get(devUser!.id, primaryProjectId, collName) as { cnt: number };
  assert(countRow.cnt === totalOps, 'Database confirmed exactly 500 documents persisted without data race/loss');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 3: Sub-10ms Latency Benchmarking (Reads, Indexed Filters & Pagination)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Sub-10ms Latency Benchmarking ---');
  
  const queryBenchmarkRuns = 100;
  const latencies: number[] = [];

  for (let i = 0; i < queryBenchmarkRuns; i++) {
    const qStart = process.hrtime.bigint();
    const result = dbStore.queryDocuments(devUser!.id, primaryProjectId, collName, {
      filter: { status: 'completed' },
      limit: 20,
      offset: 0,
      sortBy: 'amount',
      sortOrder: 'desc'
    });
    const qEnd = process.hrtime.bigint();
    const durationMs = Number(qEnd - qStart) / 1_000_000;
    latencies.push(durationMs);
    if (i === 0) {
      assert(result.documents.length === 20, 'Filtered query returned expected page size');
      assert(result.total === 250, 'Filtered query correctly computed matched document count');
    }
  }

  const avgLatency = latencies.reduce((acc, v) => acc + v, 0) / latencies.length;
  const maxLatency = Math.max(...latencies);
  console.log(`  ⚡ Average Query Latency: ${avgLatency.toFixed(3)}ms (Max: ${maxLatency.toFixed(3)}ms)`);
  assert(avgLatency < 10, `Average query latency (${avgLatency.toFixed(3)}ms) is strictly sub-10ms`);

  // Point Read Benchmark
  const pointLatencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const pStart = process.hrtime.bigint();
    const doc = dbStore.getDocument(devUser!.id, primaryProjectId, collName, `doc_order_${i}`);
    const pEnd = process.hrtime.bigint();
    pointLatencies.push(Number(pEnd - pStart) / 1_000_000);
  }
  const avgPointLatency = pointLatencies.reduce((acc, v) => acc + v, 0) / pointLatencies.length;
  console.log(`  ⚡ Average Key-Lookup Point Read Latency: ${avgPointLatency.toFixed(3)}ms`);
  assert(avgPointLatency < 5, `Average point read latency (${avgPointLatency.toFixed(3)}ms) is strictly under 5ms`);

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 4: Strict Multi-Tenant Isolation Under High Concurrency
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Multi-Tenant Cross-Project Isolation Under Concurrency ---');
  
  // Write documents to the same collection name ('profiles') across 5 different projects simultaneously
  const isoColl = 'profiles';
  for (const pid of projectIds) {
    dbStore.createCollection(devUser!.id, pid, { name: isoColl });
  }

  const crossWrites = projectIds.map((pid, pIdx) => {
    return Promise.all(
      Array.from({ length: 20 }, (_, dIdx) => {
        return Promise.resolve().then(() => {
          return dbStore.insertDocument(devUser!.id, pid, isoColl, {
            userSlug: `user_${dIdx}`,
            tenantTag: `PROJECT_${pIdx}_SECRET_DATA`,
            score: pIdx * 100 + dIdx
          }, `p${pIdx}_profile_doc_${dIdx}`);
        });
      })
    );
  });

  await Promise.all(crossWrites);

  // Assert each project sees ONLY its own documents
  for (let pIdx = 0; pIdx < projectIds.length; pIdx++) {
    const pid = projectIds[pIdx];
    const qResult = dbStore.queryDocuments(devUser!.id, pid, isoColl, { limit: 100 });
    assert(qResult.total === 20, `Project ${pIdx + 1} sees exactly 20 documents`);
    
    const foreignDataFound = qResult.documents.some((d: any) => !d.tenantTag.includes(`PROJECT_${pIdx}_SECRET_DATA`));
    assert(!foreignDataFound, `Project ${pIdx + 1} has zero cross-tenant data leakage`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 5: Rate Limiting & Traffic Surge Backpressure
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Rate Limiting & Traffic Surge Backpressure ---');
  const testClientKey = `surge_client_${Date.now()}`;
  const burstCapacity = 10;
  const burstWindowMs = 60 * 1000;

  let allowedCount = 0;
  let blockedCount = 0;

  for (let req = 1; req <= 25; req++) {
    const res = rateLimiterService.limit(testClientKey, burstCapacity, burstWindowMs);
    if (res.allowed) {
      allowedCount++;
    } else {
      blockedCount++;
      assert(res.retryAfterSec > 0, `Blocked request #${req} returned valid Retry-After (${res.retryAfterSec}s)`);
    }
  }

  assert(allowedCount === 10, 'First 10 burst requests within capacity allowed');
  assert(blockedCount === 15, 'Subsequent 15 burst requests rejected with rate limiting backpressure');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 6: Real-time Event CDC / Broadcast Isolation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Real-time Event CDC / Broadcast Project Isolation ---');
  
  const mockServer: any = {
    on: () => {},
    listeners: () => []
  };
  wsService.init(mockServer);

  const receivedProjectA: any[] = [];
  const receivedProjectB: any[] = [];

  const mockSocketA: any = {
    readyState: 1, // OPEN
    isAlive: true,
    user: { sub: devUser!.id },
    projectId: projectIds[0],
    subscriptions: new Set(),
    send: (payloadStr: string) => {
      receivedProjectA.push(JSON.parse(payloadStr));
    }
  };

  const mockSocketB: any = {
    readyState: 1, // OPEN
    isAlive: true,
    user: { sub: devUser!.id },
    projectId: projectIds[1],
    subscriptions: new Set(),
    send: (payloadStr: string) => {
      receivedProjectB.push(JSON.parse(payloadStr));
    }
  };

  // Subscribe sockets
  (wsService as any).handleClientMessage(mockSocketA, { action: 'subscribe', collection: 'orders', projectId: projectIds[0] });
  (wsService as any).handleClientMessage(mockSocketB, { action: 'subscribe', collection: 'orders', projectId: projectIds[1] });

  // Clear subscription confirmation messages
  receivedProjectA.length = 0;
  receivedProjectB.length = 0;

  // Broadcast mutation on Project A
  wsService.broadcastChange(devUser!.id, projectIds[0], 'orders', 'document:inserted', { id: 'new_order_1' });

  assert(receivedProjectA.length === 1, 'Project A subscriber received real-time change event');
  assert(receivedProjectA[0].projectId === projectIds[0], 'Event payload tagged with Project A ID');
  assert(receivedProjectB.length === 0, 'Project B subscriber received 0 events (Strict WebSocket isolation verified)');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 7: Concurrent Project Auth User Registration & Rotation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Concurrent Project Auth Tokens & Rotation ---');
  
  const authConcurrency = 20;
  const userRegisterPromises = Array.from({ length: authConcurrency }, (_, i) => {
    const email = `load_user_${i}_${Date.now()}@example.com`;
    return projectAuthService.registerUser(projectIds[0], email, 'UserPass123!');
  });

  const authResults = await Promise.all(userRegisterPromises);
  assert(authResults.length === authConcurrency, 'Successfully registered 20 concurrent project users');

  const rotationPromises = authResults.map((res) => {
    return projectAuthService.rotateRefreshToken(projectIds[0], res.refreshToken);
  });

  const rotationResults = await Promise.all(rotationPromises);
  assert(rotationResults.length === authConcurrency, 'Successfully rotated all 20 refresh tokens concurrently');

  console.log('\n================================================================');
  console.log(`📊 Concurrency & Load Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runLoadAndConcurrencyTests().catch((err) => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
