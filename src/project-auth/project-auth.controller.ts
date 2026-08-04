import { Request, Response, NextFunction } from 'express';
import { projectAuthService } from './project-auth.service';
import { AppError } from '../types/auth.types';

function getResolvedProjectId(req: Request): string {
  if (req.project && req.project.id) {
    return req.project.id;
  }
  if (req.body.projectId) {
    return req.body.projectId;
  }
  throw new AppError('Project ID is missing. Provide x-aegis-api-key header or projectId in body.', 400);
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
