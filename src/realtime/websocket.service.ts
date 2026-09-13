// ─────────────────────────────────────────────────────────────────────────────
//  src/realtime/websocket.service.ts
//  FlareBase — Real-Time WebSocket Server & Database Change Streams.
//
//  Responsibilities:
//    1. Attach WebSocketServer to HTTP server.
//    2. Authenticate clients via JWT Bearer token (query parameter or initial message).
//    3. Manage per-collection subscriptions scoped to ownerId.
//    4. Broadcast database mutations (insert, update, delete) to subscribed clients.
// ─────────────────────────────────────────────────────────────────────────────

import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { URL } from 'url';
import { JwtPayload } from '../types/auth.types';
import { metricsService } from '../services/metrics.service';

export type ChangeEventType = 'document:inserted' | 'document:updated' | 'document:deleted';

interface AuthenticatedSocket extends WebSocket {
  isAlive?: boolean;
  user?: JwtPayload;
  subscriptions?: Set<string>; // set of collection names
  projectId?: string;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  /** Map of key (`${ownerId}::${collectionName}`) to set of subscribed sockets */
  private readonly subscriptions = new Map<string, Set<AuthenticatedSocket>>();

  init(server: HttpServer): void {
    if (this.wss) {
      try {
        this.wss.close();
      } catch (_) {}
    }
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: AuthenticatedSocket, req) => {
      ws.isAlive = true;
      ws.subscriptions = new Set();
      // 1. Check for token in URL query string: ws://localhost:3000?token=...&projectId=...
      const requestUrl = req.url ?? '/';
      const parsedUrl = new URL(requestUrl, 'http://localhost');
      const token = parsedUrl.searchParams.get('token');
      const projectId = parsedUrl.searchParams.get('projectId');

      if (projectId) {
        ws.projectId = projectId;
      }
      metricsService.incWsConnections(ws.projectId);

      if (token) {
        this.authenticateSocket(ws, token);
      }

      // Handle heartbeat ping/pong
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle incoming socket messages
      ws.on('message', (messageBuffer) => {
        try {
          const msg = JSON.parse(messageBuffer.toString());
          this.handleClientMessage(ws, msg);
        } catch {
          ws.send(JSON.stringify({ event: 'error', message: 'Invalid JSON payload.' }));
        }
      });

      // Cleanup on disconnect
      ws.on('close', () => {
        metricsService.decWsConnections(ws.projectId);
        this.cleanupSocket(ws);
      });
    });

    // Setup 30-second ping interval to prune dead sockets
    const interval = setInterval(() => {
      if (!this.wss) return;
      for (const ws of this.wss.clients as Set<AuthenticatedSocket>) {
        if (ws.isAlive === false) {
          this.cleanupSocket(ws);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30_000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });

    console.log('⚡ Real-time WebSocket change stream engine initialized');
  }

  /**
   * Get total count of active connected client sockets.
   */
  getActiveConnectionsCount(): number {
    return this.wss ? this.wss.clients.size : 0;
  }

  // ── Authentication ────────────────────────────────────────────────────────────

  private authenticateSocket(ws: AuthenticatedSocket, token: string): boolean {
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;
      ws.user = decoded;
      ws.send(JSON.stringify({
        event: 'auth:success',
        message: 'Authenticated successfully.',
        data: { userId: decoded.sub, email: decoded.email },
      }));
      return true;
    } catch {
      ws.send(JSON.stringify({ event: 'auth:error', message: 'Invalid or expired JWT token.' }));
      ws.close(4001, 'Invalid authentication token.');
      return false;
    }
  }

  // ── Message Routing ───────────────────────────────────────────────────────────

  private handleClientMessage(ws: AuthenticatedSocket, msg: any): void {
    const action = msg.action ?? msg.type;

    // Action: Auth via message
    if (action === 'auth') {
      if (!msg.token || typeof msg.token !== 'string') {
        ws.send(JSON.stringify({ event: 'auth:error', message: 'Token string required.' }));
        return;
      }
      this.authenticateSocket(ws, msg.token);
      return;
    }

    // Guard: Require authentication for all non-auth actions
    if (!ws.user) {
      ws.send(JSON.stringify({ event: 'error', message: 'Authentication required. Send token first.' }));
      return;
    }

    const ownerId = ws.user.sub;

    // Action: Subscribe to collection
    if (action === 'subscribe') {
      const collection = msg.collection;
      if (!collection || typeof collection !== 'string') {
        ws.send(JSON.stringify({ event: 'error', message: '"collection" string required.' }));
        return;
      }

      let targetProjectId = ws.projectId || msg.projectId;
      if ((ws.user as any)?.isProjectUser) {
        targetProjectId = (ws.user as any).projectId;
      }

      if (!targetProjectId) {
        ws.send(JSON.stringify({ event: 'error', message: '"projectId" is required for collection subscription.' }));
        return;
      }

      const key = `${ownerId}::${targetProjectId}::${collection}`;
      if (!this.subscriptions.has(key)) {
        this.subscriptions.set(key, new Set());
      }
      this.subscriptions.get(key)!.add(ws);
      ws.subscriptions?.add(key);

      ws.send(JSON.stringify({ event: 'subscribed', collection, projectId: targetProjectId }));
      return;
    }

    // Action: Unsubscribe from collection
    if (action === 'unsubscribe') {
      const collection = msg.collection;
      let targetProjectId = ws.projectId || msg.projectId;
      if ((ws.user as any)?.isProjectUser) {
        targetProjectId = (ws.user as any).projectId;
      }

      if (collection && typeof collection === 'string' && targetProjectId) {
        const key = `${ownerId}::${targetProjectId}::${collection}`;
        this.subscriptions.get(key)?.delete(ws);
        ws.subscriptions?.delete(key);
        ws.send(JSON.stringify({ event: 'unsubscribed', collection, projectId: targetProjectId }));
      }
      return;
    }

    // Action: Ping
    if (action === 'ping') {
      ws.send(JSON.stringify({ event: 'pong' }));
      return;
    }

    ws.send(JSON.stringify({ event: 'error', message: `Unknown action "${action}".` }));
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  private cleanupSocket(ws: AuthenticatedSocket): void {
    if (!ws.subscriptions) return;
    for (const key of ws.subscriptions) {
      this.subscriptions.get(key)?.delete(ws);
    }
    ws.subscriptions.clear();
  }

  // ── Public Change Broadcaster ─────────────────────────────────────────────────

  /**
   * Broadcast a database change stream event to all active client connections
   * subscribed to the given collection owned by `ownerId` and scoped to `projectId`.
   */
  broadcastChange(
    ownerId: string,
    projectId: string,
    collectionName: string,
    event: ChangeEventType,
    data: unknown,
  ): void {
    const key = `${ownerId}::${projectId}::${collectionName}`;
    const subscribers = this.subscriptions.get(key);
    if (!subscribers || subscribers.size === 0) return;

    const payload = JSON.stringify({
      event,
      projectId,
      collection: collectionName,
      data,
      timestamp: new Date().toISOString(),
    });

    for (const client of subscribers) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Broadcast a general or security event to all connected clients.
   */
  broadcast(event: string, data: unknown): void {
    if (!this.wss) return;
    const payload = JSON.stringify({
      type: event,
      event,
      data,
      timestamp: new Date().toISOString(),
    });

    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Broadcast an event to a specific user's connected sockets.
   */
  broadcastToUser(userId: string, event: string, data: unknown): void {
    if (!this.wss) return;
    const payload = JSON.stringify({
      type: event,
      event,
      data,
      timestamp: new Date().toISOString(),
    });

    for (const client of this.wss.clients as Set<AuthenticatedSocket>) {
      if (client.readyState === WebSocket.OPEN && client.user?.sub === userId) {
        client.send(payload);
      }
    }
  }
}

export const wsService = new WebSocketService();
