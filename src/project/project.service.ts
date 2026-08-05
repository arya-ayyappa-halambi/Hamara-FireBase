// ─────────────────────────────────────────────────────────────────────────────
//  src/project/project.service.ts
//  Multi-Tenant Project & API Key Management Service.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb, generateProjectKeys } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';
import { Project, CreateProjectResult, ProjectStats } from '../types/project.types';

export class ProjectService {
  /**
   * Create a new project for an owner and generate a unique API Key.
   */
  createProject(ownerId: string, name: string): CreateProjectResult {
    if (!name || name.trim().length === 0) {
      throw new AppError('Project name is required.', 400);
    }

    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const keys = generateProjectKeys();

    db.prepare(`
      INSERT INTO projects (id, ownerId, name, apiKeyHash, serviceKeyHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name.trim(), keys.anonKeyHash, keys.serviceKeyHash, now, now);

    const project: Project = {
      id,
      ownerId,
      name: name.trim(),
      apiKeyHash: keys.anonKeyHash,
      serviceKeyHash: keys.serviceKeyHash,
      createdAt: now,
      updatedAt: now,
      maxAssetSizeBytes: 10485760,
      maxStorageBytes: 1073741824,
      authConfig: null,
    };

    return { project, rawApiKey: keys.anonKey, rawServiceKey: keys.serviceKey };
  }

  /**
   * List all projects owned by a user along with resource metrics.
   */
  listProjects(ownerId: string): ProjectStats[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM collections c WHERE c.ownerId = p.ownerId AND (c.projectId = p.id OR c.projectId IS NULL)) as collectionCount,
        (SELECT COUNT(*) FROM documents d WHERE d.ownerId = p.ownerId AND (d.projectId = p.id OR d.projectId IS NULL)) as documentCount,
        (SELECT COUNT(*) FROM assets a WHERE a.ownerId = p.ownerId AND (a.projectId = p.id OR a.projectId IS NULL)) as assetCount,
        (SELECT COUNT(*) FROM deployments dep WHERE dep.ownerId = p.ownerId AND (dep.projectId = p.id OR dep.projectId IS NULL)) as deploymentCount
      FROM projects p
      WHERE p.ownerId = ?
      ORDER BY p.createdAt DESC
    `).all(ownerId) as any[];

    return rows.map((r) => ({
      id: r.id,
      ownerId: r.ownerId,
      name: r.name,
      apiKeyHash: r.apiKeyHash,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      maxAssetSizeBytes: r.maxAssetSizeBytes,
      maxStorageBytes: r.maxStorageBytes,
      authConfig: r.authConfig ? JSON.parse(r.authConfig) : null,
      collectionCount: Number(r.collectionCount || 0),
      documentCount: Number(r.documentCount || 0),
      assetCount: Number(r.assetCount || 0),
      deploymentCount: Number(r.deploymentCount || 0),
    }));
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
      authConfig: row.authConfig ? JSON.parse(row.authConfig) : null
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
      authConfig: row.authConfig ? JSON.parse(row.authConfig) : null
    };
  }

  /**
   * Find project by ID and Owner ID.
   */
  getProjectById(projectId: string, ownerId: string): Project | undefined {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM projects WHERE id = ? AND ownerId = ?
    `).get(projectId, ownerId) as any;

    if (!row) return undefined;
    return {
      ...row,
      authConfig: row.authConfig ? JSON.parse(row.authConfig) : null
    };
  }

  /**
   * Delete a project and cascade all associated collections and documents.
   */
  deleteProject(ownerId: string, projectId: string): void {
    const db = getDb();

    const proj = db.prepare('SELECT id FROM projects WHERE id = ? AND ownerId = ?').get(projectId, ownerId);
    if (!proj) {
      throw new AppError(`Project "${projectId}" not found.`, 404);
    }

    db.transaction(() => {
      db.prepare('DELETE FROM collections WHERE projectId = ? AND ownerId = ?').run(projectId, ownerId);
      db.prepare('DELETE FROM documents WHERE projectId = ? AND ownerId = ?').run(projectId, ownerId);
      db.prepare('DELETE FROM assets WHERE projectId = ? AND ownerId = ?').run(projectId, ownerId);
      db.prepare('DELETE FROM deployments WHERE projectId = ? AND ownerId = ?').run(projectId, ownerId);
      db.prepare('DELETE FROM projects WHERE id = ? AND ownerId = ?').run(projectId, ownerId);
    })();
  }

  /**
   * Update project auth configuration.
   */
  updateAuthConfig(projectId: string, ownerId: string, authConfig: any): void {
    const db = getDb();
    const proj = db.prepare('SELECT id FROM projects WHERE id = ? AND ownerId = ?').get(projectId, ownerId);
    if (!proj) throw new AppError('Project not found.', 404);
    
    db.prepare('UPDATE projects SET authConfig = ?, updatedAt = ? WHERE id = ?').run(
      JSON.stringify(authConfig),
      new Date().toISOString(),
      projectId
    );
  }

  /**
   * Update project limits or other settings.
   */
  updateProject(ownerId: string, projectId: string, patch: Partial<Project>): Project {
    const db = getDb();
    
    const proj = db.prepare('SELECT * FROM projects WHERE id = ? AND ownerId = ?').get(projectId, ownerId) as Project | undefined;
    if (!proj) {
      throw new AppError(`Project "${projectId}" not found.`, 404);
    }

    const maxAssetSizeBytes = patch.maxAssetSizeBytes ?? proj.maxAssetSizeBytes ?? 10485760; // 10MB default
    const maxStorageBytes = patch.maxStorageBytes ?? proj.maxStorageBytes ?? 1073741824; // 1GB default
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE projects 
      SET maxAssetSizeBytes = ?, maxStorageBytes = ?, updatedAt = ?
      WHERE id = ? AND ownerId = ?
    `).run(maxAssetSizeBytes, maxStorageBytes, now, projectId, ownerId);

    return { ...proj, maxAssetSizeBytes, maxStorageBytes, updatedAt: now };
  }

  /**
   * Throws an error if the specified project doesn't exist or doesn't belong to the owner.
   */
  validateOwnership(projectId: string, ownerId: string): void {
    const db = getDb();
    const proj = db.prepare('SELECT id FROM projects WHERE id = ? AND ownerId = ?').get(projectId, ownerId);
    if (!proj) {
      throw new AppError('Access denied: Project not found or you do not own this project.', 403);
    }
  }
}

export const projectService = new ProjectService();
