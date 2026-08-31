import { Request, Response, NextFunction } from 'express';
import { rateLimiterService } from '../services/rate-limiter.service';
import { AppError } from '../types/auth.types';
import { rateLimitConfig } from './rateLimit.middleware';
import { networkAccessService } from '../services/network-access.service';

export function customApiLimiter(req: Request | any, res: Response, next: NextFunction): void {
  const clientIp = networkAccessService.extractClientIp(req);
  // Determine key: user ID, project ID, or IP
  const key = req.project?.id || req.user?.sub || req.user?.id || clientIp || 'unknown';

  // Determine limit: if user has a custom limit set, use that; otherwise fallback to rateLimitConfig
  let capacity = rateLimitConfig.apiLimit;
  if (req.user && typeof req.user.apiLimit === 'number') {
    capacity = req.user.apiLimit;
  }
  const windowMs = rateLimitConfig.apiWindowMinutes * 60 * 1000;

  const { allowed, tokens, retryAfterSec } = rateLimiterService.limit(key, capacity, windowMs);

  // Set standard rate limiting headers
  res.setHeader('X-RateLimit-Limit', capacity);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, Math.floor(tokens)));

  if (!allowed) {
    res.setHeader('Retry-After', retryAfterSec);
    return next(new AppError('Too many requests. Please try again later.', 429));
  }

  next();
}

export function customAuthLimiter(req: Request, res: Response, next: NextFunction): void {
  const clientIp = networkAccessService.extractClientIp(req);
  // Auth limit: strict limit by IP address
  const key = `auth::${clientIp}`;
  const capacity = rateLimitConfig.authLimit;
  const windowMs = rateLimitConfig.authWindowMinutes * 60 * 1000;

  const { allowed, tokens, retryAfterSec } = rateLimiterService.limit(key, capacity, windowMs);

  res.setHeader('X-RateLimit-Limit', capacity);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, Math.floor(tokens)));

  if (!allowed) {
    res.setHeader('Retry-After', retryAfterSec);
    return next(new AppError('Too many login attempts. Please try again later.', 429));
  }

  next();
}
