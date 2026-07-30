// ─────────────────────────────────────────────────────────────────────────────
//  src/hoster/hoster.service.ts
//  AegisDB — Hoster orchestration layer.
//
//  Responsibilities:
//    1. Auto-detect Docker vs Process runtime at startup
//    2. Accept project ZIP uploads, extract safely (zip-slip protected)
//    3. Allocate host ports via PortManager
//    4. Manage full deployment lifecycle: deploy, start, stop, restart, remove
//    5. Delegate runtime operations to the active RuntimeAdapter
//    6. Maintain an in-memory DeploymentStore (swappable interface)
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import fs from 'fs';
import multer from 'multer';
import unzipper from 'unzipper';
import { v4 as uuidv4 } from 'uuid';

import { AppError } from '../types/auth.types';
import {
  type Deployment,
  type PublicDeployment,
  type DeployProjectDto,
} from '../types/hoster.types';
import { portManager } from './port.manager';
import { type RuntimeAdapter, type ContainerStatus } from './adapters/runtime.adapter';
import { DockerAdapter } from './adapters/docker.adapter';
import { ProcessAdapter } from './adapters/process.adapter';

// ── Directory paths ────────────────────────────────────────────────────────────

export const WORKSPACE_DIR   = path.resolve(process.cwd(), 'workspaces');
export const ZIP_UPLOAD_DIR  = path.resolve(process.cwd(), 'uploads', 'projects');

/**
 * Create required directories at process startup.
 * Safe to call multiple times.
 */
export function ensureHosterDirs(): void {
  for (const dir of [WORKSPACE_DIR, ZIP_UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  }
}

// ── Runtime adapter ────────────────────────────────────────────────────────────

let _adapter: RuntimeAdapter | null = null;

/**
 * Detect and initialise the best available runtime adapter.
 * Called once at server startup; result is cached for the process lifetime.
 */
export async function initRuntimeAdapter(): Promise<void> {
  if (_adapter) return;

  const docker = new DockerAdapter();
  if (await docker.isAvailable()) {
    _adapter = docker;
    console.log('🐳 Hoster runtime: Docker adapter active');
  } else {
    _adapter = new ProcessAdapter();
    console.log('⚙️  Hoster runtime: Process adapter active (Docker unavailable)');
  }
}

async function adapter(): Promise<RuntimeAdapter> {
  if (!_adapter) await initRuntimeAdapter();
  return _adapter!;
}

// ── Multer: ZIP upload middleware ─────────────────────────────────────────────

const zipStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ZIP_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${uuidv4()}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

function zipFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  if (path.extname(file.originalname).toLowerCase() !== '.zip') {
    cb(new AppError('Only .zip project archives are accepted.', 415) as unknown as Error);
    return;
  }
  cb(null, true);
}

export const uploadProjectMiddleware = multer({
  storage: zipStorage,
  fileFilter: zipFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB hard cap
    files: 1,
  },
}).single('project');

// ── ZIP extraction (zip-slip protected) ───────────────────────────────────────

