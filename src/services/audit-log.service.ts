import { getDb, getReaderDb } from '../db/sqlite.connection';
import { v4 as uuidv4 } from 'uuid';
import { taskQueueService } from './task-queue.service';
import { envelopeEncryptionService } from './envelope-encryption.service';

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
        
        let encEmail = null;
        let emailHash = null;
        
        if (params.actorEmail) {
          const normalized = params.actorEmail.trim().toLowerCase();
          emailHash = envelopeEncryptionService.hashBlindIndex(normalized);
          
          let contextId = params.projectId || 'SYSTEM';
          if (contextId !== 'SYSTEM') {
            const projExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(contextId);
            if (!projExists) contextId = 'SYSTEM';
          }
          encEmail = JSON.stringify(envelopeEncryptionService.encryptField(normalized, contextId));
        }

        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, actorId, actorEmail, actorEmailHash, actionType, projectId, ipAddress, status, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          timestamp,
          params.actorId || null,
          encEmail,
          emailHash,
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
      const rows = db.prepare(`
        SELECT * FROM audit_logs
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as any[];

      return rows.map(row => {
        let email = row.actorEmail;
        if (email && typeof email === 'string' && email.startsWith('{')) {
          let contextId = row.projectId || 'SYSTEM';
          if (contextId !== 'SYSTEM') {
            const projExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(contextId);
            if (!projExists) contextId = 'SYSTEM';
          }
          email = envelopeEncryptionService.decryptField(JSON.parse(email), contextId) || email;
        }
        return { ...row, actorEmail: email };
      });
    } catch (e) {
      console.error('Failed to get recent logs:', e);
      return [];
    }
  }

  getWebhookLogs(projectId: string, limit = 50): AuditLog[] {
    try {
      const db = getReaderDb();
      const rows = db.prepare(`
        SELECT * FROM audit_logs
        WHERE projectId = ? AND actionType = 'webhook_dispatch'
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(projectId, limit) as any[];

      return rows.map(row => {
        let email = row.actorEmail;
        if (email && typeof email === 'string' && email.startsWith('{')) {
          let contextId = row.projectId || 'SYSTEM';
          if (contextId !== 'SYSTEM') {
            const projExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(contextId);
            if (!projExists) contextId = 'SYSTEM';
          }
          email = envelopeEncryptionService.decryptField(JSON.parse(email), contextId) || email;
        }
        return { ...row, actorEmail: email };
      });
    } catch (e) {
      console.error('Failed to get webhook logs:', e);
      return [];
    }
  }
}

export const auditLogService = new AuditLogService();
