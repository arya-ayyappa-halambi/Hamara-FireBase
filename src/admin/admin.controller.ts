// ─────────────────────────────────────────────────────────────────────────────
//  src/admin/admin.controller.ts
//  HTTP controller for Super Admin telemetry, backups, audit logs, and limits.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service';
import { ApiResponse, AppError } from '../types/auth.types';
import { AdminSystemStats } from '../types/project.types';
import { securityAdvisorService } from '../security/advisor.service';
import { auditLogService } from '../services/audit-log.service';
import { backupService } from '../services/backup.service';
import { rateLimiterService } from '../services/rate-limiter.service';
import { metricsService } from '../services/metrics.service';
import { threatDetectionService } from '../services/threat-detection.service';
import { accountModerationService } from '../services/account-moderation.service';
import { userStore } from '../store/user.store';
import { getDb } from '../db/sqlite.connection';
import { endpointMigrationScheduler } from '../services/endpoint-migration-scheduler.service';
import { wsService } from '../realtime/websocket.service';
import { networkDiagnosticsService } from '../services/network-diagnostics.service';
import { networkAccessService } from '../services/network-access.service';
import { geoipThreatIntelService } from '../services/geoip-threat-intel.service';
import { subnetRateLimiterService } from '../services/subnet-rate-limiter.service';
import { emergencyControlService } from '../services/emergency-control.service';
import { wafShieldService } from '../services/waf-shield.service';
import { remoteOttAccessService } from '../services/remote-ott-access.service';
import { tunnelManagerService } from '../services/tunnel-manager.service';
import { trafficTopologyService } from '../services/traffic-topology.service';
import { meshVpnService } from '../services/mesh-vpn.service';
import { envelopeEncryptionService } from '../services/envelope-encryption.service';

export async function getPlatformSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM platform_settings WHERE id = ?').get('default') as any;
    const networkIp = endpointMigrationScheduler.getNetworkIp();
    const pendingMigration = endpointMigrationScheduler.getPendingMigration();
    const serverHost = settings?.serverHost || '0.0.0.0';
    const serverPort = settings?.serverPort || 3000;
    const serverHostingMode = settings?.serverHostingMode || 'both';
    const customDomain = settings?.customDomain || '';
    const canonicalBaseUrl = endpointMigrationScheduler.computeBaseUrl(serverHostingMode, serverHost, serverPort, customDomain);

    res.status(200).json({
      success: true,
      message: 'Platform settings retrieved.',
      data: {
        googleAuthEnabled: settings ? settings.googleAuthEnabled === 1 : false,
        googleClientId: settings ? settings.googleClientId : '',
        demoLoginEnabled: settings ? (settings.demoLoginEnabled === 1 || settings.demoLoginEnabled === true) : true,
        magicLinkAuthEnabled: settings ? (settings.magicLinkAuthEnabled === 1 || settings.magicLinkAuthEnabled === true) : false,
        passkeyAuthEnabled: settings ? (settings.passkeyAuthEnabled === 1 || settings.passkeyAuthEnabled === true) : false,
        backupMode: settings ? settings.backupMode : 'none',
        backupIntervalMinutes: settings ? settings.backupIntervalMinutes : 1440,
        backupRetentionDays: settings ? settings.backupRetentionDays : 7,
        s3BucketName: settings ? settings.s3BucketName : '',
        s3Region: settings ? settings.s3Region : '',
        s3AccessKey: settings ? settings.s3AccessKey : '',
        s3SecretKey: settings ? settings.s3SecretKey : '',
        maintenanceMode: settings ? settings.maintenanceMode === 1 : false,
        lastBackupAt: settings ? settings.lastBackupAt : null,
        lastBackupStatus: settings ? settings.lastBackupStatus : null,
        lastBackupS3Status: settings ? settings.lastBackupS3Status : null,
        lastBackupLocation: settings ? settings.lastBackupLocation : null,
        lastBackupS3Url: settings ? settings.lastBackupS3Url : null,
        serverHost,
        serverPort,
        serverHostingMode,
        customDomain,
        networkIp,
        canonicalBaseUrl,
        pendingMigration
      }
    });
  } catch (err) { next(err); }
}