/**
 * Extract a .zip archive to `destDir` with full path-traversal protection.
 *
 * Algorithm:
 *   1. Resolve every entry path against destDir
 *   2. Reject if resolved path escapes destDir (zip-slip)
 *   3. Extract valid entries via streams (memory-efficient for large archives)
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.promises.mkdir(destDir, { recursive: true });
  const safeDest = path.resolve(destDir);

  const directory = await unzipper.Open.file(zipPath);

  // ── Pass 1: validate ALL paths before writing a single byte ───────────────
  for (const file of directory.files) {
    // Normalise Windows-style separators inside zip entries
    const normalised = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved   = path.resolve(destDir, normalised);

    const insideDest =
      resolved === safeDest ||
      resolved.startsWith(safeDest + path.sep);

    if (!insideDest) {
      throw new AppError(
        `Zip-slip attack detected: entry "${file.path}" would extract ` +
          `outside the project workspace. Upload rejected.`,
        400,
      );
    }
  }

  // ── Pass 2: extract ────────────────────────────────────────────────────────
  for (const file of directory.files) {
    const normalised = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    const fullPath   = path.resolve(destDir, normalised);

    if (file.type === 'Directory') {
      await fs.promises.mkdir(fullPath, { recursive: true });
    } else {
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

      // Stream each file entry to disk — avoids loading entire zip into memory
      await new Promise<void>((resolve, reject) => {
        file
          .stream()
          .pipe(fs.createWriteStream(fullPath))
          .on('finish', resolve)
          .on('error', reject);
      });
    }
  }
}

import { getDb } from '../db/sqlite.connection';

// ── SQLite deployment store ──────────────────────────────────────────────────

class SqliteDeploymentStore {
  save(dep: Deployment): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO deployments (
        id, ownerId, name, status, runtimeMode, containerId, pid,
        allocatedPort, workspaceDir, metadata, createdAt, updatedAt, errorMessage
      ) VALUES (
        @id, @ownerId, @name, @status, @runtimeMode, @containerId, @pid,
        @allocatedPort, @workspaceDir, @metadata, @createdAt, @updatedAt, @errorMessage
      ) ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        containerId = excluded.containerId,
        pid = excluded.pid,
        updatedAt = excluded.updatedAt,
        errorMessage = excluded.errorMessage
    `).run({
      ...dep,
      containerId: dep.containerId ?? null,
      pid: dep.pid ?? null,
      metadata: JSON.stringify(dep.metadata),
      errorMessage: dep.errorMessage ?? null,
    });
  }

  /** Update updatedAt timestamp and persist to SQLite. */
  touch(dep: Deployment): void {
    dep.updatedAt = new Date().toISOString();
    this.save(dep);
  }

  /**
   * Retrieve a deployment by id, enforcing owner scope.
   * Returns 404 on owner mismatch (no existence leak).
   */
  require(ownerId: string, id: string): Deployment {
    const db = getDb();
    const row = db.prepare('SELECT * FROM deployments WHERE id = ? AND ownerId = ?').get(id, ownerId) as any;
    if (!row) {
      throw new AppError(`Deployment "${id}" not found.`, 404);
    }
    return {
      ...row,
      metadata: JSON.parse(row.metadata),
      containerId: row.containerId ?? undefined,
      pid: row.pid ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
    };
  }

  listByOwner(ownerId: string): Deployment[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM deployments WHERE ownerId = ? ORDER BY createdAt DESC').all(ownerId) as any[];
    return rows.map((row) => ({
      ...row,
      metadata: JSON.parse(row.metadata),
      containerId: row.containerId ?? undefined,
      pid: row.pid ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
    }));
  }

  /** Remove from database. Returns the deleted record. */
  delete(ownerId: string, id: string): Deployment {
    const dep = this.require(ownerId, id);
    const db = getDb();
    db.prepare('DELETE FROM deployments WHERE id = ? AND ownerId = ?').run(id, ownerId);
    return dep;
  }
}

const store = new SqliteDeploymentStore();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strip internal fields before returning to API consumers. */
function toPublic(dep: Deployment): PublicDeployment {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { workspaceDir: _wd, ...pub } = dep;
  return pub;
}

/**
 * Sync a deployment's stored status against the live adapter status.
 * Only queries the adapter if status might have changed (running/building).
 */
async function syncStatus(dep: Deployment): Promise<void> {
  if (dep.status !== 'running' && dep.status !== 'building') return;

  try {
    const live: ContainerStatus = await (await adapter()).getStatus(dep);
    if (live !== 'running') {
      dep.status = live === 'error' ? 'error' : 'stopped';
      store.touch(dep);
    }
  } catch {
    // Swallow sync errors — return the stored status as-is
  }
}

function cleanupWorkspace(dir: string): void {
  if (dir && fs.existsSync(dir)) {
    fs.rm(dir, { recursive: true, force: true }, (err) => {
      if (err) console.error(`⚠️  Workspace cleanup failed for ${dir}:`, err.message);
    });
  }
}

// ── Public service API ────────────────────────────────────────────────────────

/**
 * Upload, extract, and launch a new project deployment.
 *
 * Even if startup fails the deployment record is persisted with status='error',
 * allowing the caller to inspect `errorMessage` without losing context.
 */
export async function deployProject(
  ownerId: string,
  dto: DeployProjectDto,
  zipFile: Express.Multer.File,
): Promise<PublicDeployment> {
  const adapt  = await adapter();
  const id     = uuidv4();
  const wsDir  = path.join(WORKSPACE_DIR, id);
  const port   = portManager.allocate();
  const now    = new Date().toISOString();

  const dep: Deployment = {
    id,
    ownerId,
    name:        dto.name.trim(),
    status:      'building',
    runtimeMode: adapt.mode,
    allocatedPort: port,
    workspaceDir: wsDir,
    metadata: {
      startCommand: dto.startCommand?.trim() || 'node index.js',
      image:        dto.image?.trim()        || 'node:18-alpine',
      envVars:      dto.envVars              ?? {},
      memoryLimitMb: dto.memoryLimitMb      ?? 512,
      description:  dto.description?.trim() ?? '',
    },
    createdAt: now,
    updatedAt: now,
  };

  store.save(dep);

  // ── Phase A: extract ZIP ───────────────────────────────────────────────────
  try {
    await extractZip(zipFile.path, wsDir);
  } catch (err) {
    dep.status       = 'error';
    dep.errorMessage = `Extraction failed: ${err instanceof Error ? err.message : String(err)}`;
    store.touch(dep);
    portManager.release(port);
    cleanupWorkspace(wsDir);
  } finally {
    // Always delete the uploaded zip — it has been extracted or errored out
    fs.unlink(zipFile.path, () => { /* fire and forget */ });
  }

  if (dep.status === 'error') return toPublic(store.require(ownerId, id));

  // ── Phase B: start via runtime adapter ────────────────────────────────────
  try {
    const result = await adapt.start(dep);
    dep.containerId = result.containerId;
    dep.pid         = result.pid;
    dep.status      = 'running';
    store.touch(dep);
  } catch (err) {
    dep.status       = 'error';
    dep.errorMessage = `Start failed: ${err instanceof Error ? err.message : String(err)}`;
    store.touch(dep);
    portManager.release(port);
    cleanupWorkspace(wsDir);
  }

  return toPublic(store.require(ownerId, id));
}

