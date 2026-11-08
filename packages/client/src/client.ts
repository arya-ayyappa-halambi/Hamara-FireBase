// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/client — client.ts
//  Core FlareBaseClient class managing network sessions, credentials, and submodules.
// ─────────────────────────────────────────────────────────────────────────────

import { FlareBaseError } from './errors';
import {
  FlareBaseClientOptions,
  AuthUser,
  ApiResponse
} from './types';
import { FlareBaseAuth } from './auth';
import { FlareBaseStorage } from './storage';
import { FlareBaseCollection } from './collection';

declare const window: any;
declare const document: any;
declare const navigator: any;
declare const localStorage: any;
declare const FormData: any;

export class FlareBaseClient {
  public baseUrl: string;
  public apiKey: string;
  public projectId: string | null;
  public pat: string | null;

  private _token: string | null = null;
  private _user: AuthUser | null = null;
  private readonly _prefix: string;
  private readonly _listeners = new Map<string, Array<(payload: any) => void>>();
  private readonly _onAuthChangeCallback?: (state: { token: string | null; user: AuthUser | null }) => void;
  private readonly _onErrorCallback?: (error: unknown) => void;

  public readonly auth: FlareBaseAuth;
  public readonly storage: FlareBaseStorage;

  constructor(options: FlareBaseClientOptions = {}) {
    const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';
    const defaultOrigin = isBrowser && window.location.origin ? window.location.origin : 'http://localhost:3000';

    this._prefix = options.storageKeyPrefix || 'flarebase_';
    this.baseUrl = (options.baseUrl || this._getStoredItem('baseUrl') || defaultOrigin).replace(/\/+$/, '');
    this.apiKey = (options.apiKey || this._getStoredItem('apiKey') || '').trim();
    this.projectId = options.projectId || this._getStoredItem('projectId') || null;
    this.pat = options.pat || this._getStoredItem('pat') || null;

    this._onAuthChangeCallback = options.onAuthChange;
    this._onErrorCallback = options.onError;

    this._token = options.token || this._getStoredItem('token') || null;
    this._user = this._loadStoredUser();

    // Initialize submodules
    this.auth = new FlareBaseAuth(this);
    this.storage = new FlareBaseStorage(this);
  }

  // ── Database Collection Accessor ───────────────────────────────────────────

  /**
   * Access a typed document collection
   * @example
   * const todos = flare.collection<Todo>('todos');
   * const list = await todos.query({ limit: 10 });
   */
  public collection<T = Record<string, any>>(name: string): FlareBaseCollection<T> {
    return new FlareBaseCollection<T>(this, name);
  }

  // ── Token & Session Management ─────────────────────────────────────────────

  public getToken(): string | null {
    return this._token;
  }

  public setToken(token: string | null): void {
    this._token = token;
    if (token) {
      this._setStoredItem('token', token);
    } else {
      this._removeStoredItem('token');
    }
    this._notifyAuthChange();
  }

  public getUser(): AuthUser | null {
    return this._user;
  }

  public setUser(user: AuthUser | null): void {
    this._user = user;
    if (user) {
      this._setStoredItem('user', JSON.stringify(user));
    } else {
      this._removeStoredItem('user');
    }
    this._notifyAuthChange();
  }

  public clearAuth(): void {
    this._token = null;
    this._user = null;
    this._removeStoredItem('token');
    this._removeStoredItem('user');
    this._notifyAuthChange();
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey.trim();
    this._setStoredItem('apiKey', this.apiKey);
  }

  public setPat(pat: string | null): void {
    this.pat = pat ? pat.trim() : null;
    if (this.pat) {
      this._setStoredItem('pat', this.pat);
    } else {
      this._removeStoredItem('pat');
    }
  }

  // ── Hardware / Device Fingerprinting ───────────────────────────────────────

