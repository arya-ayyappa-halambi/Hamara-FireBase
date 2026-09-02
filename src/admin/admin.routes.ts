import { Router } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { requireSuperAdmin, requireAdminPermission, disallowOttSessionMutation } from '../middleware/admin.middleware';
import {
  getStats,
  getUsers,
  createAdminHandler,
  promoteUserToAdminHandler,
  demoteAdminHandler,
  updateAdminSecurityConfigHandler,
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
  getSubnetLiveMetricsHandler,
  getEmergencyStatusHandler,
  setEmergencyLevelHandler,
  setMaintenanceWindowHandler,
  createEmergencySnapshotHandler,
  getWafSettingsHandler,
  updateWafSettingsHandler,
  getWafStatsHandler,
  generateOttHandler,
  listOttTokensHandler,
  revokeOttTokenHandler,
  listDeviceRequestsHandler,
  approveDeviceRequestHandler,
  rejectDeviceRequestHandler,
  getClusterDiagnosticsHandler,
  hotRestartServerHandler,
  getTunnelStatusHandler,
  startTunnelHandler,
  stopTunnelHandler,
  updateTunnelSettingsHandler,
  clearTunnelSettingsHandler,
  attachTunnelHandler,
  getTrafficTopologyHandler,
  getTenantQuotas,
  getMeshVpnStatusHandler,
  updateMeshVpnSettingsHandler,
  pingMeshPeerHandler
} from './admin.controller';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Only allow Super Admins
router.use(authenticateJwt, requireSuperAdmin);
router.use(apiLimiter);

// ── Network Access Control & Device Tracking ─────────────────────────────────
router.get('/network/rules', getNetworkRulesHandler);
router.post('/network/rules', disallowOttSessionMutation, addNetworkRuleHandler);
router.delete('/network/rules/:id', disallowOttSessionMutation, deleteNetworkRuleHandler);
router.get('/network/devices', getTrackedDevicesHandler);
router.post('/network/devices/:ip/toggle-block', disallowOttSessionMutation, toggleBlockDeviceHandler);
router.get('/network/settings', getNetworkSettingsHandler);
router.patch('/network/settings', disallowOttSessionMutation, updateNetworkSettingsHandler);
router.get('/network/geoip/:ip', lookupGeoIpHandler);

// ── Adaptive Subnet Rate Limiting & Bandwidth Throttling ─────────────────────
router.get('/network/rate-limits', getSubnetRatePoliciesHandler);
router.post('/network/rate-limits', disallowOttSessionMutation, addSubnetRatePolicyHandler);
router.patch('/network/rate-limits/:id', disallowOttSessionMutation, updateSubnetRatePolicyHandler);
router.delete('/network/rate-limits/:id', disallowOttSessionMutation, deleteSubnetRatePolicyHandler);
router.get('/network/rate-limits/metrics', getSubnetLiveMetricsHandler);

// ── Automated & Manual IP Quarantine / Jail ─────────────────────────────────
router.get('/network/jail', getJailedIpsHandler);
router.post('/network/jail', disallowOttSessionMutation, jailIpHandler);
router.post('/network/jail/:ip/pardon', disallowOttSessionMutation, pardonJailedIpHandler);
router.delete('/network/jail/clear', disallowOttSessionMutation, clearAllJailsHandler);

// ── Emergency Protocols, Panic Mode & Maintenance Windows ───────────────────
router.get('/emergency/status', getEmergencyStatusHandler);
router.post('/emergency/lockdown', disallowOttSessionMutation, setEmergencyLevelHandler);
router.post('/emergency/maintenance', disallowOttSessionMutation, setMaintenanceWindowHandler);
router.post('/emergency/panic-snapshot', createEmergencySnapshotHandler);

// ── Layer-7 Web Application Firewall (WAF) & Threat Shield ──────────────────
router.get('/waf/settings', getWafSettingsHandler);
router.patch('/waf/settings', disallowOttSessionMutation, updateWafSettingsHandler);
router.get('/waf/stats', getWafStatsHandler);

