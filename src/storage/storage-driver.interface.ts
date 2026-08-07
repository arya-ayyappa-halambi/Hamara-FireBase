import { Readable } from 'stream';

export interface StorageUploadResult {
  storedName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  path: string;
  url: string;
}

export interface StorageDriver {
  uploadFile(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StorageUploadResult>;
  getFileStream(storedName: string): Promise<Readable>;
  deleteFile(storedName: string): Promise<void>;
  getSignedUrl(storedName: string, expiresInSec?: number): Promise<string>;
}
