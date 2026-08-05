import axios from 'axios';
import { getDb } from '../db/sqlite.connection';
import { wsService } from '../realtime/websocket.service';
import { sseRealtimeService } from './sse-realtime.service';
import { taskQueueService } from './task-queue.service';
import { decryptValue } from '../utils/encryption.helper';

export interface ReplicationMutation {
  id: string;
  ownerId: string;
  projectId: string;
  collectionName: string;
  data: string; // JSON string payload
  createdAt: string;
  updatedAt: string;
  version: number;
  isDelete: boolean;
}

export class ReplicationService {
  private readonly nodeId = process.env.NODE_ID || `node-${Math.random().toString(36).substring(2, 9)}`;

  private getPeers(): string[] {
    const peersStr = process.env.REPLICATION_PEERS || '';
    return peersStr
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  /**
   * Enqueues background replication of a mutation to all peer nodes.
   */
  queueReplication(mutation: ReplicationMutation): void {
    const peers = this.getPeers();
    if (peers.length === 0) return;

    for (const peer of peers) {
      taskQueueService.enqueue(async () => {
        try {
          await axios.post(`${peer}/api/v1/replication/sync`, {
            senderNodeId: this.nodeId,
            mutations: [mutation],
          }, {
            timeout: 5000,
          });
        } catch (err: any) {
          console.warn(`[Replication] Failed to sync to peer ${peer}:`, err.message);
        }
      });
    }
  }

  /**
   * Applies peer mutations locally using LWW-CRDT (Last-Write-Wins) resolution logic.
   */
  applyMutations(incoming: ReplicationMutation[]): void {
    const db = getDb();

    db.transaction(() => {
      for (const mut of incoming) {
        // Query existing document locally
        const local = db.prepare(`
          SELECT updatedAt, data FROM documents WHERE id = ?
        `).get(mut.id) as { updatedAt: string; data: string } | undefined;

        if (!local) {
          if (mut.isDelete) {
            continue; // Already deleted / doesn't exist
          }

          // Insert incoming document
          db.prepare(`
            INSERT INTO documents (id, ownerId, projectId, collectionName, data, createdAt, updatedAt, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(mut.id, mut.ownerId, mut.projectId, mut.collectionName, mut.data, mut.createdAt, mut.updatedAt, mut.version);

          // Broadcast change streams locally
          const docObj = JSON.parse(mut.data);
          wsService.broadcastChange(mut.ownerId, mut.collectionName, 'document:inserted', docObj);
          sseRealtimeService.broadcast(mut.ownerId, mut.collectionName, 'document:inserted', docObj);
          continue;
        }

        // LWW comparison check
        const incomingTime = new Date(mut.updatedAt).getTime();
        const localTime = new Date(local.updatedAt).getTime();

        if (incomingTime > localTime) {
          // Incoming write wins!
          if (mut.isDelete) {
            db.prepare('DELETE FROM documents WHERE id = ?').run(mut.id);
            // Broadcast deletion locally
            wsService.broadcastChange(mut.ownerId, mut.collectionName, 'document:deleted', { _id: mut.id });
            sseRealtimeService.broadcast(mut.ownerId, mut.collectionName, 'document:deleted', { _id: mut.id });
          } else {
            db.prepare(`
              UPDATE documents SET data = ?, updatedAt = ?, version = ? WHERE id = ?
            `).run(mut.data, mut.updatedAt, mut.version, mut.id);
            // Broadcast update locally
            const docObj = JSON.parse(mut.data);
            wsService.broadcastChange(mut.ownerId, mut.collectionName, 'document:updated', docObj);
            sseRealtimeService.broadcast(mut.ownerId, mut.collectionName, 'document:updated', docObj);
          }
        }
      }
    })();
  }
}

export const replicationService = new ReplicationService();
