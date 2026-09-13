const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const token = JSON.parse(data).data.token;
    
    // Update
    const payload = JSON.stringify({ s3BucketName: 'my-test-bucket', s3Region: 'us-west-2' });
    const req2 = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/admin/platform-settings',
      method: 'PATCH',
      headers: { 
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res2) => {
      let data2 = '';
      res2.on('data', d => data2 += d);
      res2.on('end', () => {
        console.log("UPDATE Response:", data2);
        
        // Fetch
        const req3 = http.request({
          hostname: 'localhost',
          port: 3000,
          path: '/api/v1/admin/platform-settings',
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + token }
        }, (res3) => {
          let data3 = '';
          res3.on('data', d => data3 += d);
          res3.on('end', () => console.log("GET Response:", data3));
        });
        req3.end();
      });
    });
    req2.write(payload);
    req2.end();
  });
});

req.write(JSON.stringify({ email: 'admin@flarebase.dev', password: 'AdminPass123!' }));
req.end();
