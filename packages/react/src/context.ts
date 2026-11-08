// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/react — context.tsx
//  React Context Provider and consumer hook for FlareBaseClient.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'react';
import type { FlareBaseClient } from '@flarebase/client';
import type { FlareBaseProviderProps } from './types';

export const FlareBaseContext = React.createContext<FlareBaseClient | null>(null);

/**
 * Top-level provider that injects the FlareBaseClient into the React component tree.
 *
 * @example
 * ```tsx
 * import { createClient } from '@flarebase/client';
 * import { FlareBaseProvider } from '@flarebase/react';
 *
 * const client = createClient({ baseUrl: 'http://localhost:3000', apiKey: '...' });
 *
 * export default function App({ children }) {
 *   return <FlareBaseProvider client={client}>{children}</FlareBaseProvider>;
 * }
 * ```
 */
export function FlareBaseProvider({ client, children }: FlareBaseProviderProps): React.ReactElement {
  return React.createElement(FlareBaseContext.Provider, { value: client }, children);
}

/**
 * Hook to access the current `FlareBaseClient` instance anywhere in the React tree.
 * Throws a helpful error if called outside `<FlareBaseProvider>`.
 */
export function useFlareBase(): FlareBaseClient {
  const client = React.useContext(FlareBaseContext);
  if (!client) {
    throw new Error(
      'useFlareBase must be used within a <FlareBaseProvider client={...}>. ' +
      'Wrap your root component in FlareBaseProvider to provide access to the FlareBase client.'
    );
  }
  return client;
}
