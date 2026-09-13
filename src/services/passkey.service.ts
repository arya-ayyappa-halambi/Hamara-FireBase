// ─────────────────────────────────────────────────────────────────────────────
//  src/services/passkey.service.ts
//  FlareBase — WebAuthn / Passkeys (FIDO2) Biometric Authentication Service
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { envelopeEncryptionService } from './envelope-encryption.service';
import { AppError } from '../types/auth.types';

export interface PasskeyRecord {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceName: string;
  transports?: string[] | null;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface WebAuthnChallengeOptions {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user?: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{ alg: number; type: 'public-key' }>;
  timeout: number;
  attestation?: string;
  userVerification?: string;
  authenticatorSelection?: {
    residentKey?: string;
    userVerification?: string;
    authenticatorAttachment?: string;
  };
}

class PasskeyService {
  private static instance: PasskeyService;
  // Ephemeral challenge cache: challenge -> { userId, expiresAt, type }
  private challenges = new Map<string, { userId?: string; email?: string; expiresAt: number; type: 'registration' | 'authentication' }>();

  private constructor() {
    // Periodically clean up expired challenges
    setInterval(() => {
      const now = Date.now();
      for (const [ch, val] of this.challenges.entries()) {
        if (val.expiresAt < now) {
          this.challenges.delete(ch);
        }
      }
    }, 60000);
  }

  public static getInstance(): PasskeyService {
    if (!PasskeyService.instance) {
      PasskeyService.instance = new PasskeyService();
    }
    return PasskeyService.instance;
  }

  /**
   * Generates a WebAuthn Registration Challenge for a user
   */
  public generateRegistrationOptions(userId: string, email: string, name: string, hostname = 'localhost'): WebAuthnChallengeOptions {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    this.challenges.set(challenge, {
      userId,
      email,
      expiresAt,
      type: 'registration'
    });

    const cleanHost = hostname.split(':')[0];

    return {
      challenge,
      rp: {
        name: 'FlareBase Security BaaS',
        id: cleanHost || 'localhost'
      },
      user: {
        id: Buffer.from(userId).toString('base64url'),
        name: email,
        displayName: name || email
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256 (ECDSA P-256)
        { alg: -257, type: 'public-key' }, // RS256 (RSA SHA-256)
        { alg: -8, type: 'public-key' }   // EdDSA (Ed25519)
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform' // FaceID / TouchID / Windows Hello
      }
    };
  }

  /**
   * Verifies Registration Response and saves passkey credential in database
   */
  public verifyRegistrationResponse(params: {
    userId: string;
    challenge: string;
    credentialId: string;
    publicKey: string;
    deviceName?: string;
    transports?: string[];
  }): PasskeyRecord {
    const { userId, challenge, credentialId, publicKey, deviceName, transports } = params;

    const storedChallenge = this.challenges.get(challenge);
    if (!storedChallenge || storedChallenge.type !== 'registration' || storedChallenge.userId !== userId) {
      throw new AppError('Invalid or expired WebAuthn registration challenge.', 400);
    }
    if (storedChallenge.expiresAt < Date.now()) {
      this.challenges.delete(challenge);
      throw new AppError('WebAuthn registration challenge has expired.', 400);
    }

    this.challenges.delete(challenge);

    const db = getDb();
    const id = `pk_${uuidv4()}`;
    const now = new Date().toISOString();
    const friendlyName = deviceName || 'Biometric Authenticator (Passkey)';
    const transportsJson = transports ? JSON.stringify(transports) : null;

    db.prepare(`
      INSERT INTO user_passkeys (id, userId, credentialId, publicKey, counter, deviceName, transports, createdAt)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `).run(id, userId, credentialId, publicKey, friendlyName, transportsJson, now);

    return {
      id,
      userId,
      credentialId,
      publicKey,
      counter: 0,
      deviceName: friendlyName,
      transports: transports || null,
      createdAt: now
    };
  }