export function listDeployments(ownerId: string): PublicDeployment[] {
  return store.listByOwner(ownerId).map(toPublic);
}

export async function getDeployment(ownerId: string, id: string): Promise<PublicDeployment> {
  const dep = store.require(ownerId, id);
  await syncStatus(dep);
  return toPublic(dep);
}

export async function startDeployment(ownerId: string, id: string): Promise<PublicDeployment> {
  const dep = store.require(ownerId, id);

  if (dep.status === 'running')  throw new AppError('Deployment is already running.', 409);
  if (dep.status === 'building') throw new AppError('Deployment is still building — wait for it to finish.', 409);
  if (dep.status === 'removed')  throw new AppError('Deployment has been removed and cannot be restarted.', 410);

  dep.status = 'building';
  store.touch(dep);

  try {
    const adapt  = await adapter();
    const result = await adapt.start(dep);
    dep.containerId    = result.containerId ?? dep.containerId;
    dep.pid            = result.pid         ?? dep.pid;
    dep.status         = 'running';
    dep.errorMessage   = undefined;
    store.touch(dep);
  } catch (err) {
    dep.status       = 'error';
    dep.errorMessage = `Start failed: ${err instanceof Error ? err.message : String(err)}`;
    store.touch(dep);
  }

  return toPublic(store.require(ownerId, id));
}

export async function stopDeployment(ownerId: string, id: string): Promise<PublicDeployment> {
  const dep = store.require(ownerId, id);

  if (dep.status === 'stopped') throw new AppError('Deployment is already stopped.', 409);
  if (dep.status === 'removed') throw new AppError('Deployment has been removed.', 410);

  await (await adapter()).stop(dep);
  dep.status = 'stopped';
  store.touch(dep);

  return toPublic(store.require(ownerId, id));
}

export async function restartDeployment(ownerId: string, id: string): Promise<PublicDeployment> {
  const dep = store.require(ownerId, id);

  if (dep.status === 'removed') throw new AppError('Deployment has been removed.', 410);

  const adapt = await adapter();

  // Graceful stop before restart (ignore errors — process might already be dead)
  if (dep.status === 'running') {
    try { await adapt.stop(dep); } catch { /* safe to ignore */ }
  }

  dep.status = 'building';
  store.touch(dep);

  try {
    const result = await adapt.start(dep);
    dep.containerId  = result.containerId ?? dep.containerId;
    dep.pid          = result.pid         ?? dep.pid;
    dep.status       = 'running';
    dep.errorMessage = undefined;
    store.touch(dep);
  } catch (err) {
    dep.status       = 'error';
    dep.errorMessage = `Restart failed: ${err instanceof Error ? err.message : String(err)}`;
    store.touch(dep);
  }

  return toPublic(store.require(ownerId, id));
}

export async function getDeploymentLogs(
  ownerId: string,
  id: string,
  lines = 100,
): Promise<string> {
  const dep   = store.require(ownerId, id);
  const adapt = await adapter();
  const clamped = Math.min(Math.max(1, lines), 1000);
  return adapt.getLogs(dep, clamped);
}

export async function removeDeployment(ownerId: string, id: string): Promise<PublicDeployment> {
  const dep = store.require(ownerId, id);

  if (dep.status === 'removed') throw new AppError('Deployment is already removed.', 410);

  // Stop + remove from runtime (best-effort — don't block on runtime errors)
  try { await (await adapter()).remove(dep); } catch { /* ignore */ }

  // Release the port back to the pool
  portManager.release(dep.allocatedPort);

  // Delete extracted workspace from disk (async — non-blocking)
  cleanupWorkspace(dep.workspaceDir);

  // Remove from store
  store.delete(ownerId, id);

  // Return a terminal snapshot
  return { ...toPublic(dep), status: 'removed', updatedAt: new Date().toISOString() };
}

/** Port pool statistics — useful for health/metrics endpoints. */
export function getPortStats() {
  return portManager.stats();
}
