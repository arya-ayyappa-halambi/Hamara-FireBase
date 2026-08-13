const http = require('http');

const data = JSON.stringify({
  email: 'testuser@gmail.com',
  password: 'Password123!'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, res => {
  let resData = '';
  res.on('data', chunk => resData += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:', resData);
    process.exit(0);
  });
});

req.on('error', error => {
  console.error(error);
  process.exit(1);
});

req.write(data);
req.end();
