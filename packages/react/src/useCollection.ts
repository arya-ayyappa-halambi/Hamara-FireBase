// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/react — useCollection.ts
//  Reactive hook for subscribing to a FlareBase document collection with SSE sync.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'react';
import type { DocumentRecord, SnapshotChange } from '@flarebase/client';
import { useFlareBase } from './context';
import type { UseCollectionOptions, UseCollectionResult } from './types';

/**
 * React hook to query and subscribe to real-time updates for a FlareBase collection.
 *
 * @param collectionName Name of the collection (e.g., 'messages', 'products')
 * @param options Query, limit, ordering, and real-time subscription options
 *
 * @example
 * ```tsx
 * const { data: messages, loading, insert } = useCollection('messages', {
 *   query: { channel: 'general' },
 *   realTime: true
 * });
 * ```
 */
export function useCollection<T extends Record<string, any> = Record<string, any>>(
  collectionName: string,
  options: UseCollectionOptions<T> = {}
): UseCollectionResult<T> {
  const client = useFlareBase();
  const {
    query,
    limit,
    offset,
    orderBy,
    order,
    realTime = true,
    initialData = []
  } = options;

  const [data, setData] = React.useState<DocumentRecord<T>[]>(() => initialData || []);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<any>(null);

  const col = React.useMemo(() => client.collection<T>(collectionName), [client, collectionName]);

  const queryKey = React.useMemo(() => {
    return JSON.stringify({ collectionName, query, limit, offset, orderBy, order });
  }, [collectionName, query, limit, offset, orderBy, order]);

  // Initial fetch
  const refetch = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await col.query({
        where: query,
        limit,
        offset,
        sortBy: orderBy,
        sortOrder: order
      });
      setData(res.items);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [col, queryKey]);

  // Setup initial fetch and real-time SSE subscription
  React.useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await col.query({
          where: query,
          limit,
          offset,
          sortBy: orderBy,
          sortOrder: order
        });
        if (!isMounted) return;
        setData(res.items);
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

            const changeType = (change.type || '').toUpperCase();

            setData((prev) => {
              if (changeType === 'INSERT') {
                const exists = prev.some((d) => (d.id || d._id) === changedId);
                if (exists) return prev;
                return [changedDoc, ...prev];
              } else if (changeType === 'UPDATE') {
                return prev.map((d) => {
                  if ((d.id || d._id) === changedId) {
                    return { ...d, ...changedDoc, data: { ...(d.data || {}), ...(changedDoc.data || {}) } };
                  }
                  return d;
                });
              } else if (changeType === 'DELETE') {
                return prev.filter((d) => (d.id || d._id) !== changedId);
              }
              return prev;
            });
          });
        } catch (subErr) {
          console.warn('[FlareBase useCollection] Error attaching real-time listener:', subErr);
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
  }, [col, queryKey, realTime]);

  // Optimistic insert helper
  const insert = React.useCallback(
    async (newDoc: Partial<T> & Record<string, any>): Promise<DocumentRecord<T>> => {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const optimisticDoc: DocumentRecord<T> = {
        _id: tempId,
        id: tempId,
        data: { ...(newDoc as any) },
        ...newDoc
      } as DocumentRecord<T>;

      setData((prev) => [optimisticDoc, ...prev]);

      try {
        const created = await col.insert(newDoc);
        setData((prev) => prev.map((d) => ((d.id || d._id) === tempId ? created : d)));
        return created;
      } catch (err: any) {
        setData((prev) => prev.filter((d) => (d.id || d._id) !== tempId));
        setError(err);
        throw err;
      }
    },
    [col]
  );

  // Optimistic update helper
  const update = React.useCallback(
    async (id: string, updates: Partial<T> & Record<string, any>): Promise<DocumentRecord<T>> => {
      let previousDoc: DocumentRecord<T> | undefined;
      setData((prev) => {
        previousDoc = prev.find((d) => (d.id || d._id) === id);
        return prev.map((d) =>
          (d.id || d._id) === id
            ? { ...d, ...updates, data: { ...(d.data || {}), ...(updates as any) } }
            : d
        );
      });

      try {
        const updated = await col.update(id, updates);
        setData((prev) => prev.map((d) => ((d.id || d._id) === id ? updated : d)));
        return updated;
      } catch (err: any) {
        if (previousDoc) {
          setData((prev) => prev.map((d) => ((d.id || d._id) === id ? previousDoc! : d)));
        }
        setError(err);
        throw err;
      }
    },
    [col]
  );

  // Optimistic delete helper
  const remove = React.useCallback(
    async (id: string): Promise<boolean> => {
      let previousList: DocumentRecord<T>[] = [];
      setData((prev) => {
        previousList = prev;
        return prev.filter((d) => (d.id || d._id) !== id);
      });

      try {
        await col.delete(id);
        return true;
      } catch (err: any) {
        setData(previousList);
        setError(err);
        throw err;
      }
    },
    [col]
  );

  return {
    data,
    loading,
    error,
    insert,
    update,
    remove,
    refetch
  };
}
