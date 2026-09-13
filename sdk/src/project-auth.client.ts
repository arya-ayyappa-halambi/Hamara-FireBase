// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/project-auth.client.ts
//  Project End-User Authentication Module for @flarebase/sdk.
//  Provides zero-bypass client authentication, dynamic OAuth Client ID sync,
//  and public user registration policy enforcement.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiResponse } from './types.js';

export interface ProjectAuthConfig {
  allowPublicRegistration: boolean;
  email: {
    enabled: boolean;
  };
  google: {
    enabled: boolean;
    clientId?: string;
  };
  github: {
    enabled: boolean;
    clientId?: string;
  };
  apple: {
    enabled: boolean;
    clientId?: string;
  };
  [key: string]: any;
}

export interface ProjectUser {
  id: string;
  email: string;
  projectId: string;
  role: string;
  customClaims?: Record<string, any>;
  [key: string]: any;
}

export interface ProjectAuthResponse {
  accessToken: string;
  user: ProjectUser;
}

export class ProjectAuthClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private accessToken: string | null = null;
  private currentUser: ProjectUser | null = null;
  private cachedConfig: ProjectAuthConfig | null = null;

  constructor(baseUrl: string, apiKey: string, accessToken?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.accessToken = accessToken ?? null;
  }

  /**
   * Retrieve active access token
   */
  getToken(): string | null {
    return this.accessToken;
  }

  /**
   * Set access token manually
   */
  setToken(token: string | null): void {
    this.accessToken = token;
  }

  /**
   * Retrieve current authenticated user
   */
  getUser(): ProjectUser | null {
    return this.currentUser;
  }

  /**
   * Discover real-time Auth Configuration and OAuth Client IDs from FlareBase.
   * GET /api/v1/project-auth/config
   */
  async getConfig(forceFresh = false): Promise<ProjectAuthConfig> {
    if (!forceFresh && this.cachedConfig) {
      return this.cachedConfig;
    }

    const res = await fetch(`${this.baseUrl}/api/v1/project-auth/config?_t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'x-flarebase-api-key': this.apiKey,
        'x-flare-api-key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });

    const json = (await res.json()) as ApiResponse<ProjectAuthConfig>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Failed to fetch project auth configuration (${res.status}).`);
    }

    this.cachedConfig = json.data;
    return json.data;
  }

  /**
   * Security Guard: Verifies provider is enabled on the server before proceeding.
   */
  async verifyProvider(provider: 'email' | 'google' | 'github' | 'apple' | string): Promise<ProjectAuthConfig> {
    const norm = provider.toLowerCase().trim();
    const cfg = await this.getConfig(true); // always verify fresh

    if (norm === 'email' || norm === 'password') {
      if (cfg.email && cfg.email.enabled === false) {
        throw new Error('FlareBase Security Violation: Email & Password authentication is disabled for this project.');
      }
      return cfg;
    }

    if (['google', 'github', 'apple'].includes(norm)) {
      const pCfg = (cfg as any)[norm];
      if (!pCfg || pCfg.enabled === false) {
        throw new Error(`FlareBase Security Violation: ${norm.toUpperCase()} authentication is disabled for this project.`);
      }
      if (!pCfg.clientId || !pCfg.clientId.trim()) {
        throw new Error(`FlareBase Configuration Error: ${norm.toUpperCase()} Client ID is not configured in FlareBase dashboard.`);
      }
      return cfg;
    }

    return cfg;
  }

  /**
   * Register a new project user (Email/Password).
   * POST /api/v1/project-auth/register
   */
  async signUp(params: { email: string; password: string; name?: string; role?: string }): Promise<ProjectAuthResponse> {
    await this.verifyProvider('email');

    const res = await fetch(`${this.baseUrl}/api/v1/project-auth/register`, {
      method: 'POST',
      headers: {
        'x-flarebase-api-key': this.apiKey,
        'x-flare-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    const json = (await res.json()) as ApiResponse<ProjectAuthResponse>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Registration failed.');
    }

    const data = json.data;
    this.accessToken = data.accessToken || (data as any).token;
    this.currentUser = data.user;
    return data;
  }

  /**
   * Sign in an existing project user (Email/Password).
   * POST /api/v1/project-auth/login
   */
  async signIn(params: { email: string; password: string }): Promise<ProjectAuthResponse> {
    await this.verifyProvider('email');

    const res = await fetch(`${this.baseUrl}/api/v1/project-auth/login`, {
      method: 'POST',
      headers: {
        'x-flarebase-api-key': this.apiKey,
        'x-flare-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    const json = (await res.json()) as ApiResponse<ProjectAuthResponse>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Login failed.');
    }

    const data = json.data;
    this.accessToken = data.accessToken || (data as any).token;
    this.currentUser = data.user;
    return data;
  }

  /**
   * Sign in or register via OAuth provider token.
   * POST /api/v1/project-auth/oauth/<provider>
   */
  async signInWithOAuth(provider: 'google' | 'github' | 'apple' | string, token: string): Promise<ProjectAuthResponse> {
    await this.verifyProvider(provider);

    const res = await fetch(`${this.baseUrl}/api/v1/project-auth/oauth/${encodeURIComponent(provider)}`, {
      method: 'POST',
      headers: {
        'x-flarebase-api-key': this.apiKey,
        'x-flare-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    const json = (await res.json()) as ApiResponse<ProjectAuthResponse>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || `${provider} OAuth sign-in failed.`);
    }

    const data = json.data;
    this.accessToken = data.accessToken || (data as any).token;
    this.currentUser = data.user;
    return data;
  }

  /**
   * Helper: Automatically initialize Google Identity Services on a web page using
   * the Client ID configured directly in the FlareBase dashboard.
   */
  async initGoogleAuth(options: {
    callback: (authResponse: ProjectAuthResponse) => void;
    onError?: (error: Error) => void;
    buttonContainer?: HTMLElement | string;
    buttonOptions?: Record<string, any>;
  }): Promise<string | null> {
    const cfg = await this.getConfig();
    if (!cfg.google || !cfg.google.enabled || !cfg.google.clientId) {
      console.warn('[FlareBase] Google auth is disabled or missing Client ID in FlareBase project settings.');
      return null;
    }

    const clientId = cfg.google.clientId.trim();
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
      const google = (window as any).google;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          if (response && response.credential) {
            try {
              const authRes = await this.signInWithOAuth('google', response.credential);
              options.callback(authRes);
            } catch (err: any) {
              if (options.onError) options.onError(err);
              else console.error('[FlareBase Google Auth]', err);
            }
          }
        }
      });

      if (options.buttonContainer) {
        const container = typeof options.buttonContainer === 'string'
          ? document.getElementById(options.buttonContainer)
          : options.buttonContainer;

        if (container) {
          google.accounts.id.renderButton(container, options.buttonOptions || {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'signin_with'
          });
        }
      }
    }

    return clientId;
  }

  /**
   * Sign out and clear stored tokens
   */
  signOut(): void {
    this.accessToken = null;
    this.currentUser = null;
  }
}
