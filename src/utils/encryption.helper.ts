import crypto from 'crypto';

export interface EncryptedField {
  _encrypted: true;
  ciphertext: string;
  iv: string;
  tag: string;
}

export function isEncryptedField(value: any): value is EncryptedField {
  return (
    value &&
    typeof value === 'object' &&
    value._encrypted === true &&
    typeof value.ciphertext === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.tag === 'string'
  );
}

function getProjectEncryptionKey(projectId: string): Buffer {
  const master = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'aegisdb_default_master_encryption_key_32_chars';
  const derived = crypto.hkdfSync('sha256', master, Buffer.from(projectId), Buffer.from('aegisdb-field-encryption'), 32);
  return Buffer.from(derived);
}

export function encryptValue(val: any, projectId: string): EncryptedField {
  const key = getProjectEncryptionKey(projectId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const plaintext = JSON.stringify(val);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final().toString('hex');
  const tag = cipher.getAuthTag().toString('hex');
  
  return {
    _encrypted: true,
    ciphertext,
    iv: iv.toString('hex'),
    tag
  };
}

export function decryptValue(enc: EncryptedField, projectId: string): any {
  const key = getProjectEncryptionKey(projectId);
  const iv = Buffer.from(enc.iv, 'hex');
  const tag = Buffer.from(enc.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(enc.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final().toString('utf8');
  
  try {
    return JSON.parse(decrypted);
  } catch (_) {
    return decrypted;
  }
}