// ── Ephemeral One-Time Tokens (OTT) & Zero-Trust Device Approvals ───────────
router.post('/ott/generate', disallowOttSessionMutation, generateOttHandler);
router.get('/ott/list', listOttTokensHandler);
router.delete('/ott/:id', disallowOttSessionMutation, revokeOttTokenHandler);
router.get('/device-requests', listDeviceRequestsHandler);
router.post('/device-requests/:id/approve', disallowOttSessionMutation, approveDeviceRequestHandler);
router.post('/device-requests/:id/reject', disallowOttSessionMutation, rejectDeviceRequestHandler);

// ── Zero-Downtime Hot Restart & Cluster Port Diagnostics Matrix ──────────────
router.get('/server/cluster-diagnostics', getClusterDiagnosticsHandler);
router.post('/server/hot-restart', disallowOttSessionMutation, hotRestartServerHandler);

// ── Global Public Tunneling Manager (Cloudflare, Ngrok & Localtunnel) ────────
router.get('/tunnel/status', getTunnelStatusHandler);
router.post('/tunnel/start', disallowOttSessionMutation, startTunnelHandler);
router.post('/tunnel/stop', disallowOttSessionMutation, stopTunnelHandler);
router.post('/tunnel/attach', disallowOttSessionMutation, attachTunnelHandler);
router.patch('/tunnel/settings', disallowOttSessionMutation, updateTunnelSettingsHandler);
router.delete('/tunnel/settings', disallowOttSessionMutation, clearTunnelSettingsHandler);

// ── Real-Time Traffic Topology & Flow Telemetry Matrix ───────────────────────
router.get('/traffic/topology', getTrafficTopologyHandler);

// ── Private Mesh VPN & P2P Overlay (n2n, Tailscale, WireGuard, ZeroTier) ────
router.get('/mesh/status', getMeshVpnStatusHandler);
router.patch('/mesh/settings', disallowOttSessionMutation, updateMeshVpnSettingsHandler);
router.post('/mesh/ping', pingMeshPeerHandler);

router.post('/server/shutdown', disallowOttSessionMutation, shutdownServerHandler);
router.get('/terminal-logs', getTerminalLogs);
router.get('/platform-settings', getPlatformSettings);
router.patch('/platform-settings', disallowOttSessionMutation, updatePlatformSettings);
router.get('/platform-settings/port-diagnostics', getPortDiagnostics);
router.post('/platform-settings/check-port', checkSinglePort);
router.get('/platform-settings/migration', getScheduledMigrationHandler);
router.post('/platform-settings/migration/schedule', disallowOttSessionMutation, scheduleMigrationHandler);
router.post('/platform-settings/migration/cancel', disallowOttSessionMutation, cancelScheduledMigrationHandler);
router.post('/platform-settings/migration/execute-now', disallowOttSessionMutation, executeScheduledMigrationNowHandler);
router.post('/platform-settings/broadcast-notice', disallowOttSessionMutation, broadcastEndpointNoticeHandler);

router.get('/stats', requireAdminPermission('telemetry'), getStats);
router.get('/tenants', requireAdminPermission('tenants'), getTenantQuotas);
router.get('/users', requireAdminPermission('user_management'), getUsers);
router.post('/users/create-admin', requireAdminPermission('user_management'), disallowOttSessionMutation, createAdminHandler);
router.patch('/users/:id/promote', requireAdminPermission('user_management'), disallowOttSessionMutation, promoteUserToAdminHandler);
router.patch('/users/:id/demote', requireAdminPermission('user_management'), disallowOttSessionMutation, demoteAdminHandler);
router.patch('/users/:id/admin-config', requireAdminPermission('user_management'), disallowOttSessionMutation, updateAdminSecurityConfigHandler);
router.patch('/users/:id/limits', requireAdminPermission('user_management'), disallowOttSessionMutation, updateUserLimits);
router.post('/users/:id/reset-mfa', requireAdminPermission('user_management'), disallowOttSessionMutation, resetUserMfa);

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
