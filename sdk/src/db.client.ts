// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/db.client.ts
//  Dynamic Database Engine client module for @flarebase/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import { AuthClient } from './auth.client.js';
import { Collection, DocumentRecord, QueryOptions, QueryResult, ApiResponse } from './types.js';

export class DbClient {
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
      'Content-Type': 'application/json',
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
      throw new Error('Authentication required. Provide an apiKey in config or call FlareBase.auth.login() first.');
    }

    let res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    // Handle automatic token refresh on 401 if refresh token is available
    if (res.status === 401 && this.auth.getRefreshToken()) {
      try {
        await this.auth.refresh();
        const newToken = this.auth.getAccessToken();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
          res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
        }
      } catch {
        // Refresh failed, proceed to error parsing
      }
    }

    const json = (await res.json()) as ApiResponse<T>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Database request failed (${res.status}).`);
    }

    return json.data;
  }

  // ── Collections ─────────────────────────────────────────────────────────────

  async createCollection(name: string, description?: string): Promise<Collection> {
    return this.request<Collection>('/api/v1/db/collections', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async listCollections(): Promise<Collection[]> {
    return this.request<Collection[]>('/api/v1/db/collections', {
      method: 'GET',
    });
  }

  async getCollection(name: string): Promise<Collection> {
    return this.request<Collection>(`/api/v1/db/collections/${encodeURIComponent(name)}`, {
      method: 'GET',
    });
  }

  async deleteCollection(name: string): Promise<void> {
    await this.request<void>(`/api/v1/db/collections/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  // ── Documents ───────────────────────────────────────────────────────────────

  async insertDocument(collectionName: string, data: Record<string, unknown>, docId?: string): Promise<DocumentRecord> {
    const payload: Record<string, unknown> = { data };
    if (docId) payload.id = docId;
    return this.request<DocumentRecord>(`/api/v1/db/collections/${encodeURIComponent(collectionName)}/documents`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /** Alias for insertDocument */
  async createDocument(collectionName: string, data: Record<string, unknown>, docId?: string): Promise<DocumentRecord> {
    return this.insertDocument(collectionName, data, docId);
  }

  async queryDocuments(collectionName: string, options: QueryOptions = {}): Promise<QueryResult> {
    const params = new URLSearchParams();
    if (options.filter)     params.set('filter', JSON.stringify(options.filter));
    if (options.limit)      params.set('limit', String(options.limit));
    if (options.offset)     params.set('offset', String(options.offset));
    if (options.sortBy)     params.set('sortBy', options.sortBy);
    if (options.sortOrder)  params.set('sortOrder', options.sortOrder);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<QueryResult>(`/api/v1/db/collections/${encodeURIComponent(collectionName)}/documents${query}`, {
      method: 'GET',
    });
  }

  async getDocument(collectionName: string, docId: string): Promise<DocumentRecord> {
    return this.request<DocumentRecord>(`/api/v1/db/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(docId)}`, {
      method: 'GET',
    });
  }

  async updateDocument(collectionName: string, docId: string, patch: Record<string, unknown>): Promise<DocumentRecord> {
    return this.request<DocumentRecord>(`/api/v1/db/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(docId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: patch }),
    });
  }

  async deleteDocument(collectionName: string, docId: string): Promise<void> {
    await this.request<void>(`/api/v1/db/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Fluent Collection reference helper (Firebase / BaaS style)
   */
  collection(name: string) {
    return {
      insert: (data: Record<string, unknown>, docId?: string) => this.insertDocument(name, data, docId),
      create: (data: Record<string, unknown>, docId?: string) => this.createDocument(name, data, docId),
      get: (docId: string) => this.getDocument(name, docId),
      update: (docId: string, patch: Record<string, unknown>) => this.updateDocument(name, docId, patch),
      delete: (docId: string) => this.deleteDocument(name, docId),
      query: (options: QueryOptions = {}) => this.queryDocuments(name, options),
    };
  }
}
