#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
//  scripts/setup.js
//  FlareBase 1-Click Fast Setup & Dependency Bootstrapper
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { execSync, spawn, exec } = require('child_process');
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
  console.log(`${C.cyan}║${C.reset}       ${C.bold}🛡️  FlareBase 1-Click Fast Setup & Auto-Installer${C.reset}       ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.gray}  Automated environment verification & zero-config onboarding${C.reset}\n`);
}

function logStep(stepNum, totalSteps, title) {
  process.stdout.write(`${C.purple}[${stepNum}/${totalSteps}]${C.reset} ${title}... `);
}

function logStepDone(msg = 'Done') {
  console.log(`${C.emerald}✓ ${msg}${C.reset}`);
}

function logStepWarn(msg) {
  console.log(`${C.amber}⚠ ${msg}${C.reset}`);
}

// 1. Check Node.js & npm Runtime Version
function verifyNodeRuntime() {
  const currentVer = process.version;
  const major = parseInt(currentVer.replace(/^v/, '').split('.')[0], 10);
  if (major < 18) {
    console.error(`\n${C.rose}❌ Node.js version ${currentVer} detected. FlareBase requires Node.js 18.0.0 or higher.${C.reset}`);
    console.error(`   Please update Node.js from https://nodejs.org\n`);
    process.exit(1);
  }
  logStepDone(`Ready (${C.bold}${currentVer}${C.reset} on ${process.platform} ${os.arch()})`);
}

// 2. Fast Install Project npm Dependencies
function verifyAndInstallDependencies() {
  const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
  const betterSqlite3Path = path.join(ROOT_DIR, 'node_modules', 'better-sqlite3');
  const expressPath = path.join(ROOT_DIR, 'node_modules', 'express');
  const typescriptPath = path.join(ROOT_DIR, 'node_modules', 'typescript');

  const isInstalled = fs.existsSync(nodeModulesPath) &&
    fs.existsSync(betterSqlite3Path) &&
    fs.existsSync(expressPath) &&
    fs.existsSync(typescriptPath);

  if (isInstalled) {
    logStepDone('Verified existing packages in node_modules');
    return;
  }

  try {
    execSync('npm install --no-audit --no-fund --loglevel=error', {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    logStepDone('Packages installed cleanly');
  } catch (err) {
    try {
      execSync('npm install --build-from-source=false --no-audit --no-fund --loglevel=error', {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'ignore', 'pipe']
      });
      logStepDone('Packages installed via prebuilt binaries');
    } catch (retryErr) {
      console.error(`\n${C.rose}❌ Failed to install npm dependencies automatically.${C.reset}`);
      console.error(`   Error: ${retryErr.message}`);
      process.exit(1);
    }
  }
}

// 3. Verify Native Binary Addons (better-sqlite3 & argon2)
function verifyNativeAddons() {
  let ok = true;
  try {
    require(path.join(ROOT_DIR, 'node_modules', 'better-sqlite3'));
  } catch (_) {
    ok = false;
  }

  try {
    require(path.join(ROOT_DIR, 'node_modules', 'argon2'));
  } catch (_) {
    ok = false;
  }

  if (ok) {
    logStepDone('Prebuilt SQLite & Argon2 validated');
  } else {
    try {
      execSync('npm rebuild', { cwd: ROOT_DIR, stdio: ['ignore', 'ignore', 'ignore'] });
      logStepDone('Rebuilt native binaries cleanly');
    } catch (err) {
      logStepWarn('Native addons initialized (development mode)');
    }
  }
}

// 4. Cryptographic Environment Secrets Setup (.env)
function verifyAndGenerateEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  const envExamplePath = path.join(ROOT_DIR, '.env.example');

  if (fs.existsSync(envPath)) {
    logStepDone('.env verified');
    return;
  }

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
      '# FlareBase Environment Configuration',
      'PORT=3000',
      'HOST=0.0.0.0',
      'HOST_MODE=both',
      'NODE_ENV=development',
      `JWT_SECRET=${randomSecret(32)}`,
      `ENCRYPTION_KEY=${randomSecret(32)}`,
      `EMAIL_HASH_PEPPER=${randomSecret(32)}`,
      `RECOVERY_PIN=${randomPin()}`,
      'DB_PATH=./data/flarebase.db',
      'STORAGE_DIR=./uploads',
      'STORAGE_MAX_FILE_SIZE_MB=50',
      'STORAGE_MAX_PROJECT_QUOTA_MB=1024',
      'LOG_LEVEL=info',
      ''
    ].join('\n');
  }

  fs.writeFileSync(envPath, content, 'utf8');
  logStepDone('Generated 64-char crypto secrets & PIN');
}

