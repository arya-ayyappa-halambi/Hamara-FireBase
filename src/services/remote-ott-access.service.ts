// ─────────────────────────────────────────────────────────────────────────────
//  src/services/remote-ott-access.service.ts
//  FlareBase — Ephemeral One-Time Tokens (OTT) & Zero-Trust Remote Device Approvals
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/sqlite.connection';
import { wsService } from '../realtime/websocket.service';
import { networkAccessService } from './network-access.service';

export interface OneTimeTokenRecord {
  id: string;
  token: string;
  label: string;
  createdByUserId: string;
  ipRestriction?: string | null;
  expiresAt: string;
  isUsed: boolean;
  usedAt?: string | null;
  usedByIp?: string | null;
  createdAt: string;
}

export interface DeviceAccessRequest {
  id: string;
  ipAddress: string;
  userAgent: string;
  deviceName: string;
  fingerprintHash: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  requestedAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
  expiresAt?: string | null;
}

export class RemoteOttAccessService {
  private static instance: RemoteOttAccessService;

  private constructor() {}

  public static getInstance(): RemoteOttAccessService {
    if (!RemoteOttAccessService.instance) {
      RemoteOttAccessService.instance = new RemoteOttAccessService();
    }
    return RemoteOttAccessService.instance;
  }

  // ── 1. Ephemeral One-Time Tokens (OTT) ─────────────────────────────────────

  /**
   * Generates a single-use cryptographically random OTT for emergency remote access.
   */
  public generateOneTimeToken(params: {
    label: string;
    createdByUserId: string;
    durationMinutes?: number;
    ipRestriction?: string;
  }): OneTimeTokenRecord {
    const db = getDb();
    const id = `ott-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const token = `ott_${crypto.randomBytes(32).toString('hex')}`;
    const duration = params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : 15;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000).toISOString();

    const record: OneTimeTokenRecord = {
      id,
      token,
      label: params.label || 'Remote Emergency Access Token',
      createdByUserId: params.createdByUserId,
      ipRestriction: params.ipRestriction ? networkAccessService.normalizeIp(params.ipRestriction) : null,
      expiresAt,
      isUsed: false,
      createdAt: now.toISOString()
    };

    db.prepare(`
      INSERT INTO one_time_admin_tokens (
        id, token, label, createdByUserId, ipRestriction, expiresAt, isUsed, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      record.id,
      record.token,
      record.label,
      record.createdByUserId,
      record.ipRestriction,
      record.expiresAt,
      record.createdAt
    );

    return record;
  }

