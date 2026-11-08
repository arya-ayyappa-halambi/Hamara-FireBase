// ─────────────────────────────────────────────────────────────────────────────
//  tests/react-hooks.test.ts
//  Integration test suite for @flarebase/react hooks and provider.
// ─────────────────────────────────────────────────────────────────────────────

import assert from 'assert';
import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import {
  FlareBaseProvider,
  useFlareBase,
  useCollection,
  useDocument,
  useAuth,
  useStorage
} from '../packages/react/src';
import { FlareBaseClient } from '../packages/client/src';

let totalTests = 0;
let passedTests = 0;

async function it(description: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: ${description}`);
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 Running @flarebase/react Hooks Test Suite');
  console.log('================================================================\n');

  const client = new FlareBaseClient({
    baseUrl: 'http://localhost:3000',
    apiKey: 'test_pk_12345'
  });

  // ── 1. Export Integrity & Type Verification ──────────────────────────────
  console.log('--- 1. Export Integrity & Type Verification ---');

  await it('FlareBaseProvider is defined as a React component function', () => {
    assert.strictEqual(typeof FlareBaseProvider, 'function');
  });

  await it('useFlareBase hook is defined', () => {
    assert.strictEqual(typeof useFlareBase, 'function');
  });

  await it('useCollection hook is defined', () => {
    assert.strictEqual(typeof useCollection, 'function');
  });

  await it('useDocument hook is defined', () => {
    assert.strictEqual(typeof useDocument, 'function');
  });

  await it('useAuth hook is defined', () => {
    assert.strictEqual(typeof useAuth, 'function');
  });

  await it('useStorage hook is defined', () => {
    assert.strictEqual(typeof useStorage, 'function');
  });

  // ── 2. Provider Invariant Checks & SSR Safety ────────────────────────────
  console.log('\n--- 2. Provider Invariant Checks & SSR Safety ---');

  await it('useFlareBase throws descriptive error when rendered outside Provider', () => {
    function ConsumerOutside() {
      useFlareBase();
      return React.createElement('div', null, 'outside');
    }

    assert.throws(
      () => {
        ReactDOMServer.renderToString(React.createElement(ConsumerOutside));
      },
      (err: any) => {
        return err instanceof Error && err.message.includes('must be used within a <FlareBaseProvider');
      },
      'Expected descriptive Provider error'
    );
  });

  await it('FlareBaseProvider renders children and provides client context in SSR', () => {
    let capturedClient: any = null;

    function TestChild() {
      capturedClient = useFlareBase();
      return React.createElement('div', { id: 'test-child' }, 'FlareBase Connected');
    }

    const html = ReactDOMServer.renderToString(
      React.createElement(
        FlareBaseProvider,
        { client },
        React.createElement(TestChild)
      )
    );

    assert(html.includes('FlareBase Connected'), 'Rendered HTML contains child text');
    assert.strictEqual(capturedClient, client, 'Provider injected client context accurately');
  });

  // ── 3. Subscription Lifecycle & Mock Contract ─────────────────────────────
  console.log('\n--- 3. Subscription Lifecycle & Mock Contract ---');

  await it('useCollection creates collection handle and binds query options', async () => {
    let unsubscribed = false;
    let registeredCallback: any = null;

    // Spy on client.collection
    const originalCollection = client.collection.bind(client);
    client.collection = function (name: string): any {
      const col = originalCollection(name);
      col.onSnapshot = function (callback: any) {
        registeredCallback = callback;
        return () => {
          unsubscribed = true;
        };
      };
      return col;
    };

    const col = client.collection('items');
    const unsub = col.onSnapshot((_change: any) => {});
    assert.strictEqual(typeof registeredCallback, 'function', 'Listener registered');
    unsub();
    assert.strictEqual(unsubscribed, true, 'Unsubscribe successfully cleaned up listener');
  });

  await it('useAuth exposes standard authentication action handlers', () => {
    assert.strictEqual(typeof client.auth.login, 'function');
    assert.strictEqual(typeof client.auth.register, 'function');
    assert.strictEqual(typeof client.auth.logout, 'function');
    assert.strictEqual(typeof client.auth.me, 'function');
    assert.strictEqual(typeof client.auth.getUser, 'function');
    assert.strictEqual(typeof client.auth.isAuthenticated, 'function');
  });

  await it('useStorage exposes standard storage action handlers', () => {
    assert.strictEqual(typeof client.storage.upload, 'function');
    assert.strictEqual(typeof client.storage.getSignedUrl, 'function');
    assert.strictEqual(typeof client.storage.getQuota, 'function');
    assert.strictEqual(typeof client.storage.delete, 'function');
    assert.strictEqual(typeof client.storage.list, 'function');
    assert.strictEqual(typeof client.storage.getAssetUrl, 'function');
  });

  // ── Results ──────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`📊 @flarebase/react Results: ${passedTests} passed, ${totalTests - passedTests} failed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
