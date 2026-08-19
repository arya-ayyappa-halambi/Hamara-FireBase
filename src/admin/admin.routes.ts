import { Router } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { requireSuperAdmin } from '../middleware/admin.middleware';
import {
  getStats,
  getUsers,
  updateRateLimits,
  updateUserLimits,
  getAccountDeletionRequests,
  cancelAccountDeletion,
  resetUserMfa,
  getSecurityAdvisorReport,
  getAuditLogs,
  listBackups,
  purgeExpiredBackups,
  createBackup,
  getPlatformSettings,
  updatePlatformSettings,
  getSecurityAlerts,
  dismissSecurityAlert,
  manualFlagUser,
  issueComplianceNotice,
  listComplianceNotices,
  reviewComplianceNotice
} from './admin.controller';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Only allow Super Admins
router.use(authenticateJwt, requireSuperAdmin);
router.use(apiLimiter);

router.get('/platform-settings', getPlatformSettings);
router.patch('/platform-settings', updatePlatformSettings);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.patch('/users/:id/limits', updateUserLimits);
router.post('/users/:id/reset-mfa', resetUserMfa);

// ── Trust & Safety / Threat Intelligence & Moderation ─────────────────────────
router.get('/security/alerts', getSecurityAlerts);
router.post('/security/flags/:id/dismiss', dismissSecurityAlert);
router.post('/users/:id/flag', manualFlagUser);
router.post('/users/:id/notice', issueComplianceNotice);
router.get('/notices', listComplianceNotices);
router.post('/notices/:id/decision', reviewComplianceNotice);

// ── Account Deletions Lifecycle & Retention ───────────────────────────────────
router.get('/account-deletions', getAccountDeletionRequests);
router.post('/account-deletions/:id/cancel', cancelAccountDeletion);

router.patch('/rate-limits', updateRateLimits);
router.get('/security-advisor', getSecurityAdvisorReport);
router.get('/audit-logs', getAuditLogs);
router.get('/backups', listBackups);
router.post('/backups/purge', purgeExpiredBackups);
router.post('/backups', createBackup);

export default router;
