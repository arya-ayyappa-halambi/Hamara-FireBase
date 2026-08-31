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
    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
      || db.prepare('SELECT id FROM project_users WHERE id = ?').get(userId);
    if (!userExists) {
      return next(new AppError('User not found or session expired. Please log in again.', 401));
    }

    if (!decoded.sub) {
      decoded.sub = userId;
    }

    req.user = decoded;
    next();
  } catch (error) {
    // Re-throw JWT-specific errors so globalErrorHandler can map them correctly
    next(error);
  }
}
