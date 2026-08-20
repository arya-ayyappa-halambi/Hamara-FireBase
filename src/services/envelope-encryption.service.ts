import crypto from 'crypto';
import { getDb } from '../db/sqlite.connection';

export class EnvelopeEncryptionService {
  private getKek(): Buffer {
    const masterSecret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!masterSecret || masterSecret.length < 32) {
      throw new Error('ENCRYPTION_KEY or JWT_SECRET must be configured in environment and at least 32 characters.');
    }
    return Buffer.from(crypto.hkdfSync('sha256', masterSecret, Buffer.from('aegis-kek-salt'), Buffer.from('aegis-kek-info'), 32));
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
      if (row) return this.decryptDek(row.dekEncrypted, row.dekIv, row.dekTag);

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
      return this.decryptDek(row.dekEncrypted, row.dekIv, row.dekTag);
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

    const dek = this.getOrCreateProjectDek(projectId);
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(encryptedObj.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encryptedObj.tag, 'hex'));

    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedObj.v, 'hex')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }
  
  // Deterministic Blind Index for lookups (e.g. Email)
  hashBlindIndex(value: string): string {
    if (!value) return '';
    const pepper = process.env.EMAIL_HASH_PEPPER;
    if (!pepper) throw new Error('EMAIL_HASH_PEPPER environment variable is missing');
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