export async function updatePlatformSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const current = db.prepare('SELECT * FROM platform_settings WHERE id = ?').get('default') as any;
    
    // Merge new values with current values
    const googleAuthEnabled = req.body.googleAuthEnabled !== undefined ? req.body.googleAuthEnabled : current.googleAuthEnabled;
    const googleClientId = req.body.googleClientId !== undefined ? req.body.googleClientId : current.googleClientId;
    const demoLoginEnabled = req.body.demoLoginEnabled !== undefined ? req.body.demoLoginEnabled : (current.demoLoginEnabled !== undefined ? current.demoLoginEnabled : 1);
    const magicLinkAuthEnabled = req.body.magicLinkAuthEnabled !== undefined ? req.body.magicLinkAuthEnabled : current.magicLinkAuthEnabled;
    const passkeyAuthEnabled = req.body.passkeyAuthEnabled !== undefined ? req.body.passkeyAuthEnabled : current.passkeyAuthEnabled;
    const backupMode = req.body.backupMode !== undefined ? req.body.backupMode : current.backupMode;
    const backupIntervalMinutes = req.body.backupIntervalMinutes !== undefined ? req.body.backupIntervalMinutes : current.backupIntervalMinutes;
    const backupRetentionDays = req.body.backupRetentionDays !== undefined ? req.body.backupRetentionDays : current.backupRetentionDays;
    const s3BucketName = req.body.s3BucketName !== undefined ? req.body.s3BucketName : current.s3BucketName;
    const s3Region = req.body.s3Region !== undefined ? req.body.s3Region : current.s3Region;
    const s3AccessKey = req.body.s3AccessKey !== undefined ? req.body.s3AccessKey : current.s3AccessKey;
    const s3SecretKey = req.body.s3SecretKey !== undefined ? req.body.s3SecretKey : current.s3SecretKey;
    const maintenanceMode = req.body.maintenanceMode !== undefined ? req.body.maintenanceMode : current.maintenanceMode;
    const serverHost = req.body.serverHost !== undefined ? req.body.serverHost : (current.serverHost || '0.0.0.0');
    const serverPort = req.body.serverPort !== undefined ? parseInt(req.body.serverPort, 10) : (current.serverPort || 3000);
    const serverHostingMode = req.body.serverHostingMode !== undefined ? req.body.serverHostingMode : (current.serverHostingMode || 'both');
    const customDomain = req.body.customDomain !== undefined ? req.body.customDomain : (current.customDomain || '');

    if (isNaN(serverPort) || serverPort < 1 || serverPort > 65535) {
      throw new AppError('Server port must be a valid integer between 1 and 65535.', 400);
    }
    if (serverPort < 1024 && process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
      throw new AppError(`Port ${serverPort} is a privileged system port (< 1024). On macOS and Linux, ports below 1024 require root/sudo privileges. Please choose a port between 1024 and 65535 (e.g. 3000, 4000, 8080, 9000).`, 400);
    }

    // Convert boolean to 1/0 for sqlite
    const isGoogleAuthEnabled = googleAuthEnabled === true || googleAuthEnabled === 'true' || googleAuthEnabled === 1 ? 1 : 0;
    const isDemoLoginEnabled = demoLoginEnabled === true || demoLoginEnabled === 'true' || demoLoginEnabled === 1 ? 1 : 0;
    const isMagicLinkAuthEnabled = magicLinkAuthEnabled === true || magicLinkAuthEnabled === 'true' || magicLinkAuthEnabled === 1 ? 1 : 0;
    const isPasskeyAuthEnabled = passkeyAuthEnabled === true || passkeyAuthEnabled === 'true' || passkeyAuthEnabled === 1 ? 1 : 0;
    
    db.prepare(`
      UPDATE platform_settings 
      SET googleAuthEnabled = ?, 
          googleClientId = ?,
          demoLoginEnabled = ?,
          magicLinkAuthEnabled = ?,
          passkeyAuthEnabled = ?,
          backupMode = ?,
          backupIntervalMinutes = ?,
          backupRetentionDays = ?,
          s3BucketName = ?,
          s3Region = ?,
          s3AccessKey = ?,
          s3SecretKey = ?,
          maintenanceMode = ?,
          serverHost = ?,
          serverPort = ?,
          serverHostingMode = ?,
          customDomain = ?
      WHERE id = ?
    `).run(
      isGoogleAuthEnabled, 
      googleClientId || '', 
      isDemoLoginEnabled,
      isMagicLinkAuthEnabled,
      isPasskeyAuthEnabled,
      backupMode || 'none',
      backupIntervalMinutes || 1440,
      backupRetentionDays || 7,
      s3BucketName || '',
      s3Region || '',
      s3AccessKey || '',
      s3SecretKey || '',
      maintenanceMode === true || maintenanceMode === 'true' || maintenanceMode === 1 ? 1 : 0,
      serverHost,
      serverPort,
      serverHostingMode,
      customDomain,
      'default'
    );
    
    // Refresh backup scheduler
    backupService.stopScheduler();
    backupService.startScheduler();
      
    // Automatically enforce retention policy on updated settings
    backupService.enforceRetention().catch((e) => console.error('Retention enforcement failed:', e));

    const networkIp = endpointMigrationScheduler.getNetworkIp();
    const newBaseUrl = endpointMigrationScheduler.computeBaseUrl(serverHostingMode, serverHost, serverPort, customDomain);

    // Rebind server socket if host, port, or mode has changed
    const portChanged = serverPort !== Number(current.serverPort || 3000);
    const hostChanged = serverHost !== (current.serverHost || '0.0.0.0');
    const modeChanged = serverHostingMode !== (current.serverHostingMode || 'both');

    if (portChanged || hostChanged || modeChanged) {
      // Broadcast live migration redirect event to all connected clients across all tabs
      wsService.broadcast('ENDPOINT_MIGRATION_EXECUTED', {
        serverHost,
        serverPort,
        serverHostingMode,
        customDomain,
        newBaseUrl,
        networkIp
      });

      const currentBindAddr = (current.serverHost === '127.0.0.1' || current.serverHost === 'localhost' || current.serverHostingMode === 'localhost') ? '127.0.0.1' : '0.0.0.0';
      const effectiveHost = (serverHostingMode === 'localhost' || serverHost === '127.0.0.1' || serverHost === 'localhost') ? '127.0.0.1' : serverHost;
      const newBindAddr = (effectiveHost === '127.0.0.1' || effectiveHost === 'localhost') ? '127.0.0.1' : '0.0.0.0';

      if (portChanged || currentBindAddr !== newBindAddr) {
        setImmediate(async () => {
          try {
            console.log(`[Admin] Rebinding server live socket to ${effectiveHost}:${serverPort}...`);
            const { rebindServer } = await import('../server');
            await rebindServer(serverPort, effectiveHost);
          } catch (err: any) {
            console.error('[Admin] Rebind server failed:', err.message);
          }
        });
      }
    } else {
      // Broadcast real-time config update over WebSocket
      wsService.broadcast('SERVER_HOST_CONFIG_UPDATED', {
        serverHost,
        serverPort,
        serverHostingMode,
        customDomain,
        newBaseUrl,
        networkIp
      });
    }

    res.status(200).json({
      success: true,
      message: 'Platform settings updated successfully.',
      data: {
        googleAuthEnabled: isGoogleAuthEnabled === 1,
        googleClientId: googleClientId || '',
        demoLoginEnabled: isDemoLoginEnabled === 1,
        magicLinkAuthEnabled: isMagicLinkAuthEnabled === 1,
        passkeyAuthEnabled: isPasskeyAuthEnabled === 1,
        backupMode: backupMode || 'none',
        backupIntervalMinutes: backupIntervalMinutes || 1440,
        backupRetentionDays: backupRetentionDays || 7,
        s3BucketName: s3BucketName || '',
        s3Region: s3Region || '',
        s3AccessKey: s3AccessKey || '',
        s3SecretKey: s3SecretKey || '',
        serverHost,
        serverPort,
        serverHostingMode,
        customDomain,
        networkIp,
        canonicalBaseUrl: newBaseUrl
      }
    });
  } catch (err) { next(err); }
}

