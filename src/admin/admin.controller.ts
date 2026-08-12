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
import { getDb } from '../db/sqlite.connection';

export async function getPlatformSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT googleAuthEnabled, googleClientId, backupMode, backupIntervalMinutes, s3BucketName, s3Region, s3AccessKey, s3SecretKey, lastBackupAt, lastBackupStatus, lastBackupS3Status, lastBackupLocation, lastBackupS3Url FROM platform_settings WHERE id = ?').get('default') as any;
    res.status(200).json({
      success: true,
      message: 'Platform settings retrieved.',
      data: {
        googleAuthEnabled: settings ? settings.googleAuthEnabled === 1 : false,
        googleClientId: settings ? settings.googleClientId : '',
        backupMode: settings ? settings.backupMode : 'none',
        backupIntervalMinutes: settings ? settings.backupIntervalMinutes : 1440,
        s3BucketName: settings ? settings.s3BucketName : '',
        s3Region: settings ? settings.s3Region : '',
        s3AccessKey: settings ? settings.s3AccessKey : '',
        s3SecretKey: settings ? settings.s3SecretKey : '',
        lastBackupAt: settings ? settings.lastBackupAt : null,
        lastBackupStatus: settings ? settings.lastBackupStatus : null,
        lastBackupS3Status: settings ? settings.lastBackupS3Status : null,
        lastBackupLocation: settings ? settings.lastBackupLocation : null,
        lastBackupS3Url: settings ? settings.lastBackupS3Url : null,
      }
    });
  } catch (err) { next(err); }
}

export async function updatePlatformSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { 
      googleAuthEnabled, googleClientId, 
      backupMode, backupIntervalMinutes, 
      s3BucketName, s3Region, s3AccessKey, s3SecretKey 
    } = req.body;
    
    // Convert boolean to 1/0 for sqlite
    const isEnabled = googleAuthEnabled === true || googleAuthEnabled === 'true' || googleAuthEnabled === 1 ? 1 : 0;
    
    const db = getDb();
    db.prepare(`
      UPDATE platform_settings 
      SET googleAuthEnabled = ?, 
          googleClientId = ?,
          backupMode = ?,
          backupIntervalMinutes = ?,
          s3BucketName = ?,
          s3Region = ?,
          s3AccessKey = ?,
          s3SecretKey = ?
      WHERE id = ?
    `).run(
      isEnabled, 
      googleClientId || '', 
      backupMode || 'none',
      backupIntervalMinutes || 1440,
      s3BucketName || '',
      s3Region || '',
      s3AccessKey || '',
      s3SecretKey || '',
      'default'
    );
    
    // Refresh backup scheduler
    backupService.stopScheduler();
    backupService.startScheduler();
      
    res.status(200).json({
      success: true,
      message: 'Platform settings updated successfully.',
      data: {
        googleAuthEnabled: isEnabled === 1,
        googleClientId: googleClientId || '',
        backupMode: backupMode || 'none',
        backupIntervalMinutes: backupIntervalMinutes || 1440,
        s3BucketName: s3BucketName || '',
        s3Region: s3Region || '',
        s3AccessKey: s3AccessKey || '',
        s3SecretKey: s3SecretKey || ''
      }
    });
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

export async function updateUserLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout } = req.body;
    await adminService.updateUserLimits(id, apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: req.ip,
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
      ipAddress: req.ip,
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

export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    adminService.deleteUser(id);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'super_admin_operation',
      ipAddress: req.ip,
      status: 'success',
      details: `Deleted user ID "${id}".`
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully.',
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
      ipAddress: req.ip,
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
      ipAddress: req.ip,
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
      ipAddress: req.ip,
      status: 'failure',
      details: `Database backup snapshot creation failed: ${(err as Error).message}`
    });
    next(err);
  }
}
