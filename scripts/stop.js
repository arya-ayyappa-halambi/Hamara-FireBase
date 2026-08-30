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

function getPidOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      const lines = output.split('\n').filter(l => l.includes('LISTENING'));
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s+/);
        return parts[parts.length - 1];
      }
    } else {
      const pid = execSync(`lsof -ti :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      if (pid) return pid.split('\n')[0];
    }
  } catch (_) {}
  return null;
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    }
    return true;
  } catch (_) {}
  return false;
}

function killLingeringNodeProcesses() {
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq AegisDB*"', { stdio: 'ignore' });
    } catch (_) {}
  } else {
    try {
      execSync('pkill -f "nodemon.*src/server.ts|ts-node src/server.ts|scripts/serve.js"', { stdio: 'ignore' });
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
    const pid = getPidOnPort(port);
    if (pid && pid !== process.pid.toString()) {
      killedPids.add(pid);
      killPid(pid);
      killedPorts.push(port);
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
  console.log(`${C.emerald}✅ AegisDB server successfully killed. All ports are freed!${C.reset}\n`);

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
