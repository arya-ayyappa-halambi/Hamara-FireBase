import { Request, Response, NextFunction } from 'express';
import { projectAuthService } from './project-auth.service';
import { AppError } from '../types/auth.types';

function getResolvedProjectId(req: Request): string {
  // 1. Set securely by api-key middleware
  if (req.project && req.project.id) {
    return req.project.id;
  }
  
  // 2. Used by Dashboard (Admin JWT)
  const headerProjId = req.headers['x-aegis-project-id'] as string;
  const bodyProjId = req.body.projectId as string;
  const projectId = headerProjId || bodyProjId;
  
  if (!projectId) {
    throw new AppError('Project ID is missing. Provide x-aegis-api-key header or x-aegis-project-id header.', 400);
  }

  // If using Admin JWT, ensure they own the project (unless they are a project user, though project users shouldn't hit these endpoints for admin tasks)
  const user = req.user as any;
  if (user && !user.isProjectUser) {
    const db = require('../db/sqlite.connection').getDb();
    const proj = db.prepare('SELECT id FROM projects WHERE id = ? AND ownerId = ?').get(projectId, user.sub);
    if (!proj) {
      throw new AppError('Access denied: Project not found or you do not own it.', 403);
    }
  }

  return projectId;
}

export async function registerProjectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const { email, password } = req.body;
    
    const result = await projectAuthService.registerUser(projectId, email, password);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: result
    });
  } catch (err) { next(err); }
}

export async function loginProjectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const { email, password } = req.body;

    const result = await projectAuthService.loginUser(projectId, email, password);

    res.status(200).json({
      success: true,
      message: 'User logged in successfully.',
      data: result
    });
  } catch (err) { next(err); }
}

export async function handleOAuthProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const { provider } = req.params;
    const { token } = req.body;

    const result = await projectAuthService.handleOAuth(projectId, provider, token);

    res.status(200).json({
      success: true,
      message: `User authenticated via ${provider} successfully.`,
      data: result
    });
  } catch (err) { next(err); }
}

export async function deleteProjectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const userId = req.params.id;
    
    await projectAuthService.deleteUser(projectId, userId);
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully.'
    });
  } catch (err) { next(err); }
}

export async function listProjectUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    // Directly query the db for simplicity here (or move to service)
    const db = require('../db/sqlite.connection').getDb();
    const users = db.prepare('SELECT id, email, provider, createdAt, lastLoginAt FROM project_users WHERE projectId = ? ORDER BY createdAt DESC').all(projectId);
    
    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully.',
      data: users
    });
  } catch (err) { next(err); }
}
