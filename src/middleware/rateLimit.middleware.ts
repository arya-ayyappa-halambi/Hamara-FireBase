// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/rateLimit.middleware.ts
//  AegisDB — Rate limiting middleware configurations.
// ─────────────────────────────────────────────────────────────────────────────

import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response } from 'express';
import { ApiResponse } from '../types/auth.types';

export const rateLimitConfig = {
  authWindowMinutes: 15,
  authLimit: 10,
  apiWindowMinutes: 15,
  apiLimit: 100,
};

function createRateLimitHandler(customMessage: string) {
  return (_req: Request, res: Response, _next: unknown, options: Options): void => {
    const responseBody: ApiResponse<null> = {
      success: false,
      message: customMessage || options.message,
      data: null,
    };
    res.status(options.statusCode).json(responseBody);
  };
}

export const authLimiter = rateLimit({
  windowMs: rateLimitConfig.authWindowMinutes * 60 * 1000,
  limit: () => rateLimitConfig.authLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  ),
});

export const apiLimiter = rateLimit({
  windowMs: rateLimitConfig.apiWindowMinutes * 60 * 1000,
  limit: () => rateLimitConfig.apiLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    'Too many API requests from this IP. Please try again after 15 minutes.',
  ),
});