  /**
   * Generates a WebAuthn Authentication Challenge for login
   */
  public generateLoginOptions(hostname = 'localhost', email?: string): WebAuthnChallengeOptions & { allowCredentials?: any[] } {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 5 * 60 * 1000;

    let targetUserId: string | undefined;
    const allowCredentials: any[] = [];

    if (email) {
      const db = getDb();
      const emailHash = envelopeEncryptionService.hashBlindIndex(email.trim().toLowerCase());
      const user = db.prepare('SELECT id FROM users WHERE emailHash = ?').get(emailHash) as { id: string } | undefined;
      if (user) {
        targetUserId = user.id;
        const passkeys = db.prepare('SELECT credentialId, transports FROM user_passkeys WHERE userId = ?').all(user.id) as any[];
        for (const pk of passkeys) {
          allowCredentials.push({
            id: pk.credentialId,
            type: 'public-key',
            transports: pk.transports ? JSON.parse(pk.transports) : undefined
          });
        }
      }
    }

    this.challenges.set(challenge, {
      userId: targetUserId,
      email,
      expiresAt,
      type: 'authentication'
    });

    const cleanHost = hostname.split(':')[0];

    return {
      challenge,
      rp: {
        name: 'FlareBase Security BaaS',
        id: cleanHost || 'localhost'
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' }
      ],
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined
    };
  }

  /**
   * Verifies an Authentication Assertion and increments counter
   */
  public verifyLoginAssertion(params: {
    challenge: string;
    credentialId: string;
    signature?: string;
    counter?: number;
  }): { userId: string; passkey: PasskeyRecord } {
    const { challenge, credentialId, counter } = params;

    const storedChallenge = this.challenges.get(challenge);
    if (!storedChallenge || storedChallenge.type !== 'authentication') {
      throw new AppError('Invalid or expired WebAuthn login challenge.', 401);
    }
    if (storedChallenge.expiresAt < Date.now()) {
      this.challenges.delete(challenge);
      throw new AppError('WebAuthn login challenge has expired.', 401);
    }

    this.challenges.delete(challenge);

    const db = getDb();
    const passkey = db.prepare('SELECT * FROM user_passkeys WHERE credentialId = ?').get(credentialId) as any;
    if (!passkey) {
      throw new AppError('Passkey credential not recognized on this server.', 401);
    }

    // Verify counter rollback (clone detection)
    const newCounter = counter !== undefined ? counter : passkey.counter + 1;
    if (counter !== undefined && counter > 0 && counter <= passkey.counter) {
      throw new AppError('SECURITY WARNING: Passkey counter rollback detected! Authenticator may be cloned.', 401);
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE user_passkeys SET counter = ?, lastUsedAt = ? WHERE id = ?').run(newCounter, now, passkey.id);

    return {
      userId: passkey.userId,
      passkey: {
        id: passkey.id,
        userId: passkey.userId,
        credentialId: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: newCounter,
        deviceName: passkey.deviceName,
        transports: passkey.transports ? JSON.parse(passkey.transports) : null,
        createdAt: passkey.createdAt,
        lastUsedAt: now
      }
    };
  }

  /**
   * List all registered passkeys for a user
   */
  public listUserPasskeys(userId: string): PasskeyRecord[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM user_passkeys WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      credentialId: r.credentialId,
      publicKey: r.publicKey,
      counter: r.counter,
      deviceName: r.deviceName,
      transports: r.transports ? JSON.parse(r.transports) : null,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt
    }));
  }

  /**
   * Delete a passkey
   */
  public deletePasskey(userId: string, passkeyId: string): boolean {
    const db = getDb();
    const info = db.prepare('DELETE FROM user_passkeys WHERE id = ? AND userId = ?').run(passkeyId, userId);
    return info.changes > 0;
  }
}

export const passkeyService = PasskeyService.getInstance();
