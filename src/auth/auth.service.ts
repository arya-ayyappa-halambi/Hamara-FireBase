// ─────────────────────────────────────────────────────────────────────────────
//  src/auth/auth.service.ts
//  Core business logic for authentication.
//
//  This layer is intentionally decoupled from Express — no Request/Response
//  objects appear here. It can be tested in isolation or reused across
//  transport layers (REST, WebSocket, gRPC).
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import argon2 from 'argon2';
import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import {
  RegisterDto,
  LoginDto,
  User,
  PublicUser,
  AuthResponseData,
  JwtPayload,
  AppError,
  RefreshTokenRecord,
} from '../types/auth.types';
import { userStore } from '../store/user.store';
import { getDb } from '../db/sqlite.connection';

// ── Argon2id Configuration ────────────────────────────────────────────────────

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MiB
  timeCost: 3,         // 3 iterations
  parallelism: 4,      // 4 parallel threads
};

// ── JWT Configuration ─────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short. Set a strong secret (≥ 32 chars) in your .env file.',
    );
  }
  return secret;
}

function getJwtExpiry(): string {
  return process.env.JWT_EXPIRES_IN ?? '15m'; // Access tokens short-lived (15m)
}

// ── Password Utilities ────────────────────────────────────────────────────────

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}

// ── JWT & Refresh Token Utilities ─────────────────────────────────────────────

import { projectService } from '../project/project.service';

/** Sign and return an access JWT for the given user. */
export function generateToken(user: Pick<User, 'id' | 'email' | 'isSuperAdmin'>): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin ?? false,
  };

  const signOptions: SignOptions = {
    expiresIn: getJwtExpiry() as SignOptions['expiresIn'],
    algorithm: 'HS256',
  };

  return jwt.sign(payload, getJwtSecret(), signOptions);
}

