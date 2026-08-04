// ─────────────────────────────────────────────────────────────────────────────
//  src/admin/admin.service.ts
//  Super Admin Control Panel Service.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { rateLimitConfig } from '../middleware/rateLimit.middleware';
import { AdminSystemStats, UpdateRateLimitDto } from '../types/project.types';
import { userStore } from '../store/user.store';

export class AdminService {
  async getUsers() {
    return userStore.getAllUsers();
  }

  async updateUserLimits(userId: string, apiLimit: number, readLimit: number, writeLimit: number, lockoutMinutes: number, resetLockout?: boolean) {
    userStore.updateUserLimits(userId, apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout);
  }
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

  /**
   * Delete a user and all their owned data (projects, collections, documents, etc).
   * Cannot delete the Super Admin account.
   */
  deleteUser(userId: string): void {
    const db = getDb();
    const user = db.prepare('SELECT id, isSuperAdmin FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      throw new Error('User not found.');
    }
    if (user.isSuperAdmin) {
      throw new Error('Cannot delete the Super Admin account.');
    }
    // CASCADE in the schema handles projects, collections, documents, etc.
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}

export const adminService = new AdminService();