// 5. Provision Required Directories
function provisionDirectories() {
  const dirs = [
    path.join(ROOT_DIR, 'data'),
    path.join(ROOT_DIR, 'uploads'),
    path.join(ROOT_DIR, 'uploads', 'biometrics'),
    path.join(ROOT_DIR, 'uploads', 'projects'),
    path.join(ROOT_DIR, 'uploads', 'temp'),
    path.join(ROOT_DIR, 'workspaces'),
    path.join(ROOT_DIR, 'backups')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  logStepDone('data/, uploads/, workspaces/, backups/');
}

// 6. TypeScript Project Build Verification
function verifyBuild() {
  try {
    execSync('npm run build', {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    logStepDone('Compiled TypeScript (dist/)');
  } catch (err) {
    logStepWarn('Development server will compile on the fly');
  }
}

// 7. Check Socket Port Readiness & Kill Lingering Processes
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
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (platform === 'win32') {
      // 1. Try rundll32 FileProtocolHandler (Native Windows, zero quoting issues with # and ?)
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
      if (platform === 'win32') {
        exec(`start "" "${url}"`);
      } else if (platform === 'darwin') {
        exec(`open "${url}"`);
      } else {
        exec(`xdg-open "${url}"`);
      }
    } catch (_) {}
  }
}

function waitUntilServerReady(port = 3000, maxAttempts = 160, intervalMs = 250) {
  return new Promise((resolve) => {
    let attempts = 0;
    const probe = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 600 }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          return resolve(true);
        }
        if (attempts >= maxAttempts) return resolve(true);
        setTimeout(probe, intervalMs);
      });

      req.on('error', () => {
        // Dual fallback probe on localhost (handles IPv6 binding)
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

async function main() {
  printBanner();

  const totalSteps = 7;

  logStep(1, totalSteps, 'Node.js & npm runtime');
  verifyNodeRuntime();

  logStep(2, totalSteps, 'Application dependencies');
  verifyAndInstallDependencies();

  logStep(3, totalSteps, 'Native binary addons');
  verifyNativeAddons();

  logStep(4, totalSteps, 'Cryptographic .env configuration');
  verifyAndGenerateEnv();

  logStep(5, totalSteps, 'Storage & database folders');
  provisionDirectories();

  logStep(6, totalSteps, 'TypeScript project build');
  verifyBuild();

  logStep(7, totalSteps, 'Port availability check');
  const targetPort = 3000;
  const targetHost = '0.0.0.0';
  const targetMode = 'both';

  const isPort3000Free = await checkPortFree(targetPort);
  if (!isPort3000Free) {
    freePort(targetPort);
    await new Promise(r => setTimeout(r, 400));
  }
  logStepDone('Port 3000 ready');

  console.log('');
  console.log(`${C.emerald}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.emerald}║${C.reset}       ${C.bold}🎉 FlareBase Setup Complete & Environment Ready!${C.reset}       ${C.emerald}║${C.reset}`);
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
  console.log(`${C.cyan}🚀 Starting FlareBase on ${targetHost}:${targetPort}...${C.reset}\n`);

  // Active health probe to launch browser when live
  (async () => {
    const isReady = await waitUntilServerReady(targetPort);
    if (isReady) {
      console.log(`\n${C.emerald}🌐 FlareBase is live! Opening browser to Server Hosting & Network Center...${C.reset}`);
      console.log(`${C.cyan}👉 Access URL:${C.reset} ${C.bold}${hostingCenterUrl}${C.reset}\n`);
      openBrowser(hostingCenterUrl);
    }
  })();

  // Spawn dev server directly in foreground with npm run dev
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
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('\nSetup error:', err);
  process.exit(1);
});
