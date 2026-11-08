"use strict";
var FlareBase = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    FlareBase: () => FlareBase,
    FlareBaseAuth: () => FlareBaseAuth,
    FlareBaseClient: () => FlareBaseClient,
    FlareBaseCollection: () => FlareBaseCollection,
    FlareBaseError: () => FlareBaseError,
    FlareBaseStorage: () => FlareBaseStorage,
    createClient: () => createClient,
    default: () => index_default
  });

  // src/errors.ts
  var FlareBaseError = class _FlareBaseError extends Error {
    status;
    code;
    data;
    originalError;
    isFlareBaseError = true;
    constructor(message, options = {}) {
      super(message);
      this.name = "FlareBaseError";
      this.status = options.status ?? 0;
      this.code = options.code ?? (this.status === 0 ? "NETWORK_ERROR" : `HTTP_${this.status}`);
      this.data = options.data ?? null;
      this.originalError = options.originalError;
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, _FlareBaseError);
      }
    }
    static fromResponse(status, payload) {
      const message = payload?.message || payload?.error || `Request failed with HTTP status ${status}`;
      const code = payload?.code || (status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : `HTTP_${status}`);
      return new _FlareBaseError(message, {
        status,
        code,
        data: payload?.data ?? payload
      });
    }
    static network(originalError, baseUrl) {
      return new _FlareBaseError(
        `Network error or FlareBase server unreachable at ${baseUrl}. Please verify host connectivity and server status.`,
        {
          status: 0,
          code: "NETWORK_ERROR",
          originalError
        }
      );
    }
  };

  // src/auth.ts
  var FlareBaseAuth = class {
    client;
    constructor(client) {
      this.client = client;
    }
    /**
     * Discover active project authentication configuration and enabled providers.
     */
    async getConfig() {
      return await this.client.request(`/api/v1/project-auth/config?_t=${Date.now()}`, {
        method: "GET",
        includeAuth: false
      });
    }
    /**
     * Register a new project end-user.
     *
     * @example
     * const auth = await flare.auth.register({
     *   email: 'alice@company.com',
     *   password: 'StrongPassword123!',
     *   name: 'Alice Cooper'
     * });
     */
    async register(params) {
      const res = await this.client.request("/api/v1/project-auth/register", {
        method: "POST",
        includeAuth: false,
        body: JSON.stringify(params)
      });
      if (res?.token) {
        this.client.setToken(res.token);
        if (res.user) this.client.setUser(res.user);
      }
      return res;
    }
    /**
     * Sign in an existing project user with email and password.
     */
    async login(credentials) {
      const res = await this.client.request("/api/v1/project-auth/login", {
        method: "POST",
        includeAuth: false,
        body: JSON.stringify(credentials)
      });
      if (res?.token) {
        this.client.setToken(res.token);
        if (res.user) this.client.setUser(res.user);
      }
      return res;
    }
    /**
     * Authenticate with a social OAuth token (Google, Apple, GitHub).
     */
    async oauth(provider, token) {
      const res = await this.client.request(`/api/v1/project-auth/oauth/${encodeURIComponent(provider)}`, {
        method: "POST",
        includeAuth: false,
        body: JSON.stringify({ token })
      });
      if (res?.token) {
        this.client.setToken(res.token);
        if (res.user) this.client.setUser(res.user);
      }
      return res;
    }
    /**
     * Fetch the currently authenticated user's profile and permissions.
     */
    async me() {
      const res = await this.client.request("/api/v1/auth/me", {
        method: "GET"
      });
      const user = res?.user || res;
      this.client.setUser(user);
      return user;
    }
    /**
     * Refresh current user session token.
     */
    async refresh(refreshToken) {
      const res = await this.client.request("/api/v1/project-auth/refresh", {
        method: "POST",
        includeAuth: false,
        body: JSON.stringify({ refreshToken })
      });
      if (res?.token) {
        this.client.setToken(res.token);
      }
      return res;
    }
    /**
     * Sign out the active user and clear session storage.
     */
    async logout() {
      try {
        await this.client.request("/api/v1/project-auth/logout", {
          method: "POST"
        });
      } catch (_) {
      } finally {
        this.client.clearAuth();
      }
      return { success: true };
    }
    /**
     * Request a 6-digit OTP or passwordless magic link email.
     */
    async requestMagicLink(email) {
      return await this.client.request("/api/v1/auth/magic-link/request", {
        method: "POST",
        includeAuth: false,
        body: JSON.stringify({ email })
      });
    }
    /**
     * Verify a magic link token or 6-digit email OTP.
     */
    async verifyMagicLink(tokenOrOtp, email) {
      const res = await this.client.request("/api/v1/auth/magic-link/verify", {
        method: "POST",
        includeAuth: false,
        body: JSON.stringify({ token: tokenOrOtp, email })
      });
      if (res?.token) {
        this.client.setToken(res.token);
        if (res.user) this.client.setUser(res.user);
      }
      return res;
    }
    /**
     * Export user account data under GDPR / DPDP Right to Data Portability (Article 20).
     */
    async exportData() {
      return await this.client.request("/api/v1/project-auth/export-data", {
        method: "GET"
      });
    }
    /**
     * Request account deletion (initiates cryptographic shredding & cooling-off window).
     */
    async deleteAccount() {
      const res = await this.client.request("/api/v1/project-auth/account", {
        method: "DELETE"
      });
      this.client.clearAuth();
      return res;
    }
    /**
     * Convenience helpers
     */
    getUser() {
      return this.client.getUser();
    }
    isAuthenticated() {
      return !!this.client.getToken();
    }
  };

  // src/storage.ts
  var FlareBaseStorage = class {
    client;
    constructor(client) {
      this.client = client;
    }
    /**
     * Upload a file, blob, or asset to the project storage vault.
     *
     * @param fileOrBlob File or Blob object (e.g. from <input type="file"> or buffer).
     * @param fieldName Form field name (default: 'file').
     * @param customFilename Optional custom filename override.
     */
    async upload(fileOrBlob, fieldName = "file", customFilename) {
      if (typeof FormData === "undefined") {
        throw new Error("FlareBase: FormData is not available in this environment.");
      }
      const formData = new FormData();
      if (customFilename && typeof Blob !== "undefined" && fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)) {
        formData.append(fieldName, fileOrBlob, customFilename);
      } else {
        formData.append(fieldName, fileOrBlob, customFilename);
      }
      return await this.client.request("/api/v1/storage/upload", {
        method: "POST",
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
    async getSignedUrl(filename, operation = "read", expiresIn = 3600) {
      return await this.client.request("/api/v1/storage/signed-url", {
        method: "POST",
        body: JSON.stringify({ filename, operation, expiresIn })
      });
    }
    /**
     * Retrieve active storage usage metrics and quota ceiling.
     */
    async getQuota() {
      return await this.client.request("/api/v1/storage/quota", {
        method: "GET"
      });
    }
    /**
     * List assets in the project storage vault.
     */
    async list() {
      const res = await this.client.request("/api/v1/storage/assets", {
        method: "GET"
      });
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.assets)) return res.assets;
      return res?.data || [];
    }
    /**
     * Delete an asset by ID from the storage vault.
     */
    async delete(id) {
      return await this.client.request(`/api/v1/storage/assets/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
    }
    /**
     * Build a permanent or direct asset stream URL.
     */
    getAssetUrl(idOrFilename) {
      if (!idOrFilename) return "";
      if (idOrFilename.startsWith("http://") || idOrFilename.startsWith("https://")) {
        return idOrFilename;
      }
      const clean = idOrFilename.replace(/^\/+/, "");
      return `${this.client.baseUrl}/api/v1/storage/assets/${encodeURIComponent(clean)}/file`;
    }
  };

  // src/collection.ts
  function normalizeDoc(raw) {
    if (!raw || typeof raw !== "object") return raw;
    const id = String(raw.id || raw._id || "");
    const { _id, _ownerId, _projectId, _createdAt, _updatedAt, _rules, ...fields } = raw;
    const data = raw.data && typeof raw.data === "object" ? raw.data : fields;
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
  var FlareBaseCollection = class {
    name;
    client;
    constructor(client, name) {
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
    async insert(data, rules) {
      const docPayload = { ...data || {} };
      if (rules && typeof rules === "object") {
        docPayload._rules = rules;
      }
      const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents`;
      const res = await this.client.request(endpoint, {
        method: "POST",
        body: JSON.stringify({ data: docPayload })
      });
      return normalizeDoc(res);
    }
    /**
     * Fetch a single document by ID.
     */
    async get(id) {
      if (!id) throw new Error("FlareBase: Document ID is required.");
      const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`;
      const res = await this.client.request(endpoint, {
        method: "GET"
      });
      return normalizeDoc(res);
    }
    /**
     * Query documents in this collection with filtering, sorting, and pagination.
     */
    async query(options = {}) {
      const params = new URLSearchParams();
      if (options.limit !== void 0) params.set("limit", String(options.limit));
      if (options.offset !== void 0) params.set("offset", String(options.offset));
      if (options.sortBy) params.set("sortBy", options.sortBy);
      if (options.sortOrder) params.set("sortOrder", options.sortOrder);
      if (options.filter) {
        params.set("filter", typeof options.filter === "string" ? options.filter : JSON.stringify(options.filter));
      }
      if (options.where) {
        params.set("where", JSON.stringify(options.where));
      }
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents${queryStr}`;
      const res = await this.client.request(endpoint, {
        method: "GET"
      });
      let rawItems = [];
      let total;
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
        items: rawItems.map((item) => normalizeDoc(item)),
        total: total ?? rawItems.length,
        limit: options.limit,
        offset: options.offset
      };
    }
    /**
     * Alias for query()
     */
    async list(options = {}) {
      return this.query(options);
    }
    /**
     * Update fields on an existing document.
     */
    async update(id, fields) {
      if (!id) throw new Error("FlareBase: Document ID is required for update.");
      const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`;
      const res = await this.client.request(endpoint, {
        method: "PATCH",
        body: JSON.stringify({ data: fields })
      });
      return normalizeDoc(res);
    }
    /**
     * Delete a document by ID.
     */
    async delete(id) {
      if (!id) throw new Error("FlareBase: Document ID is required for deletion.");
      const endpoint = `/api/v1/db/collections/${encodeURIComponent(this.name)}/documents/${encodeURIComponent(id)}`;
      await this.client.request(endpoint, {
        method: "DELETE"
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
    onSnapshot(callback, errorCallback) {
      const apiKey = this.client.apiKey;
      const token = this.client.getToken();
      const query = new URLSearchParams();
      if (apiKey) query.set("apiKey", apiKey);
      if (token) query.set("token", token);
      const sseUrl = `${this.client.baseUrl}/api/v1/db/collections/${encodeURIComponent(this.name)}/realtime?${query.toString()}`;
      if (typeof globalThis.EventSource !== "undefined") {
        const EventSourceClass = globalThis.EventSource;
        const es = new EventSourceClass(sseUrl);
        es.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload && payload.document) {
              payload.document = normalizeDoc(payload.document);
            }
            callback(payload);
          } catch (e) {
            if (errorCallback) errorCallback(e);
          }
        };
        es.onerror = (err) => {
          if (errorCallback) errorCallback(err);
        };
        return () => {
          es.close();
        };
      }
      const abortController = new AbortController();
      let isTerminated = false;
      (async () => {
        try {
          const headers = {
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache"
          };
          if (apiKey) headers["x-flarebase-api-key"] = apiKey;
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const res = await fetch(sseUrl, {
            headers,
            signal: abortController.signal
          });
          if (!res.ok || !res.body) {
            throw new Error(`SSE stream connection failed with HTTP ${res.status}`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!isTerminated) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() || "";
            for (const block of blocks) {
              const lines = block.split("\n");
              let dataLine = "";
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  dataLine = line.slice(6).trim();
                }
              }
              if (dataLine) {
                try {
                  const parsed = JSON.parse(dataLine);
                  if (parsed && parsed.document) {
                    parsed.document = normalizeDoc(parsed.document);
                  }
                  callback(parsed);
                } catch (e) {
                }
              }
            }
          }
        } catch (err) {
          if (!isTerminated && errorCallback && err.name !== "AbortError") {
            errorCallback(err);
          }
        }
      })();
      return () => {
        isTerminated = true;
        try {
          abortController.abort();
        } catch (_) {
        }
      };
    }
  };

  // src/client.ts
  var FlareBaseClient = class {
    baseUrl;
    apiKey;
    projectId;
    pat;
    _token = null;
    _user = null;
    _prefix;
    _listeners = /* @__PURE__ */ new Map();
    _onAuthChangeCallback;
    _onErrorCallback;
    auth;
    storage;
    constructor(options = {}) {
      const isBrowser = typeof window !== "undefined" && typeof window.location !== "undefined";
      const defaultOrigin = isBrowser && window.location.origin ? window.location.origin : "http://localhost:3000";
      this._prefix = options.storageKeyPrefix || "flarebase_";
      this.baseUrl = (options.baseUrl || this._getStoredItem("baseUrl") || defaultOrigin).replace(/\/+$/, "");
      this.apiKey = (options.apiKey || this._getStoredItem("apiKey") || "").trim();
      this.projectId = options.projectId || this._getStoredItem("projectId") || null;
      this.pat = options.pat || this._getStoredItem("pat") || null;
      this._onAuthChangeCallback = options.onAuthChange;
      this._onErrorCallback = options.onError;
      this._token = options.token || this._getStoredItem("token") || null;
      this._user = this._loadStoredUser();
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
    collection(name) {
      return new FlareBaseCollection(this, name);
    }
    // ── Token & Session Management ─────────────────────────────────────────────
    getToken() {
      return this._token;
    }
    setToken(token) {
      this._token = token;
      if (token) {
        this._setStoredItem("token", token);
      } else {
        this._removeStoredItem("token");
      }
      this._notifyAuthChange();
    }
    getUser() {
      return this._user;
    }
    setUser(user) {
      this._user = user;
      if (user) {
        this._setStoredItem("user", JSON.stringify(user));
      } else {
        this._removeStoredItem("user");
      }
      this._notifyAuthChange();
    }
    clearAuth() {
      this._token = null;
      this._user = null;
      this._removeStoredItem("token");
      this._removeStoredItem("user");
      this._notifyAuthChange();
    }
    setApiKey(apiKey) {
      this.apiKey = apiKey.trim();
      this._setStoredItem("apiKey", this.apiKey);
    }
    setPat(pat) {
      this.pat = pat ? pat.trim() : null;
      if (this.pat) {
        this._setStoredItem("pat", this.pat);
      } else {
        this._removeStoredItem("pat");
      }
    }
    // ── Hardware / Device Fingerprinting ───────────────────────────────────────
    getDeviceFingerprint() {
      if (typeof window === "undefined") return "server_or_node_client";
      try {
        const parts = [
          navigator.userAgent || "",
          window.screen ? `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth || 24}` : "screen",
          navigator.hardwareConcurrency || 4,
          navigator.language || "en",
          (/* @__PURE__ */ new Date()).getTimezoneOffset()
        ];
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 200;
          canvas.height = 50;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.textBaseline = "top";
            ctx.font = "14px Arial";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = "#069";
            ctx.fillText("FlareBase,did:1.0", 2, 15);
            parts.push(canvas.toDataURL().slice(-40));
          }
        } catch (_) {
        }
        let hash = 0;
        const str = parts.join("|||");
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
        }
        return `dfp_${Math.abs(hash).toString(16)}_${navigator.hardwareConcurrency || 4}`;
      } catch (_) {
        return `dfp_fallback_${Date.now()}`;
      }
    }
    // ── Unified Request Dispatcher ─────────────────────────────────────────────
    async request(endpoint, options = {}) {
      const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
      const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
      const headers = {
        "Accept": "application/json",
        ...options.headers || {}
      };
      if (!isFormData && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      if (this.apiKey) {
        headers["x-flarebase-api-key"] = this.apiKey;
        headers["x-flare-api-key"] = this.apiKey;
      }
      if (this.projectId) {
        headers["x-flarebase-project-id"] = this.projectId;
        headers["x-flare-project-id"] = this.projectId;
      }
      if (this.pat) {
        headers["x-flarebase-pat"] = this.pat;
      }
      const dfp = this.getDeviceFingerprint();
      if (dfp) {
        headers["x-device-fingerprint"] = dfp;
      }
      if (options.includeAuth !== false && this._token) {
        headers["Authorization"] = `Bearer ${this._token}`;
      }
      const fetchOptions = {
        ...options,
        headers
      };
      let response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (networkErr) {
        const error = FlareBaseError.network(networkErr, this.baseUrl);
        this._emit("error", error);
        if (this._onErrorCallback) this._onErrorCallback(error);
        throw error;
      }
      let payload = null;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
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
        this._emit("error", error);
        if (this._onErrorCallback) this._onErrorCallback(error);
        if (response.status === 401) this._emit("unauthorized", error);
        if (response.status === 403) this._emit("forbidden", error);
        throw error;
      }
      const apiResponse = payload;
      if (apiResponse && typeof apiResponse === "object" && "data" in apiResponse) {
        return apiResponse.data;
      }
      return payload;
    }
    // ── Event Bus ──────────────────────────────────────────────────────────────
    on(event, callback) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, []);
      }
      this._listeners.get(event).push(callback);
      return () => this.off(event, callback);
    }
    off(event, callback) {
      const list = this._listeners.get(event);
      if (!list) return;
      this._listeners.set(event, list.filter((cb) => cb !== callback));
    }
    _emit(event, payload) {
      const list = this._listeners.get(event);
      if (list) {
        for (const cb of list) {
          try {
            cb(payload);
          } catch (e) {
            console.error(`[FlareBaseClient] Listener error on [${event}]:`, e);
          }
        }
      }
    }
    _notifyAuthChange() {
      const state = { token: this._token, user: this._user };
      this._emit("authChange", state);
      if (this._onAuthChangeCallback) {
        try {
          this._onAuthChangeCallback(state);
        } catch (e) {
          console.error("[FlareBaseClient] onAuthChange error:", e);
        }
      }
    }
    // ── Storage Helpers ────────────────────────────────────────────────────────
    _getStoredItem(key) {
      if (typeof localStorage === "undefined") return null;
      try {
        return localStorage.getItem(`${this._prefix}${key}`);
      } catch (_) {
        return null;
      }
    }
    _setStoredItem(key, value) {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(`${this._prefix}${key}`, value);
      } catch (_) {
      }
    }
    _removeStoredItem(key) {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.removeItem(`${this._prefix}${key}`);
      } catch (_) {
      }
    }
    _loadStoredUser() {
      const raw = this._getStoredItem("user");
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }
  };

  // src/index.ts
  function createClient(options = {}) {
    return new FlareBaseClient(options);
  }
  var FlareBase = FlareBaseClient;
  var index_default = FlareBaseClient;
  if (typeof globalThis !== "undefined") {
    globalThis.FlareBaseClient = FlareBaseClient;
    globalThis.createFlareBaseClient = createClient;
  }
  return __toCommonJS(index_exports);
})();
