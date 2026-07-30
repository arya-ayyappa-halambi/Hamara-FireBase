// ─────────────────────────────────────────────────────────────────────────────
//  src/admin/admin.service.ts
//  Super Admin Control Panel Service.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { rateLimitConfig } from '../middleware/rateLimit.middleware';
import { AdminSystemStats, UpdateRateLimitDto } from '../types/project.types';

export class AdminService {
  /**
   * Retrieve platform-wide metrics and system status.
   */
  getSystemStats(): AdminSystemStats {
    const db = getDb();

    const usersCount = Number((db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count);
    const projectsCount = Number((db.prepare('SELECT COUNT(*) as count FROM projects').get() as any).count);
    const collectionsCount = Number((db.prepare('SELECT COUNT(*) as count FROM collections').get() as any).count);
    const documentsCount = Number((db.prepare('SELECT COUNT(*) as count FROM documents').get() as any).count);
    const assetsCount = Number((db.prepare('SELECT COUNT(*) as count FROM assets').get() as any).count);
    const deploymentsCount = Number((db.prepare('SELECT COUNT(*) as count FROM deployments').get() as any).count);

    const mem = process.memoryUsage();
    const memoryUsageMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
    const uptimeSeconds = Math.round(process.uptime());

    return {
      totalUsers: usersCount,
      totalProjects: projectsCount,
      totalCollections: collectionsCount,
      totalDocuments: documentsCount,
      totalAssets: assetsCount,
      totalDeployments: deploymentsCount,
      memoryUsageMb,
      uptimeSeconds,
    };
  }

  /**
   * Dynamically adjust live rate limits.
   */
  updateRateLimits(dto: UpdateRateLimitDto) {
    if (dto.authLimit !== undefined && dto.authLimit > 0) {
      rateLimitConfig.authLimit = dto.authLimit;
    }
    if (dto.authWindowMinutes !== undefined && dto.authWindowMinutes > 0) {
      rateLimitConfig.authWindowMinutes = dto.authWindowMinutes;
    }
    if (dto.apiLimit !== undefined && dto.apiLimit > 0) {
      rateLimitConfig.apiLimit = dto.apiLimit;
    }
    if (dto.apiWindowMinutes !== undefined && dto.apiWindowMinutes > 0) {
      rateLimitConfig.apiWindowMinutes = dto.apiWindowMinutes;
    }

    return rateLimitConfig;
  }
}

export const adminService = new AdminService();
