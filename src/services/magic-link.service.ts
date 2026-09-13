// ─────────────────────────────────────────────────────────────────────────────
//  src/services/magic-link.service.ts
//  FlareBase — Passwordless Magic Link & 6-Digit Email OTP Login Service
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { envelopeEncryptionService } from './envelope-encryption.service';
import { AppError } from '../types/auth.types';

export interface MagicLinkRecord {
  id: string;
  userId: string;
  email: string;
  token: string;
  otpCode: string;
  expiresAt: string;
  isUsed: boolean;
  createdAt: string;
}

class MagicLinkService {
  private static instance: MagicLinkService;

  private constructor() {}

  public static getInstance(): MagicLinkService {
    if (!MagicLinkService.instance) {
      MagicLinkService.instance = new MagicLinkService();
    }
    return MagicLinkService.instance;
  }

  /**
   * Generates a single-use Magic Link cryptographic token & 6-digit numeric OTP
   */
  public generateMagicAuth(email: string, ttlMinutes = 15): { magicToken: string; otpCode: string; expiresAt: string; userId: string } {
    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();
    const emailHash = envelopeEncryptionService.hashBlindIndex(cleanEmail);

    // Verify user exists by emailHash blind index or create unverified record
    let user = db.prepare('SELECT id FROM users WHERE emailHash = ?').get(emailHash) as any;
    let userId: string;

    if (!user) {
      // Auto-provision user on first magic-link request
      userId = uuidv4();
      const now = new Date().toISOString();
      const encryptedEmail = JSON.stringify(envelopeEncryptionService.encryptField(cleanEmail, 'SYSTEM'));
      const encryptedName = JSON.stringify(envelopeEncryptionService.encryptField(cleanEmail.split('@')[0], 'SYSTEM'));
      const randomPass = crypto.randomBytes(32).toString('hex');

      db.prepare(`
        INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      `).run(userId, encryptedEmail, emailHash, encryptedName, `magic_init_${randomPass}`, now, now);
    } else {
      userId = user.id;
    }

    const rawToken = `magic_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // 6-digit cryptographic numeric OTP
    const otpNumber = crypto.randomInt(100000, 999999);
    const otpCode = String(otpNumber);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
    const id = `mlk_${uuidv4()}`;

    // Invalidate prior pending tokens for this email
    db.prepare('UPDATE magic_link_tokens SET isUsed = 1 WHERE email = ? AND isUsed = 0').run(cleanEmail);

    db.prepare(`
      INSERT INTO magic_link_tokens (id, userId, email, tokenHash, otpCode, expiresAt, isUsed, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, userId, cleanEmail, tokenHash, otpCode, expiresAt, now.toISOString());

    return {
      magicToken: rawToken,
      otpCode,
      expiresAt,
      userId
    };
  }

  /**
   * Verifies a Magic Link Token or 6-digit OTP code, burns it, and returns the userId
   */
  public verifyMagicAuth(params: { token?: string; otpCode?: string; email?: string }): { userId: string; email: string } {
    const { token, otpCode, email } = params;
    const db = getDb();
    let record: any;

    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      record = db.prepare('SELECT * FROM magic_link_tokens WHERE tokenHash = ?').get(tokenHash);
    } else if (otpCode && email) {
      const cleanEmail = email.trim().toLowerCase();
      record = db.prepare('SELECT * FROM magic_link_tokens WHERE email = ? AND otpCode = ? ORDER BY createdAt DESC LIMIT 1').get(cleanEmail, otpCode.trim());
    } else {
      throw new AppError('Either magic link token or (email + 6-digit code) is required.', 400);
    }

    if (!record) {
      throw new AppError('Invalid or expired magic authentication code.', 401);
    }

    if (record.isUsed === 1) {
      throw new AppError('This magic login token or code has already been used.', 401);
    }

    if (new Date(record.expiresAt) < new Date()) {
      throw new AppError('This magic login token or code has expired. Please request a new one.', 401);
    }

    // Auto-Burn token immediately (Single-Use Invariant)
    const now = new Date().toISOString();
    db.prepare('UPDATE magic_link_tokens SET isUsed = 1, usedAt = ? WHERE id = ?').run(now, record.id);

    return {
      userId: record.userId,
      email: record.email
    };
  }
}

export const magicLinkService = MagicLinkService.getInstance();
