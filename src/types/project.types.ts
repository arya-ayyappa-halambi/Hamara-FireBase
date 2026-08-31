// ─────────────────────────────────────────────────────────────────────────────
//  src/types/project.types.ts
//  Type definitions for Multi-Tenant Projects, API Keys, and Super Admin.
// ─────────────────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  ownerId: string;
  orgId?: string | null;
  name: string;
  apiKeyHash: string;
  serviceKeyHash?: string | null;
  maxAssetSizeBytes: number;
  maxStorageBytes: number;
  authConfig: string | null;
  backupConfig: string | null;
  createdAt: string;
  updatedAt: string;
  myProjectRole?: 'admin' | 'maintainer' | 'developer' | 'viewer';
}

export interface CreateProjectResult {
  project: Project;
  rawApiKey: string;
  rawServiceKey?: string;
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
  cpuUsagePercent?: number;
  activeWebSockets?: number;
}

export interface UpdateRateLimitDto {
  authWindowMinutes?: number;
  authLimit?: number;
  apiWindowMinutes?: number;
  apiLimit?: number;
}
