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
    const json = JSON.parse(data);
    const token = json.data.token;
    
    const req2 = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/admin/platform-settings',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, (res2) => {
      let data2 = '';
      res2.on('data', d => data2 += d);
      res2.on('end', () => console.log(data2));
    });
    req2.end();
  });
});

req.write(JSON.stringify({ email: 'admin@aegis.dev', password: 'AdminPass123!' }));
req.end();
