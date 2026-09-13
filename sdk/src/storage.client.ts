// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/storage.client.ts
//  Biometric & Asset Storage client module for @flarebase/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import { AuthClient } from './auth.client.js';
import { AssetMetadata, ApiResponse } from './types.js';

export class StorageClient {
  private readonly baseUrl: string;
  private readonly auth: AuthClient;
  private readonly apiKey?: string;
  private readonly projectId?: string;

  constructor(baseUrl: string, auth: AuthClient, apiKey?: string, projectId?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.auth = auth;
    this.apiKey = apiKey;
    this.projectId = projectId;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.auth.getAccessToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (this.apiKey) {
      headers['x-flarebase-api-key'] = this.apiKey;
      headers['x-flare-api-key'] = this.apiKey;
      headers['x-flarebase-api-key'] = this.apiKey;
    }
    if (this.projectId) {
      headers['x-flarebase-project-id'] = this.projectId;
      headers['x-flare-project-id'] = this.projectId;
      headers['x-flarebase-project-id'] = this.projectId;
    }

    if (!token && !this.apiKey) {
      throw new Error('Authentication required for storage operations. Provide an apiKey or login first.');
    }

    let res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    // Handle automatic token refresh on 401
    if (res.status === 401 && this.auth.getRefreshToken()) {
      try {
        await this.auth.refresh();
        const newToken = this.auth.getAccessToken();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
          res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
        }
      } catch {
        // Refresh failed
      }
    }

    const json = (await res.json()) as ApiResponse<T>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Storage request failed (${res.status}).`);
    }

    return json.data;
  }

  /**
   * Upload a biometric image file.
   * Accepts a File or Blob instance (Node/Browser).
   */
  async upload(file: Blob | File, filename?: string, linkedCollectionId?: string): Promise<AssetMetadata> {
    const formData = new FormData();
    formData.append('biometric', file, filename ?? (file as File).name ?? 'upload.jpg');

    if (linkedCollectionId) {
      formData.append('linkedCollectionId', linkedCollectionId);
    }

    return this.request<AssetMetadata>('/api/v1/storage/upload', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * List all stored assets owned by the user.
   */
  async listAssets(): Promise<AssetMetadata[]> {
    return this.request<AssetMetadata[]>('/api/v1/storage/assets', {
      method: 'GET',
    });
  }

  /**
   * Get metadata for a specific asset.
   */
  async getAsset(assetId: string): Promise<AssetMetadata> {
    return this.request<AssetMetadata>(`/api/v1/storage/assets/${encodeURIComponent(assetId)}`, {
      method: 'GET',
    });
  }

  /**
   * Get the absolute stream URL for downloading/viewing an asset.
   */
  getFileUrl(assetId: string): string {
    return `${this.baseUrl}/api/v1/storage/assets/${encodeURIComponent(assetId)}/file`;
  }

  /**
   * Delete an asset by ID (removes metadata & file).
   */
  async deleteAsset(assetId: string): Promise<AssetMetadata> {
    return this.request<AssetMetadata>(`/api/v1/storage/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
    });
  }
}
