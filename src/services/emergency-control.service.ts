// ─────────────────────────────────────────────────────────────────────────────
//  src/services/emergency-control.service.ts
//  AegisDB — Emergency Protocols, Panic Mode & Maintenance Windows Service
//
//  Provides 3-Tier Emergency Lockdown:
//    - Level 1: Read-Only Shield (Mutations frozen, reads allowed)
//    - Level 2: LAN Quarantine (External public traffic blocked, LAN only)
//    - Level 3: Full Air-Gap Freeze (Complete API lock, socket termination, emergency backup snapshot)
//  Along with Scheduled Maintenance Windows (503 + Retry-After).
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { networkAccessService } from './network-access.service';
import { geoipThreatIntelService } from './geoip-threat-intel.service';
import fs from 'fs';
import path from 'path';

export type EmergencyLockdownLevel = 'normal' | 'read_only' | 'lan_only' | 'air_gap';

export interface EmergencyStatus {
  level: EmergencyLockdownLevel;
  reason: string | null;
  activatedAt: string | null;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  maintenanceStartAt: string | null;
  maintenanceEndAt: string | null;
  maintenanceRetryAfterSeconds: number;
}

export interface AccessEvaluationResult {
  allowed: boolean;
  statusCode?: number;
  code?: string;
  message?: string;
  retryAfter?: number;
}

class EmergencyControlService {
  private currentLevel: EmergencyLockdownLevel = 'normal';
  private reason: string | null = null;
  private activatedAt: string | null = null;

  private maintenanceEnabled: boolean = false;
  private maintenanceMessage: string = 'System is temporarily undergoing scheduled maintenance.';
  private maintenanceStartAt: string | null = null;
  private maintenanceEndAt: string | null = null;
  private maintenanceRetryAfterSeconds: number = 300;

  private initialized: boolean = false;

  constructor() {
    // Lazy init on first use
  }

  /**
   * Load stored emergency state from SQLite platform_settings table.
   */
  private initFromDb(): void {
    if (this.initialized) return;
    try {
      const db = getDb();
      const row = db.prepare(`
        SELECT 
          emergencyLockdownLevel,
          emergencyLockdownReason,
          emergencyLockdownActivatedAt,
          maintenanceWindowEnabled,
          maintenanceMessage,
          maintenanceStartAt,
          maintenanceEndAt,
          maintenanceRetryAfterSeconds
        FROM platform_settings 
        WHERE id = 'default'
      `).get() as any;

      if (row) {
        this.currentLevel = (row.emergencyLockdownLevel as EmergencyLockdownLevel) || 'normal';
        this.reason = row.emergencyLockdownReason || null;
        this.activatedAt = row.emergencyLockdownActivatedAt || null;
        this.maintenanceEnabled = Number(row.maintenanceWindowEnabled) === 1;
        if (row.maintenanceMessage) this.maintenanceMessage = row.maintenanceMessage;
        this.maintenanceStartAt = row.maintenanceStartAt || null;
        this.maintenanceEndAt = row.maintenanceEndAt || null;
        this.maintenanceRetryAfterSeconds = row.maintenanceRetryAfterSeconds || 300;
      }
      this.initialized = true;
    } catch (_) {
      // Table or column might be initializing
    }
  }

  /**
   * Get the current live emergency and maintenance status.
   */
  public getStatus(): EmergencyStatus {
    this.initFromDb();
    return {
      level: this.currentLevel,
      reason: this.reason,
      activatedAt: this.activatedAt,
      maintenanceEnabled: this.maintenanceEnabled,
      maintenanceMessage: this.maintenanceMessage,
      maintenanceStartAt: this.maintenanceStartAt,
      maintenanceEndAt: this.maintenanceEndAt,
      maintenanceRetryAfterSeconds: this.maintenanceRetryAfterSeconds,
    };
  }