export async function getScheduledMigrationHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const migration = endpointMigrationScheduler.getPendingMigration();
    res.status(200).json({ success: true, data: migration });
  } catch (err) { next(err); }
}

export async function scheduleMigrationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { targetHost, targetPort, targetMode, customDomain, scheduledAt, noticeMessage } = req.body;
    if (!scheduledAt) {
      res.status(400).json({ success: false, message: 'scheduledAt date-time is required.' });
      return;
    }

    const portNum = Number(targetPort || 3000);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      res.status(400).json({ success: false, message: 'targetPort must be a valid integer between 1 and 65535.' });
      return;
    }
    if (portNum < 1024 && process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
      res.status(400).json({ success: false, message: `Port ${portNum} is a privileged system port (< 1024). On macOS and Linux, ports below 1024 require root/sudo. Please choose a port between 1024 and 65535 (e.g. 3000, 4000, 8080, 9000).` });
      return;
    }

    const migration = endpointMigrationScheduler.scheduleMigration({
      targetHost,
      targetPort: portNum,
      targetMode,
      customDomain,
      scheduledAt,
      noticeMessage
    });

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'schedule_endpoint_migration',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Scheduled endpoint migration to ${migration.newBaseUrl} at ${scheduledAt}.`
    });

    res.status(201).json({
      success: true,
      message: 'Endpoint migration scheduled successfully and notice rolled out.',
      data: migration
    });
  } catch (err) { next(err); }
}

export async function cancelScheduledMigrationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.body?.id;
    const cancelled = endpointMigrationScheduler.cancelMigration(id);
    res.status(200).json({ success: true, message: cancelled ? 'Scheduled migration cancelled.' : 'No active scheduled migration found.' });
  } catch (err) { next(err); }
}

export async function executeScheduledMigrationNowHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.body?.id;
    if (!id) throw new AppError('Migration ID is required.', 400);
    const executed = await endpointMigrationScheduler.executeMigration(id);
    res.status(200).json({ success: true, message: executed ? 'Migration executed immediately.' : 'Failed to execute migration.' });
  } catch (err) { next(err); }
}

export async function broadcastEndpointNoticeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, message, newBaseUrl, oldBaseUrl } = req.body;
    if (!title || !message) {
      throw new AppError('Title and message are required.', 400);
    }
    const networkIp = endpointMigrationScheduler.getNetworkIp();
    wsService.broadcast('ENDPOINT_MIGRATION_NOTICE', {
      title,
      message,
      newBaseUrl,
      oldBaseUrl,
      networkIp,
      broadcastedAt: new Date().toISOString()
    });
    res.status(200).json({ success: true, message: 'Endpoint notice broadcasted to all active clients.' });
  } catch (err) { next(err); }
}

export async function getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = adminService.getSystemStats();
    const rateLimiting = rateLimiterService.getTelemetry();
    const metricsSnapshot = metricsService.getJsonSnapshot();
    res.status(200).json({
      success: true,
      message: 'System statistics retrieved.',
      data: {
        ...stats,
        rateLimiting,
        metricsSnapshot
      },
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function getUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await adminService.getUsers();
    res.status(200).json({
      success: true,
      message: 'Users retrieved.',
      data: users,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function createAdminHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password, adminPermissions, adminAllowedIpSubnet, adminRequireMfa } = req.body;
    const adminUser = await adminService.createAdmin({
      name,
      email,
      password,
      adminPermissions,
      adminAllowedIpSubnet,
      adminRequireMfa
    });

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Created new Administrator account for "${email}" with permissions: ${JSON.stringify(adminPermissions || ['*'])} and IP lock: "${adminAllowedIpSubnet || 'None'}".`
    });

    res.status(201).json({
      success: true,
      message: 'Administrator account created successfully.',
      data: adminUser,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function promoteUserToAdminHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { adminPermissions, adminAllowedIpSubnet, adminRequireMfa } = req.body;
    const updated = await adminService.promoteUserToAdmin(id, adminPermissions, adminAllowedIpSubnet, adminRequireMfa);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Promoted user "${id}" (${updated?.email}) to Administrator with permissions: ${JSON.stringify(adminPermissions || ['*'])}.`
    });

    res.status(200).json({
      success: true,
      message: `User promoted to Administrator successfully.`,
      data: updated,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function demoteAdminHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const currentActorId = req.user?.sub;
    const updated = await adminService.demoteAdmin(id, currentActorId);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Revoked Administrator privileges from user "${id}" (${updated?.email}). Account converted to regular Developer.`
    });

    res.status(200).json({
      success: true,
      message: `Administrator privileges revoked successfully.`,
      data: updated,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function updateAdminSecurityConfigHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const currentActorId = req.user?.sub;
    const { adminPermissions, adminAllowedIpSubnet, adminRequireMfa, adminStatus } = req.body;

    const updated = await adminService.updateAdminSecurityConfig(id, {
      adminPermissions,
      adminAllowedIpSubnet,
      adminRequireMfa,
      adminStatus
    }, currentActorId);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Updated security configuration for Administrator "${id}" (${updated?.email}): Status=${adminStatus || 'active'}, IP Lock="${adminAllowedIpSubnet || 'None'}", Permissions=${JSON.stringify(adminPermissions || ['*'])}.`
    });

    res.status(200).json({
      success: true,
      message: `Administrator security configuration updated successfully.`,
      data: updated,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function updateUserLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout } = req.body;
    await adminService.updateUserLimits(id, apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Updated limits for user ID "${id}".`
    });

    res.status(200).json({
      success: true,
      message: 'User limits updated successfully.',
      data: null,
    } as ApiResponse<null>);
  } catch (err) { next(err); }
}

