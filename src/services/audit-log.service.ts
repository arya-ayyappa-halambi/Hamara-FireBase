import { getDb, getReaderDb } from '../db/sqlite.connection';
import { v4 as uuidv4 } from 'uuid';
import { taskQueueService } from './task-queue.service';

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorEmail: string | null;
  actionType: string;
  projectId: string | null;
  ipAddress: string | null;
  status: string;
  details: string | null;
}

export class AuditLogService {
  logAction(params: {
    actorId?: string | null;
    actorEmail?: string | null;
    actionType: string;
    projectId?: string | null;
    ipAddress?: string | null;
    status: 'success' | 'failure';
    details?: string | null;
  }): void {
    const id = uuidv4();
    const timestamp = new Date().toISOString();

    taskQueueService.enqueue(async () => {
      try {
        const db = getDb();
        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, actorId, actorEmail, actionType, projectId, ipAddress, status, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          timestamp,
          params.actorId || null,
          params.actorEmail || null,
          params.actionType,
          params.projectId || null,
          params.ipAddress || null,
          params.status,
          params.details || null
        );
      } catch (e) {
        console.error('Failed to write audit log:', e);
      }
    });
  }

  getRecentLogs(limit = 100, offset = 0): AuditLog[] {
    try {
      const db = getReaderDb();
      return db.prepare(`
        SELECT * FROM audit_logs
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as AuditLog[];
    } catch (e) {
      console.error('Failed to get recent logs:', e);
      return [];
    }
  }

  getWebhookLogs(projectId: string, limit = 50): AuditLog[] {
    try {
      const db = getReaderDb();
      return db.prepare(`
        SELECT * FROM audit_logs
        WHERE projectId = ? AND actionType = 'webhook_dispatch'
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(projectId, limit) as AuditLog[];
    } catch (e) {
      console.error('Failed to get webhook logs:', e);
      return [];
    }
  }
}

export const auditLogService = new AuditLogService();
