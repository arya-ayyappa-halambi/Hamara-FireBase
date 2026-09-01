// ─────────────────────────────────────────────────────────────────────────────
//  src/admin/admin.service.ts
//  Super Admin Control Panel Service.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { rateLimitConfig } from '../middleware/rateLimit.middleware';
import { AdminSystemStats, UpdateRateLimitDto } from '../types/project.types';
import { userStore } from '../store/user.store';
import { wsService } from '../realtime/websocket.service';
import { envelopeEncryptionService } from '../services/envelope-encryption.service';
import os from 'os';

export class AdminService {
  private lastCpu = this.getCpuUsage();

  private getCpuUsage() {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += (cpu.times as any)[type];
      }
      idle += cpu.times.idle;
    }
    return { idle, total };
  }

  async getUsers() {
    return userStore.getAllUsers();
  }

  async updateUserLimits(userId: string, apiLimit: number, readLimit: number, writeLimit: number, lockoutMinutes: number, resetLockout?: boolean) {
    userStore.updateUserLimits(userId, apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout);
  }

  async createAdmin(dto: { name: string; email: string; password: string; adminPermissions?: string[]; adminAllowedIpSubnet?: string | null; adminRequireMfa?: boolean }) {
    const { name, email, password, adminPermissions, adminAllowedIpSubnet, adminRequireMfa } = dto;
    if (!email || !password || !name) {
      throw new Error('Name, email, and password are required.');
    }
    const cleanEmail = email.toLowerCase().trim();
    const existing = await userStore.findByEmail(cleanEmail);
    if (existing) {
      throw new Error(`An account with email "${cleanEmail}" already exists.`);
    }

    const { hashPassword } = await import('../auth/auth.service');
    const { v4: uuidv4 } = await import('uuid');

    const passwordHash = await hashPassword(password);
    const now = new Date();
    const newUser = {
      id: uuidv4(),
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      isSuperAdmin: true,
      createdAt: now,
      updatedAt: now
    };

    return userStore.createAdminUser(newUser as any, adminPermissions, adminAllowedIpSubnet, adminRequireMfa);
  }

  async promoteUserToAdmin(userId: string, adminPermissions?: string[], adminAllowedIpSubnet?: string | null, adminRequireMfa?: boolean) {
    const user = await userStore.findById(userId);
    if (!user) {
      throw new Error(`User with ID "${userId}" not found.`);
    }
    userStore.promoteToAdmin(userId, adminPermissions, adminAllowedIpSubnet, adminRequireMfa);
    return userStore.findById(userId);
  }

  async demoteAdmin(userId: string, currentActorId?: string) {
    const user = await userStore.findById(userId);
    if (!user) {
      throw new Error(`User with ID "${userId}" not found.`);
    }
    if (!user.isSuperAdmin) {
      throw new Error('User is not an administrator.');
    }
    if (currentActorId && user.id === currentActorId) {
      throw new Error('Safety guard: You cannot revoke your own administrator privileges.');
    }

    const db = getDb();
    const activeAdminsCount = Number((db.prepare('SELECT COUNT(*) as count FROM users WHERE isSuperAdmin = 1 AND (adminStatus = \'active\' OR adminStatus IS NULL)').get() as any).count);
    if (activeAdminsCount <= 1) {
      throw new Error('Safety guard: Cannot demote the last remaining active Administrator.');
    }

    userStore.demoteAdmin(userId);
    return userStore.findById(userId);
  }

  async updateAdminSecurityConfig(
    userId: string,
    config: { adminPermissions?: string[]; adminAllowedIpSubnet?: string | null; adminRequireMfa?: boolean; adminStatus?: 'active' | 'suspended' },
    currentActorId?: string
  ) {
    const user = await userStore.findById(userId);
    if (!user) {
      throw new Error(`User with ID "${userId}" not found.`);
    }
    if (!user.isSuperAdmin) {
      throw new Error('User is not an administrator.');
    }

    if (config.adminStatus === 'suspended' && currentActorId && user.id === currentActorId) {
      throw new Error('Safety guard: You cannot suspend your own administrator account.');
    }

    if (config.adminStatus === 'suspended') {
      const db = getDb();
      const activeAdminsCount = Number((db.prepare('SELECT COUNT(*) as count FROM users WHERE isSuperAdmin = 1 AND id != ? AND (adminStatus = \'active\' OR adminStatus IS NULL)').get(userId) as any).count);
      if (activeAdminsCount < 1) {
        throw new Error('Safety guard: Cannot suspend the last remaining active Administrator.');
      }
    }

    userStore.updateAdminSecurityConfig(userId, config);
    return userStore.findById(userId);
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

    const currentCpu = this.getCpuUsage();
    const idleDiff = currentCpu.idle - this.lastCpu.idle;
    const totalDiff = currentCpu.total - this.lastCpu.total;
    const cpuUsagePercent = totalDiff === 0 ? 0 : 100 - (100 * idleDiff) / totalDiff;
    this.lastCpu = currentCpu;

    return {
      totalUsers: usersCount,
      totalProjects: projectsCount,
      totalCollections: collectionsCount,
      totalDocuments: documentsCount,
      totalAssets: assetsCount,
      totalDeployments: deploymentsCount,
      memoryUsageMb,
      uptimeSeconds,
      cpuUsagePercent: Number(cpuUsagePercent.toFixed(1)),
      activeWebSockets: wsService.getActiveConnectionsCount(),
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
   * List all account deletion requests (pending, cancelled, completed) for audit and management.
   */
  getAccountDeletionRequests() {
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        id,
        accountType,
        userId,
        projectId,
        userEmail,
        initiatedAt,
        gracePeriodDays,
        scheduledDeletionAt,
        cancelledAt,
        cancelledBy,
        deletedAt,
        status
      FROM account_deletion_requests
      ORDER BY initiatedAt DESC
    `).all() as any[];

    return rows.map((r) => {
      let email = r.userEmail;
      if (typeof email === 'string' && email.startsWith('{')) {
        try {
          const parsed = JSON.parse(email);
          const decrypted = envelopeEncryptionService.decryptField(parsed, r.projectId || 'SYSTEM');
          if (decrypted) email = decrypted;
        } catch {
          // ignore
        }
      }
      return { ...r, userEmail: email };
    });
  }

  /**
   * Super Admin cancels a pending deletion request and retains the account.
   */
  async cancelAccountDeletion(requestId: string) {
    const db = getDb();
    const reqRow = db.prepare('SELECT * FROM account_deletion_requests WHERE id = ?').get(requestId) as any;
    if (!reqRow) {
      throw new Error('Deletion request not found.');
    }
    if (reqRow.status !== 'pending') {
      throw new Error(`Cannot cancel: Deletion request is already ${reqRow.status}.`);
    }

    if (reqRow.accountType === 'developer') {
      const { cancelDeveloperAccountDeletion } = await import('../auth/auth.service');
      return cancelDeveloperAccountDeletion(reqRow.userId, 'admin');
    } else {
      const { projectAuthService } = await import('../project-auth/project-auth.service');
      return projectAuthService.cancelProjectUserDeletion(reqRow.projectId, reqRow.userId, 'admin');
    }
  }

  /**
   * Reset MFA for a user (admin operation). Clears the TOTP secret and disables MFA.
   */
  resetUserMfa(userId: string): void {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      throw new Error('User not found.');
    }
    db.prepare('UPDATE users SET mfaEnabled = 0, mfaSecret = NULL WHERE id = ?').run(userId);
  }
}

export const adminService = new AdminService();
