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

const ARGON2_OPTIONS: any = {
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
  return (argon2.hash(plaintext, ARGON2_OPTIONS) as unknown) as string;
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

export async function googleLoginUser(email: string, name: string): Promise<AuthResponseData> {
  const normalizedEmail = email.toLowerCase().trim();
  let user = await userStore.findByEmail(normalizedEmail);
  let isNewUser = false;

  if (!user) {
    // Auto-register the Google user with a random un-guessable password
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(randomPassword);
    const now = new Date();
    
    const newUser: User = {
      id: uuidv4(),
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      isSuperAdmin: false,
      createdAt: now,
      updatedAt: now,
    };

    user = await userStore.create(newUser);
    isNewUser = true;

    try {
      projectService.createProject(user.id, 'Default Project');
    } catch (e) { /* Ignore if project creation fails */ }
  }

  const token = generateToken(user);
  const refreshToken = await issueRefreshToken(user.id);

  return { user: toPublicUser(user), token, refreshToken, requiresPasswordSetup: isNewUser };
}

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

export async function setInitialPassword(userId: string, newPassword: string): Promise<boolean> {
  if (!newPassword || newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters long.', 400);
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw new AppError('User not found.', 404);

  // Directly hash and update without requiring old password
  const newHash = await hashPassword(newPassword);

  db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?')
    .run(newHash, new Date().toISOString(), userId);
    
  return true;
}

export async function updateUserProfile(userId: string, name: string, email?: string, currentPassword?: string): Promise<any> {
  if (!name || name.trim().length === 0) {
    throw new AppError('Name cannot be empty.', 400);
  }

  const db = getDb();
  const user = db.prepare('SELECT id, email, passwordHash FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw new AppError('User not found.', 404);

  const cleanName = name.trim();
  let cleanEmail = user.email;

  if (email && email.trim() !== '' && email.trim() !== user.email) {
    cleanEmail = email.trim().toLowerCase();
    
    // Require current password for email changes
    if (!currentPassword) {
      throw new AppError('Current password is required to change email address.', 400);
    }
    
    // Verify password
    const argon2 = await import('argon2');
    const isValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!isValid) {
      throw new AppError('Incorrect current password.', 401);
    }

    // Check uniqueness
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, userId);
    if (existing) {
      throw new AppError('Email address is already in use by another account.', 409);
    }
  }

  db.prepare('UPDATE users SET name = ?, email = ?, updatedAt = ? WHERE id = ?')
    .run(cleanName, cleanEmail, new Date().toISOString(), userId);
  
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

// ── Password Recovery ─────────────────────────────────────────────────────────

import nodemailer from 'nodemailer';

export async function requestPasswordReset(email: string): Promise<void> {
  const db = getDb();
  const pepper = process.env.EMAIL_HASH_PEPPER;
  if (!pepper) throw new AppError('Server misconfiguration: missing EMAIL_HASH_PEPPER.', 500);

  const emailHash = crypto.createHmac('sha256', pepper).update(email.toLowerCase()).digest('hex');
  const user = db.prepare('SELECT * FROM users WHERE emailHash = ?').get(emailHash) as any;

  // To prevent enumeration, silently succeed if user doesn't exist
  if (!user) return;

  // Check SMTP Configuration
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    FRONTEND_URL
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn(`[AUTH] Password reset requested for ${email}, but SMTP is not configured in .env`);
    return;
  }

  // Generate JWT Token (15m expiry)
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new AppError('Server misconfiguration: missing JWT_SECRET.', 500);

  const token = jwt.sign(
    { sub: user.id, type: 'password_reset' },
    jwtSecret,
    { expiresIn: '15m' }
  );

  // Create Reset Link
  const origin = FRONTEND_URL || 'http://localhost:3000';
  const resetLink = `${origin}/reset-password?token=${token}`;

  // Send Email
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_PORT === '465',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: SMTP_FROM || '"AegisDB" <noreply@aegisdb.dev>',
      to: email,
      subject: 'Password Reset Request - AegisDB',
      text: `You requested a password reset. Click the link below to set a new password.\n\n${resetLink}\n\nIf you did not request this, please ignore this email. This link will expire in 15 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your AegisDB account.</p>
          <p>Click the button below to set a new password. This link will expire in 15 minutes.</p>
          <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>If you did not request this, please safely ignore this email.</p>
        </div>
      `
    });
  } catch (err) {
    console.error('[AUTH] Failed to send password reset email:', err);
    // Do not throw to maintain anti-enumeration
  }
}

export async function executePasswordReset(token: string, newPassword: string): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new AppError('Server misconfiguration: missing JWT_SECRET.', 500);

  try {
    const decoded = jwt.verify(token, jwtSecret) as any;
    if (decoded.type !== 'password_reset') {
      throw new AppError('Invalid token type', 400);
    }

    const db = getDb();
    const userId = decoded.sub;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) throw new AppError('Invalid token', 400);

    const newPasswordHash = await argon2.hash(newPassword);

    const stmt = db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?');
    stmt.run(newPasswordHash, new Date().toISOString(), userId);

  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Reset token has expired. Please request a new one.', 400);
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid reset token.', 400);
    }
    throw err;
  }
}

/**
 * GDPR Article 20 / CCPA Data Portability: Export full developer profile and project summaries.
 */
