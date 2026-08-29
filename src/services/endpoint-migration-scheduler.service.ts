// ─────────────────────────────────────────────────────────────────────────────
//  src/services/endpoint-migration-scheduler.service.ts
//  Manages scheduled host & port migrations and automated user rollouts.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { wsService } from '../realtime/websocket.service';
import os from 'os';
import crypto from 'crypto';

export interface ScheduledMigration {
  id: string;
  targetHost: string;
  targetPort: number;
  targetMode: string; // 'both' | 'localhost' | 'network' | 'custom'
  customDomain?: string;
  scheduledAt: string;
  status: 'pending' | 'completed' | 'cancelled';
  noticeMessage?: string;
  createdAt: string;
  executedAt?: string;
  newBaseUrl?: string;
  remainingSec?: number;
}

export type RebindHandler = (port: number, host: string) => Promise<void>;

export class EndpointMigrationSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;
  private rebindHandler: RebindHandler | null = null;

  public setRebindHandler(handler: RebindHandler): void {
    this.rebindHandler = handler;
  }

  public getNetworkIp(): string {
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

  public computeBaseUrl(mode: string, host: string, port: number, customDomain?: string): string {
    const networkIp = this.getNetworkIp();
    if (mode === 'localhost') {
      return `http://localhost:${port}`;
    } else if (mode === 'network') {
      return `http://${networkIp}:${port}`;
    } else if (mode === 'both') {
      return `http://localhost:${port}`;
    } else if (mode === 'custom') {
      if (customDomain && customDomain.trim()) {
        const cleanDomain = customDomain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        return `http://${cleanDomain}${port ? `:${port}` : ''}`;
      }
      const cleanHost = (host || 'localhost').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      return `http://${cleanHost}:${port}`;
    }
    return `http://localhost:${port}`;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkPendingMigrations(), 5000);
    // Initial check on boot
    this.checkPendingMigrations();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async checkPendingMigrations(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const db = getDb();
      const nowIso = new Date().toISOString();
      const due = db.prepare(`
        SELECT * FROM scheduled_endpoint_migrations 
        WHERE status = 'pending' AND scheduledAt <= ?
        ORDER BY scheduledAt ASC
        LIMIT 1
      `).get(nowIso) as any;

      if (due) {
        await this.executeMigration(due.id);
      }
    } catch (err: any) {
      console.error('[EndpointMigrationScheduler] Error checking pending migrations:', err.message);
    } finally {
      this.isChecking = false;
    }
  }

  public getPendingMigration(): ScheduledMigration | null {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM scheduled_endpoint_migrations 
      WHERE status = 'pending' 
      ORDER BY scheduledAt ASC 
      LIMIT 1
    `).get() as any;

    if (!row) return null;

    const scheduledTime = new Date(row.scheduledAt).getTime();
    const now = Date.now();
    const remainingSec = Math.max(0, Math.ceil((scheduledTime - now) / 1000));
    const newBaseUrl = this.computeBaseUrl(row.targetMode, row.targetHost, row.targetPort, row.customDomain);

    return {
      ...row,
      newBaseUrl,
      remainingSec
    };
  }

  public getActiveMigration(): ScheduledMigration | null {
    return this.getPendingMigration();
  }

  public scheduleMigration(data: {
    targetHost: string;
    targetPort: number;
    targetMode: string;
    customDomain?: string;
    scheduledAt: string;
    noticeMessage?: string;
  }): ScheduledMigration {
    const db = getDb();

    // Cancel any previous pending migration
    db.prepare(`UPDATE scheduled_endpoint_migrations SET status = 'cancelled' WHERE status = 'pending'`).run();

    const id = `mig_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const createdAt = new Date().toISOString();
    const targetHost = data.targetHost || '0.0.0.0';
    const targetPort = data.targetPort || 3000;
    const targetMode = data.targetMode || 'both';
    const customDomain = data.customDomain || '';
    const scheduledAt = data.scheduledAt;
    const noticeMessage = data.noticeMessage || `Server endpoint is scheduled to migrate to ${this.computeBaseUrl(targetMode, targetHost, targetPort, customDomain)} at ${new Date(scheduledAt).toLocaleTimeString()}.`;

    db.prepare(`
      INSERT INTO scheduled_endpoint_migrations (
        id, targetHost, targetPort, targetMode, customDomain, scheduledAt, status, noticeMessage, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, targetHost, targetPort, targetMode, customDomain, scheduledAt, noticeMessage, createdAt);

    const newBaseUrl = this.computeBaseUrl(targetMode, targetHost, targetPort, customDomain);
    const scheduledTime = new Date(scheduledAt).getTime();
    const remainingSec = Math.max(0, Math.ceil((scheduledTime - Date.now()) / 1000));

    const migration: ScheduledMigration = {
      id,
      targetHost,
      targetPort,
      targetMode,
      customDomain,
      scheduledAt,
      status: 'pending',
      noticeMessage,
      createdAt,
      newBaseUrl,
      remainingSec
    };

    // Broadcast schedule notification to all connected clients
    wsService.broadcast('ENDPOINT_MIGRATION_SCHEDULED', {
      migration,
      networkIp: this.getNetworkIp()
    });

    return migration;
  }

  public cancelMigration(id?: string, reason?: string): boolean {
    const db = getDb();
    let result;
    if (id) {
      result = db.prepare(`UPDATE scheduled_endpoint_migrations SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(id);
    } else {
      result = db.prepare(`UPDATE scheduled_endpoint_migrations SET status = 'cancelled' WHERE status = 'pending'`).run();
    }

    if (result.changes > 0) {
      wsService.broadcast('ENDPOINT_MIGRATION_CANCELLED', {
        id,
        noticeMessage: reason || 'The scheduled endpoint migration has been cancelled by the Super Admin.'
      });
      return true;
    }
    return false;
  }

  public async executeMigration(id: string): Promise<boolean> {
    const db = getDb();
    const migration = db.prepare(`SELECT * FROM scheduled_endpoint_migrations WHERE id = ?`).get(id) as any;
    if (!migration) return false;

    const executedAt = new Date().toISOString();
    const newBaseUrl = this.computeBaseUrl(migration.targetMode, migration.targetHost, migration.targetPort, migration.customDomain);
    const networkIp = this.getNetworkIp();

    // 1. Update platform_settings
    db.prepare(`
      UPDATE platform_settings SET
        serverHost = ?,
        serverPort = ?,
        serverHostingMode = ?,
        customDomain = ?
      WHERE id = 'default'
    `).run(migration.targetHost, migration.targetPort, migration.targetMode, migration.customDomain || '');

    // 2. Mark migration complete
    db.prepare(`
      UPDATE scheduled_endpoint_migrations SET 
        status = 'completed',
        executedAt = ?
      WHERE id = ?
    `).run(executedAt, id);

    // 3. Broadcast real-time execution & redirect event to all connected clients BEFORE closing the old socket
    wsService.broadcast('ENDPOINT_MIGRATION_EXECUTED', {
      id,
      newBaseUrl,
      serverHost: migration.targetHost,
      serverPort: migration.targetPort,
      serverHostingMode: migration.targetMode,
      customDomain: migration.customDomain || '',
      networkIp,
      executedAt
    });

    wsService.broadcast('SERVER_HOST_CONFIG_UPDATED', {
      serverHost: migration.targetHost,
      serverPort: migration.targetPort,
      serverHostingMode: migration.targetMode,
      customDomain: migration.customDomain || '',
      newBaseUrl,
      networkIp
    });

    // Give clients a brief moment to receive the WS packet before closing the socket
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 4. Perform dynamic live socket rebinding
    if (this.rebindHandler) {
      try {
        console.log(`[EndpointMigrationScheduler] Triggering dynamic server socket rebind to port ${migration.targetPort}...`);
        await this.rebindHandler(migration.targetPort, migration.targetHost);
      } catch (rebindErr: any) {
        console.error('[EndpointMigrationScheduler] Failed to rebind server socket:', rebindErr.message);
      }
    }

    console.log(`[EndpointMigrationScheduler] Migration ${id} successfully executed -> ${newBaseUrl}`);
    return true;
  }
}

export const endpointMigrationScheduler = new EndpointMigrationSchedulerService();
