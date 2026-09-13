// ─────────────────────────────────────────────────────────────────────────────
//  src/types/hoster.types.ts
//  FlareBase — Hoster module domain types.
// ─────────────────────────────────────────────────────────────────────────────

// ── Runtime mode ──────────────────────────────────────────────────────────────

/** Which underlying execution engine is managing this deployment. */
export type RuntimeMode = 'docker' | 'process';

// ── Deployment lifecycle status ───────────────────────────────────────────────

export type DeploymentStatus =
  | 'pending'    // record created, not yet started
  | 'building'   // zip is being extracted / image is being pulled
  | 'running'    // process/container is alive and serving
  | 'stopped'    // explicitly halted; can be restarted
  | 'error'      // failed to start or crashed unexpectedly
  | 'removed';   // fully torn down and unrecoverable

// ── Deployment metadata (persisted alongside the record) ─────────────────────

export interface DeploymentMetadata {
  /** Shell command executed inside the workspace/container. */
  startCommand: string;
  /** Docker image (Docker mode only). */
  image: string;
  /** User-supplied environment variables injected at runtime. */
  envVars: Record<string, string>;
  /** Memory cap in megabytes (Docker mode enforced, Process mode advisory). */
  memoryLimitMb: number;
  /** Human-readable description. */
  description: string;
}

// ── Core deployment record (internal) ────────────────────────────────────────

export interface Deployment {
  /** UUID assigned at deploy time. */
  id: string;
  /** Owner's user ID from the JWT sub claim. */
  ownerId: string;
  /** Human-readable project name. */
  name: string;
  /** Current lifecycle phase. */
  status: DeploymentStatus;
  /** Which adapter manages this deployment. */
  runtimeMode: RuntimeMode;

  /** Docker container ID (Docker mode only). */
  containerId?: string;
  /** OS process ID (Process mode only). */
  pid?: number;

  /** Host port the project is accessible on. */
  allocatedPort: number;

  /**
   * Absolute filesystem path to the extracted project directory.
   * INTERNAL — must never be sent to API consumers.
   */
  workspaceDir: string;

  /** Runtime parameters. */
  metadata: DeploymentMetadata;

  createdAt: string;
  updatedAt: string;

  /** Set when status === 'error'. */
  errorMessage?: string;
}

// ── Public view (safe to return to API consumers) ────────────────────────────

/** `workspaceDir` is stripped — internal path never leaves the server. */
export type PublicDeployment = Omit<Deployment, 'workspaceDir'>;

// ── Inbound DTOs ──────────────────────────────────────────────────────────────

export interface DeployProjectDto {
  name: string;
  description?: string;
  /** Docker image tag. Ignored in Process mode. Default: node:18-alpine */
  image?: string;
  /** Shell command to run. Default: node index.js */
  startCommand?: string;
  /** Key/value pairs injected as environment variables. */
  envVars?: Record<string, string>;
  /** Memory limit in MB. Default: 512 */
  memoryLimitMb?: number;
}
