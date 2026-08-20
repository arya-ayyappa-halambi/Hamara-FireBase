const autocannon = require('autocannon');

async function runAdminUsersTest() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjMWViNGU2Ny1iMTI5LTRkNmItYmRhNy1mYTQwODIzNmEwZTAiLCJlbWFpbCI6ImFkbWluQGFlZ2lzZGIuZGV2IiwiaXNTdXBlckFkbWluIjp0cnVlLCJpYXQiOjE3ODcyMDc4NjcsImV4cCI6MTc4NzgxMjY2N30.0TS5q_ldkkDkjLrRfoza_Yp_rL79XW4PSLfiuvcjWJs';

  console.log('🚀 Starting authenticated read-only load test against http://localhost:3000/api/v1/admin/users');
  console.log('   Connections: 20 | Duration: 15s');

  const instance = autocannon({
    url: 'http://localhost:3000/api/v1/admin/users',
    connections: 20,
    duration: 15,
    pipelining: 1,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }, (err, result) => {
    if (err) {
      console.error('❌ Error running load test:', err);
      process.exit(1);
    }
    console.log('\n📊 Authenticated Data-Path Load Test Results Summary:');
    console.log(`- Total Requests: ${result.requests.total}`);
    console.log(`- Requests/sec: ${result.requests.average}`);
    console.log(`- Average Latency: ${result.latency.average} ms`);
    console.log(`- p99 Latency: ${result.latency.p99} ms`);
    console.log(`- 2xx Responses: ${result['2xx']}`);
    console.log(`- Non-2xx Responses: ${result.non2xx}`);
    console.log(`- Errors: ${result.errors}`);
    console.log(`- Timeouts: ${result.timeouts}`);
  });

  autocannon.track(instance, { renderProgressBar: true });
}

runAdminUsersTest();
