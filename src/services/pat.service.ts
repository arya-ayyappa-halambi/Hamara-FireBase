// ─────────────────────────────────────────────────────────────────────────────
//  src/services/pat.service.ts
//  AegisDB — Scoped Personal Access Tokens (PATs) for Developers & CI/CD
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';

export type PatScope =
  | 'db:read'
  | 'db:write'
  | 'storage:read'
  | 'storage:write'
  | 'profile:read'
  | 'collections:manage'
  | 'projects:read'
  | '*';

export interface PatRecord {
  id: string;
  userId: string;
  name: string;
  tokenPrefix: string;
  scopes: PatScope[];
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  rawToken?: string;
}

class PatService {
  private static instance: PatService;

  private constructor() {}

  public static getInstance(): PatService {
    if (!PatService.instance) {
      PatService.instance = new PatService();
    }
    return PatService.instance;
  }

  /**
   * Generates a new Personal Access Token with specific scopes & TTL
   */
  public createPat(params: {
    userId: string;
    name: string;
    scopes: PatScope[];
    expirationDays?: number; // default 30 days, 0 = never
  }): PatRecord {
    const { userId, name, scopes, expirationDays = 30 } = params;

    if (!name || !name.trim()) {
      throw new AppError('Token name is required.', 400);
    }
    if (!scopes || scopes.length === 0) {
      throw new AppError('At least one scope must be selected.', 400);
    }

    const randomSecret = crypto.randomBytes(24).toString('hex');
    const rawToken = `pat_${randomSecret}`;
    const tokenPrefix = rawToken.substring(0, 10) + '••••••••';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const id = `pat_${uuidv4()}`;
    const now = new Date();
    const expiresAt = expirationDays > 0 ? new Date(now.getTime() + expirationDays * 86400000).toISOString() : null;
    const createdAt = now.toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO user_pats (id, userId, name, tokenHash, tokenPrefix, scopes, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, name.trim(), tokenHash, tokenPrefix, JSON.stringify(scopes), expiresAt, createdAt);

    return {
      id,
      userId,
      name: name.trim(),
      tokenPrefix,
      scopes,
      expiresAt,
      createdAt,
      rawToken // Only returned on creation
    };
  }

  /**
   * Validates a Personal Access Token and verifies requested scope
   */
  public validatePat(rawToken: string, requiredScope?: PatScope): { userId: string; scopes: PatScope[]; patId: string } {
    if (!rawToken || !rawToken.startsWith('pat_')) {
      throw new AppError('Invalid Personal Access Token format.', 401);
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const db = getDb();

    const pat = db.prepare('SELECT * FROM user_pats WHERE tokenHash = ?').get(tokenHash) as any;
    if (!pat) {
      throw new AppError('Personal Access Token not recognized or revoked.', 401);
    }

    if (pat.expiresAt && new Date(pat.expiresAt) < new Date()) {
      throw new AppError('Personal Access Token has expired.', 401);
    }

    const scopes: PatScope[] = JSON.parse(pat.scopes || '[]');

    if (requiredScope && !scopes.includes('*') && !scopes.includes(requiredScope)) {
      throw new AppError(`Forbidden: Personal Access Token lacks required scope "${requiredScope}".`, 403, {
        requiredScope,
        grantedScopes: scopes
      });
    }

    // Update lastUsedAt asynchronously
    const now = new Date().toISOString();
    db.prepare('UPDATE user_pats SET lastUsedAt = ? WHERE id = ?').run(now, pat.id);

    return {
      userId: pat.userId,
      scopes,
      patId: pat.id
    };
  }

  /**
   * List all PATs for a user
   */
  public listUserPats(userId: string): PatRecord[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM user_pats WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      tokenPrefix: r.tokenPrefix,
      scopes: JSON.parse(r.scopes || '[]'),
      expiresAt: r.expiresAt,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt
    }));
  }

  /**
   * Revoke a PAT
   */
  public revokePat(userId: string, patId: string): boolean {
    const db = getDb();
    const info = db.prepare('DELETE FROM user_pats WHERE id = ? AND userId = ?').run(patId, userId);
    return info.changes > 0;
  }
}

export const patService = PatService.getInstance();
