import { Response } from 'express';
import { matchesFilter } from '../db/db.service';

export interface SseSubscriber {
  res: Response;
  filter?: any;
}

export class SseRealtimeService {
  /** Map of key (`${ownerId}::${projectId}::${collectionName}`) to list of active SSE subscribers */
  private readonly subscribers = new Map<string, SseSubscriber[]>();

  /**
   * Add a new SSE client subscriber.
   */
  add(ownerId: string, projectId: string, collectionName: string, res: Response, filter?: any): void {
    const key = `${ownerId}::${projectId}::${collectionName}`;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }

    const sub: SseSubscriber = { res, filter };
    this.subscribers.get(key)!.push(sub);

    // Clean up when client disconnects
    res.on('close', () => {
      this.remove(ownerId, projectId, collectionName, res);
    });
  }

  /**
   * Remove an SSE client connection.
   */
  remove(ownerId: string, projectId: string, collectionName: string, res: Response): void {
    const key = `${ownerId}::${projectId}::${collectionName}`;
    const list = this.subscribers.get(key);
    if (list) {
      this.subscribers.set(
        key,
        list.filter((sub) => sub.res !== res)
      );
    }
  }

  /**
   * Broadcasts document change event to matching SSE subscribers for the specific project.
   */
  broadcast(ownerId: string, projectId: string, collectionName: string, event: string, data: any): void {
    const key = `${ownerId}::${projectId}::${collectionName}`;
    const subs = this.subscribers.get(key);
    if (!subs || subs.length === 0) return;

    const payload = JSON.stringify({
      event,
      projectId,
      collection: collectionName,
      data,
      timestamp: new Date().toISOString(),
    });

    for (const sub of subs) {
      try {
        // Evaluate filter on document if present (skip filter for deletions since the document data might only have _id)
        if (sub.filter && event !== 'document:deleted') {
          if (!matchesFilter(data, sub.filter)) {
            continue;
          }
        }

        sub.res.write(`event: ${event}\n`);
        sub.res.write(`data: ${payload}\n\n`);
      } catch (err) {
        console.error('[SSE] Failed to write event to client:', err);
      }
    }
  }
}

export const sseRealtimeService = new SseRealtimeService();
