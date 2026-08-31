// ─────────────────────────────────────────────────────────────────────────────
//  tests/traffic-topology.test.ts
//  Test Suite for Real-Time Traffic Topology & Flow Telemetry Engine
// ─────────────────────────────────────────────────────────────────────────────

import { initSqlite } from '../src/db/sqlite.connection';
import { trafficTopologyService } from '../src/services/traffic-topology.service';

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

async function runTrafficTopologyTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running Real-Time Traffic Topology & Flow Telemetry Tests');
  console.log('================================================================\n');

  initSqlite();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Ingress Source Classification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Ingress Classification ---');
  assert(trafficTopologyService.classifyIngress('127.0.0.1') === 'localhost', '127.0.0.1 classified as localhost');
  assert(trafficTopologyService.classifyIngress('::1') === 'localhost', '::1 classified as localhost');
  assert(trafficTopologyService.classifyIngress('localhost') === 'localhost', 'localhost classified as localhost');
  assert(trafficTopologyService.classifyIngress('192.168.1.50') === 'lan', '192.168.1.50 classified as lan');
  assert(trafficTopologyService.classifyIngress('10.0.0.12') === 'lan', '10.0.0.12 classified as lan');
  assert(trafficTopologyService.classifyIngress('172.20.10.4') === 'lan', '172.20.10.4 classified as lan');
  assert(trafficTopologyService.classifyIngress('198.51.100.22') === 'wan_tunnel', '198.51.100.22 classified as wan_tunnel');
  assert(trafficTopologyService.classifyIngress('127.0.0.1', true) === 'wan_tunnel', 'Explicit tunnel request classified as wan_tunnel');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Record Request & Metrics Flow Accumulation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Record Transaction Flow ---');
  const snapPre = trafficTopologyService.getTopologySnapshot();
  const preReqs = snapPre.totalRequests;
  const preBytesIn = snapPre.totalBytesIn;
  const preBytesOut = snapPre.totalBytesOut;

  trafficTopologyService.recordRequest({
    ip: '192.168.31.88',
    method: 'POST',
    path: '/api/v1/db/documents/users',
    protocol: 'HTTP/1.1',
    statusCode: 201,
    latencyMs: 3.4,
    bytesIn: 512,
    bytesOut: 1024
  });

  const snapPost = trafficTopologyService.getTopologySnapshot();
  assert(snapPost.totalRequests === preReqs + 1, 'Total requests incremented by 1');
  assert(snapPost.totalBytesIn === preBytesIn + 512, 'Total bytes in incremented by 512');
  assert(snapPost.totalBytesOut === preBytesOut + 1024, 'Total bytes out incremented by 1024');
  assert(snapPost.recentStreams.length > 0, 'Recent streams contains new entry');

  const latestStream = snapPost.recentStreams[0];
  assert(latestStream.clientIp === '192.168.31.88', 'Stream clientIp matches');
  assert(latestStream.ingressType === 'lan', 'Stream ingressType is lan');
  assert(latestStream.method === 'POST', 'Stream method is POST');
  assert(latestStream.path === '/api/v1/db/documents/users', 'Stream path matches');
  assert(latestStream.statusCode === 201, 'Stream statusCode is 201');
  assert(latestStream.bytesIn === 512, 'Stream bytesIn is 512');
  assert(latestStream.bytesOut === 1024, 'Stream bytesOut is 1024');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Tunnel Packet Flow Recording
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Public Tunnel Stream Flow ---');
  trafficTopologyService.recordRequest({
    ip: '198.51.100.99',
    method: 'GET',
    path: '/api/v1/auth/login',
    protocol: 'Tunnel-Proxy',
    statusCode: 200,
    latencyMs: 5.2,
    bytesIn: 128,
    bytesOut: 2048,
    isTunnel: true
  });

  const snapTunnel = trafficTopologyService.getTopologySnapshot();
  const tunnelStream = snapTunnel.recentStreams[0];
  assert(tunnelStream.ingressType === 'wan_tunnel', 'Tunnel stream classified as wan_tunnel');
  assert(tunnelStream.protocol === 'Tunnel-Proxy', 'Protocol is Tunnel-Proxy');
  assert(snapTunnel.ingressDistribution.wan_tunnel >= 1, 'Ingress distribution wan_tunnel counter incremented');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Pipeline Node Health Structure
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Pipeline Node Health ---');
  assert(snapTunnel.pipelineNodes.ingress.status === 'healthy', 'Ingress node status is healthy');
  assert(snapTunnel.pipelineNodes.security.status === 'healthy', 'Security node status is healthy');
  assert(snapTunnel.pipelineNodes.router.status === 'healthy', 'Router node status is healthy');
  assert(snapTunnel.pipelineNodes.storage.status === 'healthy', 'Storage node status is healthy');
  assert(Array.isArray(snapTunnel.rpsHistory), 'rpsHistory is an array');
  assert(Array.isArray(snapTunnel.bandwidthHistory), 'bandwidthHistory is an array');

  trafficTopologyService.stopMetricsTicker();

  console.log('\n================================================================');
  console.log(`📊 Traffic Topology Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTrafficTopologyTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
