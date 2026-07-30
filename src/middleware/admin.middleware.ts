// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/admin.middleware.ts
//  Super Admin Authorization Guard Middleware.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const userId = req.user?.sub;
  if (!userId) {
    return next(new AppError('Authentication required.', 401));
  }

  const db = getDb();
  const row = db.prepare('SELECT isSuperAdmin FROM users WHERE id = ?').get(userId) as { isSuperAdmin: number } | undefined;

  if (!row || Number(row.isSuperAdmin) !== 1) {
    return next(new AppError('Forbidden: Super Admin privileges required.', 403));
  }

  next();
}
