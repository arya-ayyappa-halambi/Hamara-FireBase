// ─────────────────────────────────────────────────────────────────────────────
//  sdk/examples/demo.ts
//  End-to-End demonstration script for @flarebase/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import { FlareBase } from '../dist/index.js';

async function main() {
  console.log('🚀 Initializing FlareBase Client SDK...');
  const flare = new FlareBase({ baseUrl: 'http://localhost:3000' });

  try {
    // 1. Authentication
    console.log('\n--- 1. Auth Module ---');
    const authData = await flare.auth.register(
      `sdk-user-${Date.now()}@flarebase.dev`,
      'SdkPassword123!',
      'SDK Test User',
    );
    console.log('✅ Registered User ID :', authData.user.id);
    console.log('🔑 Access Token      :', authData.token.substring(0, 25) + '...');

    // 2. Real-Time WebSockets
    console.log('\n--- 2. Realtime WebSockets Module ---');
    await flare.realtime.subscribe('telemetry', (frame) => {
      console.log('⚡ Real-time Change Stream Event Received:', frame.event, frame.data);
    });
    console.log('✅ Subscribed to "telemetry" change stream over WebSocket.');

    // 3. Dynamic Schema DB Engine
    console.log('\n--- 3. Dynamic Database Engine Module ---');
    const col = await flare.db.createCollection('telemetry', 'SDK telemetry collection');
    console.log('📁 Created Collection :', col.name);

    const doc1 = await flare.db.insertDocument('telemetry', {
      device: 'sensor-01',
      reading: 42.8,
      status: 'active',
    });
    console.log('📄 Inserted Document  :', doc1._id, doc1);

    const doc2 = await flare.db.updateDocument('telemetry', doc1._id, {
      reading: 45.2,
      updatedBy: 'sdk-client',
    });
    console.log('✏️  Updated Document   :', doc2._id, doc2);

    const queryResult = await flare.db.queryDocuments('telemetry', {
      filter: { status: 'active' },
      sortBy: '_createdAt',
      sortOrder: 'desc',
    });
    console.log('🔍 Query Result Total :', queryResult.total, 'documents found.');

    await flare.db.deleteDocument('telemetry', doc1._id);
    console.log('🗑️  Deleted Document   :', doc1._id);

    // 4. Hoster Deployments
    console.log('\n--- 4. Hoster Module ---');
    const deployments = await flare.hoster.listDeployments();
    console.log('🐳 Total Deployments  :', deployments.length);

    // 5. Token Refresh & Logout
    console.log('\n--- 5. Token Refresh & Clean Logout ---');
    const refreshed = await flare.auth.refresh();
    console.log('🔄 Refreshed Token    :', refreshed.token.substring(0, 25) + '...');

    flare.realtime.disconnect();
    await flare.auth.logout();
    console.log('👋 Logged out cleanly.\n');
    console.log('🎉 All SDK End-to-End Operations Passed!');

  } catch (err: any) {
    console.error('❌ SDK Demo Error:', err.message || err);
    process.exit(1);
  }
}

main();