export async function updateRateLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = adminService.updateRateLimits(req.body);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Updated system rate limits: ${JSON.stringify(req.body)}`
    });

    res.status(200).json({
      success: true,
      message: 'Rate limits updated successfully.',
      data: config,
    } as ApiResponse<typeof config>);
  } catch (err) { next(err); }
}

export async function getAccountDeletionRequests(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = adminService.getAccountDeletionRequests();
    res.status(200).json({
      success: true,
      message: 'Account deletion requests retrieved.',
      data: requests,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function cancelAccountDeletion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await adminService.cancelAccountDeletion(id);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Super admin cancelled deletion and retained account for request ID "${id}".`
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: null,
    } as ApiResponse<null>);
  } catch (err) { next(err); }
}

export async function resetUserMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    adminService.resetUserMfa(id);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Reset MFA for user ID "${id}".`
    });

    res.status(200).json({
      success: true,
      message: 'User MFA has been reset successfully.',
      data: null,
    } as ApiResponse<null>);
  } catch (err) { next(err); }
}

export async function getSecurityAdvisorReport(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = securityAdvisorService.runScan();
    res.status(200).json({
      success: true,
      message: 'Security advisor scan completed.',
      data: report,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);
    const logs = auditLogService.getRecentLogs(limit, offset);
    res.status(200).json({
      success: true,
      message: 'Audit logs retrieved.',
      data: logs,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function listBackups(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const backups = backupService.listBackups();
    res.status(200).json({
      success: true,
      message: 'Database backups list retrieved.',
      data: backups,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function createBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const backup = await backupService.createBackup();
    if (!backup) {
      res.status(400).json({ success: false, message: 'Backup system is disabled (backupMode is none).' });
      return;
    }

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'database_backup',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Database backup snapshot "${backup.filename}" created successfully.`
    });

    res.status(201).json({
      success: true,
      message: 'Database backup snapshot created successfully.',
      data: backup,
    } as ApiResponse<any>);
  } catch (err) {
    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'database_backup',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'failure',
      details: `Database backup snapshot creation failed: ${(err as Error).message}`
    });
    next(err);
  }
}

// ── Trust & Safety / Moderation Endpoints ────────────────────────────────────

export async function getSecurityAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const alerts = threatDetectionService.getActiveSecurityAlerts();
    res.status(200).json({
      success: true,
      message: 'Security threat alerts retrieved.',
      data: alerts,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function dismissSecurityAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@aegisdb.dev';
    threatDetectionService.dismissFlag(id, adminId, adminEmail);
    res.status(200).json({
      success: true,
      message: 'Security alert dismissed successfully.',
      data: null,
    } as ApiResponse<null>);
  } catch (err) { next(err); }
}