  /**
   * Redeems an OTT, verifying validity, expiry, and IP restriction, and burns it.
   */
  public redeemOneTimeToken(token: string, clientIp: string): {
    valid: boolean;
    jwtToken?: string;
    user?: any;
    reason?: string;
  } {
    const db = getDb();
    const normIp = networkAccessService.normalizeIp(clientIp);

    const row = db.prepare(`
      SELECT * FROM one_time_admin_tokens WHERE token = ?
    `).get(token) as any;

    if (!row) {
      return { valid: false, reason: 'Invalid or non-existent One-Time Token.' };
    }

    if (Number(row.isUsed) === 1) {
      return { valid: false, reason: 'This One-Time Token has already been redeemed and burned.' };
    }

    const exp = new Date(row.expiresAt).getTime();
    if (Date.now() > exp) {
      return { valid: false, reason: 'This One-Time Token has expired.' };
    }

    if (row.ipRestriction && row.ipRestriction !== normIp) {
      return { valid: false, reason: `Token is restricted to IP ${row.ipRestriction} (Client IP: ${normIp}).` };
    }

    // Burn token immediately (Single-Use Invariant)
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE one_time_admin_tokens
      SET isUsed = 1, usedAt = ?, usedByIp = ?
      WHERE id = ?
    `).run(nowIso, normIp, row.id);

    // Fetch super admin user or creator
    let user = db.prepare("SELECT * FROM users WHERE isSuperAdmin = 1 LIMIT 1").get() as any;
    if (!user && row.createdByUserId) {
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.createdByUserId) as any;
    }

    if (!user) {
      user = {
        id: row.createdByUserId || 'super-admin-ott-recovery',
        email: 'admin@flarebase.dev',
        name: 'Super Admin (OTT)',
        isSuperAdmin: 1
      };
    }

    const jwtPayload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name || 'Super Admin',
      role: user.role || 'admin',
      isSuperAdmin: Boolean(user.isSuperAdmin),
      isOttLogin: true,
      ottId: row.id
    };

    const jwtSecret = process.env.JWT_SECRET || 'flarebase_super_secret_jwt_key_2026';
    const jwtToken = jwt.sign(jwtPayload, jwtSecret, { expiresIn: '4h', algorithm: 'HS256' });

    // Notify Super Admin Dashboard in real time
    wsService.broadcast('OTT_TOKEN_REDEEMED', {
      ottId: row.id,
      label: row.label,
      clientIp: normIp,
      redeemedAt: nowIso
    });

    return {
      valid: true,
      jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || 'Super Admin',
        role: user.role || 'admin',
        isSuperAdmin: true
      }
    };
  }

  public listOneTimeTokens(): OneTimeTokenRecord[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM one_time_admin_tokens ORDER BY createdAt DESC LIMIT 50
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      token: r.token,
      label: r.label,
      createdByUserId: r.createdByUserId,
      ipRestriction: r.ipRestriction,
      expiresAt: r.expiresAt,
      isUsed: Number(r.isUsed) === 1,
      usedAt: r.usedAt,
      usedByIp: r.usedByIp,
      createdAt: r.createdAt
    }));
  }

  public revokeOneTimeToken(id: string): boolean {
    const db = getDb();
    const res = db.prepare(`
      UPDATE one_time_admin_tokens SET isUsed = 1, usedAt = ? WHERE id = ?
    `).run(new Date().toISOString(), id);
    return res.changes > 0;
  }

  // ── 2. Zero-Trust Remote Device Approvals ───────────────────────────────────

  public submitDeviceAccessRequest(params: {
    ipAddress: string;
    userAgent: string;
    deviceName?: string;
  }): DeviceAccessRequest {
    const db = getDb();
    const normIp = networkAccessService.normalizeIp(params.ipAddress);
    const fingerprintHash = crypto.createHash('sha256').update(`${normIp}-${params.userAgent}`).digest('hex').slice(0, 16);

    // Check if an existing pending request exists for this device
    const existing = db.prepare(`
      SELECT * FROM device_access_requests WHERE ipAddress = ? AND fingerprintHash = ? AND status = 'pending'
    `).get(normIp, fingerprintHash) as any;

    if (existing) {
      return {
        id: existing.id,
        ipAddress: existing.ipAddress,
        userAgent: existing.userAgent,
        deviceName: existing.deviceName,
        fingerprintHash: existing.fingerprintHash,
        status: existing.status,
        requestedAt: existing.requestedAt
      };
    }

    const id = `dreq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const deviceName = params.deviceName || `Remote Client (${normIp})`;

    const req: DeviceAccessRequest = {
      id,
      ipAddress: normIp,
      userAgent: params.userAgent,
      deviceName,
      fingerprintHash,
      status: 'pending',
      requestedAt: nowIso
    };

    db.prepare(`
      INSERT INTO device_access_requests (
        id, ipAddress, userAgent, deviceName, fingerprintHash, status, requestedAt
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(req.id, req.ipAddress, req.userAgent, req.deviceName, req.fingerprintHash, req.requestedAt);

    // Real-time notification to Super Admin Dashboard
    wsService.broadcast('DEVICE_ACCESS_REQUESTED', { request: req });

    return req;
  }

  public listDeviceAccessRequests(): DeviceAccessRequest[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM device_access_requests ORDER BY requestedAt DESC LIMIT 50
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      deviceName: r.deviceName,
      fingerprintHash: r.fingerprintHash,
      status: r.status,
      requestedAt: r.requestedAt,
      decidedAt: r.decidedAt,
      decidedBy: r.decidedBy,
      expiresAt: r.expiresAt
    }));
  }

  public approveDeviceRequest(id: string, decidedBy = 'Super Admin', durationHours = 24): DeviceAccessRequest | null {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM device_access_requests WHERE id = ?`).get(id) as any;
    if (!row) return null;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString();
    const decidedAt = now.toISOString();

    db.prepare(`
      UPDATE device_access_requests
      SET status = 'approved', decidedAt = ?, decidedBy = ?, expiresAt = ?
      WHERE id = ?
    `).run(decidedAt, decidedBy, expiresAt, id);

    // Whitelist this IP in network rules automatically
    try {
      networkAccessService.addRule({
        ipPattern: row.ipAddress,
        action: 'allow',
        label: `Auto-approved device: ${row.deviceName}`,
        createdBy: decidedBy,
        durationMinutes: durationHours * 60
      });
    } catch (_) {}

    const updated: DeviceAccessRequest = {
      id: row.id,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      deviceName: row.deviceName,
      fingerprintHash: row.fingerprintHash,
      status: 'approved',
      requestedAt: row.requestedAt,
      decidedAt,
      decidedBy,
      expiresAt
    };

    wsService.broadcast('DEVICE_ACCESS_DECIDED', { request: updated });
    return updated;
  }

  public rejectDeviceRequest(id: string, decidedBy = 'Super Admin'): DeviceAccessRequest | null {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM device_access_requests WHERE id = ?`).get(id) as any;
    if (!row) return null;

    const decidedAt = new Date().toISOString();
    db.prepare(`
      UPDATE device_access_requests
      SET status = 'rejected', decidedAt = ?, decidedBy = ?
      WHERE id = ?
    `).run(decidedAt, decidedBy, id);

    const updated: DeviceAccessRequest = {
      id: row.id,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      deviceName: row.deviceName,
      fingerprintHash: row.fingerprintHash,
      status: 'rejected',
      requestedAt: row.requestedAt,
      decidedAt,
      decidedBy
    };

    wsService.broadcast('DEVICE_ACCESS_DECIDED', { request: updated });
    return updated;
  }
}

export const remoteOttAccessService = RemoteOttAccessService.getInstance();
