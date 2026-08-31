import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';
import { networkAccessService } from '../services/network-access.service';

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

  // Super Admin Perimeter Check
  const netSettings = networkAccessService.getNetworkSettings();
  if (netSettings.adminEndpointIpLockEnabled) {
    const clientIp = networkAccessService.normalizeIp(req.ip || '127.0.0.1');
    const allowedSubnets = (netSettings.adminAllowedSubnet || '127.0.0.1').split(',').map(s => s.trim()).filter(Boolean);
    const isAllowedSubnet = allowedSubnets.some(sub => networkAccessService.matchIpPattern(clientIp, sub));
    const allRules = networkAccessService.getRules().filter(r => !r.isExpired);
    const hasAdminAllowRule = allRules.some(r => r.action === 'allow' && (r.scope === 'admin_only' || r.scope === 'global') && networkAccessService.matchIpPattern(clientIp, r.ipPattern, r.ruleType));

    if (!isAllowedSubnet && !hasAdminAllowRule) {
      return next(new AppError('Forbidden: Access restricted to Super Admin from authorized management devices.', 403, {
        code: 'ADMIN_PERIMETER_RESTRICTED',
        clientIp
      }));
    }
  }

  next();
}
