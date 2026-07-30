// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/db.client.ts
//  Dynamic Database Engine client module for @aegis/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import { AuthClient } from './auth.client.js';
import { Collection, DocumentRecord, QueryOptions, QueryResult, ApiResponse } from './types.js';

export class DbClient {
  private readonly baseUrl: string;
  private readonly auth: AuthClient;

  constructor(baseUrl: string, auth: AuthClient) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.auth = auth;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.auth.getAccessToken();
    if (!token) {
      throw new Error('Authentication required. Call Aegis.auth.login() or Aegis.auth.register() first.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    };

    let res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    // Handle automatic token refresh on 401
    if (res.status === 401 && this.auth.getRefreshToken()) {
      try {
        await this.auth.refresh();
        const newToken = this.auth.getAccessToken();
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
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

  async insertDocument(collectionName: string, data: Record<string, unknown>): Promise<DocumentRecord> {
    return this.request<DocumentRecord>(`/api/v1/db/collections/${encodeURIComponent(collectionName)}/documents`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
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
}
