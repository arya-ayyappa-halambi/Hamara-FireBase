// ─────────────────────────────────────────────────────────────────────────────
//  src/project/project.controller.ts
//  HTTP controller for Project & API Key management.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { projectService } from './project.service';
import { AppError, ApiResponse } from '../types/auth.types';
import { ProjectStats, CreateProjectResult } from '../types/project.types';

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