  /**
   * Set emergency lockdown level.
   */
  public setEmergencyLevel(level: EmergencyLockdownLevel, reason?: string): EmergencyStatus {
    this.initFromDb();
    this.currentLevel = level;
    this.reason = reason || null;
    this.activatedAt = level === 'normal' ? null : new Date().toISOString();

    const db = getDb();
    try {
      db.prepare(`
        UPDATE platform_settings SET
          emergencyLockdownLevel = ?,
          emergencyLockdownReason = ?,
          emergencyLockdownActivatedAt = ?
        WHERE id = 'default'
      `).run(this.currentLevel, this.reason, this.activatedAt);
    } catch (_) {}

    // If Level 3: Air-Gap Freeze is activated, trigger an instant emergency snapshot
    if (level === 'air_gap') {
      this.createPanicSnapshot('Air-Gap Emergency Freeze activated');
    }

    return this.getStatus();
  }

  /**
   * Update scheduled maintenance window parameters.
   */
  public setMaintenanceWindow(params: {
    enabled: boolean;
    message?: string;
    startAt?: string | null;
    endAt?: string | null;
    retryAfterSeconds?: number;
  }): EmergencyStatus {
    this.initFromDb();
    this.maintenanceEnabled = Boolean(params.enabled);
    if (params.message !== undefined) this.maintenanceMessage = params.message;
    if (params.startAt !== undefined) this.maintenanceStartAt = params.startAt;
    if (params.endAt !== undefined) this.maintenanceEndAt = params.endAt;
    if (params.retryAfterSeconds !== undefined) this.maintenanceRetryAfterSeconds = params.retryAfterSeconds;

    const db = getDb();
    try {
      db.prepare(`
        UPDATE platform_settings SET
          maintenanceWindowEnabled = ?,
          maintenanceMessage = ?,
          maintenanceStartAt = ?,
          maintenanceEndAt = ?,
          maintenanceRetryAfterSeconds = ?
        WHERE id = 'default'
      `).run(
        this.maintenanceEnabled ? 1 : 0,
        this.maintenanceMessage,
        this.maintenanceStartAt,
        this.maintenanceEndAt,
        this.maintenanceRetryAfterSeconds
      );
    } catch (_) {}

    return this.getStatus();
  }

  /**
   * Create an instant emergency database snapshot to backups/panic-snapshot-<timestamp>.db
   */
  public createPanicSnapshot(reasonNote?: string): { success: boolean; snapshotPath: string; sizeBytes: number } {
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotFileName = `panic-snapshot-${timestamp}.db`;
    const snapshotPath = path.join(backupDir, snapshotFileName);

    try {
      const db = getDb();
      // SQLite online vacuum into target snapshot file
      db.prepare(`VACUUM INTO ?`).run(snapshotPath);

      let sizeBytes = 0;
      if (fs.existsSync(snapshotPath)) {
        sizeBytes = fs.statSync(snapshotPath).size;
      }

      return {
        success: true,
        snapshotPath,
        sizeBytes,
      };
    } catch (err: any) {
      return {
        success: false,
        snapshotPath,
        sizeBytes: 0,
      };
    }
  }

