// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/error.middleware.ts
//  Global Express error-handling middleware.
//
//  Must be registered LAST in server.ts (after all routes) so Express routes
//  errors through it via `next(err)`.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { AppError, ApiResponse } from '../types/auth.types';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Extended Error with an optional HTTP status code. */
interface HttpError extends Error {
  statusCode?: number;
  status?: number;
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * Centralised error handler.
 *
 * Handles three categories:
 *  1. `AppError`  — known operational errors (validation, auth failures, etc.)
 *  2. JWT errors  — mapped to 401 Unauthorized
 *  3. Anything else — generic 500 Internal Server Error
 *
 * Stack traces are suppressed in production responses to avoid leaking
 * implementation details to clients.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isDev = process.env.NODE_ENV === 'development';

  // ── Operational errors (AppError) ──────────────────────────────────────────
  if (err instanceof AppError && err.isOperational) {
    const body: ApiResponse<any> = {
      success: false,
      message: err.message,
      data: err.details || null,
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // ── JWT-specific errors ────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    const body: ApiResponse<null> = {
      success: false,
      message: err.name === 'TokenExpiredError'
        ? 'Session expired. Please log in again.'
        : 'Invalid token. Please log in again.',
      data: null,
    };
    res.status(401).json(body);
    return;
  }

  // ── Unknown / programming errors ───────────────────────────────────────────
  // Log full error server-side; return a safe generic message to client.
  console.error('💥 Unexpected error:', err);

  const body: ApiResponse<null> & { stack?: string } = {
    success: false,
    message: 'An unexpected internal server error occurred.',
    data: null,
    ...(isDev && { stack: err.stack }), // expose stack only in development
  };

  res.status(err.statusCode ?? err.status ?? 500).json(body);
}

// ── 404 Handler ───────────────────────────────────────────────────────────────

/**
 * Catch-all for unmatched routes. Must be registered BEFORE `globalErrorHandler`
 * but AFTER all route definitions.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}
