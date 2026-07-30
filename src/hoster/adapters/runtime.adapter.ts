// ─────────────────────────────────────────────────────────────────────────────
//  src/hoster/adapters/runtime.adapter.ts
//  AegisDB — Runtime adapter interface.
//
//  Both DockerAdapter and ProcessAdapter implement this contract.
//  HosterService only ever interacts with RuntimeAdapter, enabling
//  seamless switching between Docker and local-process execution.
// ─────────────────────────────────────────────────────────────────────────────

import { type Deployment, type RuntimeMode } from '../../types/hoster.types';

// ── Shared types ──────────────────────────────────────────────────────────────

/** Live status of the underlying process/container. */
export type ContainerStatus = 'running' | 'stopped' | 'error';

/** Identifiers returned after a successful start. */
export interface StartResult {
  /** Set by DockerAdapter when a container is created. */
  containerId?: string;
  /** Set by ProcessAdapter when a child process is spawned. */
  pid?: number;
}

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface RuntimeAdapter {
  /** Which execution engine this adapter represents. */
  readonly mode: RuntimeMode;

  /**
   * Probe whether this adapter's runtime is available on the host.
   * For Docker: pings the daemon.
   * For Process: always true.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Start the deployment.
   * Extracts workspace, spawns/creates the process or container,
   * and returns identifying handles (containerId or pid).
   */
  start(deployment: Deployment): Promise<StartResult>;

  /**
   * Gracefully stop a running deployment.
   * Does NOT remove the deployment record or workspace.
   */
  stop(deployment: Deployment): Promise<void>;

  /**
   * Stop AND remove all runtime resources (container/process + logs).
   * Called before workspace deletion on `removeDeployment`.
   */
  remove(deployment: Deployment): Promise<void>;

  /**
   * Retrieve the last `lines` lines of stdout/stderr from the deployment.
   */
  getLogs(deployment: Deployment, lines: number): Promise<string>;

  /**
   * Query the live status of the deployment's process/container.
   * Used to sync the stored status with reality on GET requests.
   */
  getStatus(deployment: Deployment): Promise<ContainerStatus>;
}
