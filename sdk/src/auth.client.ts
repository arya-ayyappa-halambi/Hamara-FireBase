// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/auth.client.ts
//  Authentication client module for @flarebase/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiResponse, AuthResponseData, User } from './types.js';

export class AuthClient {
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private currentUser: User | null = null;

  constructor(baseUrl: string, accessToken?: string, refreshToken?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.accessToken = accessToken ?? null;
    this.refreshToken = refreshToken ?? null;
  }

  /** Retrieve the current access token. */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Retrieve the current refresh token. */
  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /** Retrieve the currently authenticated user details. */
  getUser(): User | null {
    return this.currentUser;
  }

  /** Set tokens manually. */
  setTokens(accessToken: string | null, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  /**
   * Register a new account.
   */
  async register(email: string, password: string, name: string): Promise<AuthResponseData> {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    const json = (await res.json()) as ApiResponse<AuthResponseData>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Registration failed.');
    }

    this.accessToken = json.data.token;
    this.refreshToken = json.data.refreshToken;
    this.currentUser = json.data.user;

    return json.data;
  }

  /**
   * Login with email and password.
   */
  async login(email: string, password: string): Promise<AuthResponseData> {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = (await res.json()) as ApiResponse<AuthResponseData>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Login failed.');
    }

    this.accessToken = json.data.token;
    this.refreshToken = json.data.refreshToken;
    this.currentUser = json.data.user;

    return json.data;
  }

  /**
   * Refresh the access token using the stored or provided refresh token.
   */
  async refresh(refreshTokenInput?: string): Promise<AuthResponseData> {
    const targetToken = refreshTokenInput ?? this.refreshToken;
    if (!targetToken) {
      throw new Error('No refresh token available to refresh authentication.');
    }

    const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: targetToken }),
    });

    const json = (await res.json()) as ApiResponse<AuthResponseData>;
    if (!res.ok || !json.success) {
      this.accessToken = null;
      this.refreshToken = null;
      this.currentUser = null;
      throw new Error(json.message || 'Token refresh failed.');
    }

    this.accessToken = json.data.token;
    this.refreshToken = json.data.refreshToken;
    this.currentUser = json.data.user;

    return json.data;
  }

  /**
   * Logout and revoke the active refresh token.
   */
  async logout(): Promise<void> {
    if (this.refreshToken) {
      try {
        await fetch(`${this.baseUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      } catch {
        // Silent ignore network error during logout
      }
    }

    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser = null;
  }
}
