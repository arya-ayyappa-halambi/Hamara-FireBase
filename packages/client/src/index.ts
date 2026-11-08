// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/client — index.ts
//  Main public entry point for the official FlareBase TypeScript Client SDK.
// ─────────────────────────────────────────────────────────────────────────────

import { FlareBaseClient } from './client';
import { FlareBaseClientOptions } from './types';

export * from './types';
export * from './errors';
export * from './client';
export * from './collection';
export * from './auth';
export * from './storage';

/**
 * Factory helper for initializing a new FlareBase client instance.
 *
 * @example
 * import { createClient } from '@flarebase/client';
 *
 * const flare = createClient({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'flare_pk_sample_key_123'
 * });
 */
export function createClient(options: FlareBaseClientOptions = {}): FlareBaseClient {
  return new FlareBaseClient(options);
}

// Export default instance alias
export const FlareBase = FlareBaseClient;
export default FlareBaseClient;

// Attach to browser globalThis / window if in browser environment
if (typeof globalThis !== 'undefined') {
  (globalThis as any).FlareBaseClient = FlareBaseClient;
  (globalThis as any).createFlareBaseClient = createClient;
}
