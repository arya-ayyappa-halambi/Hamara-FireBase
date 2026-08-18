// ─────────────────────────────────────────────────────────────────────────────
//  src/services/threat-detection.service.ts
//  Automated Threat Intelligence & Behavioral Anomaly Flagging Engine.
//  Monitors traffic, registration, and security signals to detect bot,
//  spam, malicious probe, or compromised accounts, notifying Super Admin in real-time.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { AccountSecurityFlag } from '../types/auth.types';
import { wsService } from '../realtime/websocket.service';
import { auditLogService } from './audit-log.service';
import { v4 as uuidv4 } from 'uuid';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'tempmail.com',
  'guerrillamail.com',
  'throwawaymail.com',
  'trashmail.com',
  'sharklasers.com',
  'getairmail.com',
  'dispostable.com',
  'yopmail.com',
  'fakeinbox.com',
  'mytempemail.com',
  'mohmal.com'
]);

export interface ThreatEvaluationContext {
  userId: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
  eventType: 'registration' | 'failed_login_lockout' | 'malicious_payload_probe' | 'rapid_burst_traffic' | 'compromised_access';
  payload?: any;
}

export class ThreatDetectionService {
  /**
   * Evaluate risk score for a user event and trigger automated flagging if threshold exceeded.
   */
  public async evaluateThreat(ctx: ThreatEvaluationContext): Promise<{ riskScore: number; isFlagged: boolean; flag?: AccountSecurityFlag }> {
    const db = getDb();
    let riskScore = 0;
    const triggers: Record<string, any> = {};
    let primaryReason: 'bot_activity' | 'spam' | 'malicious_traffic' | 'illegal_content' | 'compromised_account' = 'bot_activity';
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

    const domain = ctx.userEmail.split('@')[1]?.toLowerCase();

    // 1. Disposable / Burner Email Detection
    if (domain && DISPOSABLE_DOMAINS.has(domain)) {
      riskScore += 75;
      primaryReason = 'spam';
      triggers.disposableEmail = { domain, detected: true };
    }

    // 2. Event-specific scoring
    if (ctx.eventType === 'registration') {
      if (ctx.userAgent && (ctx.userAgent.includes('HeadlessChrome') || ctx.userAgent.includes('curl/') || ctx.userAgent.includes('python-requests'))) {
        riskScore += 35;
        primaryReason = 'bot_activity';
        triggers.botUserAgent = ctx.userAgent;
      }
    } else if (ctx.eventType === 'failed_login_lockout') {
      riskScore += 50;
      primaryReason = 'compromised_account';
      triggers.lockoutEvent = ctx.payload || 'Repeated failed login lockout triggered';
    } else if (ctx.eventType === 'malicious_payload_probe') {
      riskScore += 80;
      primaryReason = 'malicious_traffic';
      triggers.payloadProbe = ctx.payload;
    } else if (ctx.eventType === 'rapid_burst_traffic') {
      riskScore += 45;
      primaryReason = 'bot_activity';
      triggers.trafficSpike = ctx.payload;
    }

    // Determine Severity
    if (riskScore >= 90) severity = 'critical';
    else if (riskScore >= 70) severity = 'high';
    else if (riskScore >= 40) severity = 'medium';
    else severity = 'low';

    // Update user's risk score in SQLite
    try {
      db.prepare('UPDATE users SET riskScore = MAX(riskScore, ?) WHERE id = ?').run(riskScore, ctx.userId);
    } catch {}

    // Auto-Flag account if high/critical risk
    if (riskScore >= 70) {
      const existingFlag = db.prepare("SELECT id FROM account_security_flags WHERE userId = ? AND status = 'active'").get(ctx.userId) as any;
      
      let flagId = existingFlag?.id || uuidv4();
      const now = new Date().toISOString();

      if (!existingFlag) {
        db.prepare(`
          INSERT INTO account_security_flags (
            id, userId, userEmail, reason, severity, riskScore, detectionSource, triggerEvidence, flaggedAt, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'system_automated_heuristic', ?, ?, 'active')
        `).run(
          flagId,
          ctx.userId,
          ctx.userEmail,
          primaryReason,
          severity,
          riskScore,
          JSON.stringify(triggers),
          now
        );

        db.prepare('UPDATE users SET isFlagged = 1 WHERE id = ?').run(ctx.userId);

        auditLogService.logAction({
          actorId: 'system_ai_threat_engine',
          actorEmail: 'security@aegisdb.internal',
          actionType: 'security_event',
          ipAddress: ctx.ipAddress,
          status: 'failure',
          details: `Automated Threat Engine flagged account "${ctx.userEmail}" (Score: ${riskScore}, Reason: ${primaryReason}). Evidence: ${JSON.stringify(triggers)}`
        });

        const flagRecord: AccountSecurityFlag = {
          id: flagId,
          userId: ctx.userId,
          userEmail: ctx.userEmail,
          reason: primaryReason,
          severity,
          riskScore,
          detectionSource: 'system_automated_heuristic',
          triggerEvidence: triggers,
          flaggedAt: now,
          status: 'active'
        };

        // Real-Time WebSocket Push Alert to Connected Super Admin Sessions
        wsService.broadcast('SECURITY_ALERT_FLAGGED', {
          flag: flagRecord,
          timestamp: now,
          summary: `High risk account detected: ${ctx.userEmail} (${primaryReason.toUpperCase()} - Score: ${riskScore})`
        });

        console.log(`🚨 [ThreatEngine] Auto-flagged high risk user "${ctx.userEmail}" (${primaryReason}, Score: ${riskScore}).`);

        return { riskScore, isFlagged: true, flag: flagRecord };
      }
    }

    return { riskScore, isFlagged: riskScore >= 70 };
  }

