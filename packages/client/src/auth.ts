// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/client — auth.ts
//  Project User and Platform Authentication module.
// ─────────────────────────────────────────────────────────────────────────────

import { FlareBaseClient } from './client';
import {
  AuthResponse,
  AuthUser,
  ProjectAuthConfig
} from './types';

export class FlareBaseAuth {
  private readonly client: FlareBaseClient;

  constructor(client: FlareBaseClient) {
    this.client = client;
  }

  /**
   * Discover active project authentication configuration and enabled providers.
   */
  async getConfig(): Promise<ProjectAuthConfig> {
    return await this.client.request<ProjectAuthConfig>(`/api/v1/project-auth/config?_t=${Date.now()}`, {
      method: 'GET',
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
  async register(params: {
    email: string;
    password: string;
    name?: string;
    role?: string;
  }): Promise<AuthResponse> {
    const res = await this.client.request<AuthResponse>('/api/v1/project-auth/register', {
      method: 'POST',
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
  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    const res = await this.client.request<AuthResponse>('/api/v1/project-auth/login', {
      method: 'POST',
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
  async oauth(provider: 'google' | 'github' | 'apple' | string, token: string): Promise<AuthResponse> {
    const res = await this.client.request<AuthResponse>(`/api/v1/project-auth/oauth/${encodeURIComponent(provider)}`, {
      method: 'POST',
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
  async me(): Promise<AuthUser> {
    const res = await this.client.request<any>('/api/v1/auth/me', {
      method: 'GET'
    });
    const user = res?.user || res;
    this.client.setUser(user);
    return user as AuthUser;
  }

  /**
   * Refresh current user session token.
   */
  async refresh(refreshToken: string): Promise<{ token: string }> {
    const res = await this.client.request<{ token: string }>('/api/v1/project-auth/refresh', {
      method: 'POST',
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
  async logout(): Promise<{ success: boolean }> {
    try {
      await this.client.request('/api/v1/project-auth/logout', {
        method: 'POST'
      });
    } catch (_) {
      // Ignore server-side logout failures and ensure local state is cleared
    } finally {
      this.client.clearAuth();
    }
    return { success: true };
  }

  /**
   * Request a 6-digit OTP or passwordless magic link email.
   */
  async requestMagicLink(email: string): Promise<{ success: boolean; message?: string }> {
    return await this.client.request<{ success: boolean; message?: string }>('/api/v1/auth/magic-link/request', {
      method: 'POST',
      includeAuth: false,
      body: JSON.stringify({ email })
    });
  }

  /**
   * Verify a magic link token or 6-digit email OTP.
   */
  async verifyMagicLink(tokenOrOtp: string, email?: string): Promise<AuthResponse> {
    const res = await this.client.request<AuthResponse>('/api/v1/auth/magic-link/verify', {
      method: 'POST',
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
  async exportData(): Promise<any> {
    return await this.client.request('/api/v1/project-auth/export-data', {
      method: 'GET'
    });
  }

  /**
   * Request account deletion (initiates cryptographic shredding & cooling-off window).
   */
  async deleteAccount(): Promise<{ success: boolean; message?: string }> {
    const res = await this.client.request<{ success: boolean; message?: string }>('/api/v1/project-auth/account', {
      method: 'DELETE'
    });
    this.client.clearAuth();
    return res;
  }

  /**
   * Convenience helpers
   */
  getUser(): AuthUser | null {
    return this.client.getUser();
  }

  isAuthenticated(): boolean {
    return !!this.client.getToken();
  }
}
