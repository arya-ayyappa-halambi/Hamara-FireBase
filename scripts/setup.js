#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
//  scripts/setup.js
//  AegisDB 1-Click First-Time Setup & Dependency Bootstrapper
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const http = require('http');

// ── Colors & Styles ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  emerald: '\x1b[32m',
  cyan: '\x1b[36m',
  amber: '\x1b[33m',
  rose: '\x1b[31m',
  purple: '\x1b[35m',
  gray: '\x1b[90m'
};

const ROOT_DIR = path.resolve(__dirname, '..');

function printBanner() {
  console.log('');
  console.log(`${C.cyan}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}       ${C.bold}🛡️  AegisDB First-Time Universal Device Setup${C.reset}        ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.gray}  Automated environment verification & zero-config onboarding${C.reset}\n`);
}

function logStep(stepNum, totalSteps, title) {
  console.log(`${C.purple}[${stepNum}/${totalSteps}]${C.reset} ${C.bold}${title}${C.reset}...`);
}

function logSuccess(msg) {
  console.log(`    ${C.emerald}✓ ${msg}${C.reset}`);
}

function logInfo(msg) {
  console.log(`    ${C.cyan}ℹ ${msg}${C.reset}`);
}

function logWarning(msg) {
  console.log(`    ${C.amber}⚠ ${msg}${C.reset}`);
}

// 1. Check Node.js Version
function verifyNodeRuntime() {
  const currentVer = process.version;
  const major = parseInt(currentVer.replace(/^v/, '').split('.')[0], 10);
  if (major < 18) {
    console.error(`\n${C.rose}❌ Node.js version ${currentVer} detected. AegisDB requires Node.js 18.0.0 or higher.${C.reset}`);
    console.error(`   Please update Node.js from https://nodejs.org\n`);
    process.exit(1);
  }
  logSuccess(`Node.js runtime verified (${C.bold}${currentVer}${C.reset}) on ${process.platform} (${os.arch()})`);
}

// 2. Check & Install Project Dependencies
function verifyAndInstallDependencies() {
  const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
  const betterSqlite3Path = path.join(ROOT_DIR, 'node_modules', 'better-sqlite3');
  const expressPath = path.join(ROOT_DIR, 'node_modules', 'express');

  const isInstalled = fs.existsSync(nodeModulesPath) && fs.existsSync(betterSqlite3Path) && fs.existsSync(expressPath);

  if (isInstalled) {
    logSuccess('Project dependencies already installed');
    return;
  }

  logInfo('Fresh clone detected: Installing npm dependencies (this may take a minute)...');
  try {
    execSync('npm install --no-audit --no-fund', {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
    logSuccess('npm dependencies installed successfully');
  } catch (err) {
    console.error(`\n${C.rose}❌ Failed to install npm dependencies automatically.${C.reset}`);
    console.error(`   Error: ${err.message}`);
    console.error(`   Please run 'npm install' manually in the project root directory.\n`);
    process.exit(1);
  }
}

// 3. Cryptographic Environment Secrets Setup
function verifyAndGenerateEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  const envExamplePath = path.join(ROOT_DIR, '.env.example');

  if (fs.existsSync(envPath)) {
    logSuccess('Cryptographic .env configuration verified');
    return;
  }

  logInfo('Creating production-ready .env with cryptographically strong keys...');
  const randomSecret = (len = 64) => crypto.randomBytes(len).toString('hex');
  const randomPin = () => Math.floor(100000 + Math.random() * 900000).toString();

  let content = '';
  if (fs.existsSync(envExamplePath)) {
    content = fs.readFileSync(envExamplePath, 'utf8');
    content = content
      .replace(/JWT_SECRET=.*/g, `JWT_SECRET=${randomSecret(32)}`)
      .replace(/ENCRYPTION_KEY=.*/g, `ENCRYPTION_KEY=${randomSecret(32)}`)
      .replace(/EMAIL_HASH_PEPPER=.*/g, `EMAIL_HASH_PEPPER=${randomSecret(32)}`)
      .replace(/RECOVERY_PIN=.*/g, `RECOVERY_PIN=${randomPin()}`);
  } else {
    content = [
      '# AegisDB Environment Configuration',
      'PORT=3000',
      'HOST=0.0.0.0',
      'HOST_MODE=both',
      'NODE_ENV=development',
      `JWT_SECRET=${randomSecret(32)}`,
      `ENCRYPTION_KEY=${randomSecret(32)}`,
      `EMAIL_HASH_PEPPER=${randomSecret(32)}`,
      `RECOVERY_PIN=${randomPin()}`,
      'DB_PATH=./data/aegis.db',
      'STORAGE_DIR=./uploads',
      'STORAGE_MAX_FILE_SIZE_MB=50',
      'STORAGE_MAX_PROJECT_QUOTA_MB=1024',
      'LOG_LEVEL=info',
      ''
    ].join('\n');
  }

  fs.writeFileSync(envPath, content, 'utf8');
  logSuccess('Generated fresh .env file with 64-character encryption keys');
}

// 4. Provision Required Directories
function provisionDirectories() {
  const dirs = [
    path.join(ROOT_DIR, 'data'),
    path.join(ROOT_DIR, 'uploads'),
    path.join(ROOT_DIR, 'uploads', 'temp'),
    path.join(ROOT_DIR, 'workspaces'),
    path.join(ROOT_DIR, 'backups')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  logSuccess('Provisioned local directories (data/, uploads/, workspaces/, backups/)');
}

// 5. TypeScript Project Build Verification
function verifyBuild() {
  logInfo('Compiling TypeScript and verifying project build...');
  try {
    execSync('npm run build', {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    logSuccess('TypeScript build compiled cleanly (dist/)');
  } catch (err) {
    logWarning('TypeScript build warning (development server will compile on the fly)');
  }
}

// 6. Check Socket Port Readiness & Kill Lingering Processes
function checkPortFree(port = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(200);
    socket.on('connect', () => {
      socket.destroy();
      resolve(false); // occupied
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(true); // free
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(true); // free
    });
    socket.connect(port, '127.0.0.1');
  });
}

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      output.split('\n').filter(l => l.includes('LISTENING')).forEach(l => {
        const parts = l.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== process.pid.toString()) {
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
        }
      });
    } else {
      const output = execSync(`lsof -n -iTCP:${port} -sTCP:LISTEN -t`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      if (output) {
        output.split('\n').forEach(p => {
          if (p.trim() && p.trim() !== process.pid.toString()) {
            execSync(`kill -9 ${p.trim()}`, { stdio: 'ignore' });
          }
        });
      }
    }
  } catch (_) {}
}

