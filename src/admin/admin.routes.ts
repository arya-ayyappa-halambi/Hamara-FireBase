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
  getScheduledMigrationHandler,
  scheduleMigrationHandler,
  cancelScheduledMigrationHandler,
  executeScheduledMigrationNowHandler,
  broadcastEndpointNoticeHandler,
  getPortDiagnostics,
  checkSinglePort,
  getSecurityAlerts,
  dismissSecurityAlert,
  manualFlagUser,
  issueComplianceNotice,
  listComplianceNotices,
  reviewComplianceNotice,
  getTerminalLogs,
  shutdownServerHandler,
  getNetworkRulesHandler,
  addNetworkRuleHandler,
  deleteNetworkRuleHandler,
  getTrackedDevicesHandler,
  toggleBlockDeviceHandler,
  getNetworkSettingsHandler,
  updateNetworkSettingsHandler,
  getJailedIpsHandler,
  pardonJailedIpHandler,
  jailIpHandler,
  clearAllJailsHandler,
  lookupGeoIpHandler,
  getSubnetRatePoliciesHandler,
  addSubnetRatePolicyHandler,
  updateSubnetRatePolicyHandler,
  deleteSubnetRatePolicyHandler,
  getSubnetLiveMetricsHandler
} from './admin.controller';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Only allow Super Admins
router.use(authenticateJwt, requireSuperAdmin);
router.use(apiLimiter);

// ── Network Access Control & Device Tracking ─────────────────────────────────
router.get('/network/rules', getNetworkRulesHandler);
router.post('/network/rules', addNetworkRuleHandler);
router.delete('/network/rules/:id', deleteNetworkRuleHandler);
router.get('/network/devices', getTrackedDevicesHandler);
router.post('/network/devices/:ip/toggle-block', toggleBlockDeviceHandler);
router.get('/network/settings', getNetworkSettingsHandler);
router.patch('/network/settings', updateNetworkSettingsHandler);
router.get('/network/geoip/:ip', lookupGeoIpHandler);

// ── Adaptive Subnet Rate Limiting & Bandwidth Throttling ─────────────────────
router.get('/network/rate-limits', getSubnetRatePoliciesHandler);
router.post('/network/rate-limits', addSubnetRatePolicyHandler);
router.patch('/network/rate-limits/:id', updateSubnetRatePolicyHandler);
router.delete('/network/rate-limits/:id', deleteSubnetRatePolicyHandler);
router.get('/network/rate-limits/metrics', getSubnetLiveMetricsHandler);

// ── Automated & Manual IP Quarantine / Jail ─────────────────────────────────
router.get('/network/jail', getJailedIpsHandler);
router.post('/network/jail', jailIpHandler);
router.post('/network/jail/:ip/pardon', pardonJailedIpHandler);
router.delete('/network/jail/clear', clearAllJailsHandler);

router.post('/server/shutdown', shutdownServerHandler);
router.get('/terminal-logs', getTerminalLogs);
router.get('/platform-settings', getPlatformSettings);
router.patch('/platform-settings', updatePlatformSettings);
router.get('/platform-settings/port-diagnostics', getPortDiagnostics);
router.post('/platform-settings/check-port', checkSinglePort);
router.get('/platform-settings/migration', getScheduledMigrationHandler);
router.post('/platform-settings/migration/schedule', scheduleMigrationHandler);
router.post('/platform-settings/migration/cancel', cancelScheduledMigrationHandler);
router.post('/platform-settings/migration/execute-now', executeScheduledMigrationNowHandler);
router.post('/platform-settings/broadcast-notice', broadcastEndpointNoticeHandler);

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