export async function manualFlagUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { reason, severity, notes } = req.body;
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@aegisdb.dev';

    const user = await userStore.findById(id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const flag = threatDetectionService.manualFlag(
      adminId,
      adminEmail,
      id,
      user.email,
      reason || 'bot_activity',
      severity || 'high',
      notes
    );

    res.status(201).json({
      success: true,
      message: `User "${user.email}" flagged successfully.`,
      data: flag,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function getUserSecurityMatrixHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { search, category, minRisk, isFlagged, projectId } = req.query;
    const matrix = threatDetectionService.getUserSecurityMatrix({
      search: search ? String(search) : undefined,
      category: category ? String(category) : undefined,
      minRisk: minRisk !== undefined ? Number(minRisk) : undefined,
      isFlagged: isFlagged !== undefined ? isFlagged === 'true' : undefined,
      projectId: projectId ? String(projectId) : undefined
    });
    res.status(200).json({
      success: true,
      message: 'User security threat matrix retrieved.',
      data: matrix
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function getThreatIntelligenceStatsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { projectId } = req.query;
    const stats = threatDetectionService.getThreatIntelligenceStats(projectId ? String(projectId) : undefined);
    res.status(200).json({
      success: true,
      message: 'Threat intelligence platform statistics retrieved.',
      data: stats
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function unflagUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@aegisdb.dev';
    const result = threatDetectionService.unflagUser(id, adminId, adminEmail);
    res.status(200).json({
      success: true,
      message: `Account "${result.userEmail}" unflagged and restored successfully.`,
      data: result
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function quarantineUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { reason, severity, notes } = req.body;
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@aegisdb.dev';
    const flag = threatDetectionService.quarantineUser(
      id,
      adminId,
      adminEmail,
      reason || 'malicious_traffic',
      severity || 'high',
      notes
    );
    res.status(200).json({
      success: true,
      message: `Account "${flag.userEmail}" quarantined successfully.`,
      data: flag
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function runPlatformSecurityAuditHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@aegisdb.dev';
    const projectId = (req.body?.projectId || req.query?.projectId) as string | undefined;
    const auditResult = threatDetectionService.runPlatformSecurityAudit(adminId, adminEmail, projectId);
    res.status(200).json({
      success: true,
      message: `Security audit completed on ${auditResult.scannedCount} accounts.`,
      data: auditResult
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function exportThreatIntelligenceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const report = threatDetectionService.exportThreatIntelligenceReport(format);
    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.status(200).send(report.data);
  } catch (err) { next(err); }
}

export async function purgeResolvedIncidentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@aegisdb.dev';
    const result = threatDetectionService.purgeResolvedIncidents(adminId, adminEmail);
    res.status(200).json({
      success: true,
      message: `Purged ${result.purgedCount} resolved security incidents.`,
      data: result
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function issueComplianceNotice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { category, title, details, deadlineDays } = req.body;
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@aegisdb.dev';

    const notice = accountModerationService.issueNotice(adminId, adminEmail, id, {
      category,
      title,
      details,
      deadlineDays: Number(deadlineDays || 3)
    });

    res.status(201).json({
      success: true,
      message: `Compliance notice issued to user with a ${deadlineDays || 3}-day deadline.`,
      data: notice,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function listComplianceNotices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const notices = accountModerationService.listNotices(status);
    res.status(200).json({
      success: true,
      message: 'Compliance notices retrieved.',
      data: notices,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function reviewComplianceNotice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { decision, decisionNotes } = req.body;
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@aegisdb.dev';

    if (decision !== 'accepted' && decision !== 'rejected') {
      res.status(400).json({ success: false, message: 'Decision must be "accepted" or "rejected".' });
      return;
    }

    const result = accountModerationService.reviewNotice(adminId, adminEmail, id, decision, decisionNotes);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function purgeExpiredBackups(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = backupService.getConfig();
    const result = await backupService.enforceRetention(config);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'purge_expired_backups',
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Purged ${result.localPurged} local and ${result.s3Purged} S3 expired backup files (retention: ${config.backupRetentionDays} days).`
    });

    res.status(200).json({
      success: true,
      message: `Retention policy enforced. Purged ${result.localPurged} local and ${result.s3Purged} S3 expired backup(s) older than ${config.backupRetentionDays} days.`,
      data: result
    });
  } catch (err) { next(err); }
}

export async function getPortDiagnostics(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM platform_settings WHERE id = ?').get('default') as any;
    const currentPort = Number(settings?.serverPort || process.env.PORT || 3000);
    const currentHost = settings?.serverHost || process.env.HOST || '0.0.0.0';

    const diagnostics = await networkDiagnosticsService.getDiagnosticsReport(currentPort, currentHost);

    res.status(200).json({
      success: true,
      message: 'Port & network diagnostics report generated.',
      data: diagnostics
    });
  } catch (err) { next(err); }
}

export async function checkSinglePort(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { port, host } = req.body;
    const portNum = Number(port);
    const hostStr = host || '0.0.0.0';

    const db = getDb();
    const settings = db.prepare('SELECT * FROM platform_settings WHERE id = ?').get('default') as any;
    const currentPort = Number(settings?.serverPort || process.env.PORT || 3000);

    if (portNum === currentPort) {
      res.status(200).json({
        success: true,
        message: `Port ${portNum} is the currently running active AegisDB server.`,
        data: {
          available: true,
          status: 'active_aegis',
          reason: `Port ${portNum} is the currently active AegisDB server`
        }
      });
      return;
    }

    const result = await networkDiagnosticsService.checkPortAvailability(portNum, hostStr);

    res.status(200).json({
      success: true,
      message: result.reason,
      data: result
    });
  } catch (err) { next(err); }
}

import { terminalStreamService } from '../services/terminal-stream.service';

export async function getTerminalLogs(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const logs = terminalStreamService.getRecentLogs(200);
    res.status(200).json({
      success: true,
      message: 'Terminal logs retrieved successfully.',
      data: logs
    });
  } catch (err) { next(err); }
}

export async function shutdownServerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as any).user;
    const db = getDb();
    const settings = db.prepare("SELECT serverPort, serverHost FROM platform_settings WHERE id = 'default'").get() as any;
    const port = settings?.serverPort || parseInt(process.env.PORT || '3000', 10);

    // Log Super Admin action in audit logs
    auditLogService.logAction({
      actorId: user?.id || null,
      actorEmail: user?.email || null,
      actionType: 'SERVER_SHUTDOWN',
      projectId: null,
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: JSON.stringify({ port, reason: 'Super Admin initiated graceful shutdown from Developer Dashboard' })
    });

    // Broadcast WebSocket event to all connected clients
    wsService.broadcast('SERVER_SHUTDOWN', {
      message: `AegisDB Server on port ${port} was stopped by Super Admin (${user?.email || 'admin'}).`,
      port,
      stoppedBy: user?.email || 'Super Admin',
      stoppedAt: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: `Server shutdown initiated on port ${port}. All connections closed and port released.`,
      data: { port, pid: process.pid, platform: process.platform }
    });

    // Execute platform-specific detached stop worker after 400ms so HTTP response finishes sending
    setTimeout(() => {
      console.log(`\n🛑 [Server] Super Admin (${user?.email || 'admin'}) initiated shutdown.`);
      console.log(`✅ AegisDB Server on port ${port} successfully killed. Port is now freed!\n`);

      try {
        const { spawn, exec } = require('child_process');
        const path = require('path');
        const stopScript = path.resolve(process.cwd(), 'scripts/stop.js');

        // Spawn detached stop engine that survives parent process exit and guarantees complete port release
        const stopWorker = spawn(process.execPath, [stopScript, '--close-self', `--port=${port}`], {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd()
        });
        stopWorker.unref();

        // On macOS, send AppleScript to close any open terminal windows running start.command or serve.js
        if (process.platform === 'darwin') {
          exec(`osascript -e 'tell application "Terminal"
            repeat with w in windows
              if (name of w contains "start.command") or (name of w contains "serve.js") or (name of w contains "AegisDB") then
                close w
              end if
            end repeat
          end tell'`);
        }
      } catch (_) {}

      process.exit(0);
    }, 400);
  } catch (err) {
    next(err);
  }
}

// ── Network Access Control & Device Tracking Handlers ───────────────────────

export async function getNetworkRulesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { scope, projectId } = req.query;
    const rules = networkAccessService.getRules(scope as string, projectId as string);
    res.status(200).json({
      success: true,
      message: 'Network access rules retrieved.',
      data: rules
    });
  } catch (err) {
    next(err);
  }
}

export async function addNetworkRuleHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ipPattern, label, ruleType, action, scope, projectId, durationMinutes, durationLabel, expiresAt } = req.body;
    if (!ipPattern) {
      res.status(400).json({ success: false, message: 'ipPattern is required (e.g. 192.168.1.50 or 192.168.1.0/24).' });
      return;
    }

    const user = (req as any).user;
    const rule = networkAccessService.addRule({
      ipPattern,
      label: label || `Rule for ${ipPattern}`,
      ruleType,
      action: action || 'allow',
      scope,
      projectId,
      createdBy: user?.email || 'Super Admin',
      durationMinutes: durationMinutes !== undefined ? parseInt(durationMinutes, 10) : undefined,
      durationLabel,
      expiresAt
    });

    res.status(201).json({
      success: true,
      message: 'Network access rule created successfully.',
      data: rule
    });
  } catch (err) {
    next(err);
  }
}

export async function getJailedIpsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jails = networkAccessService.getJailedIps();
    res.status(200).json({
      success: true,
      message: 'Jailed IPs retrieved.',
      data: jails
    });
  } catch (err) {
    next(err);
  }
}

export async function pardonJailedIpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ip } = req.params;
    const user = (req as any).user;
    const unjailedBy = user?.email || 'Super Admin';
    const pardoned = networkAccessService.pardonJailedIp(decodeURIComponent(ip), unjailedBy);

    res.status(200).json({
      success: true,
      message: `IP ${ip} has been pardoned and released from quarantine jail.`,
      data: { pardoned }
    });
  } catch (err) {
    next(err);
  }
}

export async function jailIpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ipAddress, reason, durationMinutes } = req.body;
    if (!ipAddress) {
      res.status(400).json({ success: false, message: 'ipAddress is required.' });
      return;
    }

    const user = (req as any).user;
    const jail = networkAccessService.jailIpManually({
      ipAddress,
      reason: reason || 'Manual Administrator Quarantine',
      durationMinutes: durationMinutes !== undefined ? parseInt(durationMinutes, 10) : 15,
      jailedBy: user?.email || 'Super Admin'
    });

    res.status(201).json({
      success: true,
      message: `IP ${ipAddress} quarantined in jail for ${jail.durationMinutes} minutes.`,
      data: jail
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to jail IP' });
  }
}

export async function clearAllJailsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as any).user;
    const count = networkAccessService.clearAllJails(user?.email || 'Super Admin');
    res.status(200).json({
      success: true,
      message: `All active IP jails pardoned (${count} records updated).`,
      data: { clearedCount: count }
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteNetworkRuleHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = networkAccessService.deleteRule(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Network access rule not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Network access rule deleted.'
    });
  } catch (err) {
    next(err);
  }
}

