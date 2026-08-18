// ─────────────────────────────────────────────────────────────────────────────
//  src/services/account-moderation.service.ts
//  Compliance Violation Notice, User Explanation & Appeal Hearing Service.
//  Enforces formal notice lifecycles, Super Admin hearings, and automated purge workflows.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { AccountComplianceNotice, AppError } from '../types/auth.types';
import { auditLogService } from './audit-log.service';
import { wsService } from '../realtime/websocket.service';
import { envelopeEncryptionService } from './envelope-encryption.service';
import { v4 as uuidv4 } from 'uuid';

export interface IssueNoticeDto {
  category: string;
  title: string;
  details: string;
  deadlineDays?: number;
}

export class AccountModerationService {
  /**
   * Super Admin issues a formal compliance violation notice to an account.
   */
  public issueNotice(adminId: string, adminEmail: string, userId: string, dto: IssueNoticeDto): AccountComplianceNotice {
    const db = getDb();
    const user = db.prepare('SELECT id, email, isSuperAdmin FROM users WHERE id = ?').get(userId) as any;
    if (!user) throw new AppError('User not found', 404);
    if (user.isSuperAdmin) {
      throw new AppError('Cannot issue compliance notices to Super Admin accounts.', 400);
    }

    let userEmail = user.email;
    if (typeof userEmail === 'string' && userEmail.startsWith('{')) {
      try {
        userEmail = envelopeEncryptionService.decryptField(JSON.parse(userEmail), 'SYSTEM') || userEmail;
      } catch {}
    }

    const noticeId = uuidv4();
    const now = new Date();
    const days = dto.deadlineDays && dto.deadlineDays > 0 ? dto.deadlineDays : 3;
    const deadlineDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const issuedAt = now.toISOString();
    const deadlineAt = deadlineDate.toISOString();

    const noticeTx = db.transaction(() => {
      // Invalidate previous open notices for this user
      db.prepare(`UPDATE account_compliance_notices SET status = 'revoked' WHERE userId = ? AND status = 'open'`).run(userId);

      db.prepare(`
        INSERT INTO account_compliance_notices (
          id, userId, userEmail, category, title, details, issuedAt, deadlineAt, status, adminDecision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'pending')
      `).run(
        noticeId,
        userId,
        userEmail,
        dto.category || 'Terms of Service & Security Policy Violation',
        dto.title,
        dto.details,
        issuedAt,
        deadlineAt
      );

      db.prepare(`
        UPDATE users 
        SET activeNoticeId = ?, noticeStatus = 'notice_issued', isFlagged = 1, updatedAt = ?
        WHERE id = ?
      `).run(noticeId, issuedAt, userId);
    });

    noticeTx();

    auditLogService.logAction({
      actorId: adminId,
      actorEmail: adminEmail,
      actionType: 'super_admin_operation',
      status: 'success',
      details: `Super Admin issued ${days}-day Compliance Notice to "${userEmail}" (${dto.category}): "${dto.title}".`
    });

    const notice: AccountComplianceNotice = {
      id: noticeId,
      userId,
      userEmail,
      category: dto.category || 'Security Policy Violation',
      title: dto.title,
      details: dto.details,
      issuedAt,
      deadlineAt,
      status: 'open',
      adminDecision: 'pending',
      daysRemaining: days
    };

    // WebSocket push to real-time sessions
    wsService.broadcast('USER_NOTICE_ISSUED', {
      userId,
      noticeId,
      title: dto.title,
      deadlineAt
    });

    console.log(`⚠️ [ModerationService] Issued compliance notice to "${userEmail}" (Deadline: ${days} days).`);

    return notice;
  }

  /**
   * User fetches their active compliance notice.
   */
  public getUserActiveNotice(userId: string): AccountComplianceNotice | null {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM account_compliance_notices 
      WHERE userId = ? AND status IN ('open', 'appealed', 'scheduled_for_purge')
      ORDER BY issuedAt DESC LIMIT 1
    `).get(userId) as any;

    if (!row) return null;

    const remainingMs = new Date(row.deadlineAt).getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

    return {
      ...row,
      daysRemaining
    };
  }

  /**
   * User submits their explanation / appeal against the notice.
   */
  public submitUserExplanation(userId: string, noticeId: string, explanation: string): { success: boolean; message: string } {
    const db = getDb();
    const notice = db.prepare('SELECT * FROM account_compliance_notices WHERE id = ? AND userId = ?').get(noticeId, userId) as any;
    if (!notice) throw new AppError('Notice not found', 404);
    if (notice.status === 'revoked' || notice.status === 'purged') {
      throw new AppError('This notice is no longer active.', 400);
    }

    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        UPDATE account_compliance_notices
        SET userExplanation = ?, explanationSubmittedAt = ?, status = 'appealed'
        WHERE id = ?
      `).run(explanation, now, noticeId);

