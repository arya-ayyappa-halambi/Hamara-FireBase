// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/realtime.client.ts
//  Real-Time WebSocket Change Streams client module for @flarebase/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import WebSocket from 'ws';
import { AuthClient } from './auth.client.js';
import { ChangeStreamFrame, ChangeStreamCallback } from './types.js';

export class RealtimeClient {
  private readonly wsUrl: string;
  private readonly auth: AuthClient;
  private ws: WebSocket | null = null;
  private autoReconnect = true;
  private isConnected = false;

  private readonly activeSubscriptions = new Set<string>();
  private readonly callbacks = new Map<string, Set<ChangeStreamCallback>>();

  constructor(wsUrl: string, auth: AuthClient) {
    this.wsUrl = wsUrl.replace(/\/+$/, '');
    this.auth = auth;
  }

  /**
   * Connect to the FlareBase WebSocket server.
   */
  async connect(): Promise<void> {
    const token = this.auth.getAccessToken();
    if (!token) {
      throw new Error('Authentication required before connecting Realtime client.');
    }

    const url = `${this.wsUrl}?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(url);

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('WebSocket creation failed.'));

      this.ws.on('open', () => {
        this.isConnected = true;
        // Re-subscribe to any previously active subscriptions upon reconnect
        for (const collection of this.activeSubscriptions) {
          this.send({ action: 'subscribe', collection });
        }
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const frame = JSON.parse(data.toString());
          this.handleFrame(frame);
        } catch {
          // Ignore invalid JSON frame
        }
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        if (this.autoReconnect) {
          setTimeout(() => {
            if (this.auth.getAccessToken()) {
              this.connect().catch(() => { /* silent retry */ });
            }
          }, 3000);
        }
      });

      this.ws.on('error', (err) => {
        if (!this.isConnected) reject(err);
      });
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private handleFrame(frame: any): void {
    if (frame.event && frame.collection) {
      const changeFrame: ChangeStreamFrame = frame;
      const key = `${changeFrame.collection}:${changeFrame.event}`;
      const wildKey = `${changeFrame.collection}:*`;

      const set1 = this.callbacks.get(key);
      const set2 = this.callbacks.get(wildKey);

      if (set1) set1.forEach((cb) => cb(changeFrame));
      if (set2) set2.forEach((cb) => cb(changeFrame));
    }
  }

  /**
   * Subscribe to a collection's real-time change stream.
   */
  async subscribe(collection: string, callback?: ChangeStreamCallback): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    this.activeSubscriptions.add(collection);
    this.send({ action: 'subscribe', collection });

    if (callback) {
      this.on(collection, '*', callback);
    }
  }

  /**
   * Unsubscribe from a collection.
   */
  unsubscribe(collection: string): void {
    this.activeSubscriptions.delete(collection);
    this.send({ action: 'unsubscribe', collection });
  }

  /**
   * Listen for change events on a collection.
   * event: 'document:inserted' | 'document:updated' | 'document:deleted' | '*'
   */
  on(collection: string, event: string, callback: ChangeStreamCallback): void {
    const key = `${collection}:${event}`;
    if (!this.callbacks.has(key)) {
      this.callbacks.set(key, new Set());
    }
    this.callbacks.get(key)!.add(callback);
  }

  /**
   * Remove an event listener.
   */
  off(collection: string, event: string, callback: ChangeStreamCallback): void {
    const key = `${collection}:${event}`;
    this.callbacks.get(key)?.delete(callback);
  }

  /**
   * Disconnect the WebSocket connection.
   */
  disconnect(): void {
    this.autoReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