export async function getTrackedDevicesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const devices = networkAccessService.getTrackedDevices(100);
    res.status(200).json({
      success: true,
      message: 'Tracked client devices retrieved.',
      data: devices
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleBlockDeviceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ip } = req.params;
    const { isBlocked } = req.body;

    const result = networkAccessService.toggleBlockDevice(decodeURIComponent(ip), isBlocked);
    res.status(200).json({
      success: true,
      message: result.isBlocked ? `Device ${ip} blocked.` : `Device ${ip} unblocked.`,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function getNetworkSettingsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = networkAccessService.getNetworkSettings();
    const networkIp = endpointMigrationScheduler.getNetworkIp();
    res.status(200).json({
      success: true,
      message: 'Network access settings retrieved.',
      data: {
        ...settings,
        detectedNetworkIp: networkIp
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function updateNetworkSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      ipFilteringEnabled,
      ipFilterDefaultPolicy,
      adminEndpointIpLockEnabled,
      adminAllowedSubnet,
      requireWriteIpWhitelist,
      enableSubnetRateLimiting,
      defaultSubnetRequestsPerMin
    } = req.body;

    const updated = networkAccessService.updateNetworkSettings({
      ipFilteringEnabled,
      ipFilterDefaultPolicy,
      adminEndpointIpLockEnabled,
      adminAllowedSubnet,
      requireWriteIpWhitelist,
      enableSubnetRateLimiting,
      defaultSubnetRequestsPerMin
    });

    res.status(200).json({
      success: true,
      message: 'Network access settings updated.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export async function lookupGeoIpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ip } = req.params;
    const geo = await geoipThreatIntelService.lookupIp(decodeURIComponent(ip));
    res.status(200).json({
      success: true,
      message: 'Geo-IP and threat intelligence retrieved.',
      data: geo
    });
  } catch (err) {
    next(err);
  }
}

export async function getSubnetRatePoliciesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const policies = subnetRateLimiterService.getPolicies();
    res.status(200).json({
      success: true,
      message: 'Subnet rate limit policies retrieved.',
      data: policies
    });
  } catch (err) {
    next(err);
  }
}

export async function addSubnetRatePolicyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { subnetPattern, label, requestsPerMinute, burstLimit, bandwidthLimitKbps, actionOnExceed, isActive } = req.body;
    if (!subnetPattern) {
      throw new AppError('Subnet pattern (CIDR, IP, or *) is required.', 400);
    }

    const policy = subnetRateLimiterService.addPolicy({
      subnetPattern,
      label: label || `Rate limit for ${subnetPattern}`,
      requestsPerMinute,
      burstLimit,
      bandwidthLimitKbps,
      actionOnExceed,
      isActive
    });

    res.status(201).json({
      success: true,
      message: 'Subnet rate limit policy created.',
      data: policy
    });
  } catch (err) {
    next(err);
  }
}

export async function updateSubnetRatePolicyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const policy = subnetRateLimiterService.updatePolicy(id, req.body);
    if (!policy) {
      throw new AppError('Subnet rate policy not found.', 404);
    }

    res.status(200).json({
      success: true,
      message: 'Subnet rate limit policy updated.',
      data: policy
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteSubnetRatePolicyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const success = subnetRateLimiterService.deletePolicy(id);
    if (!success) {
      throw new AppError('Subnet rate policy not found.', 404);
    }

    res.status(200).json({
      success: true,
      message: 'Subnet rate limit policy deleted.'
    });
  } catch (err) {
    next(err);
  }
}

export async function getSubnetLiveMetricsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const metrics = subnetRateLimiterService.getLiveSubnetMetrics();
    res.status(200).json({
      success: true,
      message: 'Subnet real-time rate metrics retrieved.',
      data: metrics
    });
  } catch (err) {
    next(err);
  }
}

