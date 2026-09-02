// ─────────────────────────────────────────────────────────────────────────────
//  src/project/project.controller.ts
//  HTTP controller for Project & API Key management.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { projectService } from './project.service';
import { AppError, ApiResponse } from '../types/auth.types';
import { ProjectStats, CreateProjectResult } from '../types/project.types';
import { auditLogService } from '../services/audit-log.service';
import { webhookService } from '../services/webhook.service';
import { metricsService } from '../services/metrics.service';
import { projectBackupService } from '../services/project-backup.service';
import { networkAccessService } from '../services/network-access.service';
import path from 'path';

function getOwnerId(req: Request): string {
  const sub = req.user?.sub;
  if (!sub) throw new AppError('Authentication context missing.', 401);
  return sub;
}

export async function createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const orgId = (req.body.orgId || req.query.orgId) as string | undefined;
    const result = projectService.createProject(ownerId, req.body.name, orgId);
    res.status(201).json({
      success: true,
      message: 'Project created and API key generated.',
      data: result,
    } as ApiResponse<CreateProjectResult>);
  } catch (err) { next(err); }
}

export async function listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const isSuperAdmin = !!req.user?.isSuperAdmin;
    const orgIdQuery = req.query.orgId as string | undefined;
    const orgId = orgIdQuery === 'null' ? null : orgIdQuery;
    const projects = projectService.listProjects(ownerId, orgId, isSuperAdmin);
    res.status(200).json({
      success: true,
      message: 'Projects retrieved successfully.',
      data: projects,
    } as ApiResponse<ProjectStats[]>);
  } catch (err) { next(err); }
}

export async function getProjectStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    // For now, returning global snapshot as a proxy for project stats.
    const metricsSnapshot = metricsService.getJsonSnapshot();
    res.status(200).json({
      success: true,
      message: 'Project stats retrieved successfully.',
      data: { metricsSnapshot },
    });
  } catch (err) { next(err); }
}

export async function getWebhookLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const projectId = req.params.id;
    
    // Verify project ownership
    projectService.getProjectById(projectId, ownerId);

    const logs = auditLogService.getWebhookLogs(projectId);
    res.status(200).json({
      success: true,
      message: 'Webhook logs retrieved successfully.',
      data: logs,
    });
  } catch (err) { next(err); }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    projectService.deleteProject(ownerId, req.params.id);
    res.status(200).json({
      success: true,
      message: `Project "${req.params.id}" and associated resources deleted.`,
      data: null,
    } as ApiResponse<null>);
  } catch (err) { next(err); }
}

export async function updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const updated = projectService.updateProject(ownerId, req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: 'Project updated.',
      data: updated,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function rotateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const keys = projectService.rotateProjectKeys(ownerId, id);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'project_key_rotation',
      projectId: id,
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: 'Project API keys rotated manually by user.'
    });

    res.status(200).json({
      success: true,
      message: 'Project API keys rotated successfully.',
      data: keys,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function getAuthConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const isSuperAdmin = !!req.user?.isSuperAdmin;
    const { id } = req.params;
    const project = projectService.getProjectById(id, ownerId, isSuperAdmin);
    if (!project) throw new AppError('Project not found.', 404);
    
    let parsedConfig = project.authConfig;
    if (typeof parsedConfig === 'string') {
      try { parsedConfig = JSON.parse(parsedConfig); } catch (_) {}
    }
    res.status(200).json({ success: true, data: parsedConfig || { email: { enabled: true } } });
  } catch (err) { next(err); }
}

export async function updateAuthConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const isSuperAdmin = !!req.user?.isSuperAdmin;
    const { id } = req.params;
    const { authConfig } = req.body;
    projectService.updateAuthConfig(id, ownerId, authConfig, isSuperAdmin);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'project_config_update',
      projectId: id,
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: 'Project authentication configuration updated.'
    });

    res.status(200).json({
      success: true,
      message: 'Project auth configuration updated successfully.',
      data: authConfig,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function listWebhooks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const webhooks = webhookService.list(id);
    res.status(200).json({ success: true, data: webhooks });
  } catch (err) { next(err); }
}

export async function registerWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { url, events } = req.body;
    if (!url || !events || !Array.isArray(events)) {
      throw new AppError('url (string) and events (array of strings) are required.', 400);
    }
    const webhook = webhookService.register(id, url, events);
    
    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'webhook_register',
      projectId: id,
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Registered new webhook for ${url}`
    });

    res.status(201).json({ success: true, message: 'Webhook registered successfully.', data: webhook });
  } catch (err) { next(err); }
}

export async function deleteWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, webhookId } = req.params;
    webhookService.delete(id, webhookId);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'webhook_delete',
      projectId: id,
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Deleted webhook ID ${webhookId}`
    });

    res.status(200).json({ success: true, message: 'Webhook deleted successfully.' });
  } catch (err) { next(err); }
}

export async function testWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url, event, payload } = req.body || {};
    if (!url) {
      throw new AppError('url is required for test webhook dispatch.', 400);
    }
    const result = await webhookService.testDispatch(url, event || 'test.ping', payload);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) { next(err); }
}

export async function getBackupConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const project = projectService.getProjectById(id, ownerId);
    if (!project) throw new AppError('Project not found.', 404);
    
    const backupConfig = project.backupConfig ? JSON.parse(project.backupConfig) : {};
    res.status(200).json({ success: true, data: backupConfig });
  } catch (err) { next(err); }
}

export async function updateBackupConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const { backupConfig } = req.body;
    
    projectService.updateProject(ownerId, id, { backupConfig: JSON.stringify(backupConfig) });

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'project_config_update',
      projectId: id,
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Project backup config updated.`
    });

    res.status(200).json({ success: true, message: 'Backup config updated successfully.' });
  } catch (err) { next(err); }
}

export async function triggerBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    
    const backupFilePath = await projectBackupService.exportProjectJson(id, ownerId);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'project_backup_trigger',
      projectId: id,
      ipAddress: networkAccessService.extractClientIp(req),
      status: 'success',
      details: `Project JSON backup generated manually.`
    });

    // Provide the file as a download
    res.download(backupFilePath, path.basename(backupFilePath));
  } catch (err) { next(err); }
}

export async function listProjectCollaborators(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getOwnerId(req);
    const { id } = req.params;
    const { organizationService } = await import('../services/organization.service');
    const access = organizationService.listProjectAccess(id, userId);
    res.status(200).json({
      success: true,
      message: 'Project access list retrieved.',
      data: access
    });
  } catch (err) { next(err); }
}

export async function addProjectCollaborator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actorId = getOwnerId(req);
    const { id } = req.params;
    const { userId, role } = req.body;
    if (!userId || !role) throw new AppError('userId and role are required', 400);

    const { organizationService } = await import('../services/organization.service');
    const ipAddress = networkAccessService.extractClientIp(req);
    const collab = organizationService.addProjectCollaborator({
      projectId: id,
      userId,
      role,
      actorId,
      ipAddress
    });

    res.status(201).json({
      success: true,
      message: 'Project collaborator added successfully.',
      data: collab
    });
  } catch (err) { next(err); }
}

export async function removeProjectCollaborator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actorId = getOwnerId(req);
    const { id, userId } = req.params;
    const { organizationService } = await import('../services/organization.service');
    const ipAddress = networkAccessService.extractClientIp(req);
    organizationService.removeProjectCollaborator(id, userId, actorId, ipAddress);

    res.status(200).json({
      success: true,
      message: 'Collaborator removed from project.',
      data: null
    });
  } catch (err) { next(err); }
}

