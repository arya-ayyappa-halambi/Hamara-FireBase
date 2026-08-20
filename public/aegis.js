/**
 * =========================================================
 * AegisDB JavaScript Client SDK (v1.0.0)
 * Lightweight, self-hosted BaaS Client
 * Supports: Auth, Collections CRUD, Row-Level Security Rules,
 * Real-Time SSE sync, File/Biometric Storage, and Error Interceptors.
 * =========================================================
 */

(function (global) {
  'use strict';

  class AegisClient {
    constructor(options = {}) {
      this.baseUrl = (options.baseUrl || localStorage.getItem('aegisBaseUrl') || 'http://localhost:3000').replace(/\/+$/, '');
      this.apiKey = options.apiKey || localStorage.getItem('aegisApiKey') || 'aegis_pk_a85e45e984ca9724ca01019954cf2f17';
      this._token = localStorage.getItem('aegisToken') || null;
      this._user = this._loadStoredUser();
      this._eventSources = new Map();
      this._listeners = new Map();

      // Submodules
      this.auth = new AegisAuthModule(this);
      this.db = new AegisDatabaseModule(this);
      this.storage = new AegisStorageModule(this);
    }

    _loadStoredUser() {
      try {
        const raw = localStorage.getItem('aegisUser');
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    getBaseUrl() {
      return this.baseUrl;
    }

    setBaseUrl(url) {
      this.baseUrl = (url || 'http://localhost:3000').replace(/\/+$/, '');
      localStorage.setItem('aegisBaseUrl', this.baseUrl);
      this._emit('configChange', { baseUrl: this.baseUrl, apiKey: this.apiKey });
    }

    getApiKey() {
      return this.apiKey || localStorage.getItem('aegisApiKey') || 'aegis_pk_a85e45e984ca9724ca01019954cf2f17';
    }

    setApiKey(key) {
      this.apiKey = (key || '').trim();
      localStorage.setItem('aegisApiKey', this.apiKey);
      this._emit('configChange', { baseUrl: this.baseUrl, apiKey: this.apiKey });
    }

    getToken() {
      return this._token || localStorage.getItem('aegisToken') || null;
    }

    setToken(token) {
      this._token = token;
      if (token) {
        localStorage.setItem('aegisToken', token);
      } else {
        localStorage.removeItem('aegisToken');
      }
      this._emit('authChange', { token: this._token, user: this._user });
    }

    getUser() {
      return this._user || this._loadStoredUser();
    }

    setUser(user) {
      this._user = user;
      if (user) {
        localStorage.setItem('aegisUser', JSON.stringify(user));
      } else {
        localStorage.removeItem('aegisUser');
      }
      this._emit('authChange', { token: this._token, user: this._user });
    }

    clearAuth() {
      this._token = null;
      this._user = null;
      localStorage.removeItem('aegisToken');
      localStorage.removeItem('aegisUser');
      this._emit('authChange', { token: null, user: null });
    }

    /**
     * Helper to prepare standard headers for AegisDB API calls
     */
    getHeaders(customHeaders = {}, includeAuth = true) {
      const headers = {
        'Accept': 'application/json',
        ...customHeaders
      };

      const apiKey = this.getApiKey();
      if (apiKey) {
        headers['x-aegis-api-key'] = apiKey;
      }

      if (includeAuth) {
        const token = this.getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      return headers;
    }

    /**
     * Standardized HTTP Request wrapper with AegisDB response parsing & error handling
     */
    async request(endpoint, options = {}) {
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      const method = options.method || 'GET';
      const isFormData = options.body instanceof FormData;
      
      const defaultHeaders = isFormData ? {} : { 'Content-Type': 'application/json' };
      const headers = this.getHeaders({ ...defaultHeaders, ...options.headers }, options.includeAuth !== false);

      const fetchOptions = {
        method,
        headers,
        ...options
      };

      if (options.body && !isFormData && typeof options.body === 'object') {
        fetchOptions.body = JSON.stringify(options.body);
      }

      let response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (networkError) {
        console.warn(`[AegisDB Network Error] ${method} ${url}:`, networkError);
        const errObj = {
          success: false,
          status: 0,
          message: `Network error or AegisDB server unreachable at ${this.baseUrl}. Please check server status.`,
          isNetworkError: true,
          originalError: networkError
        };
        this._notifyError(errObj);
        throw errObj;
      }

      let responseData = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          responseData = await response.json();
        } catch (e) {
          responseData = null;
        }
      } else {
        const text = await response.text();
        responseData = { success: response.ok, message: text, data: text };
      }

      if (!response.ok) {
        const errorMessage = responseData?.message || responseData?.error || `HTTP ${response.status}: ${response.statusText}`;
        const errorObj = {
          success: false,
          status: response.status,
          message: errorMessage,
          data: responseData?.data || null,
          response: responseData
        };

        if (response.status === 401) {
          console.warn('[AegisDB] Unauthorized (401). Session may have expired.');
          this._emit('unauthorized', errorObj);
        } else if (response.status === 403) {
          console.warn('[AegisDB] Forbidden (403). Insufficient row or role permissions.');
          this._emit('forbidden', errorObj);
        }

        this._notifyError(errorObj);
        throw errorObj;
      }

      return responseData || { success: true, data: null };
    }

    _notifyError(err) {
      if (typeof window !== 'undefined' && window.CampusUtils && typeof window.CampusUtils.showToast === 'function') {
        const msg = err.message || 'An error occurred connecting to AegisDB';
        // Avoid spamming duplicate connection warnings
        if (!window._lastAegisToast || Date.now() - window._lastAegisToast > 3000) {
          window._lastAegisToast = Date.now();
          window.CampusUtils.showToast(msg, err.status === 401 || err.status === 403 ? 'warning' : 'error');
        }
      }
    }

    on(event, callback) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, []);
      }
      this._listeners.get(event).push(callback);
      return () => this.off(event, callback);
    }

    off(event, callback) {
      if (!this._listeners.has(event)) return;
      const list = this._listeners.get(event).filter(cb => cb !== callback);
      this._listeners.set(event, list);
    }

    _emit(event, payload) {
      if (this._listeners.has(event)) {
        this._listeners.get(event).forEach(cb => {
          try { cb(payload); } catch (e) { console.error(`Error in Aegis event listener [${event}]:`, e); }
        });
      }
    }
  }

  /**
   * =========================================================
   * 1. Aegis Auth Module (Project Auth)
   * =========================================================
   */
  class AegisAuthModule {
    constructor(client) {
      this.client = client;
    }

    /**
     * Discover Auth Configuration (OAuth providers, registration mode)
     * GET /api/v1/project-auth/config
     */
    async getConfig() {
      return await this.client.request(`/api/v1/project-auth/config?_t=${Date.now()}`, {
        method: 'GET',
        includeAuth: false
      });
    }

    /**
     * Strict Provider Security Guard:
     * Verifies that the requested authentication provider is actively enabled on AegisDB.
     * Throws an error immediately if disabled, preventing any frontend bypass or hardcoded execution.
     */
    async verifyProviderEnabled(provider) {
      const norm = (provider || '').toLowerCase().trim();
      const configRes = await this.getConfig();
      const cfg = configRes.data || configRes;
      if (!cfg) {
        throw new Error('AegisDB project authentication policies could not be loaded.');
      }

      if (norm === 'email' || norm === 'password' || norm === 'email_password') {
        if (cfg.email && typeof cfg.email === 'object' && cfg.email.enabled === false) {
          throw new Error('AegisDB Security Violation: Email & Password authentication is disabled on the AegisDB server for this project.');
        }
        if (cfg.emailAuth === false || cfg.emailPassword === false || cfg.allowEmailAuth === false || cfg.emailPasswordEnabled === false) {
          throw new Error('AegisDB Security Violation: Email & Password authentication is disabled on the AegisDB server for this project.');
        }
        if (Array.isArray(cfg.enabledProviders) && !cfg.enabledProviders.some(p => ['email', 'password', 'email_password'].includes(String(p).toLowerCase()))) {
          throw new Error('AegisDB Security Violation: Email & Password authentication is disabled on the AegisDB server for this project.');
        }
        return true;
      }

      if (['google', 'github', 'apple'].includes(norm)) {
        const pCfg = cfg[norm];
        if (pCfg && typeof pCfg === 'object' && pCfg.enabled === false) {
          throw new Error(`AegisDB Security Violation: ${norm.toUpperCase()} authentication is disabled on the AegisDB server for this project.`);
        }
        if (pCfg && typeof pCfg === 'object' && pCfg.enabled !== true && !cfg.enabledProviders?.includes(norm)) {
          throw new Error(`AegisDB Security Violation: ${norm.toUpperCase()} authentication is disabled on the AegisDB server for this project.`);
        }
        if (cfg.oauth && typeof cfg.oauth === 'object' && cfg.oauth[norm] === false) {
          throw new Error(`AegisDB Security Violation: ${norm.toUpperCase()} authentication is disabled on the AegisDB server for this project.`);
        }
        if (Array.isArray(cfg.enabledProviders) && !cfg.enabledProviders.includes(norm)) {
          throw new Error(`AegisDB Security Violation: ${norm.toUpperCase()} authentication is disabled on the AegisDB server for this project.`);
        }
        return true;
      }
      return true;
    }

    /**
     * User Sign-Up
     * POST /api/v1/project-auth/register
     */
    async signUp({ email, password, name, role = 'user' }) {
      await this.verifyProviderEnabled('email');

      const res = await this.client.request('/api/v1/project-auth/register', {
        method: 'POST',
        includeAuth: false,
        body: { email, password, name, role }
      });

      if (res && res.data && res.data.token) {
        this.client.setToken(res.data.token);
        if (res.data.user) this.client.setUser(res.data.user);
      }
      return res;
    }

    /**
     * User Sign-In (Password)
     * POST /api/v1/project-auth/login
     */
    async signIn({ email, password }) {
      await this.verifyProviderEnabled('email');

      const res = await this.client.request('/api/v1/project-auth/login', {
        method: 'POST',
        includeAuth: false,
        body: { email, password }
      });

      const payload = res.data || res;
      if (payload && payload.token) {
        this.client.setToken(payload.token);
        if (payload.user) {
          this.client.setUser(payload.user);
        }
      }
      return res;
    }

    /**
     * OAuth Sign-In (Google, Apple, GitHub)
     * POST /api/v1/project-auth/oauth/<provider>
     */
    async signInWithOAuth(provider, tokenOrPayload) {
      await this.verifyProviderEnabled(provider);

      const token = typeof tokenOrPayload === 'string' ? tokenOrPayload : tokenOrPayload.token;
      const res = await this.client.request(`/api/v1/project-auth/oauth/${provider}`, {
        method: 'POST',
        includeAuth: false,
        body: { token }
      });

      const payload = res.data || res;
      if (payload && payload.token) {
        this.client.setToken(payload.token);
        if (payload.user) {
          this.client.setUser(payload.user);
        }
      }
      return res;
    }

    /**
     * Sign out current user
     */
    signOut() {
      this.client.clearAuth();
      return { success: true };
    }

    getCurrentUser() {
      return this.client.getUser();
    }

    isAuthenticated() {
      return !!this.client.getToken();
    }
  }

  /**
   * =========================================================
   * 2 & 3. Aegis Database Module (Collections, CRUD, RLS & SSE)
   * =========================================================
   */
  class AegisDatabaseModule {
    constructor(client) {
      this.client = client;
    }

    collection(collectionName) {
      return new AegisCollectionReference(this.client, collectionName);
    }
  }

  class AegisCollectionReference {
    constructor(client, collectionName) {
      this.client = client;
      this.name = collectionName;
    }

    /**
     * Insert Document with optional Row-Level Security Rules
     * POST /api/v1/db/collections/<collection_name>/documents
     * Body: { data: { ...fields, _rules: { read: "...", write: "..." } } }
     */
    async insert(data, rules = null) {
      const docPayload = { ...(data || {}) };
      if (rules && typeof rules === 'object') {
        docPayload._rules = rules;
      }

      const res = await this.client.request(`/api/v1/db/collections/${encodeURIComponent(this.name)}/documents`, {
        method: 'POST',
        body: { data: docPayload }
      });
      return res;
    }

    /**
     * Query Documents with pagination and sorting
     * GET /api/v1/db/collections/<collection_name>/documents?limit=50&offset=0&sortBy=_createdAt&sortOrder=desc
     */
    async list(options = {}) {
      const params = new URLSearchParams();
      if (options.limit !== undefined) params.set('limit', options.limit);
      if (options.offset !== undefined) params.set('offset', options.offset);
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortOrder) params.set('sortOrder', options.sortOrder);
      if (options.filter) params.set('filter', typeof options.filter === 'string' ? options.filter : JSON.stringify(options.filter));

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await this.client.request(`/api/v1/db/collections/${encodeURIComponent(this.name)}/documents${queryStr}`, {
        method: 'GET'
      });
      return res;
    }

    /**
     * Fetch Single Document
     * GET /api/v1/db/collections/<collection_name>/documents/<id>
     */
    async get(id) {
      if (!id) throw new Error('Document ID is required');
      const res = await this.client.request(`/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`, {
        method: 'GET'
      });
      return res;
    }

    /**
     * Update Document
     * PATCH /api/v1/db/collections/<collection_name>/documents/<id>
     * Body: { data: { ...fieldsToUpdate } }
     */
    async update(id, fieldsToUpdate) {
      if (!id) throw new Error('Document ID is required');
      const res = await this.client.request(`/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { data: fieldsToUpdate }
      });
      return res;
    }

    /**
     * Delete Document
     * DELETE /api/v1/db/collections/<collection_name>/documents/<id>
     */
    async delete(id) {
      if (!id) throw new Error('Document ID is required');
      const res = await this.client.request(`/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res;
    }

    /**
     * Real-Time Data Sync via Server-Sent Events (SSE)
     * GET /api/v1/db/collections/<collection_name>/realtime?apiKey=<apiKey>
     */
    subscribe(onMessageCallback, onErrorCallback) {
      const apiKey = this.client.getApiKey();
      const sseUrl = `${this.client.baseUrl}/api/v1/db/collections/${encodeURIComponent(this.name)}/realtime?apiKey=${encodeURIComponent(apiKey)}`;

      try {
        const sse = new EventSource(sseUrl);

        sse.onopen = () => {
          console.log(`[AegisDB SSE] Connected to collection: ${this.name}`);
        };

        sse.onmessage = (event) => {
          try {
            const change = JSON.parse(event.data);
            // change: { type: 'INSERT' | 'UPDATE' | 'DELETE', document: {...} }
            if (typeof onMessageCallback === 'function') {
              onMessageCallback(change);
            }
          } catch (err) {
            console.error(`[AegisDB SSE] Error parsing realtime event for ${this.name}:`, err);
          }
        };

        sse.onerror = (err) => {
          console.warn(`[AegisDB SSE] Realtime connection warning for ${this.name}:`, err);
          if (typeof onErrorCallback === 'function') {
            onErrorCallback(err);
          }
        };

        // Return unsubscribe function
        return () => {
          sse.close();
          console.log(`[AegisDB SSE] Closed connection to collection: ${this.name}`);
        };
      } catch (err) {
        console.error(`[AegisDB SSE] Failed to initialize EventSource for ${this.name}:`, err);
        return () => {};
      }
    }
  }

  /**
   * =========================================================
   * 4. Aegis File & Biometric Storage Module
   * =========================================================
   */
  class AegisStorageModule {
    constructor(client) {
      this.client = client;
    }

    /**
     * Upload File or Biometric Data
     * POST /api/v1/storage/upload
     * Body: FormData with field 'file' or 'biometric'
     */
    async upload(fileOrBlob, fieldName = 'file', customFilename = null) {
      const formData = new FormData();
      if (customFilename && fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)) {
        formData.append(fieldName, fileOrBlob, customFilename);
      } else {
        formData.append(fieldName, fileOrBlob);
      }

      const res = await this.client.request('/api/v1/storage/upload', {
        method: 'POST',
        body: formData
      });
      return res;
    }

    /**
     * Get Asset Download / Stream URL
     * GET /api/v1/storage/assets/<filename>
     */
    getAssetUrl(filename) {
      if (!filename) return '';
      if (filename.startsWith('http')) return filename;
      const cleanName = filename.replace(/^\/+/, '');
      return `${this.client.baseUrl}/api/v1/storage/assets/${encodeURIComponent(cleanName)}`;
    }
  }

  // Create singleton instance
  const Aegis = new AegisClient();

  // Export to global / window scope and module.exports
  if (typeof globalThis !== 'undefined') {
    globalThis.AegisClient = AegisClient;
    globalThis.Aegis = Aegis;
  }
  if (typeof global !== 'undefined') {
    global.AegisClient = AegisClient;
    global.Aegis = Aegis;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AegisClient, Aegis };
  }

  // ─── Floating AegisDB Status & Settings Widget ─────────────────
  function initAegisWidget() {
    if (typeof document === 'undefined' || document.getElementById('aegis-status-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'aegis-status-widget';
    widget.innerHTML = `
      <style>
        #aegis-status-widget {
          position: fixed;
          bottom: 16px;
          right: 16px;
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .aegis-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0f172a;
          color: #f8fafc;
          padding: 8px 14px;
          border-radius: 9999px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.25);
          border: 1px solid #334155;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s ease;
          user-select: none;
        }
        .aegis-badge:hover {
          background: #1e293b;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.35);
        }
        .aegis-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
          display: inline-block;
        }
        .aegis-dot.offline {
          background: #ef4444;
          box-shadow: 0 0 8px #ef4444;
        }
        .aegis-dot.warning {
          background: #f59e0b;
          box-shadow: 0 0 8px #f59e0b;
        }
        .aegis-modal {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        .aegis-modal.hidden { display: none; }
        .aegis-card {
          background: #0f172a;
          color: #f8fafc;
          border: 1px solid #334155;
          border-radius: 14px;
          padding: 24px;
          width: 100%;
          max-width: 440px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        .aegis-card h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #38bdf8;
        }
        .aegis-card p {
          margin: 0 0 16px 0;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.4;
        }
        .aegis-form-group {
          margin-bottom: 14px;
        }
        .aegis-form-group label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: #cbd5e1;
          margin-bottom: 6px;
        }
        .aegis-input {
          width: 100%;
          box-sizing: border-box;
          padding: 9px 12px;
          border-radius: 8px;
          background: #1e293b;
          border: 1px solid #475569;
          color: #fff;
          font-size: 13px;
          outline: none;
        }
        .aegis-input:focus {
          border-color: #38bdf8;
        }
        .aegis-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }
        .aegis-btn {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: 0.2s;
        }
        .aegis-btn-primary {
          background: #0284c7;
          color: white;
        }
        .aegis-btn-primary:hover {
          background: #0369a1;
        }
        .aegis-btn-secondary {
          background: #334155;
          color: #cbd5e1;
        }
        .aegis-btn-secondary:hover {
          background: #475569;
        }
      </style>
      <div class="aegis-badge" id="aegis-toggle-badge" title="Click to configure AegisDB Connection">
        <span class="aegis-dot" id="aegis-status-dot"></span>
        <span id="aegis-badge-text">AegisDB: Ready</span>
      </div>
      <div class="aegis-modal hidden" id="aegis-settings-modal">
        <div class="aegis-card">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            AegisDB BaaS Settings
          </h3>
          <p>Configure self-hosted AegisDB host URL and project API key.</p>
          <div class="aegis-form-group">
            <label>Server Base URL</label>
            <input type="text" class="aegis-input" id="aegis-cfg-url" value="${Aegis.getBaseUrl()}" placeholder="http://localhost:3000">
          </div>
          <div class="aegis-form-group">
            <label>Project API Key (x-aegis-api-key)</label>
            <input type="text" class="aegis-input" id="aegis-cfg-key" value="${Aegis.getApiKey()}" placeholder="Enter AegisDB Project API Key">
          </div>
          <div class="aegis-form-group">
            <label>Current User JWT Session</label>
            <div style="font-size: 11px; color:#94a3b8; word-break:break-all; max-height:60px; overflow-y:auto; background:#1e293b; padding:8px; border-radius:6px;">
              ${Aegis.getToken() ? `Authenticated (${Aegis.getUser()?.email || 'Active User'})` : 'No active session (Guest)'}
            </div>
          </div>
          <div class="aegis-actions">
            <button class="aegis-btn aegis-btn-secondary" id="aegis-cfg-test">Test Connection</button>
            <button class="aegis-btn aegis-btn-secondary" id="aegis-cfg-close">Cancel</button>
            <button class="aegis-btn aegis-btn-primary" id="aegis-cfg-save">Save Settings</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    const badge = document.getElementById('aegis-toggle-badge');
    const modal = document.getElementById('aegis-settings-modal');
    const closeBtn = document.getElementById('aegis-cfg-close');
    const saveBtn = document.getElementById('aegis-cfg-save');
    const testBtn = document.getElementById('aegis-cfg-test');
    const dot = document.getElementById('aegis-status-dot');
    const badgeText = document.getElementById('aegis-badge-text');

    badge.addEventListener('click', () => {
      document.getElementById('aegis-cfg-url').value = Aegis.getBaseUrl();
      document.getElementById('aegis-cfg-key').value = Aegis.getApiKey();
      modal.classList.remove('hidden');
    });

    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    saveBtn.addEventListener('click', () => {
      const newUrl = document.getElementById('aegis-cfg-url').value;
      const newKey = document.getElementById('aegis-cfg-key').value;
      Aegis.setBaseUrl(newUrl);
      Aegis.setApiKey(newKey);
      modal.classList.add('hidden');
      if (window.CampusUtils && window.CampusUtils.showToast) {
        window.CampusUtils.showToast('AegisDB settings saved!', 'success');
      }
      checkStatus();
    });

    async function checkStatus() {
      try {
        const config = await Aegis.auth.getConfig();
        dot.className = 'aegis-dot';
        badgeText.textContent = 'AegisDB: Online';
        return true;
      } catch (err) {
        if (!Aegis.getApiKey()) {
          dot.className = 'aegis-dot warning';
          badgeText.textContent = 'AegisDB: Set API Key';
        } else {
          dot.className = 'aegis-dot offline';
          badgeText.textContent = 'AegisDB: Offline';
        }
        return false;
      }
    }

    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      const ok = await checkStatus();
      testBtn.disabled = false;
      testBtn.textContent = 'Test Connection';
      if (window.CampusUtils && window.CampusUtils.showToast) {
        window.CampusUtils.showToast(ok ? 'Connected to AegisDB successfully!' : 'Could not reach AegisDB. Ensure server is running on configured host.', ok ? 'success' : 'error');
      }
    });

    // Check status periodically
    setTimeout(checkStatus, 500);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAegisWidget);
    } else {
      initAegisWidget();
    }
  }

})(typeof window !== 'undefined' ? window : this);
