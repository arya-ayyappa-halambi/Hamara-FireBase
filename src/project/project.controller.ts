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

function getOwnerId(req: Request): string {
  const sub = req.user?.sub;
  if (!sub) throw new AppError('Authentication context missing.', 401);
  return sub;
}

export async function createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const result = projectService.createProject(ownerId, req.body.name);
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
    const projects = projectService.listProjects(ownerId);
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
    const logs = auditLogService.getWebhookLogs(ownerId);
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
      ipAddress: req.ip,
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
    const { id } = req.params;
    const project = projectService.getProjectById(id, ownerId);
    if (!project) throw new AppError('Project not found.', 404);
    res.status(200).json({ success: true, data: project.authConfig });
  } catch (err) { next(err); }
}

export async function updateAuthConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const { authConfig } = req.body;
    projectService.updateAuthConfig(id, ownerId, authConfig);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'project_config_update',
      projectId: id,
      ipAddress: req.ip,
      status: 'success',
      details: `Project auth config updated.`
    });

    res.status(200).json({ success: true, message: 'Auth config updated successfully.' });
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
      ipAddress: req.ip,
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
      ipAddress: req.ip,
      status: 'success',
      details: `Deleted webhook ID ${webhookId}`
    });

    res.status(200).json({ success: true, message: 'Webhook deleted successfully.' });
  } catch (err) { next(err); }
}