  /**
   * Super Admin manually flags an account.
   */
  public manualFlag(
    adminId: string,
    adminEmail: string,
    userId: string,
    userEmail: string,
    reason: 'bot_activity' | 'spam' | 'malicious_traffic' | 'illegal_content' | 'compromised_account',
    severity: 'low' | 'medium' | 'high' | 'critical' = 'high',
    notes?: string
  ): AccountSecurityFlag {
    const db = getDb();
    const flagId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO account_security_flags (
        id, userId, userEmail, reason, severity, riskScore, detectionSource, triggerEvidence, flaggedAt, status
      ) VALUES (?, ?, ?, ?, ?, 85, 'super_admin_manual', ?, ?, 'active')
    `).run(flagId, userId, userEmail, reason, severity, JSON.stringify({ manualNotes: notes || 'Flagged by Super Admin' }), now);

    db.prepare('UPDATE users SET isFlagged = 1, riskScore = 85 WHERE id = ?').run(userId);

    auditLogService.logAction({
      actorId: adminId,
      actorEmail: adminEmail,
      actionType: 'super_admin_operation',
      status: 'success',
      details: `Super Admin manually flagged account "${userEmail}" for "${reason}". Notes: ${notes || 'N/A'}`
    });

    const flag: AccountSecurityFlag = {
      id: flagId,
      userId,
      userEmail,
      reason,
      severity,
      riskScore: 85,
      detectionSource: 'super_admin_manual',
      triggerEvidence: { manualNotes: notes },
      flaggedAt: now,
      status: 'active'
    };

    wsService.broadcast('SECURITY_ALERT_FLAGGED', {
      flag,
      timestamp: now,
      summary: `Super Admin flagged account: ${userEmail} (${reason.toUpperCase()})`
    });

    return flag;
  }

  /**
   * Retrieve active security threat alerts for Super Admin.
   */
  public getActiveSecurityAlerts(): AccountSecurityFlag[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM account_security_flags
      WHERE status = 'active'
      ORDER BY riskScore DESC, flaggedAt DESC
    `).all() as any[];

    return rows.map(r => ({
      ...r,
      triggerEvidence: r.triggerEvidence ? JSON.parse(r.triggerEvidence) : {}
    }));
  }

  /**
   * Super Admin dismisses / resolves a security flag.
   */
  public dismissFlag(flagId: string, adminId: string, adminEmail: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    const flag = db.prepare('SELECT * FROM account_security_flags WHERE id = ?').get(flagId) as any;
    if (!flag) return;

    db.prepare(`
      UPDATE account_security_flags
      SET status = 'resolved', resolvedAt = ?, resolvedBy = ?
      WHERE id = ?
    `).run(now, adminEmail, flagId);

    // If no other active flags exist for this user, clear isFlagged
    const remaining = db.prepare("SELECT COUNT(*) as count FROM account_security_flags WHERE userId = ? AND status = 'active'").get(flag.userId) as any;
    if (!remaining || remaining.count === 0) {
      db.prepare('UPDATE users SET isFlagged = 0, riskScore = 0 WHERE id = ?').run(flag.userId);
    }

    auditLogService.logAction({
      actorId: adminId,
      actorEmail: adminEmail,
      actionType: 'super_admin_operation',
      status: 'success',
      details: `Dismissed security flag ID "${flagId}" for user "${flag.userEmail}".`
    });
  }
}

export const threatDetectionService = new ThreatDetectionService();
