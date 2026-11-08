// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/react — useAuth.ts
//  Reactive hook for FlareBase project user authentication state and operations.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'react';
import type { AuthUser } from '@flarebase/client';
import { useFlareBase } from './context';
import type { UseAuthResult } from './types';

/**
 * React hook providing reactive access to current authenticated FlareBase user,
 * login/register/logout actions, and session states.
 */
export function useAuth(): UseAuthResult {
  const client = useFlareBase();

  const [user, setUser] = React.useState<AuthUser | null>(() => client.auth.getUser());
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<any>(null);

  // Sync user state on mount
  React.useEffect(() => {
    let isMounted = true;

    const check = async () => {
      setLoading(true);
      setError(null);
      try {
        if (client.auth.isAuthenticated()) {
          const current = await client.auth.me();
          if (isMounted) setUser(current);
        } else {
          if (isMounted) setUser(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
          setUser(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    check();

    return () => {
      isMounted = false;
    };
  }, [client]);

  const login = React.useCallback(
    async (credentials: { email: string; password: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await client.auth.login(credentials);
        setUser(client.auth.getUser());
        return res;
      } catch (err: any) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const register = React.useCallback(
    async (payload: { email: string; password: string; name?: string; role?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await client.auth.register(payload);
        setUser(client.auth.getUser());
        return res;
      } catch (err: any) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const logout = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await client.auth.logout();
      setUser(null);
    } catch (err: any) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const oauth = React.useCallback(
    async (provider: 'google' | 'github' | string, token: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await client.auth.oauth(provider, token);
        return res;
      } catch (err: any) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const refresh = React.useCallback(
    async (refreshToken: string = '') => {
      setLoading(true);
      setError(null);
      try {
        const res = await client.auth.refresh(refreshToken);
        setUser(client.auth.getUser());
        return res;
      } catch (err: any) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return {
    user,
    loading,
    error,
    isAuthenticated: Boolean(user && client.auth.isAuthenticated()),
    login,
    register,
    logout,
    oauth,
    refresh
  };
}
