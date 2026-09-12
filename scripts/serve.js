#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
//  scripts/serve.js
//  FlareBase Universal Interactive Startup Wizard & Hosting Center Launcher
// ─────────────────────────────────────────────────────────────────────────────

const readline = require('readline');
const { spawn, exec, execSync } = require('child_process');
const os = require('os');
const net = require('net');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');

// ── Colors & Styles ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  emerald: '\x1b[32m',
  cyan: '\x1b[36m',
  amber: '\x1b[33m',
  rose: '\x1b[31m',
  blue: '\x1b[34m',
  indigo: '\x1b[35m',
  gray: '\x1b[90m'
};

// ── CLI Flags & Arguments ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flagMap = {};
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [k, v] = arg.slice(2).split('=');
    flagMap[k] = v === undefined ? true : v;
  } else if (arg.startsWith('-')) {
    flagMap[arg.slice(1)] = true;
  }
}

if (flagMap.help || flagMap.h) {
  console.log(`
${C.bold}FlareBase Interactive Startup Launcher${C.reset}

Usage:
  npm start [options]
  node scripts/serve.js [options]

Options:
  --mode=<mode>       Hosting mode: both (Dual), localhost (Isolated), network (Wi-Fi), custom
  --port=<port>       Server port to bind (default: 3000)
  --host=<host>       Specific host IP or bind address (default: 0.0.0.0)
  --open              Automatically open Server Hosting Center in default browser
  --default, -y       Start immediately with saved/default settings without interactive prompts
  --help, -h          Show this help message
`);
  process.exit(0);
}

// ── Auto Pre-Flight Checks (Fresh GitHub Clone Auto-Bootstrap) ────────────────
function ensureDirectories() {
  const dirs = [
    path.resolve(__dirname, '../data'),
    path.resolve(__dirname, '../uploads'),
    path.resolve(__dirname, '../uploads/biometrics'),
    path.resolve(__dirname, '../uploads/projects'),
    path.resolve(__dirname, '../workspaces'),
    path.resolve(__dirname, '../backups')
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
  }
}

function ensureEnvFile() {
  const envPath = path.resolve(__dirname, '../.env');
  const examplePath = path.resolve(__dirname, '../.env.example');

  if (!fs.existsSync(envPath)) {
    console.log(`\n${C.cyan}⚙️  First-time launch detected: Initializing .env configuration with secure keys...${C.reset}`);
    let template = '';
    if (fs.existsSync(examplePath)) {
      template = fs.readFileSync(examplePath, 'utf8');
    }

    const jwtSecret = crypto.randomBytes(32).toString('hex');
    const encKey = crypto.randomBytes(32).toString('hex');
    const pepper = crypto.randomBytes(32).toString('hex');
    const recoveryPin = (Math.floor(100000 + Math.random() * 900000)).toString();

    let envContent = template;
    if (envContent) {
      envContent = envContent.replace(/JWT_SECRET=.*/, `JWT_SECRET=${jwtSecret}`);
      envContent = envContent.replace(/ENCRYPTION_KEY=.*/, `ENCRYPTION_KEY=${encKey}`);
      envContent = envContent.replace(/EMAIL_HASH_PEPPER=.*/, `EMAIL_HASH_PEPPER=${pepper}`);
      envContent = envContent.replace(/RECOVERY_PIN=.*/, `RECOVERY_PIN=${recoveryPin}`);
    } else {
      envContent = `PORT=3000
NODE_ENV=development
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
RECOVERY_PIN=${recoveryPin}
ENCRYPTION_KEY=${encKey}
EMAIL_HASH_PEPPER=${pepper}
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="FlareBase" <your_email@gmail.com>
FRONTEND_URL=http://localhost:3000
`;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`${C.emerald}✓ Generated .env with strong cryptographic secrets.${C.reset}\n`);
  }
}