export async function getEmergencyStatusHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = emergencyControlService.getStatus();
    res.status(200).json({
      success: true,
      message: 'Emergency and maintenance status retrieved.',
      data: status
    });
  } catch (err) {
    next(err);
  }
}

export async function setEmergencyLevelHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { level, reason } = req.body;
    if (!['normal', 'read_only', 'lan_only', 'air_gap'].includes(level)) {
      throw new AppError("Invalid emergency level. Must be 'normal', 'read_only', 'lan_only', or 'air_gap'.", 400);
    }

    const updated = emergencyControlService.setEmergencyLevel(level, reason);
    res.status(200).json({
      success: true,
      message: `Emergency lockdown level updated to '${level}'.`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export async function setMaintenanceWindowHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { enabled, message, startAt, endAt, retryAfterSeconds } = req.body;
    const updated = emergencyControlService.setMaintenanceWindow({
      enabled: Boolean(enabled),
      message,
      startAt,
      endAt,
      retryAfterSeconds: retryAfterSeconds ? Number(retryAfterSeconds) : undefined
    });

    res.status(200).json({
      success: true,
      message: `Maintenance window configuration updated (Enabled: ${Boolean(enabled)}).`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export async function createEmergencySnapshotHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reasonNote } = req.body || {};
    const result = emergencyControlService.createPanicSnapshot(reasonNote);
    if (!result.success) {
      throw new AppError('Failed to generate emergency backup snapshot.', 500);
    }

    res.status(200).json({
      success: true,
      message: 'Emergency snapshot created successfully.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function getWafSettingsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = wafShieldService.getSettings();
    res.status(200).json({
      success: true,
      message: 'WAF settings retrieved.',
      data: settings
    });
  } catch (err) {
    next(err);
  }
}

export async function updateWafSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = wafShieldService.updateSettings(req.body);
    res.status(200).json({
      success: true,
      message: 'WAF shield settings updated successfully.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export async function getWafStatsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = wafShieldService.getStats();
    res.status(200).json({
      success: true,
      message: 'WAF live statistics retrieved.',
      data: stats
    });
  } catch (err) {
    next(err);
  }
}

export async function generateOttHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { label, durationMinutes, ipRestriction } = req.body || {};
    const user = (req as any).user;
    const ott = remoteOttAccessService.generateOneTimeToken({
      label: label || 'Remote Emergency Access Token',
      createdByUserId: user?.id || user?.sub || 'admin',
      durationMinutes: durationMinutes ? Number(durationMinutes) : 15,
      ipRestriction
    });

    const db = getDb();
    const settings = db.prepare("SELECT serverPort, serverHost FROM platform_settings WHERE id = 'default'").get() as any;
    const port = Number(process.env.PORT || settings?.serverPort || 3000);
    const networkIp = endpointMigrationScheduler.getNetworkIp() || '127.0.0.1';

    const networkUrl = `http://${networkIp}:${port}/?ott=${ott.token}`;
    const localUrl = `http://localhost:${port}/?ott=${ott.token}`;

    res.status(201).json({
      success: true,
      message: 'One-time admin access token generated successfully.',
      data: {
        ...ott,
        networkUrl,
        localUrl,
        networkIp,
        port
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function listOttTokensHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tokens = remoteOttAccessService.listOneTimeTokens();
    res.status(200).json({
      success: true,
      data: tokens
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeOttTokenHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const revoked = remoteOttAccessService.revokeOneTimeToken(id);
    res.status(200).json({
      success: revoked,
      message: revoked ? 'Token revoked successfully.' : 'Token not found or already revoked.'
    });
  } catch (err) {
    next(err);
  }
}

export async function listDeviceRequestsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = remoteOttAccessService.listDeviceAccessRequests();
    res.status(200).json({
      success: true,
      data: requests
    });
  } catch (err) {
    next(err);
  }
}

export async function approveDeviceRequestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { durationHours } = req.body || {};
    const user = (req as any).user;
    const approved = remoteOttAccessService.approveDeviceRequest(
      id,
      user?.email || 'Super Admin',
      durationHours ? Number(durationHours) : 24
    );

    if (!approved) {
      throw new AppError('Device request not found.', 404);
    }

    res.status(200).json({
      success: true,
      message: `Device ${approved.deviceName} (${approved.ipAddress}) approved for ${durationHours || 24} hours.`,
      data: approved
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectDeviceRequestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const rejected = remoteOttAccessService.rejectDeviceRequest(id, user?.email || 'Super Admin');

    if (!rejected) {
      throw new AppError('Device request not found.', 404);
    }

    res.status(200).json({
      success: true,
      message: `Device request from ${rejected.ipAddress} rejected.`,
      data: rejected
    });
  } catch (err) {
    next(err);
  }
}

export async function getClusterDiagnosticsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare("SELECT serverPort, serverHost FROM platform_settings WHERE id = 'default'").get() as any;
    const currentPort = Number(process.env.PORT || settings?.serverPort || 3000);
    const currentHost = process.env.HOST || settings?.serverHost || '0.0.0.0';

    const report = await networkDiagnosticsService.getClusterDiagnosticsReport(currentPort, currentHost);
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (err) {
    next(err);
  }
}

export async function hotRestartServerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare("SELECT serverPort, serverHost FROM platform_settings WHERE id = 'default'").get() as any;
    const port = Number(process.env.PORT || settings?.serverPort || 3000);
    const host = process.env.HOST || settings?.serverHost || '0.0.0.0';

    // Flush dirty device metrics to database
    networkAccessService.flushDevicesToDb();

    // Broadcast hot restart countdown event
    wsService.broadcast('SERVER_HOT_RESTARTING', {
      countdownSeconds: 2,
      port,
      host,
      message: 'Zero-Downtime Server Hot Restart initiated by Super Administrator.'
    });

    res.status(200).json({
      success: true,
      message: `Zero-Downtime Hot Restart initiated on port ${port}. State preserved.`,
      data: { port, host, timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
}

// ── Global Public Tunneling Manager Handlers ─────────────────────────────────

export async function getTunnelStatusHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = tunnelManagerService.getTunnelStatus();
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (err) {
    next(err);
  }
}

export async function startTunnelHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { provider, authToken, customDomain, autoCloseMinutes } = req.body || {};
    const report = await tunnelManagerService.startTunnel({
      provider,
      authToken,
      customDomain,
      autoCloseMinutes
    });

    res.status(200).json({
      success: true,
      message: `Global public tunnel started via ${report.provider}.`,
      data: report
    });
  } catch (err) {
    next(err);
  }
}

export async function stopTunnelHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await tunnelManagerService.stopTunnel();
    res.status(200).json({
      success: true,
      message: 'Global public tunnel disconnected.',
      data: report
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTunnelSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { provider, authToken, customDomain, autoCloseMinutes } = req.body || {};
    tunnelManagerService.updateSettings({
      provider,
      authToken,
      customDomain,
      autoCloseMinutes
    });

    res.status(200).json({
      success: true,
      message: 'Public tunnel settings saved.',
      data: tunnelManagerService.getTunnelStatus()
    });
  } catch (err) {
    next(err);
  }
}

export async function clearTunnelSettingsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = tunnelManagerService.clearSettings();
    res.status(200).json({
      success: true,
      message: 'Public tunnel configuration cleared.',
      data: report
    });
  } catch (err) {
    next(err);
  }
}

