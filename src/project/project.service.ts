// ─────────────────────────────────────────────────────────────────────────────
//  src/project/project.service.ts
//  Multi-Tenant Project & API Key Management Service with GitHub-Grade RBAC.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb, generateProjectKeys } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';
import { Project, CreateProjectResult, ProjectStats } from '../types/project.types';
import { organizationService, ProjectRole } from '../services/organization.service';

export class ProjectService {
  /**
   * Create a new project for an owner or organization and generate a unique API Key.
   */
  createProject(ownerId: string, name: string, orgId?: string | null): CreateProjectResult {
    if (!name || name.trim().length === 0) {
      throw new AppError('Project name is required.', 400);
    }

    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const keys = generateProjectKeys();

    if (orgId) {
      // Validate user is a member of the organization
      const { myRole } = organizationService.getOrganization(orgId, ownerId);
      if (myRole !== 'owner' && myRole !== 'admin' && myRole !== 'member') {
        throw new AppError('Forbidden: Insufficient privileges to create a project in this organization.', 403);
      }
    }

    db.prepare(`
      INSERT INTO projects (id, ownerId, orgId, name, apiKeyHash, serviceKeyHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, orgId || null, name.trim(), keys.anonKeyHash, keys.serviceKeyHash, now, now);

    // Auto-add creator as Project Admin in project_members table
    const pmemId = `pmem_${uuidv4()}`;
    db.prepare(`
      INSERT INTO project_members (id, projectId, userId, role, addedAt)
      VALUES (?, ?, ?, 'admin', ?)
    `).run(pmemId, id, ownerId, now);

    if (orgId) {
      organizationService.logOrgAction({
        orgId,
        actorId: ownerId,
        action: 'project.created',
        targetType: 'project',
        targetId: id,
        details: { name: name.trim() }
      });
    }

    const project: Project = {
      id,
      ownerId,
      orgId: orgId || null,
      name: name.trim(),
      apiKeyHash: keys.anonKeyHash,
      serviceKeyHash: keys.serviceKeyHash,
      createdAt: now,
      updatedAt: now,
      maxAssetSizeBytes: 10485760,
      maxStorageBytes: 1073741824,
      authConfig: null,
      backupConfig: null,
      myProjectRole: 'admin'
    };

    return { project, rawApiKey: keys.anonKey, rawServiceKey: keys.serviceKey };
  }

  /**
   * List all projects for a user filtered by active workspace (Personal vs Organization).
   */
  listProjects(userId: string, orgId?: string | null): ProjectStats[] {
    const db = getDb();
    let sql: string;
    let params: any[];

    if (orgId === null) {
      // Personal Workspace projects only
      sql = `
        SELECT p.*,
          (SELECT COUNT(*) FROM collections c WHERE (c.projectId = p.id)) as collectionCount,
          (SELECT COUNT(*) FROM documents d WHERE (d.projectId = p.id)) as documentCount,
          (SELECT COUNT(*) FROM assets a WHERE (a.projectId = p.id)) as assetCount,
          (SELECT COUNT(*) FROM deployments dep WHERE (dep.projectId = p.id)) as deploymentCount
        FROM projects p
        WHERE p.ownerId = ? AND p.orgId IS NULL
        ORDER BY p.createdAt DESC
      `;
      params = [userId];
    } else if (orgId) {
      // Specific Organization projects
      sql = `
        SELECT p.*,
          (SELECT COUNT(*) FROM collections c WHERE (c.projectId = p.id)) as collectionCount,
          (SELECT COUNT(*) FROM documents d WHERE (d.projectId = p.id)) as documentCount,
          (SELECT COUNT(*) FROM assets a WHERE (a.projectId = p.id)) as assetCount,
          (SELECT COUNT(*) FROM deployments dep WHERE (dep.projectId = p.id)) as deploymentCount
        FROM projects p
        WHERE p.orgId = ?
        ORDER BY p.createdAt DESC
      `;
      params = [orgId];
    } else {
      // All accessible projects (Personal + joined Organizations)
      sql = `
        SELECT DISTINCT p.*,
          (SELECT COUNT(*) FROM collections c WHERE (c.projectId = p.id)) as collectionCount,
          (SELECT COUNT(*) FROM documents d WHERE (d.projectId = p.id)) as documentCount,
          (SELECT COUNT(*) FROM assets a WHERE (a.projectId = p.id)) as assetCount,
          (SELECT COUNT(*) FROM deployments dep WHERE (dep.projectId = p.id)) as deploymentCount
        FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.projectId
        LEFT JOIN organization_members om ON p.orgId = om.orgId
        LEFT JOIN project_team_grants ptg ON p.id = ptg.projectId
        LEFT JOIN organization_team_members otm ON ptg.teamId = otm.teamId
        WHERE p.ownerId = ? 
           OR pm.userId = ? 
           OR (p.orgId IS NOT NULL AND om.userId = ?)
           OR (p.orgId IS NOT NULL AND otm.userId = ?)
        ORDER BY p.createdAt DESC
      `;
      params = [userId, userId, userId, userId];
    }

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map((r) => {
      const myProjectRole = organizationService.getEffectiveProjectRole(userId, r.id) || 'viewer';
      return {
        id: r.id,
        ownerId: r.ownerId,
        orgId: r.orgId || null,
        name: r.name,
        apiKeyHash: r.apiKeyHash,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        maxAssetSizeBytes: r.maxAssetSizeBytes,
        maxStorageBytes: r.maxStorageBytes,
        authConfig: r.authConfig ? JSON.parse(r.authConfig) : null,
        backupConfig: r.backupConfig ? JSON.parse(r.backupConfig) : null,
        collectionCount: Number(r.collectionCount || 0),
        documentCount: Number(r.documentCount || 0),
        assetCount: Number(r.assetCount || 0),
        deploymentCount: Number(r.deploymentCount || 0),
        myProjectRole
      };
    });
  }

  /**
   * Find project by SHA-256 hashed API key string.
   */
  getProjectByApiKeyHash(apiKeyHash: string): Project | undefined {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM projects WHERE apiKeyHash = ?
    `).get(apiKeyHash) as any;

    if (!row) return undefined;
    return {
      ...row,
      authConfig: row.authConfig ? JSON.parse(row.authConfig) : null,
      backupConfig: row.backupConfig ? JSON.parse(row.backupConfig) : null
    };
  }

