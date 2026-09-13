// ─────────────────────────────────────────────────────────────────────────────
//  src/services/user-session.service.ts
//  FlareBase — User Active Session Management & Security Audit Log Service
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { networkAccessService } from './network-access.service';
import { tokenFamilyService } from './token-family.service';

export interface UserSessionRecord {
  id: string;
  userId: string;
  refreshTokenHash?: string | null;
  ipAddress: string;
  userAgent?: string | null;
  deviceType: string;
  osName: string;
  browserName: string;
  countryCode?: string | null;
  lastActiveAt: string;
  createdAt: string;
  isRevoked: boolean;
  isCurrent?: boolean;
}

export interface UserSecurityLogRecord {
  id: string;
  userId: string;
  actionType: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  countryCode?: string | null;
  details?: string | null;
  createdAt: string;
}

class UserSessionService {
  private static instance: UserSessionService;

  private constructor() {}

  public static getInstance(): UserSessionService {
    if (!UserSessionService.instance) {
      UserSessionService.instance = new UserSessionService();
    }
    return UserSessionService.instance;
  }

  /**
   * Registers a new active session on login / token refresh
   */
  public registerSession(params: {
    userId: string;
    refreshToken?: string;
    ipAddress: string;
    userAgent?: string;
    countryCode?: string;
  }): UserSessionRecord {
    const { userId, refreshToken, ipAddress, userAgent, countryCode } = params;
    const db = getDb();

    const id = `sess_${uuidv4()}`;
    const now = new Date().toISOString();
    const tokenHash = refreshToken ? tokenFamilyService.hashToken(refreshToken) : null;
    const { deviceType, osName, browserName } = networkAccessService.parseUserAgent(userAgent);

    db.prepare(`
      INSERT INTO user_sessions (id, userId, refreshTokenHash, ipAddress, userAgent, deviceType, osName, browserName, countryCode, lastActiveAt, createdAt, isRevoked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, userId, tokenHash, ipAddress, userAgent || null, deviceType, osName, browserName, countryCode || null, now, now);

    return {
      id,
      userId,
      refreshTokenHash: tokenHash,
      ipAddress,
      userAgent: userAgent || null,
      deviceType,
      osName,
      browserName,
      countryCode: countryCode || null,
      lastActiveAt: now,
      createdAt: now,
      isRevoked: false
    };
  }

  /**
   * Updates last active timestamp of a session
   */
  public touchSession(refreshToken: string, ipAddress?: string): void {
    if (!refreshToken) return;
    try {
      const db = getDb();
      const tokenHash = tokenFamilyService.hashToken(refreshToken);
      const now = new Date().toISOString();
      db.prepare('UPDATE user_sessions SET lastActiveAt = ?, ipAddress = COALESCE(?, ipAddress) WHERE refreshTokenHash = ? AND isRevoked = 0').run(now, ipAddress || null, tokenHash);
    } catch (_) {}
  }

  /**
   * Lists all active sessions for a user
   */
  public listUserSessions(userId: string, currentRefreshToken?: string): UserSessionRecord[] {
    const db = getDb();
    const currentHash = currentRefreshToken ? tokenFamilyService.hashToken(currentRefreshToken) : null;

    const rows = db.prepare(`
      SELECT * FROM user_sessions
      WHERE userId = ? AND isRevoked = 0
      ORDER BY lastActiveAt DESC
    `).all(userId) as any[];

    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      refreshTokenHash: r.refreshTokenHash,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      deviceType: r.deviceType || 'desktop',
      osName: r.osName || 'Unknown OS',
      browserName: r.browserName || 'Unknown Client',
      countryCode: r.countryCode,
      lastActiveAt: r.lastActiveAt,
      createdAt: r.createdAt,
      isRevoked: r.isRevoked === 1,
      isCurrent: Boolean(currentHash && r.refreshTokenHash === currentHash)
    }));
  }

  /**
   * Revoke a specific session (1-Click Remote Logout)
   */
  public revokeSession(userId: string, sessionId: string): boolean {
    const db = getDb();
    const session = db.prepare('SELECT * FROM user_sessions WHERE id = ? AND userId = ?').get(sessionId, userId) as any;
    if (!session) return false;

    // Mark session revoked
    db.prepare('UPDATE user_sessions SET isRevoked = 1 WHERE id = ?').run(sessionId);

    // If associated with a refreshToken, revoke the token family
    if (session.refreshTokenHash) {
      db.prepare('UPDATE refresh_tokens SET isRevoked = 1 WHERE tokenHash = ?').run(session.refreshTokenHash);
    }

    this.logSecurityAction({
      userId,
      actionType: 'session_revoked',
      details: `Revoked session ${sessionId} (${session.osName} / ${session.browserName} - ${session.ipAddress})`
    });

    return true;
  }

  /**
   * Revoke all other sessions except current (1-Click "Logout from all other devices")
   */
  public revokeAllOtherSessions(userId: string, currentRefreshToken?: string): number {
    const db = getDb();
    const currentHash = currentRefreshToken ? tokenFamilyService.hashToken(currentRefreshToken) : null;

    let info;
    if (currentHash) {
      info = db.prepare(`
        UPDATE user_sessions
        SET isRevoked = 1
        WHERE userId = ? AND isRevoked = 0 AND (refreshTokenHash IS NULL OR refreshTokenHash != ?)
      `).run(userId, currentHash);
    } else {
      info = db.prepare(`
        UPDATE user_sessions
        SET isRevoked = 1
        WHERE userId = ? AND isRevoked = 0
      `).run(userId);
    }

    this.logSecurityAction({
      userId,
      actionType: 'logout_all_other_devices',
      details: `Terminated ${info.changes} remote session(s).`
    });

    return info.changes;
  }

  /**
   * Record User Security & Activity Log
   */
  public logSecurityAction(params: {
    userId: string;
    actionType: string;
    ipAddress?: string;
    userAgent?: string;
    countryCode?: string;
    details?: string;
  }): void {
    try {
      const db = getDb();
      const id = `sec_${uuidv4()}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO user_security_logs (id, userId, actionType, ipAddress, userAgent, countryCode, details, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, params.userId, params.actionType, params.ipAddress || null, params.userAgent || null, params.countryCode || null, params.details || null, now);
    } catch (_) {}
  }

  /**
   * List recent security logs for a user
   */
  public listUserSecurityLogs(userId: string, limit = 50): UserSecurityLogRecord[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM user_security_logs
      WHERE userId = ?
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(userId, limit) as any[];

    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      actionType: r.actionType,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      countryCode: r.countryCode,
      details: r.details,
      createdAt: r.createdAt
    }));
  }
}

export const userSessionService = UserSessionService.getInstance();
