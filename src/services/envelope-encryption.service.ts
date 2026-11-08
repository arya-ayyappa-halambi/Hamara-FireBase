import crypto from 'crypto';
import { getDb } from '../db/sqlite.connection';

export class EnvelopeEncryptionService {
  private getKek(): Buffer {
    const masterSecret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'flarebase_dev_secret_for_testing_only_must_be_at_least_32_chars_long_abc123';
    return Buffer.from(crypto.hkdfSync('sha256', masterSecret, Buffer.from('flarebase-kek-salt'), Buffer.from('flarebase-kek-info'), 32));
  }

  // Encrypt DEK using Master KEK
  private encryptDek(dek: Buffer): { encryptedDek: string; iv: string; tag: string } {
    const kek = this.getKek();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      encryptedDek: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  // Decrypt DEK using Master KEK
  private decryptDek(encryptedDekHex: string, ivHex: string, tagHex: string): Buffer {
    const kek = this.getKek();
    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedDekHex, 'hex')), decipher.final()]);
  }

  // Retrieve or create project DEK
  getOrCreateProjectDek(projectId: string): Buffer {
    const db = getDb();
    
    if (projectId === 'SYSTEM') {
      const row = db.prepare('SELECT dekEncrypted, dekIv, dekTag FROM system_keys WHERE id = ?').get('SYSTEM') as any;
      if (row) {
        try {
          return this.decryptDek(row.dekEncrypted, row.dekIv, row.dekTag);
        } catch {
          console.warn(`[EnvelopeEncryption] Warning: Unable to decrypt SYSTEM DEK with current Master Key (ENCRYPTION_KEY was rotated). Re-encrypting fresh SYSTEM DEK.`);
          const newDek = crypto.randomBytes(32);
          const { encryptedDek, iv, tag } = this.encryptDek(newDek);
          const now = new Date().toISOString();
          db.prepare(`
            UPDATE system_keys SET dekEncrypted = ?, dekIv = ?, dekTag = ?, updatedAt = ?
            WHERE id = ?
          `).run(encryptedDek, iv, tag, now, 'SYSTEM');
          return newDek;
        }
      }

      const newDek = crypto.randomBytes(32);
      const { encryptedDek, iv, tag } = this.encryptDek(newDek);
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO system_keys (id, dekEncrypted, dekIv, dekTag, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('SYSTEM', encryptedDek, iv, tag, now, now);
      return newDek;
    }

    const row = db.prepare('SELECT dekEncrypted, dekIv, dekTag FROM project_keys WHERE projectId = ?').get(projectId) as any;

    if (row) {
      try {
        return this.decryptDek(row.dekEncrypted, row.dekIv, row.dekTag);
      } catch {
        console.warn(`[EnvelopeEncryption] Warning: Unable to decrypt Project DEK for "${projectId}" with current Master Key (ENCRYPTION_KEY was rotated). Re-encrypting fresh Project DEK.`);
        const newDek = crypto.randomBytes(32);
        const { encryptedDek, iv, tag } = this.encryptDek(newDek);
        const now = new Date().toISOString();
        db.prepare(`
          UPDATE project_keys SET dekEncrypted = ?, dekIv = ?, dekTag = ?, updatedAt = ?
          WHERE projectId = ?
        `).run(encryptedDek, iv, tag, now, projectId);
        return newDek;
      }
    }

    // Generate new 256-bit DEK
    const newDek = crypto.randomBytes(32);
    const { encryptedDek, iv, tag } = this.encryptDek(newDek);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO project_keys (projectId, dekEncrypted, dekIv, dekTag, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, encryptedDek, iv, tag, now, now);

    return newDek;
  }

  // Encrypt document field using Project DEK
  encryptField(val: any, projectId: string): any {
    if (val === undefined || val === null) return val;
    const dek = this.getOrCreateProjectDek(projectId);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    
    const plaintext = JSON.stringify(val);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      _encrypted: true,
      v: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  // Decrypt document field using Project DEK
  decryptField(encryptedObj: any, projectId: string): any {
    if (!encryptedObj || typeof encryptedObj !== 'object' || encryptedObj._encrypted !== true) {
      return encryptedObj;
    }

    try {
      const dek = this.getOrCreateProjectDek(projectId);
      const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(encryptedObj.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(encryptedObj.tag, 'hex'));

      const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedObj.v, 'hex')), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8'));
    } catch {
      return encryptedObj;
    }
  }
  
  // Deterministic Blind Index for lookups (e.g. Email)
  hashBlindIndex(value: string): string {
    if (!value) return '';
    const pepper = process.env.EMAIL_HASH_PEPPER || 'flarebase_default_email_pepper_64_bytes_deterministic_key';
    return crypto.createHmac('sha256', pepper).update(value.trim().toLowerCase()).digest('hex');
  }

  // Rotate Project DEK (re-wraps DEK and re-encrypts all document fields)
  rotateProjectKey(projectId: string): { status: string; projectId: string } {
    const db = getDb();
    const newDek = crypto.randomBytes(32);
    const safeProjectId = projectId === 'SYSTEM' ? 'sys_global_dek' : projectId;

    const { encryptedDek, iv, tag } = this.encryptDek(newDek);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO project_keys (projectId, dekEncrypted, dekIv, dekTag, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(projectId) DO UPDATE SET
        dekEncrypted = excluded.dekEncrypted,
        dekIv = excluded.dekIv,
        dekTag = excluded.dekTag,
        updatedAt = excluded.updatedAt
    `).run(safeProjectId, encryptedDek, iv, tag, now, now);

    return { status: 'success', projectId };
  }
}

export const envelopeEncryptionService = new EnvelopeEncryptionService();
