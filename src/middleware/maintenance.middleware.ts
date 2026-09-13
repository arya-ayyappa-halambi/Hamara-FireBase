import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/sqlite.connection';
import jwt from 'jsonwebtoken';
import { extractBearerToken } from './auth.middleware';

export function maintenanceModeMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip checking database if it's the restore endpoint, status, or essential static files
    const p = req.path.toLowerCase();
    if (
      p === '/' ||
      p === '/index.html' ||
      p === '/admin-login' ||
      p === '/admin-login.html' ||
      p === '/admin/login' ||
      p === '/recovery' ||
      p === '/recovery.html' ||
      p === '/system/recovery' ||
      p === '/reset-password' ||
      p === '/reset-password.html' ||
      p.startsWith('/app.js') ||
      p.startsWith('/flarebase.js') ||
      p.startsWith('/styles.css') ||
      p.startsWith('/driver.css') ||
      p.startsWith('/assets/') ||
      p === '/favicon.ico' ||
      p === '/health' ||
      p === '/api/health' ||
      p.startsWith('/api/v1/health') ||
      p.startsWith('/api/v1/system/status') ||
      p.startsWith('/api/v1/system/health') ||
      p.startsWith('/api/v1/system/restore') ||
      p.startsWith('/api/v1/system/verify-recovery-pin') ||
      p.startsWith('/api/v1/auth/')
    ) {
      return next();
    }

    const db = getDb();
    const config = db.prepare('SELECT maintenanceMode FROM platform_settings WHERE id = ?').get('default') as { maintenanceMode: number } | undefined;

    if (config && config.maintenanceMode === 1) {
      // Check if user is an admin
      const token = extractBearerToken(req);
      if (token) {
        const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'master_fallback_key_32_bytes_long!!';
        try {
          const payload = jwt.verify(token, secret) as any;
          if (payload.isSuperAdmin) {
            return next();
          }
        } catch (e) {
          // ignore error, fall through to 503
        }
      }

      return res.status(503).json({
        success: false,
        error: 'MAINTENANCE_MODE',
        message: 'The system is currently undergoing maintenance. Please try again later.'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}
