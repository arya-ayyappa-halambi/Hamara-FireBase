// ─────────────────────────────────────────────────────────────────────────────
//  src/cli/interactive-start.ts
//  Interactive CLI startup prompt for selecting Host, IP, and Port.
// ─────────────────────────────────────────────────────────────────────────────

import readline from 'readline';
import os from 'os';
import { spawn } from 'child_process';
import { initSqlite, getDb } from '../db/sqlite.connection';

function getNetworkIp(): string {
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

async function runInteractivePrompt(): Promise<void> {
  const netIp = getNetworkIp();

  // Load existing settings
  initSqlite();
  const db = getDb();
  let savedPort = 3000;
  let savedHost = '0.0.0.0';
  let savedMode = 'both';

  try {
    const row = db.prepare("SELECT serverPort, serverHost, serverHostingMode FROM platform_settings WHERE id = 'default'").get() as any;
    if (row) {
      if (row.serverPort) savedPort = Number(row.serverPort);
      if (row.serverHost) savedHost = row.serverHost;
      if (row.serverHostingMode) savedMode = row.serverHostingMode;
    }
  } catch (_) {}

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║             FlareBase Interactive Server Startup 🛡️          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('  Detected Wi-Fi Network IP: \x1b[32m' + netIp + '\x1b[0m');
  console.log('  Currently Saved Defaults : \x1b[36m' + savedHost + ':' + savedPort + ' (' + savedMode + ')\x1b[0m');
  console.log('──────────────────────────────────────────────────────────────');
  console.log('  [1] Dual Host - Both Localhost & Wi-Fi Network (0.0.0.0) [Recommended]');
  console.log('  [2] Localhost Only (127.0.0.1)');
  console.log('  [3] Wi-Fi Network IP Only (' + netIp + ')');
  console.log('  [4] Custom Host IP / Domain');
  console.log('  [Enter] Keep Current Defaults (' + savedHost + ':' + savedPort + ')');
  console.log('──────────────────────────────────────────────────────────────');

  const modeChoice = (await ask('Select Hosting Mode [1-4, default=1]: ')).trim();

  let targetHost = '0.0.0.0';
  let targetMode = 'both';

  if (modeChoice === '2') {
    targetHost = '127.0.0.1';
    targetMode = 'localhost';
  } else if (modeChoice === '3') {
    targetHost = netIp;
    targetMode = 'network';
  } else if (modeChoice === '4') {
    targetMode = 'custom';
    const customHost = (await ask('Enter custom Host/IP (e.g. 192.168.1.100): ')).trim();
    targetHost = customHost || '0.0.0.0';
  } else if (!modeChoice) {
    targetHost = savedHost;
    targetMode = savedMode;
  }

  const portInput = (await ask(`Enter Server Port [default=${savedPort}]: `)).trim();
  const targetPort = portInput ? parseInt(portInput, 10) : savedPort;

  rl.close();

  // Save to database
  try {
    db.prepare(`
      UPDATE platform_settings SET
        serverHost = ?,
        serverPort = ?,
        serverHostingMode = ?
      WHERE id = 'default'
    `).run(targetHost, targetPort, targetMode);
  } catch (_) {}

  console.log('\n🚀 Starting FlareBase on \x1b[32m' + targetHost + ':' + targetPort + '\x1b[0m (' + targetMode + ' mode)...\n');

  // Spawn ts-node src/server.ts with environment variables
  const child = spawn('npx', ['ts-node', 'src/server.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: targetPort.toString(),
      HOST: targetHost
    }
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

runInteractivePrompt().catch((err) => {
  console.error('Interactive CLI error:', err);
  process.exit(1);
});
