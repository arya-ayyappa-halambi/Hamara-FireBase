import { envelopeEncryptionService } from '../services/envelope-encryption.service';

export function isEncryptedField(value: any): boolean {
  return (
    value &&
    typeof value === 'object' &&
    value._encrypted === true &&
    typeof value.v === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.tag === 'string'
  );
}

export function encryptValue(val: any, projectId: string): any {
  return envelopeEncryptionService.encryptField(val, projectId);
}

export function decryptValue(enc: any, projectId: string): any {
  return envelopeEncryptionService.decryptField(enc, projectId);
}

export function decryptUserField(fieldVal: any, projectId: string = 'SYSTEM'): string {
  if (fieldVal === undefined || fieldVal === null) return '';

  if (typeof fieldVal === 'object' && fieldVal !== null) {
    if (fieldVal._encrypted === true) {
      try {
        const decrypted = envelopeEncryptionService.decryptField(fieldVal, projectId);
        if (typeof decrypted === 'string') return decrypted;
        if (decrypted !== undefined && decrypted !== null) return String(decrypted);
      } catch (_) {}
    }
  }

  if (typeof fieldVal === 'string') {
    const trimmed = fieldVal.trim();
    if (trimmed.startsWith('{') && (trimmed.includes('_encrypted') || trimmed.includes('"v"') || trimmed.includes('ciphertext'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && parsed._encrypted === true) {
          const decrypted = envelopeEncryptionService.decryptField(parsed, projectId);
          if (typeof decrypted === 'string') return decrypted;
          if (decrypted !== undefined && decrypted !== null) return String(decrypted);
        }
      } catch (_) {}
    }
    return trimmed;
  }

  return String(fieldVal);
}

