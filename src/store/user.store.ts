// ─────────────────────────────────────────────────────────────────────────────
//  src/store/user.store.ts
//  SQLite-backed user store for FlareBase.
//
//  Implements the UserStore interface backed by SQLite database.
// ─────────────────────────────────────────────────────────────────────────────

import { User } from '../types/auth.types';
import { getDb } from '../db/sqlite.connection';
import { envelopeEncryptionService } from '../services/envelope-encryption.service';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface UserStore {
  /** Find a user by their email address. Returns undefined if not found. */
  findByEmail(email: string): Promise<User | undefined>;

  /** Find a user by their UUID. Returns undefined if not found. */
  findById(id: string): Promise<User | undefined>;

  /** Persist a new user record. Throws if the email already exists. */
  create(user: User): Promise<User>;

  /** Fetch all users (omitting sensitive data) */
  getAllUsers(): Promise<Omit<User, 'passwordHash'>[]>;

  /** Increment reads or writes count for a user */
  incrementTelemetry(userId: string, type: 'read' | 'write'): void;

  /** Update user API rate limit */
  updateUserLimits(userId: string, apiLimit: number, readLimit: number, writeLimit: number, lockoutMinutes: number, resetLockout?: boolean): void;
  
  /** Apply lockout penalty */
  applyLockout(userId: string, lockoutMinutes: number): void;
  
  /** Reset monthly limits */
  resetMonthlyLimits(userId: string): void;

  /** Create a brand new admin user with granular permissions & optional IP lock */
  createAdminUser(user: User, adminPermissions?: string[], adminAllowedIpSubnet?: string | null, adminRequireMfa?: boolean): Promise<User>;

  /** Promote an existing developer to an Admin with designated permissions */
  promoteToAdmin(userId: string, adminPermissions?: string[], adminAllowedIpSubnet?: string | null, adminRequireMfa?: boolean): void;

  /** Demote an admin user back to a regular developer */
  demoteAdmin(userId: string): void;

  /** Update admin permissions, IP whitelist, MFA enforcement, or status */
  updateAdminSecurityConfig(userId: string, config: { adminPermissions?: string[]; adminAllowedIpSubnet?: string | null; adminRequireMfa?: boolean; adminStatus?: 'active' | 'suspended' }): void;
}

// ── SQLite Implementation ──────────────────────────────────────────────────────

interface RawUserRow {
  id: string;
  email: string;
  emailHash: string;
  name: string;
  passwordHash: string;
  isSuperAdmin: number;
  adminPermissions?: string | null;
  adminAllowedIpSubnet?: string | null;
  adminRequireMfa?: number;
  adminStatus?: string;
  createdAt: string;
  updatedAt: string;
  apiLimit: number;
  readLimit: number;
  writeLimit: number;
  readsCount: number;
  writesCount: number;
  lockoutMinutes: number;
  lockedUntil: string | null;
  billingMonthStart: string | null;
  mfaEnabled?: number;
  mfaSecret?: string;
  status?: string;
  deletionInitiatedAt?: string | null;
  scheduledDeletionAt?: string | null;
  isFlagged?: number;
  riskScore?: number;
  activeNoticeId?: string | null;
  noticeStatus?: string;
  acceptedTermsVersion?: string;
  acceptedTermsAt?: string | null;
}

function mapRowToUser(row: RawUserRow): User {
  const email = envelopeEncryptionService.decryptField(
    typeof row.email === 'string' && row.email.startsWith('{') ? JSON.parse(row.email) : row.email, 
    'SYSTEM'
  ) || row.email;

  const name = envelopeEncryptionService.decryptField(
    typeof row.name === 'string' && row.name.startsWith('{') ? JSON.parse(row.name) : row.name, 
    'SYSTEM'
  ) || row.name;
  
  let mfaSecret = row.mfaSecret;
  if (mfaSecret && typeof mfaSecret === 'string' && mfaSecret.startsWith('{')) {
    mfaSecret = envelopeEncryptionService.decryptField(JSON.parse(mfaSecret), 'SYSTEM');
  }

  let adminPermissions: any = ['*'];
  if (row.adminPermissions) {
    try {
      adminPermissions = typeof row.adminPermissions === 'string' ? JSON.parse(row.adminPermissions) : row.adminPermissions;
    } catch (_) {
      adminPermissions = ['*'];
    }
  } else if (!row.isSuperAdmin) {
    adminPermissions = [];
  }

  return {
    ...row,
    email,
    name,
    mfaSecret,
    isSuperAdmin: Boolean(row.isSuperAdmin),
    adminPermissions,
    adminAllowedIpSubnet: row.adminAllowedIpSubnet || null,
    adminRequireMfa: Boolean(row.adminRequireMfa),
    adminStatus: (row.adminStatus as any) || 'active',
    mfaEnabled: row.mfaEnabled ?? 0,
    status: (row.status as any) || 'active',
    isFlagged: Boolean(row.isFlagged),
    riskScore: row.riskScore ?? 0,
    activeNoticeId: row.activeNoticeId || undefined,
    noticeStatus: (row.noticeStatus as any) || 'none',
    acceptedTermsVersion: row.acceptedTermsVersion || 'v1.0.0',
    acceptedTermsAt: row.acceptedTermsAt || undefined,
    deletionInitiatedAt: row.deletionInitiatedAt || undefined,
    scheduledDeletionAt: row.scheduledDeletionAt || undefined,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : undefined,
    billingMonthStart: row.billingMonthStart ? new Date(row.billingMonthStart) : undefined,
  };
}

