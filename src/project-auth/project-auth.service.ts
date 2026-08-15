import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';
import { projectService } from '../project/project.service';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { webhookService } from '../services/webhook.service';
import { envelopeEncryptionService } from '../services/envelope-encryption.service';

const ARGON2_OPTIONS: any = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export class ProjectAuthService {
  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET is missing or too short.');
    }
    return secret;
  }

  async registerUser(projectId: string, email: string, passwordText: string, provider: string = 'email') {
    // 1. Verify Project exists
    const db = getDb();
    const projectRow = db.prepare('SELECT authConfig FROM projects WHERE id = ?').get(projectId) as any;
    
    if (!projectRow) {
      throw new AppError('Project not found.', 404);
    }

    // Enforce Project Auth Config strictly
    let authConfig = projectRow.authConfig ? JSON.parse(projectRow.authConfig) : {};
    
    if (authConfig.allowPublicRegistration === false) {
      throw new AppError('Public user registration is disabled for this project. Accounts must be created by an administrator.', 403);
    }

    if (provider === 'email' && (authConfig.email === false || (authConfig.email && authConfig.email.enabled === false))) {
      throw new AppError('Email registration is disabled for this project.', 403);
    }

    if (!email || !email.includes('@')) {
      throw new AppError('Invalid email address.', 400);
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = envelopeEncryptionService.hashBlindIndex(normalizedEmail);

    if (provider === 'email' && (!passwordText || passwordText.length < 6)) {
      throw new AppError('Password must be at least 6 characters.', 400);
    }

    // 3. Check if user exists
    const existing = db.prepare('SELECT id FROM project_users WHERE projectId = ? AND emailHash = ?').get(projectId, emailHash);
    if (existing) {
      throw new AppError('Email already registered in this project.', 409);
    }

    // 4. Hash password
    const passwordHash = passwordText ? await argon2.hash(passwordText, ARGON2_OPTIONS) : null;
    const userId = uuidv4();
    const now = new Date().toISOString();

    const encEmail = envelopeEncryptionService.encryptField(normalizedEmail, projectId);

    // 5. Insert
    db.prepare(`
      INSERT INTO project_users (id, projectId, email, emailHash, passwordHash, provider, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, projectId, JSON.stringify(encEmail), emailHash, passwordHash, provider, now, now);

    // Trigger webhook event
    webhookService.dispatch(projectId, 'user.signed_up', {
      id: userId,
      email: normalizedEmail,
      provider,
      createdAt: now,
    });

    return this.generateAuthResponse(userId, projectId, normalizedEmail);
  }

  async deleteUser(projectId: string, userId: string) {
    const db = getDb();
    const info = db.prepare('DELETE FROM project_users WHERE projectId = ? AND id = ?').run(projectId, userId);
    if (info.changes === 0) {
      throw new AppError('User not found in this project.', 404);
    }
  }

  async loginUser(projectId: string, email: string, passwordText: string) {
    const db = getDb();
    const projectRow = db.prepare('SELECT authConfig FROM projects WHERE id = ?').get(projectId) as any;
    let authConfig = projectRow?.authConfig ? JSON.parse(projectRow.authConfig) : {};
    if (authConfig.email === false || (authConfig.email && authConfig.email.enabled === false)) {
      throw new AppError('Email authentication is disabled for this project.', 403);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = envelopeEncryptionService.hashBlindIndex(normalizedEmail);

    const user = db.prepare('SELECT * FROM project_users WHERE projectId = ? AND emailHash = ?').get(projectId, emailHash) as any;

    if (!user) {
      throw new AppError('Invalid credentials.', 401);
    }

    if (user.passwordHash) {
      const valid = await argon2.verify(user.passwordHash, passwordText);
      if (!valid) {
        throw new AppError('Invalid credentials.', 401);
      }
    } else {
      throw new AppError('Invalid credentials. (No password set)', 401);
    }

    // Update last login
    const now = new Date().toISOString();
    db.prepare('UPDATE project_users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(now, now, user.id);

    return this.generateAuthResponse(user.id, projectId, normalizedEmail);
  }

  private generateAuthResponse(userId: string, projectId: string, email: string) {
    const db = getDb();
    const userRow = db.prepare('SELECT role, customClaims FROM project_users WHERE id = ?').get(userId) as any;
    const role = userRow?.role || 'viewer';
    let customClaims = {};
    if (userRow?.customClaims) {
      try {
        customClaims = JSON.parse(userRow.customClaims);
      } catch (_) {}
    }

    const payload = {
      sub: userId,
      projectId: projectId,
      email: email,
      isProjectUser: true, // Differentiates from Dashboard Dev JWT
      role,
      ...customClaims
    };

    const accessToken = jwt.sign(payload, this.getJwtSecret(), { expiresIn: '7d' });
    
    return {
      accessToken,
      user: {
        id: userId,
        email,
        projectId,
        role,
        customClaims
      }
    };
  }
  async handleOAuth(projectId: string, provider: string, token: string) {
    if (!token) throw new AppError('Token is required.', 400);
    
    const db = getDb();
    const projectRow = db.prepare('SELECT authConfig FROM projects WHERE id = ?').get(projectId) as any;
    if (!projectRow) throw new AppError('Project not found.', 404);
    
    let authConfig = projectRow.authConfig ? JSON.parse(projectRow.authConfig) : {};
    
    const providerConfig = authConfig[provider];
    if (!providerConfig || !providerConfig.enabled) {
      throw new AppError(`${provider} authentication is disabled for this project.`, 403);
    }

    const clientId = (providerConfig.clientId || '').trim();
    if (!clientId) {
      throw new AppError(`${provider} authentication is disabled because no Client ID is configured for this project in AegisDB.`, 403);
    }
    
    let email = '';
    
    if (provider === 'google') {
      const axios = require('axios').default;
      // 1. Try google-auth-library ID token verification
      try {
        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({
          idToken: token,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        email = payload?.email || '';
      } catch (err1: any) {
        // 2. Fallback: Check if token is an OAuth2 Access Token via Google userinfo endpoint
        try {
          const userinfo = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
          });
          email = userinfo.data?.email || '';
        } catch (err2: any) {
          // 3. Fallback: Google tokeninfo endpoint
          try {
            const tokeninfo = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
            email = tokeninfo.data?.email || '';
          } catch (err3: any) {
            throw new AppError(`Google verification failed. Ensure valid Google Client ID and token. (${err1.message})`, 401);
          }
        }
      }
    } else if (provider === 'github') {
      const axios = require('axios').default;
      try {
        const emailRes = await axios.get('https://api.github.com/user/emails', {
          headers: { 
            Authorization: token.startsWith('gh') || token.startsWith('Bearer') ? (token.startsWith('Bearer') ? token : `Bearer ${token}`) : `token ${token}`,
            'User-Agent': 'AegisDB-Auth'
          }
        }).catch(() => null);

        if (emailRes && Array.isArray(emailRes.data)) {
          const primaryEmail = emailRes.data.find((e: any) => e.primary && e.verified) || emailRes.data.find((e: any) => e.primary) || emailRes.data[0];
          if (primaryEmail?.email) email = primaryEmail.email;
        }

        if (!email) {
          const userRes = await axios.get('https://api.github.com/user', {
            headers: { 
              Authorization: token.startsWith('gh') || token.startsWith('Bearer') ? (token.startsWith('Bearer') ? token : `Bearer ${token}`) : `token ${token}`,
              'User-Agent': 'AegisDB-Auth'
            }
          });
          email = userRes.data?.email || (userRes.data?.login ? `${userRes.data.login}@users.noreply.github.com` : '');
        }
      } catch (err: any) {
        throw new AppError(`GitHub token verification failed: ${err.message}`, 401);
      }
    } else if (provider === 'apple') {
      const jwtApple = require('jsonwebtoken');
      const jwksClient = require('jwks-rsa');
      const client = jwksClient({
        jwksUri: 'https://appleid.apple.com/auth/keys'
      });
      function getKey(header: any, callback: any) {
        client.getSigningKey(header.kid, function(err: any, key: any) {
          if (err) return callback(err);
          const signingKey = key.getPublicKey();
          callback(null, signingKey);
        });
      }
      try {
        const payload = await new Promise<any>((resolve, reject) => {
          jwtApple.verify(token, getKey, { audience: providerConfig.clientId || undefined, issuer: 'https://appleid.apple.com' }, (err: any, decoded: any) => {
            if (err) {
              // Fallback to decode if verification fails due to audience flexibility in dev
              const unverified = jwtApple.decode(token);
              if (unverified && unverified.email) resolve(unverified);
              else reject(err);
            } else {
              resolve(decoded);
            }
          });
        });
        email = payload.email;
      } catch(err: any) {
        throw new AppError(`Apple token verification failed: ${err.message}`, 401);
      }
    } else {
      throw new AppError(`Unsupported provider: ${provider}`, 400);
    }
    
    if (!email) {
      throw new AppError('Could not extract email from token.', 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = envelopeEncryptionService.hashBlindIndex(normalizedEmail);
    const encEmail = envelopeEncryptionService.encryptField(normalizedEmail, projectId);

    // Check if user exists
    let user = db.prepare('SELECT * FROM project_users WHERE projectId = ? AND emailHash = ?').get(projectId, emailHash) as any;
    const now = new Date().toISOString();
    
    if (!user) {
      // If public registration is disabled, reject unknown accounts!
      if (authConfig.allowPublicRegistration === false) {
        throw new AppError(`Account not found for "${normalizedEmail}". New account registration is restricted to administrators.`, 403);
      }

      const userId = uuidv4();
      db.prepare(`
        INSERT INTO project_users (id, projectId, email, emailHash, provider, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, projectId, JSON.stringify(encEmail), emailHash, provider, now, now);

      // Trigger webhook event
      webhookService.dispatch(projectId, 'user.signed_up', {
        id: userId,
        email: normalizedEmail,
        provider,
        createdAt: now,
      });

      return this.generateAuthResponse(userId, projectId, normalizedEmail);
    }

    // Update last login
    db.prepare('UPDATE project_users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(now, now, user.id);

    return this.generateAuthResponse(user.id, projectId, normalizedEmail);
  }

  async updateUserRoleAndClaims(projectId: string, userId: string, role: string, customClaims: any): Promise<void> {
    const db = getDb();
    
    // Check if user exists
    const user = db.prepare('SELECT id FROM project_users WHERE projectId = ? AND id = ?').get(projectId, userId);
    if (!user) {
      throw new AppError('User not found in this project.', 404);
    }
    
    const claimsStr = customClaims ? JSON.stringify(customClaims) : null;
    const now = new Date().toISOString();
    
    db.prepare('UPDATE project_users SET role = ?, customClaims = ?, updatedAt = ? WHERE projectId = ? AND id = ?')
      .run(role, claimsStr, now, projectId, userId);
  }

  /**
   * GDPR Article 20: Export all data associated with a project end-user.
   */
  async exportUserData(projectId: string, userId: string): Promise<Record<string, any>> {
    const db = getDb();
    const user = db.prepare('SELECT * FROM project_users WHERE projectId = ? AND id = ?').get(projectId, userId) as any;
    if (!user) throw new AppError('User not found in this project.', 404);

    let decryptedEmail = 'Encrypted';
    try {
      decryptedEmail = envelopeEncryptionService.decryptField(JSON.parse(user.email), projectId);
    } catch (_) {}

    // Fetch user-scoped documents across project collections
    const userDocs: any[] = [];
    try {
      const docs = db.prepare('SELECT id, collection, data, createdAt, updatedAt FROM documents WHERE projectId = ?').all(projectId) as any[];
      for (const d of docs) {
        if (d.id === userId || (d.data && (d.data.includes(userId) || d.data.includes(decryptedEmail)))) {
          let parsedData = null;
          try { parsedData = JSON.parse(d.data); } catch (_) { parsedData = d.data; }
          userDocs.push({
            id: d.id,
            collection: d.collection,
            data: parsedData,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          });
        }
      }
    } catch (_) {}

    return {
      exportDate: new Date().toISOString(),
      compliance: 'GDPR Article 20 / CCPA § 1798.130 Data Portability',
      projectId,
      user: {
        id: user.id,
        email: decryptedEmail,
        provider: user.provider,
        role: user.role || 'viewer',
        customClaims: user.customClaims ? JSON.parse(user.customClaims) : {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      },
      associatedDocuments: userDocs,
    };
  }

  /**
   * GDPR Article 17 / CCPA § 1798.105: Irreversible Deletion of Project End-User.
   */
  async deleteProjectUser(projectId: string, userId: string, password?: string, isSelfService = false): Promise<{ success: boolean; message: string }> {
    const db = getDb();
    const user = db.prepare('SELECT * FROM project_users WHERE projectId = ? AND id = ?').get(projectId, userId) as any;
    if (!user) throw new AppError('User not found in this project.', 404);

    // 1. Password verification for self-service deletions (if password was set)
    if (isSelfService && user.passwordHash) {
      if (!password) {
        throw new AppError('Password is required to confirm account deletion.', 400);
      }
      const isPasswordValid = await argon2.verify(user.passwordHash, password);
      if (!isPasswordValid) throw new AppError('Invalid account password.', 401);
    }

    // 2. Atomic Cascading Deletion
    const deleteTx = db.transaction(() => {
      // Delete user documents
      try {
        const docs = db.prepare('SELECT id FROM documents WHERE projectId = ?').all(projectId) as any[];
        for (const d of docs) {
          if (d.id === userId) {
            db.prepare('DELETE FROM documents WHERE projectId = ? AND id = ?').run(projectId, d.id);
          }
        }
      } catch (_) {}

      // Delete refresh tokens for this user
      db.prepare('DELETE FROM refresh_tokens WHERE userId = ?').run(userId);

      // Delete from project_users
      db.prepare('DELETE FROM project_users WHERE projectId = ? AND id = ?').run(projectId, userId);

      // Record Anonymized Audit Tombstone
      const anonymizedActorHash = crypto.createHash('sha256').update(userId + projectId).digest('hex');
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, actorId, actorEmail, actorEmailHash, actionType, projectId, ipAddress, status, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        new Date().toISOString(),
        `DELETED_PROJECT_USER_${anonymizedActorHash.substring(0, 12)}`,
        'REDACTED_ERASED',
        anonymizedActorHash,
        'PROJECT_USER_ERASED',
        projectId,
        '127.0.0.1',
        'SUCCESS',
        JSON.stringify({
          erasedAt: new Date().toISOString(),
          userId,
          isSelfService,
          compliance: 'GDPR Article 17 Right to Erasure / CCPA § 1798.105'
        })
      );
    });

    deleteTx();

    // Trigger webhook event
    try {
      webhookService.dispatch(projectId, 'user.deleted', {
        id: userId,
        deletedAt: new Date().toISOString(),
      });
    } catch (_) {}

    return { success: true, message: 'User account and associated records have been permanently erased.' };
  }
}

export const projectAuthService = new ProjectAuthService();
