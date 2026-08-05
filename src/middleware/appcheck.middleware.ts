import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../types/auth.types';

export function enforceAppCheck(req: Request, res: Response, next: NextFunction): void {
  // If no project context, bypass (e.g. platform dashboard operations)
  const project = req.project;
  if (!project) return next();

  // If request is made via Service Role key, bypass App Check! (Server-to-server calls don't need app check)
  if (req.isServiceRole) return next();

  // Parse authConfig to check if App Check is strictly enforced
  let appCheckEnforced = false;
  if (project.authConfig) {
    try {
      const cfg = typeof project.authConfig === 'string' ? JSON.parse(project.authConfig) : project.authConfig;
      if (cfg.appCheckEnforced === true) {
        appCheckEnforced = true;
      }
    } catch (_) {}
  }

  if (!appCheckEnforced) return next();

  // Enforce App Check
  const appCheckHeader = req.headers['x-aegis-app-check'];
  if (!appCheckHeader || typeof appCheckHeader !== 'string') {
    return next(new AppError('Unauthorized: Aegis App Check token is missing.', 403));
  }

  try {
    const secret = `${process.env.JWT_SECRET}::${project.id}`;
    const decoded = jwt.verify(appCheckHeader, secret) as any;
    if (decoded.projectId !== project.id) {
      return next(new AppError('Unauthorized: Aegis App Check token is invalid for this project.', 403));
    }
    next();
  } catch (err) {
    return next(new AppError('Unauthorized: Aegis App Check token is invalid or expired.', 403));
  }
}