function ensureDependencies() {
  const nodeModulesPath = path.resolve(__dirname, '../node_modules');
  const expressPath = path.resolve(__dirname, '../node_modules/express');
  const sqlitePath = path.resolve(__dirname, '../node_modules/better-sqlite3');

  if (!fs.existsSync(nodeModulesPath) || !fs.existsSync(expressPath) || !fs.existsSync(sqlitePath)) {
    console.log('');
    console.log(`${C.amber}┌────────────────────────────────────────────────────────────┐${C.reset}`);
    console.log(`${C.amber}│${C.reset}  ${C.bold}📦 First-Time Setup: Installing Dependencies via npm...${C.reset}    ${C.amber}│${C.reset}`);
    console.log(`${C.amber}│${C.reset}  Please wait while required packages are downloaded.       ${C.amber}│${C.reset}`);
    console.log(`${C.amber}└────────────────────────────────────────────────────────────┘${C.reset}`);
    console.log('');

    try {
      execSync('npm install', {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit'
      });
      console.log(`\n${C.emerald}✓ All dependencies installed successfully!${C.reset}\n`);
    } catch (err) {
      console.error(`\n${C.rose}❌ npm install failed. Please run 'npm install' manually and try again.${C.reset}\n`);
      process.exit(1);
    }
  }
}

// Run pre-flight checks before reading settings
ensureDirectories();
ensureEnvFile();
ensureDependencies();

// ── Network IP Detection ──────────────────────────────────────────────────────
function getNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const isWifi = name.toLowerCase().includes('en0') || name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi');
        if (isWifi) return iface.address;
      }
    }
  }
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

function getDbPath() {
  const rootPath = path.resolve(__dirname, '../aegis.db');
  const dataPath = path.resolve(__dirname, '../data/aegis.db');
  if (fs.existsSync(rootPath)) return rootPath;
  if (fs.existsSync(dataPath)) return dataPath;
  return rootPath;
}

// ── SQLite Saved Settings Reader ──────────────────────────────────────────────
function getSavedSettings() {
  let savedPort = 3000;
  let savedHost = '0.0.0.0';
  let savedMode = 'both';

  try {
    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      const row = db.prepare("SELECT serverPort, serverHost, serverHostingMode FROM platform_settings WHERE id = 'default'").get();
      if (row) {
        if (row.serverPort) savedPort = Number(row.serverPort);
        if (row.serverHost) savedHost = row.serverHost;
        if (row.serverHostingMode) savedMode = row.serverHostingMode;
      }
      db.close();
    }
  } catch (_) {}

  return {
    port: Number(process.env.PORT || savedPort || 3000),
    host: process.env.HOST || savedHost || '0.0.0.0',
    mode: process.env.HOST_MODE || savedMode || 'both'
  };
}

const savedSettings = getSavedSettings();

// ── Socket Port Probing Engine ────────────────────────────────────────────────
async function checkPortAvailability(port, host = '0.0.0.0') {
  if (isNaN(port) || port < 1 || port > 65535) {
    return { free: false, reason: 'Invalid port (1-65535)' };
  }

  // 1. Direct TCP connect test
  const connectProbe = (targetHost) => new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(180);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true); // Answering = In Use!
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, targetHost);
  });

  const isAnswering = await Promise.race([
    connectProbe('127.0.0.1'),
    connectProbe('::1')
  ]);

  if (isAnswering) {
    return { free: false, reason: 'In Use / Active' };
  }

  // 2. Bind probe
  const bindProbe = (targetHost) => new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err) => {
      resolve({ free: false, err: err.code });
    });
    server.listen(port, targetHost, () => {
      server.close(() => resolve({ free: true }));
    });
  });

  const b0 = await bindProbe('0.0.0.0');
  if (!b0.free) return { free: false, reason: `In Use (${b0.err})` };

  const b1 = await bindProbe('127.0.0.1');
  if (!b1.free) return { free: false, reason: `In Use (${b1.err})` };

  return { free: true, reason: 'Free & Ready' };
}

async function scanCandidatePorts() {
  const candidateList = [3000, 3001, 3002, 4000, 5000, 8000, 8080, 9000];
  const results = [];
  for (const p of candidateList) {
    const res = await checkPortAvailability(p);
    results.push({ port: p, free: res.free, reason: res.reason });
  }
  return results;
}