      db.prepare(`
        UPDATE users 
        SET noticeStatus = 'appealed', updatedAt = ?
        WHERE id = ?
      `).run(now, userId);
    })();

    auditLogService.logAction({
      actorId: userId,
      actorEmail: notice.userEmail,
      actionType: 'user_action',
      status: 'success',
      details: `User submitted explanation for compliance notice "${notice.title}".`
    });

    wsService.broadcast('USER_APPEAL_SUBMITTED', {
      noticeId,
      userId,
      userEmail: notice.userEmail,
      timestamp: now
    });

    return { success: true, message: 'Explanation submitted successfully. Super Admin will review your appeal.' };
  }

  /**
   * Super Admin reviews notice explanation and makes a hearing decision.
   * If accepted: Notice is revoked ("taken back") and account restored to active.
   * If rejected: Notice is scheduled for permanent automated deletion upon deadline.
   */
  public reviewNotice(adminId: string, adminEmail: string, noticeId: string, decision: 'accepted' | 'rejected', decisionNotes?: string): { success: boolean; message: string } {
    const db = getDb();
    const notice = db.prepare('SELECT * FROM account_compliance_notices WHERE id = ?').get(noticeId) as any;
    if (!notice) throw new AppError('Notice not found', 404);

    const now = new Date().toISOString();

    if (decision === 'accepted') {
      db.transaction(() => {
        db.prepare(`
          UPDATE account_compliance_notices
          SET adminDecision = 'accepted', decisionNotes = ?, decidedAt = ?, status = 'revoked'
          WHERE id = ?
        `).run(decisionNotes || 'Explanation accepted by Super Admin. Notice revoked.', now, noticeId);

        db.prepare(`
          UPDATE users 
          SET activeNoticeId = NULL, noticeStatus = 'none', isFlagged = 0, updatedAt = ?
          WHERE id = ?
        `).run(now, notice.userId);

        // Resolve active flags for this user
        db.prepare(`
          UPDATE account_security_flags
          SET status = 'resolved', resolvedAt = ?, resolvedBy = ?
          WHERE userId = ? AND status = 'active'
        `).run(now, adminEmail, notice.userId);
      })();

      auditLogService.logAction({
        actorId: adminId,
        actorEmail: adminEmail,
        actionType: 'super_admin_operation',
        status: 'success',
        details: `Super Admin accepted appeal and revoked compliance notice for "${notice.userEmail}". Account restored to good standing.`
      });

      console.log(`✅ [ModerationService] Notice ${noticeId} REVOKED for "${notice.userEmail}". Account restored.`);

      return { success: true, message: 'Explanation accepted. Compliance notice has been revoked and user account retained.' };

    } else {
      // Rejected appeal -> schedule for automated purge at deadline
      db.transaction(() => {
        db.prepare(`
          UPDATE account_compliance_notices
          SET adminDecision = 'rejected', decisionNotes = ?, decidedAt = ?, status = 'scheduled_for_purge'
          WHERE id = ?
        `).run(decisionNotes || 'Explanation rejected by Super Admin.', now, noticeId);

        db.prepare(`
          UPDATE users 
          SET noticeStatus = 'action_required', status = 'pending_deletion', scheduledDeletionAt = ?, updatedAt = ?
          WHERE id = ?
        `).run(notice.deadlineAt, now, notice.userId);
      })();

      auditLogService.logAction({
        actorId: adminId,
        actorEmail: adminEmail,
        actionType: 'super_admin_operation',
        status: 'success',
        details: `Super Admin rejected appeal for "${notice.userEmail}". Account scheduled for permanent erasure at deadline: ${notice.deadlineAt}.`
      });

      console.log(`❌ [ModerationService] Notice ${noticeId} REJECTED for "${notice.userEmail}". Scheduled for purge at ${notice.deadlineAt}.`);

      return { success: true, message: 'Appeal rejected. Account scheduled for permanent deletion upon deadline expiration.' };
    }
  }

  /**
   * Super Admin lists all compliance notices.
   */
  public listNotices(status?: string): AccountComplianceNotice[] {
    const db = getDb();
    let query = 'SELECT * FROM account_compliance_notices';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY issuedAt DESC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(r => {
      const remainingMs = new Date(r.deadlineAt).getTime() - Date.now();
      const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
      return {
        ...r,
        daysRemaining
      };
    });
  }
}

export const accountModerationService = new AccountModerationService();
