#!/usr/bin/env node

const readline = require('readline');
const { spawn } = require('child_process');
const os = require('os');

function getNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const networkIp = getNetworkIp();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('');
console.log('┌────────────────────────────────────────────────────────────┐');
console.log('│             🛡️  AegisDB Server Setup Launcher              │');
console.log('└────────────────────────────────────────────────────────────┘');

rl.question('\n👉 Enter PORT to run on (Default: 3000): ', (portInput) => {
  const port = parseInt(portInput.trim() || '3000', 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error('❌ Invalid port number. Exiting.');
    process.exit(1);
  }

  console.log('\nSelect Hosting & Network Access Mode:');
  console.log(`  [1] Both Localhost & Local Wi-Fi Network (0.0.0.0) [Recommended]`);
  console.log(`      ➜ Local:   http://localhost:${port}`);
  console.log(`      ➜ Network: http://${networkIp}:${port}`);
  console.log(`  [2] Localhost Only (127.0.0.1)`);
  console.log(`      ➜ Local:   http://localhost:${port}`);
  console.log(`  [3] Specific Network IP (${networkIp})`);
  console.log(`      ➜ Network: http://${networkIp}:${port}`);

  rl.question('\nEnter choice [1, 2, or 3] (Default: 1): ', (choiceInput) => {
    rl.close();
    const choice = choiceInput.trim() || '1';

    let host = '0.0.0.0';
    if (choice === '2') host = '127.0.0.1';
    else if (choice === '3') host = networkIp;

    console.log(`\n🚀 Starting AegisDB on HOST=${host}, PORT=${port}...\n`);

    const child = spawn('npx', ['nodemon', '--watch', 'src', '--watch', '.env', '--ext', 'ts', '--exec', 'ts-node', 'src/server.ts'], {
      env: { ...process.env, HOST: host, PORT: port.toString() },
      stdio: 'inherit',
      shell: true
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  });
});
