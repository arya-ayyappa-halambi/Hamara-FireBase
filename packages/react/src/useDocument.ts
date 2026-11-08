// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/react — useDocument.ts
//  Reactive hook for subscribing to a single FlareBase document.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'react';
import type { DocumentRecord, SnapshotChange } from '@flarebase/client';
import { useFlareBase } from './context';
import type { UseDocumentOptions, UseDocumentResult } from './types';

/**
 * React hook to fetch and subscribe to changes on a single document by ID.
 *
 * @param collectionName Collection name
 * @param id Document ID
 * @param options Subscription options (realTime, initialData)
 */
export function useDocument<T extends Record<string, any> = Record<string, any>>(
  collectionName: string,
  id: string | null | undefined,
  options: UseDocumentOptions<T> = {}
): UseDocumentResult<T> {
  const client = useFlareBase();
  const { realTime = true, initialData = null } = options;

  const [data, setData] = React.useState<DocumentRecord<T> | null>(() => initialData || null);
  const [loading, setLoading] = React.useState<boolean>(Boolean(id));
  const [error, setError] = React.useState<any>(null);

  const col = React.useMemo(() => client.collection<T>(collectionName), [client, collectionName]);

  const refetch = React.useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const doc = await col.get(id);
      setData(doc);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [col, id]);

  React.useEffect(() => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const doc = await col.get(id);
        if (!isMounted) return;
        setData(doc);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err);
      } finally {
        if (isMounted) setLoading(false);
      }

      if (realTime && isMounted) {
        try {
          unsubscribe = col.onSnapshot((change: SnapshotChange<T>) => {
            if (!isMounted) return;
            const changedDoc = (change.document || (change as any).doc || change) as DocumentRecord<T>;
            if (!changedDoc) return;
            const changedId = changedDoc.id || changedDoc._id || (change as any).id;

            if (changedId === id) {
              const changeType = (change.type || '').toUpperCase();
              if (changeType === 'DELETE') {
                setData(null);
              } else {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        ...changedDoc,
                        data: { ...(prev.data || {}), ...(changedDoc.data || {}) }
                      }
                    : changedDoc
                );
              }
            }
          });
        } catch (subErr) {
          console.warn('[FlareBase useDocument] Error attaching real-time listener:', subErr);
        }
      }
    };

    run();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [col, id, realTime]);

  const update = React.useCallback(
    async (updates: Partial<T> & Record<string, any>): Promise<DocumentRecord<T> | null> => {
      if (!id) throw new Error('Cannot update document without an ID.');
      const previous = data;
      setData((prev) =>
        prev
          ? { ...prev, ...updates, data: { ...(prev.data || {}), ...(updates as any) } }
          : null
      );

      try {
        const updated = await col.update(id, updates);
        setData(updated);
        return updated;
      } catch (err: any) {
        setData(previous);
        setError(err);
        throw err;
      }
    },
    [col, id, data]
  );

  const remove = React.useCallback(async (): Promise<boolean> => {
    if (!id) throw new Error('Cannot delete document without an ID.');
    const previous = data;
    setData(null);

    try {
      await col.delete(id);
      return true;
    } catch (err: any) {
      setData(previous);
      setError(err);
      throw err;
    }
  }, [col, id, data]);

  return {
    data,
    loading,
    error,
    update,
    remove,
    refetch
  };
}