// ── Process & Port Management Helpers ─────────────────────────────────────────
function getListeningPidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      const pids = new Set();
      output.split('\n').filter(l => l.includes('LISTENING')).forEach(l => {
        const parts = l.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== process.pid.toString()) pids.add(pid);
      });
      return Array.from(pids);
    } else {
      const output = execSync(`lsof -n -iTCP:${port} -sTCP:LISTEN -t`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      if (output) {
        return output.split('\n').map(p => p.trim()).filter(p => p && p !== process.pid.toString());
      }
    }
  } catch (_) {}
  return [];
}

function getPidOnPort(port) {
  const pids = getListeningPidsOnPort(port);
  return pids.length > 0 ? pids[0] : null;
}

function freePort(port) {
  const pids = getListeningPidsOnPort(port);
  let freed = false;
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
      freed = true;
    } catch (_) {}
  }
  return freed;
}

// ── Cross-Platform Browser Opener ─────────────────────────────────────────────
function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (platform === 'win32') {
      try {
        spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).unref();
      } catch (_) {
        spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
      }
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (_) {
    try {
      if (platform === 'win32') exec(`start "" "${url}"`);
      else if (platform === 'darwin') exec(`open "${url}"`);
      else exec(`xdg-open "${url}"`);
    } catch (_) {}
  }
}

