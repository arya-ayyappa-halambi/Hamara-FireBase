// ─────────────────────────────────────────────────────────────────────────────
//  src/services/terminal-stream.service.ts
//  Captures and streams real-time terminal stdout/stderr logs over WebSocket.
// ─────────────────────────────────────────────────────────────────────────────

import { wsService } from '../realtime/websocket.service';

export interface TerminalLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'request' | 'system';
  message: string;
}

class TerminalStreamService {
  private buffer: TerminalLogEntry[] = [];
  private maxBuffer = 300;
  private isHooked = false;
  private origStdoutWrite: any = null;
  private origStderrWrite: any = null;

  public init(): void {
    if (this.isHooked) return;
    this.isHooked = true;

    this.origStdoutWrite = process.stdout.write.bind(process.stdout);
    this.origStderrWrite = process.stderr.write.bind(process.stderr);

    const self = this;

    // Intercept process.stdout.write
    (process.stdout as any).write = function(chunk: any, encoding?: any, cb?: any) {
      self.handleRawLog(chunk, 'info');
      return self.origStdoutWrite(chunk, encoding, cb);
    };

    // Intercept process.stderr.write
    (process.stderr as any).write = function(chunk: any, encoding?: any, cb?: any) {
      self.handleRawLog(chunk, 'error');
      return self.origStderrWrite(chunk, encoding, cb);
    };
  }

  private handleRawLog(chunk: any, defaultLevel: 'info' | 'error'): void {
    try {
      const str = typeof chunk === 'string' ? chunk : chunk?.toString?.('utf8') || '';
      if (!str || !str.trim()) return;

      const lines = str.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        let level: TerminalLogEntry['level'] = defaultLevel;
        if (line.startsWith('→ ')) {
          level = 'request';
        } else if (line.includes('❌') || line.includes('error') || line.includes('Error:')) {
          level = 'error';
        } else if (line.includes('⚠️') || line.includes('warn') || line.includes('Warning:')) {
          level = 'warn';
        } else if (line.includes('┌') || line.includes('├') || line.includes('└') || line.includes('│') || line.includes('AegisDB')) {
          level = 'system';
        }

        const entry: TerminalLogEntry = {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          level,
          message: line
        };

        this.buffer.push(entry);
        if (this.buffer.length > this.maxBuffer) {
          this.buffer.shift();
        }

        // Broadcast to WebSocket clients
        try {
          wsService.broadcast('TERMINAL_LOG_STREAM', { entry });
        } catch (_) {}
      }
    } catch (_) {}
  }

  public getRecentLogs(limit: number = 150): TerminalLogEntry[] {
    return this.buffer.slice(-limit);
  }

  public clear(): void {
    this.buffer = [];
  }
}

export const terminalStreamService = new TerminalStreamService();