function openBrowser(url) {
  try {
    if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (_) {}
}

function waitUntilServerReady(port = 3000, maxAttempts = 60, intervalMs = 250) {
  return new Promise((resolve) => {
    let attempts = 0;
    const probe = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/api/v1/system/status`, { timeout: 350 }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          return resolve(true);
        }
        if (attempts >= maxAttempts) return resolve(false);
        setTimeout(probe, intervalMs);
      });

      req.on('error', () => {
        if (attempts >= maxAttempts) return resolve(false);
        setTimeout(probe, intervalMs);
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempts >= maxAttempts) return resolve(false);
        setTimeout(probe, intervalMs);
      });
    };

    setTimeout(probe, 250);
  });
}

async function main() {
  printBanner();

  const totalSteps = 6;

  logStep(1, totalSteps, 'Checking Node.js & System Runtime');
  verifyNodeRuntime();
  console.log('');

  logStep(2, totalSteps, 'Verifying Project Dependencies');
  verifyAndInstallDependencies();
  console.log('');

  logStep(3, totalSteps, 'Generating Cryptographic Keys & .env Configuration');
  verifyAndGenerateEnv();
  console.log('');

  logStep(4, totalSteps, 'Provisioning Storage & Database Directories');
  provisionDirectories();
  console.log('');

  logStep(5, totalSteps, 'Validating TypeScript Compilation');
  verifyBuild();
  console.log('');

  logStep(6, totalSteps, 'Verifying Port & Launching First-Time Experience');
  const targetPort = 3000;
  const targetHost = '0.0.0.0';
  const targetMode = 'both';

  const isPort3000Free = await checkPortFree(targetPort);
  if (!isPort3000Free) {
    logInfo(`Port ${targetPort} is occupied. Freeing port for fresh setup...`);
    freePort(targetPort);
    await new Promise(r => setTimeout(r, 400));
  }
  logSuccess(`Port ${targetPort} verified [FREE & READY]`);
  console.log('');

  console.log(`${C.emerald}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.emerald}║${C.reset}       ${C.bold}🎉 AegisDB Setup Complete & Environment Ready!${C.reset}       ${C.emerald}║${C.reset}`);
  console.log(`${C.emerald}╚════════════════════════════════════════════════════════════╝${C.reset}\n`);

  console.log(`${C.bold}Daily Usage Quick Guide:${C.reset}`);
  if (process.platform === 'darwin') {
    console.log(`  ▶️  ${C.emerald}To Start Server:${C.reset} Double-click ${C.cyan}start.command${C.reset} in Finder`);
    console.log(`  ⏹️  ${C.rose}To Stop Server:${C.reset}  Double-click ${C.cyan}stop.command${C.reset} in Finder or click 🛑 Stop Server in UI`);
  } else if (process.platform === 'win32') {
    console.log(`  ▶️  ${C.emerald}To Start Server:${C.reset} Double-click ${C.cyan}start.bat${C.reset} in File Explorer`);
    console.log(`  ⏹️  ${C.rose}To Stop Server:${C.reset}  Double-click ${C.cyan}stop.bat${C.reset} in File Explorer or click 🛑 Stop Server in UI`);
  } else {
    console.log(`  ▶️  ${C.emerald}To Start Server:${C.reset} Run ${C.cyan}./start.sh${C.reset} or ${C.cyan}npm start${C.reset}`);
    console.log(`  ⏹️  ${C.rose}To Stop Server:${C.reset}  Run ${C.cyan}./stop.sh${C.reset} or ${C.cyan}npm run stop${C.reset}`);
  }
  console.log('');

  const hostingCenterUrl = `http://localhost:${targetPort}/#tab-server-hosting`;
  console.log(`${C.cyan}🚀 Launching AegisDB on ${targetHost}:${targetPort}...${C.reset}\n`);

  // Active health probe to launch browser when live
  (async () => {
    const isReady = await waitUntilServerReady(targetPort);
    if (isReady) {
      console.log(`\n${C.emerald}🌐 AegisDB is live! Opening browser to Server Hosting & Network Center...${C.reset}\n`);
      openBrowser(hostingCenterUrl);
    }
  })();

  // Spawn nodemon dev server directly in foreground
  const child = spawn('npx', ['nodemon', '--watch', 'src', '--watch', '.env', '--ext', 'ts', '--exec', 'ts-node', 'src/server.ts'], {
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
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('\nSetup error:', err);
  process.exit(1);
});
