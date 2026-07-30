// ─────────────────────────────────────────────────────────────────────────────
//  src/types/project.types.ts
//  Type definitions for Multi-Tenant Projects, API Keys, and Super Admin.
// ─────────────────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  apiKeyHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectResult {
  project: Project;
  rawApiKey: string;
}

export interface ProjectStats extends Project {
  collectionCount: number;
  documentCount: number;
  assetCount: number;
  deploymentCount: number;
}

export interface AdminSystemStats {
  totalUsers: number;
  totalProjects: number;
  totalCollections: number;
  totalDocuments: number;
  totalAssets: number;
  totalDeployments: number;
  memoryUsageMb: number;
  uptimeSeconds: number;
}

export interface UpdateRateLimitDto {
  authWindowMinutes?: number;
  authLimit?: number;
  apiWindowMinutes?: number;
  apiLimit?: number;
}
