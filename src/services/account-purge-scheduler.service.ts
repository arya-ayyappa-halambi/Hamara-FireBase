// ─────────────────────────────────────────────────────────────────────────────
//  src/services/account-purge-scheduler.service.ts
//  Background worker to automatically execute permanent cascading erasure
//  for accounts whose 7-day grace period has expired.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { purgeDeveloperAccountPermanent } from '../auth/auth.service';
import { projectAuthService } from '../project-auth/project-auth.service';

export class AccountPurgeSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number = 60 * 1000; // Check every 60 seconds

  public start(): void {
    if (this.timer) return;
    // Run an initial check after 5 seconds
    setTimeout(() => this.processExpiredDeletions(), 5000);
    this.timer = setInterval(() => {
      this.processExpiredDeletions();
    }, this.intervalMs);
    console.log('🛡️  Account Purge Scheduler started (7-day grace period monitor active).');
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async processExpiredDeletions(): Promise<number> {
    const db = getDb();
    const nowIso = new Date().toISOString();

    try {
      const expiredRequests = db.prepare(`
        SELECT * FROM account_deletion_requests 
        WHERE status = 'pending' AND scheduledDeletionAt <= ?
      `).all(nowIso) as any[];

      if (expiredRequests.length > 0) {
        console.log(`⏳ [PurgeDaemon] Found ${expiredRequests.length} expired account deletion request(s) to permanently erase.`);

        for (const req of expiredRequests) {
          try {
            if (req.accountType === 'developer') {
              await purgeDeveloperAccountPermanent(req.userId);
              console.log(`✅ [PurgeDaemon] Permanently erased developer account "${req.userEmail}" (ID: ${req.userId}).`);
            } else if (req.accountType === 'project_user') {
              await projectAuthService.purgeProjectUserPermanent(req.projectId, req.userId);
              console.log(`✅ [PurgeDaemon] Permanently erased project user "${req.userEmail}" (ID: ${req.userId}).`);
            }
          } catch (err: any) {
            console.error(`❌ [PurgeDaemon] Failed to purge user "${req.userEmail}":`, err.message);
          }
        }
      }

      // ── Process Expired / Rejected Compliance Notices ────────────────────────
      const expiredNotices = db.prepare(`
        SELECT * FROM account_compliance_notices
        WHERE (status = 'scheduled_for_purge' OR status = 'open')
          AND deadlineAt <= ?
      `).all(nowIso) as any[];

      if (expiredNotices.length > 0) {
        console.log(`⏳ [PurgeDaemon] Found ${expiredNotices.length} expired compliance violation notice(s) to enforce.`);
        for (const notice of expiredNotices) {
          try {
            await purgeDeveloperAccountPermanent(notice.userId);
            db.prepare(`UPDATE account_compliance_notices SET status = 'purged', adminDecision = 'expired' WHERE id = ?`).run(notice.id);
            console.log(`✅ [PurgeDaemon] Compliance violation enforced: Permanently erased user "${notice.userEmail}".`);
          } catch (err: any) {
            console.error(`❌ [PurgeDaemon] Failed to purge compliance violator "${notice.userEmail}":`, err.message);
          }
        }
      }

      return expiredRequests.length + expiredNotices.length;
    } catch (err: any) {
      console.error('❌ [PurgeDaemon] Error querying expired deletion requests or notices:', err.message);
      return 0;
    }
  }
}

export const accountPurgeSchedulerService = new AccountPurgeSchedulerService();
