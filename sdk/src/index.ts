// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/index.ts
//  Main FlareBase client entry point for @flarebase/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import { FlareBaseConfig } from './types.js';
import { AuthClient } from './auth.client.js';
import { ProjectAuthClient } from './project-auth.client.js';
import { DbClient } from './db.client.js';
import { StorageClient } from './storage.client.js';
import { HosterClient } from './hoster.client.js';
import { RealtimeClient } from './realtime.client.js';

export * from './types.js';
export { AuthClient } from './auth.client.js';
export { ProjectAuthClient } from './project-auth.client.js';
export { DbClient } from './db.client.js';
export { StorageClient } from './storage.client.js';
export { HosterClient } from './hoster.client.js';
export { RealtimeClient } from './realtime.client.js';

/**
 * Unified FlareBase Client class.
 *
 * @example
 * // API Key initialization (Recommended for frontend apps / AI agents)
 * const flare = new FlareBase({ baseUrl: 'http://localhost:3000', apiKey: 'flare_pk_...' });
 * 
 * // Project User Authentication with Zero-Bypass security:
 * await flare.projectAuth.signIn({ email: 'user@example.com', password: 'password123' });
 * 
 * // Dynamic Google Identity sign-in with Client ID from FlareBase:
 * await flare.projectAuth.initGoogleAuth({ callback: (user) => console.log('Logged in:', user) });
 * 
 * // Database Collections:
 * const docs = await flare.db.collection('products').query();
 */
export class FlareBase {
  public readonly auth: AuthClient;
  public readonly projectAuth: ProjectAuthClient;
  public readonly db: DbClient;
  public readonly storage: StorageClient;
  public readonly hoster: HosterClient;
  public readonly realtime: RealtimeClient;

  constructor(config: FlareBaseConfig = {}) {
    const baseUrl = config.baseUrl || 'http://localhost:3000';
    const wsUrl = config.wsUrl || baseUrl.replace(/^http/, 'ws');
    const apiKey = config.apiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('flareApiKey') || localStorage.getItem('flarebaseApiKey')  || '') : '');

    this.auth = new AuthClient(baseUrl, config.accessToken, config.refreshToken);
    this.projectAuth = new ProjectAuthClient(baseUrl, apiKey, config.accessToken);
    this.db = new DbClient(baseUrl, this.auth, apiKey, config.projectId);
    this.storage = new StorageClient(baseUrl, this.auth, apiKey, config.projectId);
    this.hoster = new HosterClient(baseUrl, this.auth);
    this.realtime = new RealtimeClient(wsUrl, this.auth);
  }
}

export const FlareBaseClient = FlareBase;
export default FlareBase;
