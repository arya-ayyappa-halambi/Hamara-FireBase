import { Request, Response, NextFunction } from 'express';
import { failedLoginService } from '../services/failed-login-limiter.service';
import { AppError } from '../types/auth.types';

export function checkFailedLoginLockout(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const email = req.body?.email || '';

  const status = failedLoginService.isLockedOut(ip, email);

  if (status.locked) {
    res.setHeader('Retry-After', status.remainingSec);
    const minutes = Math.ceil(status.remainingSec / 60);
    return next(new AppError(`Account temporarily locked due to 5 consecutive failed login attempts. Please try again in ${minutes} minutes.`, 429));
  }

  next();
}
