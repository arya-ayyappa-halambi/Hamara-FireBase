// ─────────────────────────────────────────────────────────────────────────────
//  src/store/user.store.ts
//  SQLite-backed user store for AegisDB.
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
}

// ── SQLite Implementation ──────────────────────────────────────────────────────

interface RawUserRow {
  id: string;
  email: string;
  emailHash: string;
  name: string;
  passwordHash: string;
  isSuperAdmin: number;
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

  return {
    ...row,
    email,
    name,
    mfaSecret,
    isSuperAdmin: Boolean(row.isSuperAdmin),
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
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const userStore: UserStore = new SqliteUserStore();
