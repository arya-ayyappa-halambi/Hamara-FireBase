import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';
import { projectService } from '../project/project.service';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
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

    // 2. Enforce Project Auth Config
    let authConfig = projectRow.authConfig ? JSON.parse(projectRow.authConfig) : {};
    
    // Default open if email config isn't explicitly set (or based on user approval, open by default)
    if (provider === 'email' && authConfig.email === false) {
      throw new AppError('Email registration is disabled for this project.', 403);
    }

    if (!email || !email.includes('@')) {
      throw new AppError('Invalid email address.', 400);
    }

    if (provider === 'email' && (!passwordText || passwordText.length < 6)) {
      throw new AppError('Password must be at least 6 characters.', 400);
    }

    // 3. Check if user exists
    const existing = db.prepare('SELECT id FROM project_users WHERE projectId = ? AND email = ?').get(projectId, email);
    if (existing) {
      throw new AppError('Email already registered in this project.', 409);
    }

    // 4. Hash password
    const passwordHash = passwordText ? await argon2.hash(passwordText, ARGON2_OPTIONS) : null;
    const userId = uuidv4();
    const now = new Date().toISOString();

    // 5. Insert
    db.prepare(`
      INSERT INTO project_users (id, projectId, email, passwordHash, provider, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, projectId, email, passwordHash, provider, now, now);

    return this.generateAuthResponse(userId, projectId, email);
  }

  async loginUser(projectId: string, email: string, passwordText: string) {
    const db = getDb();
    const user = db.prepare('SELECT * FROM project_users WHERE projectId = ? AND email = ?').get(projectId, email) as any;

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

    return this.generateAuthResponse(user.id, projectId, user.email);
  }

  private generateAuthResponse(userId: string, projectId: string, email: string) {
    const payload = {
      sub: userId,
      projectId: projectId,
      email: email,
      isProjectUser: true // Differentiates from Dashboard Dev JWT
    };

    const accessToken = jwt.sign(payload, this.getJwtSecret(), { expiresIn: '7d' });
    
    return {
      accessToken,
      user: {
        id: userId,
        email,
        projectId
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
    
    let email = '';
    
    if (provider === 'google') {
      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client(providerConfig.clientId);
      try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: providerConfig.clientId, 
        });
        const payload = ticket.getPayload();
        email = payload?.email || '';
      } catch(err: any) {
        throw new AppError(`Google token verification failed: ${err.message}`, 401);
      }
    } else if (provider === 'github') {
      const axios = require('axios').default;
      try {
        const res = await axios.get('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const primaryEmail = res.data.find((e: any) => e.primary);
        email = primaryEmail ? primaryEmail.email : res.data[0].email;
      } catch(err: any) {
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
          jwtApple.verify(token, getKey, { audience: providerConfig.clientId, issuer: 'https://appleid.apple.com' }, (err: any, decoded: any) => {
            if (err) reject(err);
            else resolve(decoded);
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
    
    // Check if user exists
    let user = db.prepare('SELECT * FROM project_users WHERE projectId = ? AND email = ?').get(projectId, email) as any;
    const now = new Date().toISOString();
    
    if (!user) {
      const userId = uuidv4();
      db.prepare(`
        INSERT INTO project_users (id, projectId, email, provider, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, projectId, email, provider, now, now);
      user = { id: userId, email, projectId };
    } else {
      db.prepare('UPDATE project_users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(now, now, user.id);
    }
    
    return this.generateAuthResponse(user.id, projectId, user.email);
  }
}

export const projectAuthService = new ProjectAuthService();