  public getDeviceFingerprint(): string {
    if (typeof window === 'undefined') return 'server_or_node_client';
    try {
      const parts = [
        navigator.userAgent || '',
        window.screen ? `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth || 24}` : 'screen',
        navigator.hardwareConcurrency || 4,
        navigator.language || 'en',
        new Date().getTimezoneOffset()
      ];

      try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = '14px Arial';
          ctx.fillStyle = '#f60';
          ctx.fillRect(125, 1, 62, 20);
          ctx.fillStyle = '#069';
          ctx.fillText('FlareBase,did:1.0', 2, 15);
          parts.push(canvas.toDataURL().slice(-40));
        }
      } catch (_) {}

      let hash = 0;
      const str = parts.join('|||');
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return `dfp_${Math.abs(hash).toString(16)}_${navigator.hardwareConcurrency || 4}`;
    } catch (_) {
      return `dfp_fallback_${Date.now()}`;
    }
  }

  // ── Unified Request Dispatcher ─────────────────────────────────────────────

  public async request<T = any>(endpoint: string, options: RequestInit & { includeAuth?: boolean } = {}): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.apiKey) {
      headers['x-flarebase-api-key'] = this.apiKey;
      headers['x-flare-api-key'] = this.apiKey;
    }

    if (this.projectId) {
      headers['x-flarebase-project-id'] = this.projectId;
      headers['x-flare-project-id'] = this.projectId;
    }

    if (this.pat) {
      headers['x-flarebase-pat'] = this.pat;
    }

    const dfp = this.getDeviceFingerprint();
    if (dfp) {
      headers['x-device-fingerprint'] = dfp;
    }

    if (options.includeAuth !== false && this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }

    const fetchOptions: RequestInit = {
      ...options,
      headers
    };

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (networkErr: any) {
      const error = FlareBaseError.network(networkErr, this.baseUrl);
      this._emit('error', error);
      if (this._onErrorCallback) this._onErrorCallback(error);
      throw error;
    }

    let payload: any = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        payload = await response.json();
      } catch (_) {
        payload = null;
      }
    } else {
      const text = await response.text();
      payload = { success: response.ok, message: text, data: text };
    }

    if (!response.ok) {
      const error = FlareBaseError.fromResponse(response.status, payload);
      this._emit('error', error);
      if (this._onErrorCallback) this._onErrorCallback(error);

      if (response.status === 401) this._emit('unauthorized', error);
      if (response.status === 403) this._emit('forbidden', error);

      throw error;
    }

    const apiResponse = payload as ApiResponse<T>;
    if (apiResponse && typeof apiResponse === 'object' && 'data' in apiResponse) {
      return apiResponse.data as T;
    }
    return payload as T;
  }

  // ── Event Bus ──────────────────────────────────────────────────────────────

  public on(event: string, callback: (payload: any) => void): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event)!.push(callback);
    return () => this.off(event, callback);
  }

  public off(event: string, callback: (payload: any) => void): void {
    const list = this._listeners.get(event);
    if (!list) return;
    this._listeners.set(event, list.filter(cb => cb !== callback));
  }

  private _emit(event: string, payload: any): void {
    const list = this._listeners.get(event);
    if (list) {
      for (const cb of list) {
        try { cb(payload); } catch (e) { console.error(`[FlareBaseClient] Listener error on [${event}]:`, e); }
      }
    }
  }

  private _notifyAuthChange(): void {
    const state = { token: this._token, user: this._user };
    this._emit('authChange', state);
    if (this._onAuthChangeCallback) {
      try { this._onAuthChangeCallback(state); } catch (e) { console.error('[FlareBaseClient] onAuthChange error:', e); }
    }
  }

  // ── Storage Helpers ────────────────────────────────────────────────────────

  private _getStoredItem(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(`${this._prefix}${key}`);
    } catch (_) {
      return null;
    }
  }

  private _setStoredItem(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`${this._prefix}${key}`, value);
    } catch (_) {}
  }

  private _removeStoredItem(key: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(`${this._prefix}${key}`);
    } catch (_) {}
  }

  private _loadStoredUser(): AuthUser | null {
    const raw = this._getStoredItem('user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch (_) {
      return null;
    }
  }
}
