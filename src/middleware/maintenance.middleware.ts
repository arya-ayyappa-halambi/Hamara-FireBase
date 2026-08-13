import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/sqlite.connection';
import jwt from 'jsonwebtoken';
import { extractBearerToken } from './auth.middleware';

export function maintenanceModeMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip checking database if it's the restore endpoint or basic static files
    if (req.path === '/' || req.path.startsWith('/index.html') || req.path.startsWith('/app.js') || req.path.startsWith('/styles.css') || req.path.startsWith('/assets/') || req.path.startsWith('/api/v1/system/restore')) {
      return next();
    }

    const db = getDb();
    const config = db.prepare('SELECT maintenanceMode FROM platform_settings WHERE id = ?').get('default') as { maintenanceMode: number };
    
    if (config && config.maintenanceMode) {
      // Allow auth routes so admins can log in
      if (req.path.startsWith('/api/v1/auth/')) {
        return next();
      }

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