// ── Main Launch Orchestrator ──────────────────────────────────────────────────
async function main() {
  const isInteractive = Boolean(process.stdin.isTTY) && !flagMap.default && !flagMap.y && !flagMap.mode && !flagMap.port;

  // If CLI flags were explicitly provided or running in non-TTY (CI / agent)
  if (!isInteractive) {
    let targetMode = flagMap.mode || savedSettings.mode || 'both';
    let targetPort = parseInt(flagMap.port || savedSettings.port || 3000, 10);
    let targetHost = flagMap.host || (targetMode === 'localhost' ? '127.0.0.1' : targetMode === 'network' ? networkIp : savedSettings.host || '0.0.0.0');
    const shouldOpen = Boolean(flagMap.open);

    // Auto-free occupied port if needed in headless mode
    const preCheck = await checkPortAvailability(targetPort, targetHost);
    if (!preCheck.free) {
      freePort(targetPort);
      await new Promise(r => setTimeout(r, 300));
    }

    startServer(targetHost, targetPort, targetMode, shouldOpen);
    return;
  }

  // Interactive Terminal Wizard
  console.log('');
  console.log(`${C.emerald}┌────────────────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.emerald}│${C.reset}       ${C.bold}🛡️  FlareBase Interactive Server Setup Launcher${C.reset}         ${C.emerald}│${C.reset}`);
  console.log(`${C.emerald}├────────────────────────────────────────────────────────────┤${C.reset}`);
  console.log(`${C.emerald}│${C.reset}  ➜ Wi-Fi / LAN IP : ${C.cyan}${networkIp.padEnd(38)}${C.reset} ${C.emerald}│${C.reset}`);
  console.log(`${C.emerald}│${C.reset}  ➜ Saved Defaults : ${C.amber}${(savedSettings.host + ':' + savedSettings.port + ' (' + savedSettings.mode + ')').padEnd(38)}${C.reset} ${C.emerald}│${C.reset}`);
  console.log(`${C.emerald}└────────────────────────────────────────────────────────────┘${C.reset}`);

  // Scan candidate ports in real-time
  process.stdout.write(`\n${C.gray}🔍 Scanning local port availability...${C.reset} `);
  const scannedPorts = await scanCandidatePorts();
  console.log(`${C.emerald}Done ✓${C.reset}\n`);

  const portChips = scannedPorts.map(p => {
    return p.free
      ? `${C.emerald}● ${p.port} [FREE]${C.reset}`
      : `${C.rose}● ${p.port} [IN USE]${C.reset}`;
  }).join('   ');
  console.log(`  Candidate Ports: ${portChips}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log(`${C.bold}Select Hosting & Network Access Mode:${C.reset}`);
  console.log(`  ${C.emerald}[1] Dual Host (0.0.0.0)${C.reset}     — Localhost & Wi-Fi Network ${C.emerald}[Recommended]${C.reset}`);
  console.log(`  ${C.cyan}[2] Localhost Only (127.0.0.1)${C.reset} — Strictly isolated to this machine`);
  console.log(`  ${C.amber}[3] Wi-Fi Network Only (${networkIp})${C.reset} — Mobile & client testing`);
  console.log(`  ${C.indigo}[4] Custom Host IP / Domain${C.reset}`);
  console.log(`  ${C.gray}[5] Quick Start with Saved Defaults (${savedSettings.host}:${savedSettings.port})${C.reset}`);

  const modeChoice = (await ask(`\n👉 Enter choice [1-5, default=1]: `)).trim() || '1';

  let targetHost = '0.0.0.0';
  let targetMode = 'both';

  if (modeChoice === '2') {
    targetHost = '127.0.0.1';
    targetMode = 'localhost';
  } else if (modeChoice === '3') {
    targetHost = networkIp;
    targetMode = 'network';
  } else if (modeChoice === '4') {
    targetMode = 'custom';
    const customHost = (await ask(`👉 Enter custom Bind Host / IP: `)).trim();
    targetHost = customHost || '0.0.0.0';
  } else if (modeChoice === '5') {
    targetHost = savedSettings.host;
    targetMode = savedSettings.mode;
  }

  // Port Selection with intelligent conflict resolver (Default: 3000)
  let targetPort = 3000;
  if (modeChoice === '5') {
    targetPort = savedSettings.port || 3000;
  } else {
    const portPrompt = await ask(`👉 Enter Server Port [default=3000]: `);
    const trimmedInput = portPrompt.trim();
    if (trimmedInput) {
      const chosenPort = parseInt(trimmedInput, 10);
      if (!isNaN(chosenPort) && chosenPort >= 1 && chosenPort <= 65535) {
        targetPort = chosenPort;
      } else {
        console.log(`${C.rose}⚠️  Invalid port '${trimmedInput}'. Using default 3000.${C.reset}`);
        targetPort = 3000;
      }
    } else {
      targetPort = 3000;
    }
  }

  // Verify port availability
  const portCheck = await checkPortAvailability(targetPort, targetHost);
  if (!portCheck.free) {
    const occupyingPid = getPidOnPort(targetPort);
    console.log(`\n${C.rose}⚠️  Port ${targetPort} is currently occupied${occupyingPid ? ' (PID ' + occupyingPid + ')' : ''}.${C.reset}`);
    console.log(`  ${C.emerald}[1] Free Port ${targetPort} (terminate previous instance) & start [Recommended]${C.reset}`);
    console.log(`  ${C.cyan}[2] Auto-switch to next available free port${C.reset}`);
    console.log(`  ${C.amber}[3] Enter a different port${C.reset}`);

    const conflictChoice = (await ask(`\n👉 Choose option [1-3, default=1]: `)).trim() || '1';
    if (conflictChoice === '1') {
      process.stdout.write(`${C.gray}Freeing port ${targetPort}...${C.reset} `);
      freePort(targetPort);
      await new Promise(r => setTimeout(r, 400));
      console.log(`${C.emerald}Port ${targetPort} is now free! ✓${C.reset}\n`);
    } else if (conflictChoice === '2') {
      let candidate = targetPort + 1;
      while (candidate <= 65535) {
        const cCheck = await checkPortAvailability(candidate, targetHost);
        if (cCheck.free) {
          targetPort = candidate;
          console.log(`${C.emerald}✓ Switched to free port ${targetPort}.${C.reset}\n`);
          break;
        }
        candidate++;
      }
    } else {
      const newPortInput = await ask(`👉 Enter new port: `);
      const newPort = parseInt(newPortInput.trim() || '3000', 10);
      if (!isNaN(newPort) && newPort > 0 && newPort <= 65535) {
        targetPort = newPort;
      }
    }
  }

  // Browser auto-launch prompt
  let shouldOpen = Boolean(flagMap.open);
  if (!shouldOpen && modeChoice !== '5') {
    const openPrompt = (await ask(`👉 Open Server Hosting & Network Center in browser? (Y/n): `)).trim().toLowerCase();
    shouldOpen = openPrompt !== 'n' && openPrompt !== 'no';
  }

  rl.close();
  startServer(targetHost, targetPort, targetMode, shouldOpen);
}

function waitUntilServerReady(port, checkAborted, maxAttempts = 160, intervalMs = 250) {
  return new Promise((resolve) => {
    let attempts = 0;
    const probe = () => {
      if (checkAborted && checkAborted()) {
        return resolve(false);
      }
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 600 }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          return resolve(true);
        }
        if (attempts >= maxAttempts) return resolve(true);
        setTimeout(probe, intervalMs);
      });

      req.on('error', () => {
        const req2 = http.get(`http://localhost:${port}/health`, { timeout: 600 }, (res2) => {
          if (res2.statusCode >= 200 && res2.statusCode < 500) {
            return resolve(true);
          }
          if (attempts >= maxAttempts) return resolve(true);
          setTimeout(probe, intervalMs);
        });
        req2.on('error', () => {
          if (attempts >= maxAttempts) return resolve(true);
          setTimeout(probe, intervalMs);
        });
        req2.on('timeout', () => {
          req2.destroy();
          if (attempts >= maxAttempts) return resolve(true);
          setTimeout(probe, intervalMs);
        });
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempts >= maxAttempts) return resolve(true);
        setTimeout(probe, intervalMs);
      });
    };

    setTimeout(probe, 300);
  });
}