  /**
   * Find project by SHA-256 hashed Service role API key string.
   */
  getProjectByServiceKeyHash(serviceKeyHash: string): Project | undefined {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM projects WHERE serviceKeyHash = ?
    `).get(serviceKeyHash) as any;

    if (!row) return undefined;
    return {
      ...row,
      authConfig: row.authConfig ? JSON.parse(row.authConfig) : null,
      backupConfig: row.backupConfig ? JSON.parse(row.backupConfig) : null
    };
  }

  /**
   * Find project by ID and check access.
   */
  getProjectById(projectId: string, userId: string, isSuperAdmin: boolean = false): Project | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!row) return undefined;

    if (!isSuperAdmin) {
      const effectiveRole = organizationService.getEffectiveProjectRole(userId, projectId);
      if (!effectiveRole) return undefined;
      row.myProjectRole = effectiveRole;
    } else {
      row.myProjectRole = 'admin';
    }

    return {
      ...row,
      authConfig: row.authConfig ? JSON.parse(row.authConfig) : null,
      backupConfig: row.backupConfig ? JSON.parse(row.backupConfig) : null
    };
  }

  /**
   * Delete a project and cascade all associated collections and documents.
   */
  deleteProject(userId: string, projectId: string): void {
    const db = getDb();
    this.validateOwnership(projectId, userId);

    const project = db.prepare('SELECT id, orgId, name FROM projects WHERE id = ?').get(projectId) as any;

    db.transaction(() => {
      // 1. Delete documents belonging to collections in this project
      db.prepare('DELETE FROM documents WHERE projectId = ?').run(projectId);

      // 2. Delete collections
      db.prepare('DELETE FROM collections WHERE projectId = ?').run(projectId);

      // 3. Delete assets and deployments
      db.prepare('DELETE FROM assets WHERE projectId = ?').run(projectId);
      db.prepare('DELETE FROM deployments WHERE projectId = ?').run(projectId);

      // 4. Delete collaborator and team grants
      db.prepare('DELETE FROM project_members WHERE projectId = ?').run(projectId);
      db.prepare('DELETE FROM project_team_grants WHERE projectId = ?').run(projectId);

      // 5. Delete project
      db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    })();

    if (project?.orgId) {
      organizationService.logOrgAction({
        orgId: project.orgId,
        actorId: userId,
        action: 'project.deleted',
        targetType: 'project',
        targetId: projectId,
        details: { name: project.name }
      });
    }
  }

  /**
   * Update project auth configuration.
   */
  updateAuthConfig(projectId: string, userId: string, authConfig: any, isSuperAdmin: boolean = false): void {
    const db = getDb();
    if (!isSuperAdmin) {
      this.validateOwnership(projectId, userId);
    }
    
    db.prepare('UPDATE projects SET authConfig = ?, updatedAt = ? WHERE id = ?').run(
      JSON.stringify(authConfig),
      new Date().toISOString(),
      projectId
    );
  }

  /**
   * Update project limits or other settings.
   */
  updateProject(userId: string, projectId: string, patch: Partial<Project>): Project {
    const db = getDb();
    this.validateOwnership(projectId, userId);

    const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project | undefined;
    if (!proj) {
      throw new AppError(`Project "${projectId}" not found.`, 404);
    }

    const maxAssetSizeBytes = patch.maxAssetSizeBytes ?? proj.maxAssetSizeBytes ?? 10485760; // 10MB default
    const maxStorageBytes = patch.maxStorageBytes ?? proj.maxStorageBytes ?? 1073741824; // 1GB default
    const backupConfig = patch.backupConfig ?? proj.backupConfig ?? null;
    const name = patch.name ? patch.name.trim() : proj.name;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE projects 
      SET name = ?, maxAssetSizeBytes = ?, maxStorageBytes = ?, backupConfig = ?, updatedAt = ?
      WHERE id = ?
    `).run(name, maxAssetSizeBytes, maxStorageBytes, backupConfig, now, projectId);

    return { ...proj, name, maxAssetSizeBytes, maxStorageBytes, backupConfig, updatedAt: now };
  }

  /**
   * Throws an error if the user does not have Admin privileges on the project.
   */
  validateOwnership(projectId: string, userId: string): void {
    const effectiveRole = organizationService.getEffectiveProjectRole(userId, projectId);
    if (effectiveRole !== 'admin') {
      throw new AppError('Forbidden: Project Admin privileges required.', 403);
    }
  }

  /**
   * Rotate a project's API and Service Keys.
   */
  rotateProjectKeys(userId: string, projectId: string): { rawApiKey: string, rawServiceKey: string } {
    const db = getDb();
    this.validateOwnership(projectId, userId);

    const keys = generateProjectKeys();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE projects 
      SET apiKeyHash = ?, serviceKeyHash = ?, updatedAt = ?
      WHERE id = ?
    `).run(keys.anonKeyHash, keys.serviceKeyHash, now, projectId);

    return { rawApiKey: keys.anonKey, rawServiceKey: keys.serviceKey };
  }
}

export const projectService = new ProjectService();

