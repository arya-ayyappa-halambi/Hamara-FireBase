// ─────────────────────────────────────────────────────────────────────────────
//  src/services/token-family.service.ts
//  AegisDB — Refresh Token Family Rotation & Reuse Detection Service.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { generateToken } from '../auth/auth.service';
import { userStore } from '../store/user.store';
import { AppError } from '../types/auth.types';

export interface TokenFamilyRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  isSpent: number; // 0 = active, 1 = spent
  isRevoked: number; // 0 = valid, 1 = revoked
  expiresAt: string;
  createdAt: string;
}

export interface RotateTokenResult {
  accessToken: string;
  refreshToken: string;
  familyId: string;
  userId: string;
}

export class TokenFamilyService {
  /** Compute SHA-256 hash of a raw refresh token string */
  public hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Creates a new refresh token within a new or existing Token Family.
   */
  public createTokenFamily(
    userId: string,
    existingFamilyId?: string,
    ttlMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days default
  ): { refreshToken: string; tokenHash: string; familyId: string; expiresAt: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const familyId = existingFamilyId || uuidv4();
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO refresh_tokens (id, userId, tokenHash, familyId, isSpent, isRevoked, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, 0, 0, ?, ?)
    `).run(id, userId, tokenHash, familyId, expiresAt, createdAt);

    return { refreshToken: rawToken, tokenHash, familyId, expiresAt };
  }

  /**
   * Rotates a refresh token:
   * 1. Verifies token validity & revocation.
   * 2. DETECTS REUSE: If token is already spent (`isSpent === 1`), invalidates ALL tokens in the family!
   * 3. Marks current token spent and issues a new refresh token within the same familyId.
   */
  public async rotateRefreshToken(rawRefreshToken: string): Promise<RotateTokenResult> {
    if (!rawRefreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const db = getDb();

    const tokenRecord = db.prepare(`
      SELECT * FROM refresh_tokens WHERE tokenHash = ?
    `).get(tokenHash) as TokenFamilyRecord | undefined;

    if (!tokenRecord) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Check if token or family is revoked
    if (tokenRecord.isRevoked === 1) {
      throw new AppError('Refresh token has been revoked', 401);
    }

    // Check if token is expired
    if (new Date(tokenRecord.expiresAt) < new Date()) {
      throw new AppError('Refresh token has expired', 401);
    }

    // 🚨 REUSE DETECTION LOGIC 🚨
    // If a token marked as spent is presented again, someone is replaying a stolen token!
    if (tokenRecord.isSpent === 1) {
      // Revoke the entire Token Family immediately!
      this.revokeTokenFamily(tokenRecord.familyId);
      throw new AppError(
        'SECURITY ALERT: Refresh token reuse detected! All session tokens in this family have been invalidated.',
        401,
        'TOKEN_REUSE_DETECTED'
      );
    }

    // Mark current token as spent
    db.prepare(`
      UPDATE refresh_tokens SET isSpent = 1 WHERE id = ?
    `).run(tokenRecord.id);

    // Fetch user to issue new Access Token
    const user = await userStore.findById(tokenRecord.userId);
    if (!user) {
      throw new AppError('User account no longer exists', 401);
    }

    // Issue new short-lived Access Token
    const accessToken = generateToken(user);

    // Issue new Refresh Token within the SAME family
    const newSession = this.createTokenFamily(user.id, tokenRecord.familyId);

    return {
      accessToken,
      refreshToken: newSession.refreshToken,
      familyId: tokenRecord.familyId,
      userId: user.id,
    };
  }

  /**
   * Revokes all tokens in a Token Family (triggered upon reuse detection or manual security action).
   */
  public revokeTokenFamily(familyId: string): void {
    if (!familyId) return;
    const db = getDb();
    db.prepare(`
      UPDATE refresh_tokens SET isRevoked = 1 WHERE familyId = ?
    `).run(familyId);
  }

  /**
   * Revokes all refresh tokens for a user (global logout from all devices).
   */
  public revokeAllUserTokens(userId: string): void {
    const db = getDb();
    db.prepare(`
      UPDATE refresh_tokens SET isRevoked = 1 WHERE userId = ?
    `).run(userId);
  }

  /**
   * Helper: Get token family information by raw token
   */
  public getTokenFamilyRecord(rawRefreshToken: string): TokenFamilyRecord | null {
    const tokenHash = this.hashToken(rawRefreshToken);
    const db = getDb();
    const row = db.prepare(`SELECT * FROM refresh_tokens WHERE tokenHash = ?`).get(tokenHash);
    return (row as TokenFamilyRecord) || null;
  }
}

export const tokenFamilyService = new TokenFamilyService();
