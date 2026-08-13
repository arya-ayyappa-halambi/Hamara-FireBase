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
