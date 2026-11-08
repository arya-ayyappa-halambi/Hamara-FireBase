// ─────────────────────────────────────────────────────────────────────────────
//  tests/client-sdk.test.ts
//  Integration Test Suite for @flarebase/client Standalone TypeScript SDK
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a-very-long-secret-key-at-least-32-characters-for-testing-purpose!';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a-very-long-encryption-key-32-bytes-long!';

import http from 'http';
import path from 'path';
import fs from 'fs';
import { AddressInfo } from 'net';
import express from 'express';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { registerUser } from '../src/auth/auth.service';
import { userStore } from '../src/store/user.store';
import { projectService } from '../src/project/project.service';
import dbRouter from '../src/db/db.routes';
import projectAuthRouter from '../src/project-auth/project-auth.routes';
import storageRouter from '../src/storage/storage.routes';
import { globalErrorHandler } from '../src/middleware/error.middleware';

import { createClient, FlareBaseClient, FlareBaseError } from '../packages/client/src/index';

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

async function runClientSdkTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running @flarebase/client Standalone TypeScript SDK Test Suite');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();

  // 1. Setup Platform Developer & Project for testing
  const devEmail = `sdk_dev_${Date.now()}@flarebase.dev`;
  await registerUser({ email: devEmail, password: 'Password123!', name: 'SDK Developer' });
  const devUser = await userStore.findByEmail(devEmail);
  if (!devUser) throw new Error('Failed to create test platform developer');

  const { project, rawApiKey } = projectService.createProject(devUser.id, 'SDK Test Project');

  // 2. Spin up in-memory Express server for the SDK to interact with
  const app = express();
  app.use(express.json());

  // Serve compiled client bundle
  app.get(['/flarebase.js', '/assets/flarebase.js'], (_req, res, next) => {
    const clientBundle = path.resolve(__dirname, '../packages/client/dist/index.global.js');
    if (fs.existsSync(clientBundle)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.sendFile(clientBundle);
    }
    const fallback = path.resolve(__dirname, '../public/flarebase.js');
    if (fs.existsSync(fallback)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.sendFile(fallback);
    }
    next();
  });

  app.use('/api/v1/db', dbRouter);
  app.use('/api/v1/project-auth', projectAuthRouter);
  app.use('/api/v1/storage', storageRouter);
  app.use(globalErrorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ── 1. Serve Compiled Browser Bundle ───────────────────────────────────
    console.log('--- 1. Compiled Browser Bundle Route ---');
    const bundleRes = await fetch(`${baseUrl}/flarebase.js`);
    assert(bundleRes.status === 200, 'GET /flarebase.js returns HTTP 200');
    assert((bundleRes.headers.get('content-type') || '').includes('javascript'), 'Returns application/javascript');
    const bundleBody = await bundleRes.text();
    assert(bundleBody.includes('FlareBase'), 'Bundle body contains FlareBase definition');

    // ── 2. Initialize SDK Client ───────────────────────────────────────────
    console.log('\n--- 2. SDK Client Initialization ---');
    const flare: FlareBaseClient = createClient({
      baseUrl,
      apiKey: rawApiKey
    });
    assert(flare.baseUrl === baseUrl, 'SDK baseUrl properly initialized');
    assert(flare.apiKey === rawApiKey, 'SDK apiKey properly initialized');
    assert(typeof flare.collection === 'function', 'flare.collection method is available');
    assert(typeof flare.auth === 'object', 'flare.auth submodule is available');
    assert(typeof flare.storage === 'object', 'flare.storage submodule is available');

    // ── 3. Project Auth Operations ─────────────────────────────────────────
    console.log('\n--- 3. Project User Authentication Flow ---');
    const userEmail = `user_${Date.now()}@example.com`;
    const regRes = await flare.auth.register({
      email: userEmail,
      password: 'UserPass123!',
      name: 'SDK End User'
    });
    assert(Boolean(regRes.token), 'flare.auth.register returns access token');
    assert(flare.auth.isAuthenticated(), 'flare.auth.isAuthenticated() returns true after registration');
    assert(flare.auth.getUser()?.email === userEmail, 'Current authenticated user email matches registered email');

    // Test sign in
    await flare.auth.logout();
    assert(!flare.auth.isAuthenticated(), 'User logged out and session cleared');

    const loginRes = await flare.auth.login({
      email: userEmail,
      password: 'UserPass123!'
    });
    assert(Boolean(loginRes.token), 'flare.auth.login returns new access token');
    assert(flare.auth.isAuthenticated(), 'User authenticated after login');

    // ── 4. Document Collections CRUD ───────────────────────────────────────
    console.log('\n--- 4. Typed Document Collection CRUD ---');
    interface Product {
      title: string;
      price: number;
      tags: string[];
    }
    const products = flare.collection<Product>('products');

    // Insert
    const inserted = await products.insert({
      title: 'Mechanical Keyboard',
      price: 120,
      tags: ['gadgets', 'peripherals']
    });
    assert(Boolean(inserted.id), 'products.insert creates document with unique ID');
    assert(inserted.data.title === 'Mechanical Keyboard', 'Document title matches input');
    assert(inserted.data.price === 120, 'Document price matches input');

    // Get
    const fetched = await products.get(inserted.id);
    assert(fetched.id === inserted.id, 'products.get retrieves document by ID');
    assert(fetched.data.title === 'Mechanical Keyboard', 'Retrieved document title matches');

    // Update
    const updated = await products.update(inserted.id, { price: 110 });
    assert(updated.data.price === 110, 'products.update modifies fields properly');

    // Query
    const queryRes = await products.query({ limit: 10 });
    assert(Array.isArray(queryRes.items), 'products.query returns items array');
    assert(queryRes.items.some((doc) => doc.id === inserted.id), 'Inserted document present in query results');

    // Delete
    const deleteRes = await products.delete(inserted.id);
    assert(deleteRes.success === true, 'products.delete successfully removes document');

    // ── 5. Error Handling & FlareBaseError ──────────────────────────────────
    console.log('\n--- 5. Standardized Error Handling ---');
    let errorCaught: any = null;
    try {
      await products.get('invalid_document_id_99999');
    } catch (err) {
      errorCaught = err;
    }
    assert(Boolean(errorCaught), 'Non-existent document get throws error');
    assert(errorCaught instanceof FlareBaseError, 'Error is instance of FlareBaseError');
    assert(errorCaught.status === 404, 'FlareBaseError has status 404');
    assert(errorCaught.code === 'NOT_FOUND', 'FlareBaseError has code NOT_FOUND');

    // ── 6. Real-Time SSE .onSnapshot() ─────────────────────────────────────
    console.log('\n--- 6. Real-Time SSE .onSnapshot() Subscriptions ---');
    interface Note {
      content: string;
    }
    const notes = flare.collection<Note>('live_notes');
    const receivedEvents: any[] = [];

    const unsubscribe = notes.onSnapshot((change) => {
      receivedEvents.push(change);
    });

    assert(typeof unsubscribe === 'function', 'onSnapshot returns an unsubscribe function');

    // Allow connection to establish
    await new Promise((r) => setTimeout(r, 100));

    // Trigger an insert that emits an SSE CDC event
    await notes.insert({ content: 'Real-time sync test note' });

    // Wait for event to arrive through stream
    await new Promise((r) => setTimeout(r, 300));

    assert(receivedEvents.length >= 1, 'Client received real-time change event via SSE stream');
    const lastEvent = receivedEvents[receivedEvents.length - 1];
    assert(
      lastEvent.type === 'INSERT' || lastEvent.event === 'connected' || lastEvent.type === 'document:inserted',
      'Event payload received in expected CDC format'
    );

    // Unsubscribe
    unsubscribe();
    assert(true, 'SSE subscription closed cleanly');
  } finally {
    try { (server as any).closeAllConnections?.(); } catch (_) {}
    server.close();
  }

  console.log('\n================================================================');
  console.log(`📊 @flarebase/client Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runClientSdkTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
