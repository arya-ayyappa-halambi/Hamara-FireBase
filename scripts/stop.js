#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
//  scripts/stop.js
//  AegisDB 1-Click Cross-Platform Server Stop & Port Release Utility
// ─────────────────────────────────────────────────────────────────────────────

const { execSync } = require('child_process');
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');

// ── Colors & Styles ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  emerald: '\x1b[32m',
  cyan: '\x1b[36m',
  amber: '\x1b[33m',
  rose: '\x1b[31m',
  gray: '\x1b[90m'
};

const candidatePorts = [3000, 3001, 3002, 4000, 5000, 8000, 8080, 9000];

// Parse optional --port argument
const portArgIndex = process.argv.findIndex(a => a === '--port' || a.startsWith('--port='));
if (portArgIndex !== -1) {
  const customPort = process.argv[portArgIndex].includes('=')
    ? parseInt(process.argv[portArgIndex].split('=')[1], 10)
    : parseInt(process.argv[portArgIndex + 1], 10);
  if (!isNaN(customPort) && !candidatePorts.includes(customPort)) {
    candidatePorts.unshift(customPort);
  }
}

let windowsNetstatCache = null;

function getListeningPidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const pids = new Set();
      // Fast single-pass netstat cache across candidate ports
      if (!windowsNetstatCache) {
        try {
          windowsNetstatCache = execSync('netstat -ano', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        } catch (_) {
          windowsNetstatCache = '';
        }
      }

      if (windowsNetstatCache) {
        windowsNetstatCache.split(/\r?\n/).forEach(l => {
          if (l.includes('LISTENING') && (l.includes(`:${port} `) || l.includes(`:${port}\t`))) {
            const parts = l.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0' && pid !== process.pid.toString()) pids.add(pid);
          }
        });
      }

      // Method 2: PowerShell Get-NetTCPConnection fallback if netstat didn't catch it
      if (pids.size === 0) {
        try {
          const psOut = execSync(
            `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`,
            { stdio: ['pipe', 'pipe', 'ignore'] }
          ).toString().trim();
          if (psOut) {
            psOut.split(/\r?\n/).forEach(p => {
              const trimmed = p.trim();
              if (trimmed && trimmed !== '0' && trimmed !== process.pid.toString()) {
                pids.add(trimmed);
              }
            });
          }
        } catch (_) {}
      }

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

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    }
    return true;
  } catch (_) {}
  return false;
}

function killLingeringNodeProcesses() {
  if (process.platform === 'win32') {
    // Terminate any node / nodemon / ts-node processes executing server.ts, serve.js or inside project folder
    try {
      const rootEscaped = path.resolve(__dirname, '..').replace(/\\/g, '\\\\');
      execSync(
        `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe') -and ($_.CommandLine -match 'server.ts' -or $_.CommandLine -match 'serve.js' -or $_.CommandLine -match 'nodemon' -or $_.CommandLine -match 'ts-node' -or $_.CommandLine -match '${rootEscaped}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: ['ignore', 'ignore', 'ignore'] }
      );
    } catch (_) {}
    try {
      execSync('taskkill /F /FI "WINDOWTITLE eq AegisDB Server Launcher*"', { stdio: 'ignore' });
    } catch (_) {}
  } else {
    try {
      execSync('pkill -9 -f "nodemon.*src/server.ts|ts-node.*src/server.ts|node.*scripts/serve.js"', { stdio: 'ignore' });
    } catch (_) {}
  }
}

async function verifyPortFree(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(200);
    socket.on('connect', () => {
      socket.destroy();
      resolve(false); // Answering = Still occupied
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(true); // Free
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(true); // Free
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function main() {
  console.log('');
  console.log(`${C.rose}┌────────────────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.rose}│${C.reset}         ${C.bold}🛑 AegisDB Server Shutdown & Port Cleanup${C.reset}          ${C.rose}│${C.reset}`);
  console.log(`${C.rose}└────────────────────────────────────────────────────────────┘${C.reset}`);
  console.log('');

  process.stdout.write(`${C.gray}🔍 Scanning for active server processes...${C.reset} `);

  const killedPorts = [];
  const killedPids = new Set();

  for (const port of candidatePorts) {
    const pids = getListeningPidsOnPort(port);
    for (const pid of pids) {
      killedPids.add(pid);
      killPid(pid);
      if (!killedPorts.includes(port)) killedPorts.push(port);
    }
  }

  // Also terminate any nodemon / ts-node supervisor wrappers
  killLingeringNodeProcesses();

  // Wait 400ms for OS sockets to fully release
  await new Promise(r => setTimeout(r, 400));
  console.log(`${C.emerald}Done ✓${C.reset}\n`);

  if (killedPorts.length > 0 || killedPids.size > 0) {
    console.log(`${C.emerald}✓ Terminated active server process(es):${C.reset} ${Array.from(killedPids).join(', ') || 'OK'}`);
    console.log(`${C.emerald}✓ Released active port(s):${C.reset} ${killedPorts.join(', ')}`);
  } else {
    console.log(`${C.cyan}ℹ No active AegisDB server processes were found running.${C.reset}`);
  }

  console.log('');
  console.log(`${C.bold}Status of Candidate Ports:${C.reset}`);
  for (const port of candidatePorts) {
    const isFree = await verifyPortFree(port);
    if (isFree) {
      console.log(`  ${C.emerald}● Port ${port.toString().padEnd(5)} : [FREE & READY]${C.reset}`);
    } else {
      console.log(`  ${C.rose}● Port ${port.toString().padEnd(5)} : [STILL OCCUPIED]${C.reset}`);
    }
  }

  console.log('');
  console.log(`${C.emerald}✅ AegisDB server successfully stopped. All ports are freed!${C.reset}\n`);

  // On macOS, close any Terminal windows running the AegisDB start.command or serve.js
  if (process.platform === 'darwin') {
    try {
      execSync(`osascript -e 'tell application "Terminal"
        repeat with w in windows
          if (name of w contains "start.command") or (name of w contains "serve.js") or (name of w contains "AegisDB") then
            close w
          end if
        end repeat
      end tell'`, { stdio: 'ignore' });
    } catch (_) {}
  } else if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /FI "WINDOWTITLE eq AegisDB Server Launcher*"', { stdio: 'ignore' });
    } catch (_) {}
  }

  // If invoked with --close-self, wait 1.5s then close stop window
  if (process.argv.includes('--close-self') && process.platform === 'darwin') {
    await new Promise(r => setTimeout(r, 1200));
    try {
      execSync(`osascript -e 'tell application "Terminal"
        repeat with w in windows
          if (name of w contains "stop.command") then
            close w
          end if
        end repeat
      end tell'`, { stdio: 'ignore' });
    } catch (_) {}
  }
}

main().catch((err) => {
  console.error('Stop utility error:', err);
  process.exit(1);
});
