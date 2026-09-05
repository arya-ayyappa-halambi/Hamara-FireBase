import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb, getReaderDb } from '../db/sqlite.connection';
import { auditLogService } from './audit-log.service';
import { taskQueueService } from './task-queue.service';
import { validateSsrfUrl } from '../utils/ssrf-guard';

export interface Webhook {
  id: string;
  projectId: string;
  url: string;
  secret: string;
  events: string[]; // parsed from JSON text
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class WebhookService {
  /**
   * Register a new webhook endpoint.
   */
  register(projectId: string, url: string, events: string[]): Webhook {
    const db = getDb();
    const id = uuidv4();
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();
    const eventsStr = JSON.stringify(events);

    db.prepare(`
      INSERT INTO webhooks (id, projectId, url, secret, events, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, projectId, url.trim(), secret, eventsStr, now, now);

    return {
      id,
      projectId,
      url: url.trim(),
      secret,
      events,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * List all webhooks for a project.
   */
  list(projectId: string): Webhook[] {
    const db = getReaderDb();
    const rows = db.prepare('SELECT * FROM webhooks WHERE projectId = ?').all(projectId) as any[];
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      url: r.url,
      secret: r.secret,
      events: JSON.parse(r.events),
      isActive: r.isActive === 1,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Delete a webhook registration.
   */
  delete(projectId: string, webhookId: string): void {
    const db = getDb();
    db.prepare('DELETE FROM webhooks WHERE projectId = ? AND id = ?').run(projectId, webhookId);
  }

  /**
   * Dispatches an event payload to all active registered webhooks for a project.
   * Runs asynchronously in the background.
   */
  dispatch(projectId: string, event: string, payload: any): void {
    const db = getReaderDb();
    const rows = db.prepare('SELECT * FROM webhooks WHERE projectId = ? AND isActive = 1').all(projectId) as any[];
    
    const webhooks = rows.map((r) => ({
      id: r.id,
      url: r.url,
      secret: r.secret,
      events: JSON.parse(r.events) as string[],
    }));

    // Filter webhooks matching the event
    const targets = webhooks.filter((wh) => wh.events.includes(event) || wh.events.includes('*'));

    for (const target of targets) {
      const payloadString = JSON.stringify({
        id: uuidv4(),
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      const signature = crypto.createHmac('sha256', target.secret).update(payloadString).digest('hex');

      // Dispatch asynchronously in the background task queue
      taskQueueService.enqueue(async () => {
        try {
          const ssrfCheck = await validateSsrfUrl(target.url);
          if (!ssrfCheck.safe) {
            console.warn(`[Webhook] Blocked SSRF attempt to ${target.url}: ${ssrfCheck.reason}`);
            auditLogService.logAction({
              actionType: 'webhook_dispatch',
              projectId,
              status: 'failure',
              details: `Blocked SSRF attempt to ${target.url}: ${ssrfCheck.reason}`
            });
            return;
          }

          const res = await fetch(target.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-aegis-signature': signature,
              'x-aegis-event': event,
            },
            body: payloadString,
            signal: AbortSignal.timeout(5000), // 5s timeout
          });

          if (!res.ok) {
            console.error(`[Webhook] Target ${target.url} returned status ${res.status}`);
          }
          // Log success/failure to audit logs
          auditLogService.logAction({
            actionType: 'webhook_dispatch',
            projectId,
            status: res.ok ? 'success' : 'failure',
            details: `Dispatched event "${event}" to ${target.url}. Response Status: ${res.status}`
          });
        } catch (err: any) {
          console.error(`[Webhook] Failed to dispatch event "${event}" to ${target.url}:`, err.message);
          // Log failure to audit logs
          auditLogService.logAction({
            actionType: 'webhook_dispatch',
            projectId,
            status: 'failure',
            details: `Failed to dispatch event "${event}" to ${target.url}: ${err.message}`
          });
        }
      });
    }
  }

  /**
   * Dispatches a single test payload to an n8n or custom webhook endpoint.
   */
  async testDispatch(targetUrl: string, event: string = 'test.ping', payload: any = { message: 'AegisDB n8n Webhook Test Event', timestamp: new Date().toISOString() }): Promise<{ success: boolean; statusCode?: number; responseTimeMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      const ssrfCheck = await validateSsrfUrl(targetUrl);
      if (!ssrfCheck.safe) {
        return {
          success: false,
          responseTimeMs: Date.now() - startTime,
          error: `SSRF Guard Violation: ${ssrfCheck.reason}`
        };
      }

      const payloadString = JSON.stringify({
        id: uuidv4(),
        event,
        timestamp: new Date().toISOString(),
        source: 'AegisDB n8n Automation Engine',
        data: payload
      });
      const dummySecret = 'whsec_test_secret';
      const signature = crypto.createHmac('sha256', dummySecret).update(payloadString).digest('hex');

      const res = await fetch(targetUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-aegis-signature': signature,
          'x-aegis-event': event
        },
        body: payloadString,
        signal: AbortSignal.timeout(5000)
      });
      const responseTimeMs = Date.now() - startTime;
      return {
        success: res.ok,
        statusCode: res.status,
        responseTimeMs
      };
    } catch (err: any) {
      return {
        success: false,
        responseTimeMs: Date.now() - startTime,
        error: err.message
      };
    }
  }
}

export const webhookService = new WebhookService();

