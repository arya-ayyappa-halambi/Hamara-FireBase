// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/auth.middleware.ts
//  JWT authentication middleware — protects all Phase 2 routes.
//
//  Usage:
//    router.get('/protected', authenticateJwt, handler);
//
//  After this middleware runs, `req.user` is guaranteed to be a verified
//  JwtPayload (typed via the Express namespace augmentation in auth.types.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError, JwtPayload } from '../types/auth.types';
import { getDb } from '../db/sqlite.connection';

// ── Token Extractor ───────────────────────────────────────────────────────────

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns the raw token string or null if the header is absent / malformed.
 *
 * Expected header format: `Authorization: Bearer <token>`
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim(); // remove 'Bearer ' prefix
  return token.length > 0 ? token : null;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Verifies the JWT in the Authorization header.
 *
 * On success:
 *   - Attaches the decoded payload to `req.user`
 *   - Calls `next()` to proceed to the route handler
 *
 * On failure (missing, malformed, expired, wrong signature):
 *   - Calls `next(AppError)` → handled by globalErrorHandler
 *   - The global handler maps `TokenExpiredError` → 401, `JsonWebTokenError` → 401
 */
export function authenticateJwt(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);

  if (!token) {
    return next(new AppError('Authentication required. Provide a valid Bearer token.', 401));
  }

  // Handle Personal Access Token (PAT) authentication
  if (token.startsWith('pat_')) {
    try {
      const { patService } = require('../services/pat.service');
      const { userId, scopes, patId } = patService.validatePat(token);
      const db = getDb();
      const user = db.prepare('SELECT id, email, name, isSuperAdmin, customClaims FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        return next(new AppError('User associated with Personal Access Token not found.', 401));
      }
      req.user = {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.isSuperAdmin === 1,
        isPat: true,
        patId,
        patScopes: scopes,
        claims: user.customClaims ? JSON.parse(user.customClaims) : {}
      } as any;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // This should never happen if server.ts validateEnv() ran first
    return next(new AppError('Server misconfiguration: JWT_SECRET not set.', 500));
  }

  try {
    const decoded = jwt.verify(token, secret) as any;
    const userId = decoded.sub || decoded.id || decoded.userId;
    
    if (!userId) {
      return next(new AppError('Invalid token payload. Please log in again.', 401));
    }

    // Verify user actually exists in DB (protects against ghost tokens after DB resets)
    const db = getDb();
    if (decoded.isProjectUser || decoded.projectId) {
      const projectId = decoded.projectId;
      const project = db.prepare('SELECT id, authConfig FROM projects WHERE id = ?').get(projectId) as any;
      if (!project) {
        return next(new AppError('Project not found or session expired.', 401));
      }

      const projectUser = db.prepare('SELECT id, email, provider, role, customClaims, status, isFlagged FROM project_users WHERE id = ? AND projectId = ?').get(userId, projectId) as any;
      if (!projectUser) {
        return next(new AppError('User not found or session expired. Please log in again.', 401));
      }

      if (projectUser.status === 'suspended' || projectUser.isFlagged === 1) {
        return next(new AppError('Account is suspended or quarantined.', 403));
      }

      const { projectAuthService } = require('../project-auth/project-auth.service');
      const provider = projectUser.provider || 'email';
      if (!projectAuthService.isProviderEnabled(project.authConfig, provider)) {
        return next(new AppError(`Access denied: Authentication provider "${provider}" is disabled for this project.`, 403));
      }

      let customClaims = {};
      if (projectUser.customClaims) {
        try {
          customClaims = JSON.parse(projectUser.customClaims);
        } catch (_) {}
      }

      const userPayload = {
        ...decoded,
        sub: projectUser.id,
        id: projectUser.id,
        role: projectUser.role || decoded.role || 'viewer',
        provider: projectUser.provider,
        ...customClaims,
      };

      req.user = userPayload;
      req.projectUser = userPayload;
      return next();
    } else {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) {
        return next(new AppError('User not found or session expired. Please log in again.', 401));
      }

      if (!decoded.sub) {
        decoded.sub = userId;
      }

      req.user = decoded;
      return next();
    }
  } catch (error) {
    // Re-throw JWT-specific errors so globalErrorHandler can map them correctly
    next(error);
  }
}

/**
 * Perimeter Guard: Ensures only Platform Developers / Admins (from users table)
 * can access platform management routes. Rejects project end-users with 403 Forbidden.
 */
export function requirePlatformDeveloper(req: Request, _res: Response, next: NextFunction): void {
  if ((req.user as any)?.isProjectUser) {
    return next(new AppError('Forbidden: Project end-users cannot access platform developer account management APIs.', 403));
  }
  next();
}
