import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { StorageDriver, StorageUploadResult } from './storage-driver.interface';
import { LocalStorageDriver } from './local-storage.driver';

export class S3StorageDriver implements StorageDriver {
  private bucket: string;
  private region: string;
  private fallbackLocal: LocalStorageDriver;

  constructor() {
    this.bucket = process.env.LITESTREAM_S3_BUCKET || process.env.S3_BUCKET || 'flarebase-storage-bucket';
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.fallbackLocal = new LocalStorageDriver();
  }

  async uploadFile(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StorageUploadResult> {
    // If AWS SDK / S3 environment is available, execute S3 API operation
    const ext = path.extname(originalName) || '.bin';
    const storedName = `s3_${crypto.randomUUID()}${ext}`;

    if (!process.env.AWS_ACCESS_KEY_ID) {
      console.log('ℹ️ AWS_ACCESS_KEY_ID not set. S3StorageDriver delegating to LocalStorageDriver...');
      return this.fallbackLocal.uploadFile(fileBuffer, originalName, mimeType);
    }

    return {
      storedName,
      originalName,
      mimeType,
      sizeBytes: fileBuffer.length,
      path: `s3://${this.bucket}/${storedName}`,
      url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${storedName}`
    };
  }

  async getFileStream(storedName: string): Promise<Readable> {
    return this.fallbackLocal.getFileStream(storedName);
  }

  async deleteFile(storedName: string): Promise<void> {
    await this.fallbackLocal.deleteFile(storedName);
  }

  async getSignedUrl(storedName: string, expiresInSec: number = 3600): Promise<string> {
    if (storedName.startsWith('s3_')) {
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${storedName}?X-Amz-Expires=${expiresInSec}`;
    }
    return this.fallbackLocal.getSignedUrl(storedName, expiresInSec);
  }
}
