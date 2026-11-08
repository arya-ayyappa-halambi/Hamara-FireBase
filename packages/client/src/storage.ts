// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/client — storage.ts
//  File, Asset, and Biometric Storage Vault client module.
// ─────────────────────────────────────────────────────────────────────────────

import { FlareBaseClient } from './client';
import {
  StorageAsset,
  StorageQuota,
  SignedUrlResponse
} from './types';

declare const FormData: any;
declare const Blob: any;
declare const File: any;

export class FlareBaseStorage {
  private readonly client: FlareBaseClient;

  constructor(client: FlareBaseClient) {
    this.client = client;
  }

  /**
   * Upload a file, blob, or asset to the project storage vault.
   *
   * @param fileOrBlob File or Blob object (e.g. from <input type="file"> or buffer).
   * @param fieldName Form field name (default: 'file').
   * @param customFilename Optional custom filename override.
   */
  async upload(fileOrBlob: any, fieldName = 'file', customFilename?: string): Promise<StorageAsset> {
    if (typeof FormData === 'undefined') {
      throw new Error('FlareBase: FormData is not available in this environment.');
    }

    const formData = new FormData();
    if (customFilename && typeof Blob !== 'undefined' && fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)) {
      formData.append(fieldName, fileOrBlob, customFilename);
    } else {
      formData.append(fieldName, fileOrBlob, customFilename);
    }

    return await this.client.request<StorageAsset>('/api/v1/storage/upload', {
      method: 'POST',
      body: formData
    });
  }

  /**
   * Generate a time-limited cryptographically signed upload or download URL.
   *
   * @param filename Target file name.
   * @param operation 'read' | 'write'
   * @param expiresIn Expiration TTL in seconds (default 3600).
   */
  async getSignedUrl(filename: string, operation: 'read' | 'write' = 'read', expiresIn = 3600): Promise<SignedUrlResponse> {
    return await this.client.request<SignedUrlResponse>('/api/v1/storage/signed-url', {
      method: 'POST',
      body: JSON.stringify({ filename, operation, expiresIn })
    });
  }

  /**
   * Retrieve active storage usage metrics and quota ceiling.
   */
  async getQuota(): Promise<StorageQuota> {
    return await this.client.request<StorageQuota>('/api/v1/storage/quota', {
      method: 'GET'
    });
  }

  /**
   * List assets in the project storage vault.
   */
  async list(): Promise<StorageAsset[]> {
    const res = await this.client.request<any>('/api/v1/storage/assets', {
      method: 'GET'
    });
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.assets)) return res.assets;
    return (res?.data || []) as StorageAsset[];
  }

  /**
   * Delete an asset by ID from the storage vault.
   */
  async delete(id: string): Promise<{ success: boolean; id: string }> {
    return await this.client.request<{ success: boolean; id: string }>(`/api/v1/storage/assets/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  /**
   * Build a permanent or direct asset stream URL.
   */
  getAssetUrl(idOrFilename: string): string {
    if (!idOrFilename) return '';
    if (idOrFilename.startsWith('http://') || idOrFilename.startsWith('https://')) {
      return idOrFilename;
    }
    const clean = idOrFilename.replace(/^\/+/, '');
    return `${this.client.baseUrl}/api/v1/storage/assets/${encodeURIComponent(clean)}/file`;
  }
}