/** Compute SHA-256 hash of a raw token string (prevents storing raw tokens in DB). */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issue a cryptographically secure random refresh token (selector.validator format)
 * and persist the Argon2id hash of the validator in SQLite.
 * Default validity: 7 days.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const id = uuidv4();
  const validator = crypto.randomBytes(32).toString('hex');
  const tokenHash = await argon2.hash(validator, ARGON2_OPTIONS);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const db = getDb();
  db.prepare(`
    INSERT INTO refresh_tokens (id, userId, tokenHash, expiresAt, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, tokenHash, expiresAt, now.toISOString());

  // Return the compound raw token to the client
  return `${id}.${validator}`;
}

// ── Public User Projection ────────────────────────────────────────────────────

function toPublicUser(user: User): PublicUser {
  const { passwordHash: _omit, ...publicUser } = user;
  return publicUser;
}

// ── Auth Business Logic ───────────────────────────────────────────────────────

/** Register a new user and issue both access JWT & refresh token. */
export async function registerUser(dto: RegisterDto): Promise<AuthResponseData> {
  const { email, password, name } = dto;

  const existing = await userStore.findByEmail(email);
  if (existing) {
    throw new AppError('An account with this email already exists.', 409);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const newUser: User = {
    id: uuidv4(),
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash,
    isSuperAdmin: false,
    createdAt: now,
    updatedAt: now,
  };

  const savedUser = await userStore.create(newUser);

  // Auto-create "Default Project" and API Key for new user
  try {
    projectService.createProject(savedUser.id, 'Default Project');
  } catch (e) { /* Ignore if project creation fails */ }

  const token = generateToken(savedUser);
  const refreshToken = await issueRefreshToken(savedUser.id);

  return { user: toPublicUser(savedUser), token, refreshToken };
}

/** Authenticate an existing user and issue both access JWT & refresh token. */
export async function loginUser(dto: LoginDto & { totpCode?: string }): Promise<AuthResponseData> {
  const { email, password, totpCode } = dto;

  const DUMMY_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$dummysaltdummysalt$dummyhashvalueplaceholderXXXX';

  const user = await userStore.findByEmail(email);
  const hashToVerify = user ? user.passwordHash : DUMMY_HASH;

  const passwordValid = await argon2.verify(hashToVerify, password);

  if (!user || !passwordValid) {
    throw new AppError('Invalid email or password.', 401);
  }

  // TOTP Multi-Factor Authentication Check
  if (user.mfaEnabled === 1) {
    if (!totpCode || !user.mfaSecret) {
      throw new AppError('MFA verification required. Please provide a 6-digit TOTP code.', 403, { mfaRequired: true, email: user.email });
    }
    const { totpService } = await import('../services/totp.service');
    const isValidTotp = totpService.verifyCode(user.mfaSecret, totpCode);
    if (!isValidTotp) {
      throw new AppError('Invalid TOTP verification code.', 401, { mfaRequired: true });
    }
  }

  const token = generateToken(user);
  const refreshToken = await issueRefreshToken(user.id);

  return { user: toPublicUser(user), token, refreshToken };
}

export async function setupMfa(userId: string): Promise<{ secret: string; otpAuthUrl: string }> {
  const db = getDb();
  const user = db.prepare('SELECT id, email, mfaEnabled, mfaSecret FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw new AppError('User not found.', 404);

  // If MFA is already enabled, we shouldn't overwrite the secret here
  // because it would break their existing authenticator app configuration
  if (user.mfaEnabled === 1 && user.mfaSecret) {
    throw new AppError('MFA is already enabled. Please disable it first before setting it up again.', 400);
  }

  const { totpService } = await import('../services/totp.service');
  const secret = totpService.generateSecret();
  const otpAuthUrl = totpService.generateOtpAuthUrl(user.email, secret);

  // Store temporary unconfirmed secret
  db.prepare('UPDATE users SET mfaSecret = ? WHERE id = ?').run(secret, userId);

  return { secret, otpAuthUrl };
}

export async function verifyAndEnableMfa(userId: string, totpCode: string): Promise<boolean> {
  const db = getDb();
  const user = db.prepare('SELECT id, email, mfaSecret FROM users WHERE id = ?').get(userId) as any;
  if (!user || !user.mfaSecret) throw new AppError('MFA setup not initiated.', 400);

  const { totpService } = await import('../services/totp.service');
  const isValid = totpService.verifyCode(user.mfaSecret, totpCode);
  if (!isValid) throw new AppError('Invalid TOTP code provided.', 400);

  db.prepare('UPDATE users SET mfaEnabled = 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), userId);
  return true;
}

export async function disableMfa(userId: string, password: string, totpCode: string): Promise<boolean> {
  const db = getDb();
  const user = db.prepare('SELECT id, email, passwordHash, mfaSecret, mfaEnabled FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw new AppError('User not found.', 404);
  if (user.mfaEnabled !== 1) throw new AppError('MFA is not enabled for this account.', 400);

  // 1. Verify password for security
  const passwordValid = await argon2.verify(user.passwordHash, password);
  if (!passwordValid) throw new AppError('Security check failed: Incorrect account password.', 401);

  // 2. Verify 6-digit TOTP code
  const { totpService } = await import('../services/totp.service');
  const isValidTotp = totpService.verifyCode(user.mfaSecret, totpCode);
  if (!isValidTotp) throw new AppError('Security check failed: Invalid 6-digit TOTP code.', 400);

  // 3. Clear secret and disable MFA
  db.prepare('UPDATE users SET mfaEnabled = 0, mfaSecret = NULL, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), userId);
  return true;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  totpCode?: string,
): Promise<boolean> {
  if (!newPassword || newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters long.', 400);
  }

  const db = getDb();
  const user = db.prepare('SELECT id, email, passwordHash, mfaSecret, mfaEnabled FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw new AppError('User not found.', 404);

  // 1. Verify current password
  const passwordValid = await argon2.verify(user.passwordHash, currentPassword);
  if (!passwordValid) throw new AppError('Incorrect current password.', 401);

  // 2. Mandatory TOTP check if MFA enabled
  if (user.mfaEnabled === 1) {
    if (!totpCode) {
      throw new AppError('TOTP verification mandatory: 6-digit TOTP code is required to change password.', 400, { mfaRequired: true });
    }
    const { totpService } = await import('../services/totp.service');
    const isValidTotp = totpService.verifyCode(user.mfaSecret, totpCode);
    if (!isValidTotp) {
      throw new AppError('Security check failed: Invalid 6-digit TOTP code.', 400);
    }
  }

  // 3. Hash new password and update DB
  const newPasswordHash = await argon2.hash(newPassword);
  db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?').run(newPasswordHash, new Date().toISOString(), userId);
  return true;
}

export async function updateUserProfile(userId: string, name: string): Promise<any> {
  if (!name || name.trim().length === 0) {
    throw new AppError('Name cannot be empty.', 400);
  }

  const db = getDb();
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw new AppError('User not found.', 404);

  const cleanName = name.trim();
  db.prepare('UPDATE users SET name = ?, updatedAt = ? WHERE id = ?').run(cleanName, new Date().toISOString(), userId);
  
  const updatedUser = await userStore.findById(userId);
  return updatedUser ? toPublicUser(updatedUser) : null;
}

/**
 * Refresh an access token using a valid refresh token.
 * Performs refresh token rotation: revokes the used refresh token and issues a new pair.
 */
export async function refreshAccessToken(refreshToken: string): Promise<AuthResponseData> {
  const parts = refreshToken.split('.');
  if (parts.length !== 2) {
    throw new AppError('Invalid or expired refresh token.', 401);
  }
  const [id, validator] = parts;

  const db = getDb();
  const record = db.prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(id) as RefreshTokenRecord | undefined;

  if (!record) {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  // Verify the validator part against the Argon2id hash stored in the DB
  const valid = await argon2.verify(record.tokenHash, validator);
  if (!valid) {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  // Check expiration
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(record.id);
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  const user = await userStore.findById(record.userId);
  if (!user) {
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(record.id);
    throw new AppError('User account not found.', 401);
  }

  // Token rotation: Revoke old refresh token
  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(record.id);

  // Issue new access token + new refresh token
  const newAccessToken = generateToken(user);
  const newRefreshToken = await issueRefreshToken(user.id);

  return {
    user: toPublicUser(user),
    token: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Revoke a refresh token (Logout).
 * Deletes matching refresh token from SQLite.
 */
export async function logoutUser(refreshToken: string): Promise<void> {
  const parts = refreshToken.split('.');
  if (parts.length !== 2) return;
  const [id] = parts;

  const db = getDb();
  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(id);
}
