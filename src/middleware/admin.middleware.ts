import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/sqlite.connection';
import { AppError, AdminPermissionScope } from '../types/auth.types';
import { networkAccessService } from '../services/network-access.service';

export function requireAdminPermission(requiredScope?: AdminPermissionScope) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userId = req.user?.sub || (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      return next(new AppError('Authentication required.', 401));
    }

    const db = getDb();
    const row = db.prepare(`
      SELECT isSuperAdmin, adminPermissions, adminAllowedIpSubnet, adminRequireMfa, adminStatus, mfaEnabled 
      FROM users 
      WHERE id = ?
    `).get(userId) as any;

    if (!row || Number(row.isSuperAdmin) !== 1) {
      return next(new AppError('Forbidden: Administrator privileges required.', 403));
    }

    // 1. Account Status Guard
    if (row.adminStatus === 'suspended') {
      return next(new AppError('Forbidden: Your administrator account is suspended.', 403, {
        code: 'ADMIN_ACCOUNT_SUSPENDED'
      }));
    }

    // 2. Mandatory Admin MFA Guard
    if (Boolean(row.adminRequireMfa) && Number(row.mfaEnabled) !== 1) {
      return next(new AppError('Forbidden: Multi-Factor Authentication (MFA) is strictly required for this administrator account. Please configure MFA in your security settings.', 403, {
        code: 'ADMIN_MFA_REQUIRED'
      }));
    }

    const clientIp = networkAccessService.extractClientIp(req);
    const normIp = networkAccessService.normalizeIp(clientIp);

    // 3. Individual Admin IP Whitelist Check (Dedicated Per-Account Security Tier)
    if (row.adminAllowedIpSubnet && typeof row.adminAllowedIpSubnet === 'string' && row.adminAllowedIpSubnet.trim().length > 0) {
      const allowedSubnets = row.adminAllowedIpSubnet.split(',').map((s: string) => s.trim()).filter(Boolean);
      const isAllowed = allowedSubnets.some((sub: string) => networkAccessService.matchIpPattern(normIp, sub));
      if (!isAllowed) {
        return next(new AppError(`Forbidden: Access denied. Your administrator account is locked to authorized IP(s) (${row.adminAllowedIpSubnet}). Current IP: ${normIp}.`, 403, {
          code: 'ADMIN_IP_LOCKED',
          clientIp: normIp,
          allowedSubnets: row.adminAllowedIpSubnet
        }));
      }
    }

    // 4. Global Platform Perimeter Check (Global Website Settings Tier)
    const netSettings = networkAccessService.getNetworkSettings();
    if (netSettings.adminEndpointIpLockEnabled) {
      const allowedSubnets = (netSettings.adminAllowedSubnet || '127.0.0.1').split(',').map(s => s.trim()).filter(Boolean);
      const isAllowedSubnet = allowedSubnets.some(sub => networkAccessService.matchIpPattern(normIp, sub));
      const allRules = networkAccessService.getRules().filter(r => !r.isExpired);
      const hasAdminAllowRule = allRules.some(r => r.action === 'allow' && (r.scope === 'admin_only' || r.scope === 'global') && networkAccessService.matchIpPattern(normIp, r.ipPattern, r.ruleType));

      if (!isAllowedSubnet && !hasAdminAllowRule) {
        return next(new AppError('Forbidden: Access restricted to Super Admin from authorized management devices.', 403, {
          code: 'ADMIN_PERIMETER_RESTRICTED',
          clientIp: normIp
        }));
      }
    }

    // 5. Granular RBAC Scope Authorization
    if (requiredScope && requiredScope !== '*' && requiredScope !== 'all') {
      let permissions: string[] = ['*'];
      if (row.adminPermissions) {
        try {
          permissions = typeof row.adminPermissions === 'string' ? JSON.parse(row.adminPermissions) : row.adminPermissions;
        } catch (_) {
          permissions = ['*'];
        }
      }
      const hasWildcard = permissions.includes('*') || permissions.includes('all');
      const hasDirectScope = permissions.includes(requiredScope);

      if (!hasWildcard && !hasDirectScope) {
        return next(new AppError(`Forbidden: Insufficient privileges. Required scope: "${requiredScope}".`, 403, {
          code: 'ADMIN_INSUFFICIENT_PERMISSIONS',
          requiredScope,
          grantedScopes: permissions
        }));
      }
    }

    next();
  };
}

export const requireSuperAdmin = requireAdminPermission();

/**
 * Ephemeral Session Immutability Guard:
 * One-Time Token (OTT) sessions are strictly read-and-operate emergency passes.
 * They CANNOT modify network security rules, extend their own TTL/access duration,
 * generate/revoke OTT passes, approve/reject device requests, or elevate permissions.
 */
export function disallowOttSessionMutation(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.isOttLogin || (req.user as any)?.ottId) {
    return next(new AppError('Forbidden: One-Time Access sessions cannot modify access permissions, extend duration, or grant privileges.', 403, {
      code: 'OTT_IMMUTABLE_SESSION'
    }));
  }
  next();
}
