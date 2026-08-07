import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { StorageDriver, StorageUploadResult } from './storage-driver.interface';

export class LocalStorageDriver implements StorageDriver {
  private uploadDir = path.join(process.cwd(), 'uploads', 'biometrics');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StorageUploadResult> {
    const ext = path.extname(originalName) || '.bin';
    const storedName = `${crypto.randomUUID()}${ext}`;
    const absolutePath = path.join(this.uploadDir, storedName);

    await fs.promises.writeFile(absolutePath, fileBuffer);

    return {
      storedName,
      originalName,
      mimeType,
      sizeBytes: fileBuffer.length,
      path: absolutePath,
      url: `/api/v1/storage/assets/${storedName}`
    };
  }

  async getFileStream(storedName: string): Promise<Readable> {
    const absolutePath = path.join(this.uploadDir, storedName);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File asset '${storedName}' not found on local storage.`);
    }
    return fs.createReadStream(absolutePath);
  }

  async deleteFile(storedName: string): Promise<void> {
    const absolutePath = path.join(this.uploadDir, storedName);
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
    }
  }

  async getSignedUrl(storedName: string, _expiresInSec: number = 3600): Promise<string> {
    return `/api/v1/storage/assets/${storedName}`;
  }
}