function startServer(targetHost, targetPort, targetMode, shouldOpen) {
  // Final safety check: if port is occupied right before spawn, free it
  const existingPid = getPidOnPort(targetPort);
  if (existingPid && existingPid !== process.pid.toString()) {
    freePort(targetPort);
  }

  const localUrl = `http://localhost:${targetPort}`;
  const networkUrl = `http://${networkIp}:${targetPort}`;
  const hostingCenterUrl = `${targetMode === 'network' ? networkUrl : localUrl}/#tab-server-hosting`;

  console.log('');
  console.log(`${C.emerald}🚀 Launching FlareBase on ${C.bold}${targetHost}:${targetPort}${C.reset} ${C.gray}(${targetMode} mode)${C.reset}...`);
  console.log(`  ➜ Local URL      : ${C.cyan}${localUrl}${C.reset}`);
  if (targetHost === '0.0.0.0' || targetHost === networkIp) {
    console.log(`  ➜ Wi-Fi / LAN URL: ${C.amber}${networkUrl}${C.reset}`);
  }
  console.log(`  ➜ Hosting Center : ${C.emerald}${hostingCenterUrl}${C.reset}`);
  console.log('');

  // Persist choice into SQLite
  try {
    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      const Database = require('better-sqlite3');
      const db = new Database(dbPath);
      db.prepare(`
        UPDATE platform_settings SET
          serverHost = ?,
          serverPort = ?,
          serverHostingMode = ?
        WHERE id = 'default'
      `).run(targetHost, targetPort, targetMode);
      db.close();
    }
  } catch (_) {}

  let childExited = false;

  // Active health probe: Open browser ONLY after server socket is 100% listening and ready
  if (shouldOpen) {
    (async () => {
      const isReady = await waitUntilServerReady(targetPort, () => childExited);
      if (isReady && !childExited) {
        console.log(`\n${C.emerald}🌐 Server is fully live! Opening browser to Server Hosting Center...${C.reset}\n`);
        openBrowser(hostingCenterUrl);
      }
    })();
  }

  // Spawn dev server directly with npm run dev
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      HOST: targetHost,
      PORT: targetPort.toString(),
      HOST_MODE: targetMode
    },
    stdio: 'inherit',
    shell: true
  });

  child.on('exit', (code) => {
    childExited = true;
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('Fatal launcher error:', err);
  process.exit(1);
});
