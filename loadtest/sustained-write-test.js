const autocannon = require('autocannon');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjMWViNGU2Ny1iMTI5LTRkNmItYmRhNy1mYTQwODIzNmEwZTAiLCJlbWFpbCI6ImFkbWluQGFlZ2lzZGIuZGV2IiwiaXNTdXBlckFkbWluIjp0cnVlLCJpYXQiOjE3ODcyMDc4NjcsImV4cCI6MTc4NzgxMjY2N30.0TS5q_ldkkDkjLrRfoza_Yp_rL79XW4PSLfiuvcjWJs';
const PROJECT_ID = 'a357088d-f5da-477a-a3c0-8d46b7c3ee98';
const COLLECTION_NAME = 'loadtest_wal_probe';
const TARGET_URL = `http://localhost:3000/api/v1/db/collections/${COLLECTION_NAME}/documents`;

async function runSustainedWriteTest() {
  const batchTimestamp = new Date().toISOString();
  console.log('🚀 Starting Rate-Budgeted Sustained WAL Write Test');
  console.log(`   Target: POST ${TARGET_URL}`);
  console.log('   Connections: 5 | Duration: 20s | Target Rate: 5 req/sec');
  console.log(`   Batch Tag: ${batchTimestamp}\n`);

  const payload = JSON.stringify({
    loadTest: true,
    batch: batchTimestamp,
    note: 'Sustained WAL write benchmark record under rate limit'
  });

  const instance = autocannon({
    url: TARGET_URL,
    connections: 5,
    overallRate: 5, // 5 requests per second total across 5 connections
    duration: 20,
    pipelining: 1,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'x-aegis-project-id': PROJECT_ID,
      'Content-Type': 'application/json'
    },
    body: payload
  }, async (err, result) => {
    if (err) {
      console.error('❌ Error during sustained write test:', err);
      process.exit(1);
    }

    console.log('📊 Sustained Write Load Test Results:');
    console.log(`- Total Requests: ${result.requests.total}`);
    console.log(`- Requests / sec: ${result.requests.average}`);
    console.log(`- Average Latency: ${result.latency.average} ms`);
    console.log(`- p50 Latency: ${result.latency.p50} ms`);
    console.log(`- p99 Latency: ${result.latency.p99} ms`);
    console.log(`- 2xx Successful Writes: ${result['2xx']}`);
    console.log(`- Non-2xx Responses (429s/5xx): ${result.non2xx}`);
    console.log(`- Network / Timeout Errors: ${result.errors + result.timeouts}`);
  });

  autocannon.track(instance, { renderProgressBar: true });
}

runSustainedWriteTest();
