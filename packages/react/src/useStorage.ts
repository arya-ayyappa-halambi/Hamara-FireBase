// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/react — useStorage.ts
//  Reactive hook for FlareBase Storage asset uploads, quotas, and signed URLs.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'react';
import type { StorageAsset, StorageQuota, SignedUrlResponse } from '@flarebase/client';
import { useFlareBase } from './context';
import type { UseStorageResult } from './types';

/**
 * React hook providing reactive file storage operations and quota inspection.
 */
export function useStorage(): UseStorageResult {
  const client = useFlareBase();
  const [uploading, setUploading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<any>(null);

  const upload = React.useCallback(
    async (file: any, fieldName = 'file', customFilename?: string): Promise<StorageAsset> => {
      setUploading(true);
      setError(null);
      try {
        const res = await client.storage.upload(file, fieldName, customFilename);
        return res;
      } catch (err: any) {
        setError(err);
        throw err;
      } finally {
        setUploading(false);
      }
    },
    [client]
  );

  const getSignedUrl = React.useCallback(
    async (filename: string, operation: 'read' | 'write' = 'read', expiresIn = 3600): Promise<SignedUrlResponse> => {
      setError(null);
      try {
        return await client.storage.getSignedUrl(filename, operation, expiresIn);
      } catch (err: any) {
        setError(err);
        throw err;
      }
    },
    [client]
  );

  const getQuota = React.useCallback(async (): Promise<StorageQuota> => {
    setError(null);
    try {
      return await client.storage.getQuota();
    } catch (err: any) {
      setError(err);
      throw err;
    }
  }, [client]);

  const deleteAsset = React.useCallback(
    async (id: string): Promise<{ success: boolean; id: string }> => {
      setError(null);
      try {
        return await client.storage.delete(id);
      } catch (err: any) {
        setError(err);
        throw err;
      }
    },
    [client]
  );

  return {
    uploading,
    error,
    upload,
    getSignedUrl,
    getQuota,
    deleteAsset
  };
}
