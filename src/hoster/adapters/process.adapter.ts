// ─────────────────────────────────────────────────────────────────────────────
//  src/hoster/adapters/process.adapter.ts
//  FlareBase — Local child-process runtime adapter.
//
//  Active when Docker is unavailable. Each deployment is a supervised
//  `child_process.spawn` inside its extracted workspace directory.
//
//  Features:
//    - Circular in-memory log buffer (last 500 lines per deployment)
//    - Graceful SIGTERM with 5-second SIGKILL fallback (via tree-kill)
//    - Process existence check via kill(pid, 0) signal
//    - PORT injected automatically into the child's environment
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'child_process';
import treeKill from 'tree-kill';
import { type Deployment, type RuntimeMode } from '../../types/hoster.types';
import { type RuntimeAdapter, type StartResult, type ContainerStatus } from './runtime.adapter';

// ── Circular log buffer ────────────────────────────────────────────────────────

class LogBuffer {
  private readonly lines: string[] = [];
  private readonly capacity: number;

  constructor(capacity = 500) {
    this.capacity = capacity;
  }

  push(line: string): void {
    if (this.lines.length >= this.capacity) this.lines.shift();
    this.lines.push(line);
  }

  tail(n: number): string {
    return this.lines.slice(-Math.max(1, n)).join('\n');
  }
}

// ── Process record ─────────────────────────────────────────────────────────────

interface ProcessRecord {
  pid: number;
  logBuffer: LogBuffer;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export class ProcessAdapter implements RuntimeAdapter {
  readonly mode: RuntimeMode = 'process';

  /** Live process records keyed by deployment.id */
  private readonly processes = new Map<string, ProcessRecord>();

  async isAvailable(): Promise<boolean> {
    return true; // Always available — no external dependencies
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(deployment: Deployment): Promise<StartResult> {
    const { metadata, workspaceDir, allocatedPort, id } = deployment;
    const command = metadata.startCommand || 'node index.js';

    // If a previous process for this deployment is still tracked, stop it first
    const existing = this.processes.get(id);
    if (existing) {
      await this.killPid(existing.pid);
      this.processes.delete(id);
    }

    const logBuffer = new LogBuffer();
    const stamp = () => new Date().toISOString();

    // Build child environment: host env (without secrets we'd rather not leak)
    // + mandatory PORT/HOST + user-supplied overrides.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      TMPDIR: process.env.TMPDIR,
      LANG: process.env.LANG,
      // Deployment specifics
      PORT: String(allocatedPort),
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
      // User-supplied vars always win
      ...metadata.envVars,
    };

    logBuffer.push(
      `[SYS] ${stamp()} ─────────────────────────────────────────────`,
    );
    logBuffer.push(`[SYS] ${stamp()} FlareBase ProcessAdapter starting deployment`);
    logBuffer.push(`[SYS] ${stamp()} Command : sh -c "${command}"`);
    logBuffer.push(`[SYS] ${stamp()} CWD     : ${workspaceDir}`);
    logBuffer.push(`[SYS] ${stamp()} Port    : ${allocatedPort}`);
    logBuffer.push(
      `[SYS] ${stamp()} ─────────────────────────────────────────────`,
    );

    const child = spawn('sh', ['-c', command], {
      cwd: workspaceDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    if (child.pid === undefined) {
      throw new Error(
        `Failed to spawn process for deployment "${id}" — no PID was assigned.`,
      );
    }

    const record: ProcessRecord = {
      pid: child.pid,
      logBuffer,
      exitCode: null,
      exitSignal: null,
    };

    // Pipe stdout/stderr into the circular buffer
    child.stdout?.on('data', (data: Buffer) => {
      data
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((line) => logBuffer.push(`[OUT] ${stamp()} ${line}`));
    });

    child.stderr?.on('data', (data: Buffer) => {
      data
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((line) => logBuffer.push(`[ERR] ${stamp()} ${line}`));
    });

    child.on('close', (code, signal) => {
      record.exitCode = code;
      record.exitSignal = signal;
      logBuffer.push(
        `[SYS] ${stamp()} Process closed — code=${code ?? 'null'}, signal=${signal ?? 'none'}`,
      );
    });

    child.on('error', (err) => {
      logBuffer.push(`[SYS] ${stamp()} Spawn error: ${err.message}`);
    });

    this.processes.set(id, record);
    return { pid: child.pid };
  }

  async stop(deployment: Deployment): Promise<void> {
    const record = this.processes.get(deployment.id);
    if (!record) return;

    record.logBuffer.push(
      `[SYS] ${new Date().toISOString()} Stop requested by FlareBase.`,
    );
    await this.killPid(record.pid);
  }

  async remove(deployment: Deployment): Promise<void> {
    await this.stop(deployment);
    this.processes.delete(deployment.id);
  }

  async getLogs(deployment: Deployment, lines: number): Promise<string> {
    const record = this.processes.get(deployment.id);
    if (!record) {
      return '(No logs — process was not started in this session or has been removed.)';
    }
    return record.logBuffer.tail(lines);
  }

  async getStatus(deployment: Deployment): Promise<ContainerStatus> {
    const record = this.processes.get(deployment.id);
    if (!record) return 'stopped';

    try {
      // kill(pid, 0) probes whether the process exists without sending a signal.
      // Throws ESRCH if the PID is gone.
      process.kill(record.pid, 0);
      return 'running';
    } catch {
      // Process is gone
      if (record.exitCode !== null && record.exitCode !== 0) return 'error';
      return 'stopped';
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Send SIGTERM to the process tree; schedule a SIGKILL fallback after 5 s.
   * Resolves as soon as SIGTERM has been dispatched (non-blocking for the API).
   */
  private killPid(pid: number): Promise<void> {
    return new Promise<void>((resolve) => {
      treeKill(pid, 'SIGTERM', (termErr) => {
        if (termErr) {
          // SIGTERM failed (already dead?) — force-kill immediately
          treeKill(pid, 'SIGKILL', () => resolve());
        } else {
          resolve(); // SIGTERM sent; process has time to clean up

          // Background SIGKILL safety net — won't keep event loop alive
          setTimeout(() => {
            treeKill(pid, 'SIGKILL', () => { /* silent cleanup */ });
          }, 5_000).unref();
        }
      });
    });
  }
}
