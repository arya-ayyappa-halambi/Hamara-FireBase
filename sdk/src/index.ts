// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/index.ts
//  Main Aegis client entry point for @aegis/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import { AegisConfig } from './types.js';
import { AuthClient } from './auth.client.js';
import { DbClient } from './db.client.js';
import { StorageClient } from './storage.client.js';
import { HosterClient } from './hoster.client.js';
import { RealtimeClient } from './realtime.client.js';

export * from './types.js';
export { AuthClient } from './auth.client.js';
export { DbClient } from './db.client.js';
export { StorageClient } from './storage.client.js';
export { HosterClient } from './hoster.client.js';
export { RealtimeClient } from './realtime.client.js';

/**
 * Unified Aegis Client class.
 *
 * @example
 * // API Key initialization (Recommended for frontend apps / AI agents)
 * const aegis = new Aegis({ baseUrl: 'http://localhost:3000', apiKey: 'aegis_pk_...' });
 * const docs = await aegis.db.collection('products').query();
 *
 * // Or JWT authentication
 * const aegis = new Aegis({ baseUrl: 'http://localhost:3000' });
 * await aegis.auth.login('user@aegis.dev', 'Secret123!');
 * const docs = await aegis.db.queryDocuments('sensors');
 */
export class Aegis {
  public readonly auth: AuthClient;
  public readonly db: DbClient;
  public readonly storage: StorageClient;
  public readonly hoster: HosterClient;
  public readonly realtime: RealtimeClient;

  constructor(config: AegisConfig = {}) {
    const baseUrl = config.baseUrl || 'http://localhost:3000';
    const wsUrl = config.wsUrl || baseUrl.replace(/^http/, 'ws');

    this.auth = new AuthClient(baseUrl, config.accessToken, config.refreshToken);
    this.db = new DbClient(baseUrl, this.auth, config.apiKey, config.projectId);
    this.storage = new StorageClient(baseUrl, this.auth, config.apiKey, config.projectId);
    this.hoster = new HosterClient(baseUrl, this.auth);
    this.realtime = new RealtimeClient(wsUrl, this.auth);
  }
}

export const AegisDB = Aegis;
export default Aegis;