export async function exportDeveloperData(userId: string): Promise<Record<string, any>> {
  const db = getDb();
  const user = db.prepare('SELECT id, email, name, isSuperAdmin, createdAt, updatedAt, mfaEnabled FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw new AppError('User not found', 404);

  const projects = db.prepare('SELECT id, name, createdAt, updatedAt, authConfig FROM projects WHERE ownerId = ?').all(userId) as any[];
  const projectSummaries: any[] = [];

  for (const proj of projects) {
    const collections = db.prepare('SELECT name FROM collections WHERE projectId = ?').all(proj.id) as any[];
    const docCount = db.prepare('SELECT COUNT(*) as count FROM documents WHERE projectId = ?').get(proj.id) as any;
    const assetCount = db.prepare('SELECT COUNT(*) as count FROM assets WHERE projectId = ?').get(proj.id) as any;
    const projectUsersCount = db.prepare('SELECT COUNT(*) as count FROM project_users WHERE projectId = ?').get(proj.id) as any;

    projectSummaries.push({
      id: proj.id,
      name: proj.name,
      createdAt: proj.createdAt,
      updatedAt: proj.updatedAt,
      collections: collections.map(c => c.name),
      documentCount: docCount?.count || 0,
      assetCount: assetCount?.count || 0,
      projectUsersCount: projectUsersCount?.count || 0,
    });
  }

  return {
    exportDate: new Date().toISOString(),
    compliance: 'GDPR Article 20 / CCPA § 1798.130 Data Portability',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: !!user.isSuperAdmin,
      mfaEnabled: !!user.mfaEnabled,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    projects: projectSummaries,
  };
}

/**
 * GDPR Article 17 / CCPA § 1798.105: Irreversible Account Deletion & Right to Erasure.
 * Securely cascades through all owned projects, data encryption keys, documents, assets, and active sessions.
 */
export async function deleteDeveloperAccount(userId: string, password: string, totpCode?: string): Promise<{ success: boolean; message: string }> {
  const db = getDb();
  const user = db.prepare('SELECT id, email, emailHash, passwordHash, mfaEnabled, mfaSecret, isSuperAdmin FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw new AppError('User not found', 404);

  // 1. Verify Password
  const isPasswordValid = await argon2.verify(user.passwordHash, password);
  if (!isPasswordValid) throw new AppError('Invalid account password.', 401);

  // 2. Verify MFA if enabled
  if (user.mfaEnabled === 1) {
    if (!totpCode || !user.mfaSecret) {
      throw new AppError('MFA verification required: Please provide your 6-digit TOTP code to confirm account deletion.', 400, { mfaRequired: true });
    }
    const { totpService } = await import('../services/totp.service');
    const isValidTotp = totpService.verifyCode(user.mfaSecret, totpCode);
    if (!isValidTotp) throw new AppError('Invalid TOTP verification code.', 401, { mfaRequired: true });
  }

  // 3. Safety Check: If user is the ONLY Super Admin, require at least one other Super Admin before deletion
  if (user.isSuperAdmin === 1) {
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE isSuperAdmin = 1').get() as any;
    if (adminCount?.count <= 1) {
      const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
      if (totalUsers?.count > 1) {
        throw new AppError('Cannot delete account: You are the only Super Admin. Please designate another Super Admin first.', 400);
      }
    }
  }

  // 4. Atomic Cascading Deletion
  const deleteTx = db.transaction(() => {
    const projects = db.prepare('SELECT id FROM projects WHERE ownerId = ?').all(userId) as { id: string }[];
    
    for (const proj of projects) {
      // Delete asset files from disk if local storage
      try {
        const assets = db.prepare('SELECT storedName FROM assets WHERE projectId = ?').all(proj.id) as { storedName: string }[];
        const fs = require('fs');
        const path = require('path');
        const uploadDir = path.join(process.cwd(), 'uploads');
        for (const asset of assets) {
          const filePath = path.join(uploadDir, asset.storedName);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (err) {
        console.warn(`[Erasure] Could not delete physical assets for project ${proj.id}:`, err);
      }

      // Purge all project-linked tables
      db.prepare('DELETE FROM assets WHERE projectId = ?').run(proj.id);
      db.prepare('DELETE FROM documents WHERE projectId = ?').run(proj.id);
      db.prepare('DELETE FROM collections WHERE projectId = ?').run(proj.id);
      db.prepare('DELETE FROM deployments WHERE projectId = ?').run(proj.id);
      db.prepare('DELETE FROM webhooks WHERE projectId = ?').run(proj.id);
      db.prepare('DELETE FROM project_users WHERE projectId = ?').run(proj.id);
      db.prepare('DELETE FROM project_keys WHERE projectId = ?').run(proj.id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(proj.id);
    }

    // Delete refresh tokens and user
    db.prepare('DELETE FROM refresh_tokens WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    // Write Anonymized Audit Tombstone (Zero PII - GDPR Compliant Proof of Erasure)
    const anonymizedActorHash = crypto.createHash('sha256').update(userId + (process.env.JWT_SECRET || 'aegis-salt')).digest('hex');
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, actorId, actorEmail, actorEmailHash, actionType, projectId, ipAddress, status, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      new Date().toISOString(),
      `DELETED_USER_${anonymizedActorHash.substring(0, 12)}`,
      'REDACTED_ERASED',
      anonymizedActorHash,
      'DEVELOPER_ACCOUNT_ERASED',
      null,
      '127.0.0.1',
      'SUCCESS',
      JSON.stringify({
        erasedAt: new Date().toISOString(),
        deletedProjectsCount: projects.length,
        compliance: 'GDPR Article 17 Right to Erasure / CCPA § 1798.105'
      })
    );
  });

  deleteTx();
  return { success: true, message: 'Your account and all associated projects and data have been permanently erased.' };
}

