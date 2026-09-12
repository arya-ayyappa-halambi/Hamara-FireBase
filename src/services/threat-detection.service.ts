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
import { antiAbuseService } from './anti-abuse.service';
import { v4 as uuidv4 } from 'uuid';

export type ThreatCategory = 
  | 'sql_nosql_injection'
  | 'xss_malicious_payload'
  | 'path_traversal_probe'
  | 'rapid_burst_dos'
  | 'credential_stuffing'
  | 'unauthorized_cross_tenant_probe'
  | 'data_exfiltration_burst'
  | 'bot_activity'
  | 'spam'
  | 'malicious_traffic'
  | 'illegal_content'
  | 'compromised_account';

const SQL_NOSQL_INJECTION_PATTERNS = [
  /(\$where|\$regex|\$expr)\s*:/i,
  /(\bUNION\b\s+\bSELECT\b|\bSELECT\b\s+.*\s+\bFROM\b)/i,
  /(\bDROP\b\s+\bTABLE\b|\bINSERT\b\s+\bINTO\b|\bDELETE\b\s+\bFROM\b)/i,
  /(;\s*--|'\s+OR\s+'1'='1|"\s+OR\s+"1"="1|'\s+OR\s+1=1\b)/i,
  /(\bsleep\s*\(\s*\d+\s*\)|\bbenchmark\s*\()/i
];

const XSS_PAYLOAD_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
  /javascript\s*:\s*[^"'>\s]+/i,
  /\bon(?:error|load|click|mouse|key|submit)\s*=/i,
  /<iframe|<object|<embed/i
];

const PATH_TRAVERSAL_PATTERNS = [
  /(?:\.\.\/|\.\.\\){2,}/,
  /(?:\/etc\/passwd|\/etc\/shadow|\/proc\/self|\/boot\.ini|c:\\windows\\system32)/i
];

export interface ThreatEvaluationContext {
  userId: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
  eventType: 'registration' | 'failed_login_lockout' | 'malicious_payload_probe' | 'rapid_burst_traffic' | 'compromised_access' | 'project_request_probe';
  payload?: any;
  body?: Record<string, any>;
  deviceFingerprint?: string;
  projectId?: string;
}

export class ThreatDetectionService {
  /**
   * Fast, non-blocking real-time inspection for incoming project API requests.
   * Scans query parameters and body payloads for malicious injection signatures.
   */
  public inspectProjectRequest(params: {
    url?: string;
    query?: Record<string, any>;
    body?: any;
    headers?: Record<string, any>;
    ipAddress?: string;
    projectId?: string;
    userId?: string;
    userEmail?: string;
  }): { riskScore: number; threatCategory?: ThreatCategory; evidence?: string; isFlagged: boolean } {
    let riskScore = 0;
    let threatCategory: ThreatCategory | undefined;
    let matchedEvidence: string | undefined;

    // Serialize payload for pattern matching
    const rawToCheck = [
      params.url || '',
      JSON.stringify(params.query || {}),
      typeof params.body === 'string' ? params.body : JSON.stringify(params.body || {})
    ].join(' ');

    // 1. SQL / NoSQL Injection Check
    for (const pattern of SQL_NOSQL_INJECTION_PATTERNS) {
      if (pattern.test(rawToCheck)) {
        riskScore += 80;
        threatCategory = 'sql_nosql_injection';
        matchedEvidence = `SQL/NoSQL injection pattern matched: ${pattern.toString()}`;
        break;
      }
    }

    // 2. XSS & Script Payload Check
    if (riskScore < 70) {
      for (const pattern of XSS_PAYLOAD_PATTERNS) {
        if (pattern.test(rawToCheck)) {
          riskScore += 75;
          threatCategory = 'xss_malicious_payload';
          matchedEvidence = `XSS / malicious script payload matched: ${pattern.toString()}`;
          break;
        }
      }
    }

    // 3. Path Traversal Check
    if (riskScore < 70) {
      for (const pattern of PATH_TRAVERSAL_PATTERNS) {
        if (pattern.test(rawToCheck)) {
          riskScore += 85;
          threatCategory = 'path_traversal_probe';
          matchedEvidence = `Directory path traversal attempt detected: ${pattern.toString()}`;
          break;
        }
      }
    }

    // If threat detected and user is identified, asynchronously trigger threat flagging
    if (riskScore >= 70 && params.userId && params.userEmail) {
      setImmediate(() => {
        this.evaluateThreat({
          userId: params.userId!,
          userEmail: params.userEmail!,
          ipAddress: params.ipAddress,
          eventType: 'malicious_payload_probe',
          payload: { threatCategory, evidence: matchedEvidence, projectId: params.projectId }
        }).catch(() => {});
      });
    }

    return {
      riskScore,
      threatCategory,
      evidence: matchedEvidence,
      isFlagged: riskScore >= 70
    };
  }

  /**
   * Evaluate risk score for a user event and trigger automated flagging if threshold exceeded.
   */
  public async evaluateThreat(ctx: ThreatEvaluationContext): Promise<{ riskScore: number; isFlagged: boolean; flag?: AccountSecurityFlag }> {
    const db = getDb();
    let riskScore = 0;
    const triggers: Record<string, any> = {};
    let primaryReason: ThreatCategory = 'bot_activity';
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

    // 1. Comprehensive Anti-Abuse Risk Assessment for Registration
    if (ctx.eventType === 'registration') {
      const abuseEval = antiAbuseService.evaluateRegistrationRisk({
        email: ctx.userEmail,
        clientIp: ctx.ipAddress,
        userAgent: ctx.userAgent,
        body: ctx.body,
        deviceFingerprint: ctx.deviceFingerprint,
        projectId: ctx.projectId
      });

      riskScore = abuseEval.riskScore;
      if (abuseEval.reasons.length > 0) {
        triggers.antiAbuseSignals = abuseEval.reasons;
        triggers.canonicalEmail = abuseEval.canonical.canonicalEmail;
        triggers.subnet = abuseEval.subnet;
        triggers.isSharedNetwork = abuseEval.isSharedNetwork;
      }

      if (abuseEval.isDisposable) {
        primaryReason = 'spam';
      } else if (abuseEval.isCanonicalCollision) {
        primaryReason = 'spam';
      } else if (abuseEval.isDeviceSpam) {
        primaryReason = 'bot_activity';
      } else if (abuseEval.isBot || abuseEval.isHoneypotTriggered) {
        primaryReason = 'bot_activity';
      } else if (abuseEval.isSubnetSpam) {
        primaryReason = 'spam';
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
    try {
      db.prepare('UPDATE project_users SET riskScore = MAX(riskScore, ?) WHERE id = ?').run(riskScore, ctx.userId);
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

        try { db.prepare('UPDATE users SET isFlagged = 1 WHERE id = ?').run(ctx.userId); } catch {}
        try { db.prepare('UPDATE project_users SET isFlagged = 1 WHERE id = ?').run(ctx.userId); } catch {}

        auditLogService.logAction({
          actorId: 'system_ai_threat_engine',
          actorEmail: 'security@flarebase.internal',
          actionType: 'security_event',
          ipAddress: ctx.ipAddress,
          status: 'failure',
          details: `Automated Threat Engine flagged account "${ctx.userEmail}" (Score: ${riskScore}, Reason: ${primaryReason}). Evidence: ${JSON.stringify(triggers)}`
        });

        const flagRecord: AccountSecurityFlag = {
          id: flagId,
          userId: ctx.userId,
          userEmail: ctx.userEmail,
          reason: primaryReason as any,
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
          summary: `High risk activity detected: ${ctx.userEmail} (${primaryReason.toUpperCase()} - Score: ${riskScore})`
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