class SqliteUserStore implements UserStore {
  async findByEmail(email: string): Promise<User | undefined> {
    const normalised = email.toLowerCase().trim();
    const hash = envelopeEncryptionService.hashBlindIndex(normalised);
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE emailHash = ?').get(hash) as RawUserRow | undefined;
    return row ? mapRowToUser(row) : undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as RawUserRow | undefined;
    return row ? mapRowToUser(row) : undefined;
  }

  async create(user: User): Promise<User> {
    const normalised = user.email.toLowerCase().trim();
    const emailHash = envelopeEncryptionService.hashBlindIndex(normalised);
    const createdAtStr = user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt);
    const updatedAtStr = user.updatedAt instanceof Date ? user.updatedAt.toISOString() : String(user.updatedAt);

    const record: User = {
      ...user,
      email: normalised,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr),
    };

    const encEmail = envelopeEncryptionService.encryptField(normalised, 'SYSTEM');
    const encName = envelopeEncryptionService.encryptField(record.name, 'SYSTEM');

    const db = getDb();
    try {
      const stmt = db.prepare(`
        INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(record.id, JSON.stringify(encEmail), emailHash, JSON.stringify(encName), record.passwordHash, record.isSuperAdmin ? 1 : 0, createdAtStr, updatedAtStr);
      return record;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new Error(`User with email "${user.email}" already exists.`);
      }
      throw err;
    }
  }

  /** Utility — returns total stored user count. */
  count(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  }

  async getAllUsers(): Promise<Omit<User, 'passwordHash'>[]> {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all() as RawUserRow[];
    
    // We also need project count for each user
    const usersWithProjects = rows.map(row => {
      const user = mapRowToUser(row) as any;
      const projCount = db.prepare('SELECT COUNT(*) as count FROM projects WHERE ownerId = ?').get(row.id) as any;
      user.projectCount = projCount.count;
      return user;
    });
    return usersWithProjects;
  }

  incrementTelemetry(userId: string, type: 'read' | 'write'): void {
    const db = getDb();
    if (type === 'read') {
      db.prepare('UPDATE users SET readsCount = readsCount + 1 WHERE id = ?').run(userId);
    } else {
      db.prepare('UPDATE users SET writesCount = writesCount + 1 WHERE id = ?').run(userId);
    }
  }

  applyLockout(userId: string, lockoutMinutes: number): void {
    const db = getDb();
    const lockedUntil = new Date(Date.now() + lockoutMinutes * 60000).toISOString();
    db.prepare('UPDATE users SET lockedUntil = ? WHERE id = ?').run(lockedUntil, userId);
  }

  resetMonthlyLimits(userId: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET readsCount = 0, writesCount = 0, lockedUntil = NULL, billingMonthStart = ? WHERE id = ?').run(now, userId);
  }

  updateUserLimits(userId: string, apiLimit: number, readLimit: number, writeLimit: number, lockoutMinutes: number, resetLockout?: boolean): void {
    const db = getDb();
    if (resetLockout) {
      db.prepare('UPDATE users SET apiLimit = ?, readLimit = ?, writeLimit = ?, lockoutMinutes = ?, lockedUntil = NULL WHERE id = ?').run(apiLimit, readLimit, writeLimit, lockoutMinutes, userId);
    } else {
      db.prepare('UPDATE users SET apiLimit = ?, readLimit = ?, writeLimit = ?, lockoutMinutes = ? WHERE id = ?').run(apiLimit, readLimit, writeLimit, lockoutMinutes, userId);
    }
  }

  async createAdminUser(user: User, adminPermissions: string[] = ['*'], adminAllowedIpSubnet?: string | null, adminRequireMfa: boolean = false): Promise<User> {
    const normalised = user.email.toLowerCase().trim();
    const emailHash = envelopeEncryptionService.hashBlindIndex(normalised);
    const createdAtStr = user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt);
    const updatedAtStr = user.updatedAt instanceof Date ? user.updatedAt.toISOString() : String(user.updatedAt);

    const permissionsJson = JSON.stringify(adminPermissions && adminPermissions.length > 0 ? adminPermissions : ['*']);
    const allowedIp = adminAllowedIpSubnet && adminAllowedIpSubnet.trim().length > 0 ? adminAllowedIpSubnet.trim() : null;

    const encEmail = envelopeEncryptionService.encryptField(normalised, 'SYSTEM');
    const encName = envelopeEncryptionService.encryptField(user.name, 'SYSTEM');

    const db = getDb();
    try {
      const stmt = db.prepare(`
        INSERT INTO users (
          id, email, emailHash, name, passwordHash, isSuperAdmin,
          adminPermissions, adminAllowedIpSubnet, adminRequireMfa, adminStatus,
          createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'active', ?, ?)
      `);
      stmt.run(
        user.id,
        JSON.stringify(encEmail),
        emailHash,
        JSON.stringify(encName),
        user.passwordHash,
        permissionsJson,
        allowedIp,
        adminRequireMfa ? 1 : 0,
        createdAtStr,
        updatedAtStr
      );

      return {
        ...user,
        email: normalised,
        isSuperAdmin: true,
        adminPermissions: JSON.parse(permissionsJson),
        adminAllowedIpSubnet: allowedIp,
        adminRequireMfa,
        adminStatus: 'active',
        createdAt: new Date(createdAtStr),
        updatedAt: new Date(updatedAtStr)
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new Error(`User with email "${user.email}" already exists.`);
      }
      throw err;
    }
  }

  promoteToAdmin(userId: string, adminPermissions: string[] = ['*'], adminAllowedIpSubnet?: string | null, adminRequireMfa: boolean = false): void {
    const db = getDb();
    const permissionsJson = JSON.stringify(adminPermissions && adminPermissions.length > 0 ? adminPermissions : ['*']);
    const allowedIp = adminAllowedIpSubnet && adminAllowedIpSubnet.trim().length > 0 ? adminAllowedIpSubnet.trim() : null;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users 
      SET isSuperAdmin = 1,
          adminPermissions = ?,
          adminAllowedIpSubnet = ?,
          adminRequireMfa = ?,
          adminStatus = 'active',
          updatedAt = ?
      WHERE id = ?
    `).run(permissionsJson, allowedIp, adminRequireMfa ? 1 : 0, now, userId);
  }

  demoteAdmin(userId: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users 
      SET isSuperAdmin = 0,
          adminPermissions = '[]',
          adminAllowedIpSubnet = NULL,
          adminRequireMfa = 0,
          adminStatus = 'active',
          updatedAt = ?
      WHERE id = ?
    `).run(now, userId);
  }

  updateAdminSecurityConfig(userId: string, config: { adminPermissions?: string[]; adminAllowedIpSubnet?: string | null; adminRequireMfa?: boolean; adminStatus?: 'active' | 'suspended' }): void {
    const db = getDb();
    const existing = db.prepare('SELECT adminPermissions, adminAllowedIpSubnet, adminRequireMfa, adminStatus FROM users WHERE id = ?').get(userId) as any;
    if (!existing) {
      throw new Error(`User with ID "${userId}" not found.`);
    }

    const permissionsJson = config.adminPermissions !== undefined 
      ? JSON.stringify(config.adminPermissions) 
      : existing.adminPermissions;
    
    const allowedIp = config.adminAllowedIpSubnet !== undefined
      ? (config.adminAllowedIpSubnet && config.adminAllowedIpSubnet.trim().length > 0 ? config.adminAllowedIpSubnet.trim() : null)
      : existing.adminAllowedIpSubnet;

    const reqMfa = config.adminRequireMfa !== undefined
      ? (config.adminRequireMfa ? 1 : 0)
      : (existing.adminRequireMfa ?? 0);

    const status = config.adminStatus !== undefined
      ? config.adminStatus
      : (existing.adminStatus || 'active');

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users 
      SET adminPermissions = ?,
          adminAllowedIpSubnet = ?,
          adminRequireMfa = ?,
          adminStatus = ?,
          updatedAt = ?
      WHERE id = ?
    `).run(permissionsJson, allowedIp, reqMfa, status, now, userId);
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const userStore: UserStore = new SqliteUserStore();
