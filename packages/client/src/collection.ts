// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/client — collection.ts
//  Type-safe Document Collection module supporting CRUD, RLS, and SSE Change Streams.
// ─────────────────────────────────────────────────────────────────────────────

import { FlareBaseClient } from './client';
import {
  DocumentRecord,
  QueryOptions,
  QueryResult,
  RowLevelSecurityRules,
  SnapshotChange,
  Unsubscribe
} from './types';

function normalizeDoc<T = Record<string, any>>(raw: any): DocumentRecord<T> {
  if (!raw || typeof raw !== 'object') return raw;
  const id = String(raw.id || raw._id || '');
  const { _id, _ownerId, _projectId, _createdAt, _updatedAt, _rules, ...fields } = raw;
  const data = (raw.data && typeof raw.data === 'object' ? raw.data : fields) as T;
  return {
    id,
    _id: id,
    data,
    _createdAt,
    _updatedAt,
    _rules,
    ...fields
  };
}

export class FlareBaseCollection<T = Record<string, any>> {
  public readonly name: string;
  private readonly client: FlareBaseClient;

  constructor(client: FlareBaseClient, name: string) {
    this.client = client;
    this.name = name;
  }

  /**
   * Insert a new document with optional declarative Row-Level Security rules.
   *
   * @example
   * await todos.insert(
   *   { title: 'Write tests', completed: false },
   *   { read: 'auth.uid == resource.userId', write: 'auth.uid == resource.userId' }
   * );
   */
  async insert(data: Partial<T> & Record<string, any>, rules?: RowLevelSecurityRules): Promise<DocumentRecord<T>> {
    const docPayload: Record<string, any> = { ...(data || {}) };
    if (rules && typeof rules === 'object') {
      docPayload._rules = rules;
    }

    const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents`;
    const res = await this.client.request<any>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ data: docPayload })
    });
    return normalizeDoc<T>(res);
  }

  /**
   * Fetch a single document by ID.
   */
  async get(id: string): Promise<DocumentRecord<T>> {
    if (!id) throw new Error('FlareBase: Document ID is required.');
    const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`;
    const res = await this.client.request<any>(endpoint, {
      method: 'GET'
    });
    return normalizeDoc<T>(res);
  }

  /**
   * Query documents in this collection with filtering, sorting, and pagination.
   */
  async query(options: QueryOptions = {}): Promise<QueryResult<T>> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.sortOrder) params.set('sortOrder', options.sortOrder);
    if (options.filter) {
      params.set('filter', typeof options.filter === 'string' ? options.filter : JSON.stringify(options.filter));
    }
    if (options.where) {
      params.set('where', JSON.stringify(options.where));
    }

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents${queryStr}`;
    const res = await this.client.request<any>(endpoint, {
      method: 'GET'
    });

    let rawItems: any[] = [];
    let total: number | undefined;

    if (Array.isArray(res)) {
      rawItems = res;
      total = res.length;
    } else if (res && Array.isArray(res.items)) {
      rawItems = res.items;
      total = res.total;
    } else if (res && Array.isArray(res.documents)) {
      rawItems = res.documents;
      total = res.total || res.documents.length;
    } else if (res && Array.isArray(res.data)) {
      rawItems = res.data;
      total = res.total || res.data.length;
    }

    return {
      items: rawItems.map((item) => normalizeDoc<T>(item)),
      total: total ?? rawItems.length,
      limit: options.limit,
      offset: options.offset
    };
  }

  /**
   * Alias for query()
   */
  async list(options: QueryOptions = {}): Promise<QueryResult<T>> {
    return this.query(options);
  }

  /**
   * Update fields on an existing document.
   */
  async update(id: string, fields: Partial<T> & Record<string, any>): Promise<DocumentRecord<T>> {
    if (!id) throw new Error('FlareBase: Document ID is required for update.');
    const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`;
    const res = await this.client.request<any>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({ data: fields })
    });
    return normalizeDoc<T>(res);
  }

  /**
   * Delete a document by ID.
   */
  async delete(id: string): Promise<{ success: boolean; id: string }> {
    if (!id) throw new Error('FlareBase: Document ID is required for deletion.');
    const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`;
    await this.client.request(endpoint, {
      method: 'DELETE'
    });
    return { success: true, id };
  }

  /**
   * Subscribe to real-time Change Data Capture (CDC) events via Server-Sent Events (SSE).
   * Supports both browser EventSource and Node.js ReadableStream fetch readers natively.
   *
   * @param callback Handler receiving INSERT, UPDATE, and DELETE events in real-time.
   * @param errorCallback Optional error or disconnect callback.
   * @returns Unsubscribe function to terminate the stream.
   */
  onSnapshot(
    callback: (change: SnapshotChange<T>) => void,
    errorCallback?: (err: unknown) => void
  ): Unsubscribe {
    const apiKey = this.client.apiKey;
    const token = this.client.getToken();
    const query = new URLSearchParams();
    if (apiKey) query.set('apiKey', apiKey);
    if (token) query.set('token', token);

    const sseUrl = `${this.client.baseUrl}/api/v1/db/collections/${encodeURIComponent(this.name)}/realtime?${query.toString()}`;

    // Browser environment with native EventSource
    if (typeof (globalThis as any).EventSource !== 'undefined') {
      const EventSourceClass = (globalThis as any).EventSource;
      const es = new EventSourceClass(sseUrl);

      es.onmessage = (event: any) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.document) {
            payload.document = normalizeDoc<T>(payload.document);
          }
          callback(payload);
        } catch (e) {
          if (errorCallback) errorCallback(e);
        }
      };

      es.onerror = (err: any) => {
        if (errorCallback) errorCallback(err);
      };

      return () => {
        es.close();
      };
    }

    // Node.js 18+ / Edge / Fetch Streaming Fallback (Zero external dependencies)
    const abortController = new AbortController();
    let isTerminated = false;

    (async () => {
      try {
        const headers: Record<string, string> = {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        };
        if (apiKey) headers['x-flarebase-api-key'] = apiKey;
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(sseUrl, {
          headers,
          signal: abortController.signal
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE stream connection failed with HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!isTerminated) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            const lines = block.split('\n');
            let dataLine = '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                dataLine = line.slice(6).trim();
              }
            }

            if (dataLine) {
              try {
                const parsed = JSON.parse(dataLine);
                if (parsed && parsed.document) {
                  parsed.document = normalizeDoc<T>(parsed.document);
                }
                callback(parsed);
              } catch (e) {
                // Ignore non-json heartbeats
              }
            }
          }
        }
      } catch (err: any) {
        if (!isTerminated && errorCallback && err.name !== 'AbortError') {
          errorCallback(err);
        }
      }
    })();

    return () => {
      isTerminated = true;
      try {
        abortController.abort();
      } catch (_) {}
    };
  }
}