  /**
   * Evaluate whether an incoming HTTP request is permitted under active Emergency & Maintenance policies.
   */
  public evaluateRequest(params: {
    method: string;
    path: string;
    clientIp: string;
    isSuperAdmin?: boolean;
  }): AccessEvaluationResult {
    this.initFromDb();

    const normIp = networkAccessService.normalizeIp(params.clientIp);
    const isLocalhost = normIp === '127.0.0.1' || normIp === '::1';
    const isAdminPath = params.path.startsWith('/api/v1/admin');

    const p = (params.path || '').toLowerCase();
    const isBypassPath = 
      p === '/' ||
      p === '/index.html' ||
      p === '/admin-login' ||
      p === '/admin-login.html' ||
      p === '/admin/login' ||
      p === '/recovery' ||
      p === '/recovery.html' ||
      p === '/system/recovery' ||
      p === '/reset-password' ||
      p === '/reset-password.html' ||
      p.startsWith('/app.js') ||
      p.startsWith('/flarebase.js') ||
      p.startsWith('/aegis.js') ||
      p.startsWith('/styles.css') ||
      p.startsWith('/driver.css') ||
      p.startsWith('/assets/') ||
      p === '/favicon.ico' ||
      p === '/health' ||
      p === '/api/health' ||
      p.startsWith('/api/v1/health') ||
      p.startsWith('/api/v1/system/status') ||
      p.startsWith('/api/v1/system/health') ||
      p.startsWith('/api/v1/system/restore') ||
      p.startsWith('/api/v1/system/verify-recovery-pin') ||
      p.startsWith('/api/v1/auth/');

    if (isBypassPath) {
      return { allowed: true };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GUARANTEE: Super Admin from localhost (127.0.0.1) ALWAYS has access to Admin APIs
    // to manage, adjust, or disarm emergency levels and maintenance modes.
    // ─────────────────────────────────────────────────────────────────────────
    if (isLocalhost && (isAdminPath || params.isSuperAdmin)) {
      return { allowed: true };
    }

    // 1. Maintenance Mode Evaluation
    if (this.maintenanceEnabled) {
      const now = new Date();
      let isInMaintenancePeriod = true;

      if (this.maintenanceStartAt) {
        const start = new Date(this.maintenanceStartAt);
        if (now < start) isInMaintenancePeriod = false;
      }
      if (this.maintenanceEndAt) {
        const end = new Date(this.maintenanceEndAt);
        if (now > end) isInMaintenancePeriod = false;
      }

      if (isInMaintenancePeriod) {
        return {
          allowed: false,
          statusCode: 503,
          code: 'MAINTENANCE_MODE_ACTIVE',
          message: this.maintenanceMessage || 'System is temporarily undergoing scheduled maintenance.',
          retryAfter: this.maintenanceRetryAfterSeconds || 300,
        };
      }
    }

    // 2. Emergency Lockdown Level Evaluation
    if (this.currentLevel === 'normal') {
      return { allowed: true };
    }

    // Level 1: Read-Only Shield
    if (this.currentLevel === 'read_only') {
      const isWriteMethod = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(params.method.toUpperCase());
      // Non-admin write operations are blocked
      if (isWriteMethod && !isAdminPath) {
        return {
          allowed: false,
          statusCode: 423, // Locked
          code: 'EMERGENCY_READ_ONLY_LOCKDOWN',
          message: `Database is currently locked in Emergency Read-Only mode: ${this.reason || 'Mutations temporarily paused.'}`,
        };
      }
      return { allowed: true };
    }

    // Level 2: LAN Quarantine (Blocks public WAN / external IPs)
    if (this.currentLevel === 'lan_only') {
      const isPrivateLan = geoipThreatIntelService.isPrivateIp(normIp);
      if (!isPrivateLan) {
        return {
          allowed: false,
          statusCode: 403,
          code: 'EMERGENCY_LAN_QUARANTINE',
          message: `Access denied: External connections blocked under Emergency LAN Quarantine (${this.reason || 'Public access restricted'}).`,
        };
      }
      return { allowed: true };
    }

    // Level 3: Full Air-Gap Freeze
    if (this.currentLevel === 'air_gap') {
      // Non-localhost requests are completely frozen
      if (!isLocalhost) {
        return {
          allowed: false,
          statusCode: 503,
          code: 'EMERGENCY_AIR_GAP_FREEZE',
          message: `System is in Emergency Air-Gap Freeze: All network operations temporarily halted (${this.reason || 'Emergency incident isolation'}).`,
          retryAfter: 600,
        };
      }
    }

    return { allowed: true };
  }
}

export const emergencyControlService = new EmergencyControlService();