export async function attachTunnelHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { publicUrl, provider } = req.body || {};
    if (!publicUrl) {
      throw new AppError('Public tunnel URL is required.', 400);
    }
    const report = tunnelManagerService.adoptExternalTunnel(publicUrl, provider || 'cloudflare');
    res.status(200).json({
      success: true,
      message: 'Active global public tunnel attached.',
      data: report
    });
  } catch (err) {
    next(err);
  }
}

// ── Real-Time Traffic Topology & Flow Telemetry Handlers ──────────────────────

// ── Multi-Tenant Quotas & Limits Aggregator ──────────────────────────────────

export async function getTenantQuotas(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        u.id as userId,
        u.email,
        u.isSuperAdmin,
        COALESCE(u.storageQuotaBytes, 524288000) as storageQuotaBytes,
        COALESCE(u.rateLimitRpm, 120) as rateLimitRpm,
        COALESCE(u.apiLimit, 10000) as apiLimit,
        u.createdAt,
        (SELECT COUNT(*) FROM projects p WHERE p.ownerId = u.id) as projectCount,
        (SELECT COALESCE(SUM(LENGTH(d.data)), 0) FROM documents d JOIN projects p ON d.projectId = p.id WHERE p.ownerId = u.id) as docBytes,
        (SELECT COALESCE(SUM(a.sizeBytes), 0) FROM assets a WHERE a.ownerId = u.id) as assetBytes
      FROM users u
      ORDER BY u.createdAt DESC
    `).all() as any[];

    const tenants = rows.map(r => {
      const usedStorage = Number(r.docBytes || 0) + Number(r.assetBytes || 0);
      const maxStorage = Number(r.storageQuotaBytes || 524288000); // 500 MB default
      let email = r.email;
      if (typeof email === 'string' && email.startsWith('{')) {
        try {
          const parsed = JSON.parse(email);
          const decrypted = envelopeEncryptionService.decryptField(parsed, 'SYSTEM');
          if (decrypted) email = decrypted;
        } catch {
          // ignore
        }
      }
      return {
        userId: r.userId,
        email,
        role: r.isSuperAdmin ? 'Super Admin' : 'Developer',
        projectCount: Number(r.projectCount || 0),
        usedStorageBytes: usedStorage,
        maxStorageBytes: maxStorage,
        rateLimitRpm: Number(r.rateLimitRpm || 120),
        apiLimit: Number(r.apiLimit || 10000),
        createdAt: r.createdAt
      };
    });

    res.status(200).json({
      success: true,
      message: 'Tenant quotas retrieved.',
      data: tenants
    });
  } catch (err) {
    next(err);
  }
}

// ── Real-Time Traffic Topology & Flow Telemetry Handlers ──────────────────────

export async function getTrafficTopologyHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const snapshot = trafficTopologyService.getTopologySnapshot();
    res.status(200).json({
      success: true,
      data: snapshot
    });
  } catch (err) {
    next(err);
  }
}

// ── Mesh VPN & P2P Overlay Handlers ──────────────────────────────────────────

export async function getMeshVpnStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const port = Number(req.query.port) || undefined;
    const report = meshVpnService.getMeshStatus(port);
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMeshVpnSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { enabled, protocol, customIp, autoWhitelist } = req.body || {};
    const report = meshVpnService.updateMeshSettings({ enabled, protocol, customIp, autoWhitelist });
    res.status(200).json({
      success: true,
      message: 'Mesh VPN settings updated.',
      data: report
    });
  } catch (err) {
    next(err);
  }
}

export async function pingMeshPeerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { host, port, timeoutMs } = req.body || {};
    if (!host) {
      throw new AppError('Peer host address is required.', 400);
    }
    const result = await meshVpnService.probePeerReachability(host, Number(port) || 3000, Number(timeoutMs) || 2500);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}








