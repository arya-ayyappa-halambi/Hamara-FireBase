const autocannon = require('autocannon');

async function runReadOnlyTest() {
  console.log('🚀 Starting read-only load test against http://localhost:3000/health');
  console.log('   Connections: 20 | Duration: 15s');

  const instance = autocannon({
    url: 'http://localhost:3000/health',
    connections: 20,
    duration: 15,
    pipelining: 1,
    method: 'GET'
  }, (err, result) => {
    if (err) {
      console.error('❌ Error running load test:', err);
      process.exit(1);
    }
    console.log('\n📊 Load Test Results Summary:');
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

runReadOnlyTest();
