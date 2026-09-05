// ─────────────────────────────────────────────────────────────────────────────
//  src/storage/storage.service.ts
//  Secure Biometric Asset Storage Pipeline.
//
//  Security properties:
//    • SHA-256 filename hashing — original filenames never touch the filesystem
//    • MIME allowlist at fileFilter level — rejected before data hits disk
//    • 10 MB hard cap enforced by multer
//    • Owner-scoped asset access — users can only retrieve their own assets
//    • No path traversal — file resolution goes through the metadata store
//      using UUID asset IDs, never user-supplied path strings
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Response } from 'express';
import multer, { StorageEngine } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../types/auth.types';
import {
  AssetMetadata,
  PublicAssetMetadata,
  ALLOWED_MIME_TYPES,
} from '../types/storage.types';
import { getDb } from '../db/sqlite.connection';
import { webhookService } from '../services/webhook.service';
import { Jimp } from 'jimp';
import jwt from 'jsonwebtoken';

// ── Upload Directory ──────────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads', 'biometrics');

/** Ensure the upload directory exists (called at server startup). */
export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`📁 Created upload directory: ${UPLOAD_DIR}`);
  }
}

// ── SHA-256 Filename Hasher ───────────────────────────────────────────────────

/**
 * Generates a SHA-256 hash to use as the stored filename.
 * Inputs: original filename, uploader's userId, and current timestamp.
 * Output: `<hash>.<ext>` — deterministic given same inputs, but unguessable.
 */
function hashFilename(originalName: string, userId: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.bin';
  const raw = `${originalName}::${userId}::${Date.now()}::${uuidv4()}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return `${hash}${ext}`;
}

// ── Multer Configuration ──────────────────────────────────────────────────────

/**
 * Custom disk storage engine.
 * destination: always UPLOAD_DIR
 * filename: SHA-256 hash of (original + userId + timestamp) — original name never used
 *
 * NOTE: `req.user` is available here because authenticateJwt runs before multer
 * in the storage route middleware chain.
 */
const diskStorage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const userId = req.user?.sub ?? 'anonymous';
    const hashedName = hashFilename(file.originalname, userId);
    cb(null, hashedName);
  },
});

/**
 * MIME type allowlist filter. Called BEFORE file data is written to disk.
 * Rejects anything outside the allowed image types with a 415 error.
 */
function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const allowed = ALLOWED_MIME_TYPES as readonly string[];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Unsupported file type "${file.mimetype}". Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}.`,
        415,
      ) as unknown as null,
      false,
    );
  }
}

/** Pre-configured multer upload instance. Exported for use as route middleware. */
export const uploadMiddleware = multer({
  storage: diskStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,                    // only one file per request
  },
}).single('biometric'); // multipart field name must be 'biometric'

// ── SQLite Asset Metadata Store ─────────────────────────────────────────────

class SqliteAssetStore {
  save(meta: AssetMetadata): AssetMetadata {
    const db = getDb();
    db.prepare(`
      INSERT INTO assets (id, ownerId, originalName, storedName, mimeType, sizeBytes, absolutePath, uploadedAt, projectId, linkedCollectionId)
      VALUES (@id, @ownerId, @originalName, @storedName, @mimeType, @sizeBytes, @absolutePath, @uploadedAt, @projectId, @linkedCollectionId)
    `).run({ ...meta, projectId: meta.projectId ?? null, linkedCollectionId: meta.linkedCollectionId ?? null });
    return meta;
  }

  getTotalSizeForProject(projectId: string): number {
    const db = getDb();
    const row = db.prepare('SELECT SUM(sizeBytes) as total FROM assets WHERE projectId = ?').get(projectId) as any;
    return row.total || 0;
  }

  findById(ownerId: string, assetId: string, projectId?: string): AssetMetadata {
    const db = getDb();
    let query = 'SELECT * FROM assets WHERE id = ?';
    const params: any[] = [assetId];
    if (projectId) {
      query += ' AND projectId = ?';
      params.push(projectId);
    } else {
      query += ' AND ownerId = ?';
      params.push(ownerId);
    }
    const row = db.prepare(query).get(...params) as AssetMetadata | undefined;
    if (!row) {
      throw new AppError(`Asset "${assetId}" not found.`, 404);
    }
    return row;
  }

  listByOwner(ownerId: string, projectId?: string): AssetMetadata[] {
    const db = getDb();
    if (projectId) {
      return db.prepare('SELECT * FROM assets WHERE projectId = ? ORDER BY uploadedAt DESC').all(projectId) as AssetMetadata[];
    }
    return db.prepare('SELECT * FROM assets WHERE ownerId = ? ORDER BY uploadedAt DESC').all(ownerId) as AssetMetadata[];
  }

  delete(ownerId: string, assetId: string, projectId?: string): AssetMetadata {
    const meta = this.findById(ownerId, assetId, projectId);
    const db = getDb();
    if (projectId) {
      db.prepare('DELETE FROM assets WHERE id = ? AND projectId = ?').run(assetId, projectId);
    } else {
      db.prepare('DELETE FROM assets WHERE id = ? AND ownerId = ?').run(assetId, ownerId);
    }
    return meta;
  }
}

const assetStore = new SqliteAssetStore();

// ── Public service functions ──────────────────────────────────────────────────

/** Strip internal fields before returning to the client. */
function toPublicMeta(meta: AssetMetadata): PublicAssetMetadata {
  const { storedName: _sn, absolutePath: _ap, ...pub } = meta;
  return pub;
}

/**
 * Persist metadata for a successfully uploaded file.
 * Called AFTER multer has written the file to disk.
 */
export async function saveAssetMetadata(
  ownerId: string,
  file: Express.Multer.File,
  linkedCollectionId?: string,
  projectId?: string,
  transforms?: { width?: number; height?: number; format?: string }
): Promise<PublicAssetMetadata> {

  // SECURITY FEATURE: Verify file magic bytes match the claimed mime type
  const fileTypeModule: any = await (new Function('return import("file-type")')());
  const detectFromFile = fileTypeModule.fileTypeFromFile || fileTypeModule.fromFile || fileTypeModule.default?.fileTypeFromFile || fileTypeModule.default?.fromFile;
  const typeResult = detectFromFile ? await detectFromFile(file.path) : null;
  
  if (typeResult) {
    if (typeResult.mime !== file.mimetype) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new AppError(`Security violation: File signature (${typeResult.mime}) does not match claimed type (${file.mimetype}).`, 400);
    }
  } else if (!file.mimetype.startsWith('text/') && file.mimetype !== 'application/csv') {
    // If not detected by file-type and it's not a text/csv file, it's suspicious.
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    throw new AppError(`Security violation: Could not verify file signature for non-text type (${file.mimetype}).`, 400);
  }

  if (projectId) {
    const db = getDb();
    const project = db.prepare('SELECT maxAssetSizeBytes, maxStorageBytes FROM projects WHERE id = ?').get(projectId) as any;
    if (project) {
      if (file.size > project.maxAssetSizeBytes) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new AppError(`File exceeds project's max asset size limit of ${project.maxAssetSizeBytes} bytes.`, 400);
      }
      const totalSize = assetStore.getTotalSizeForProject(projectId);
      if (totalSize + file.size > project.maxStorageBytes) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new AppError(`Uploading this file would exceed the project's max storage limit of ${project.maxStorageBytes} bytes.`, 400);
      }
    }
  }

  let finalMime = file.mimetype;
  let finalSize = file.size;

  // On-the-fly Image Transformations
  if (file.mimetype.startsWith('image/') && transforms && (transforms.width || transforms.height || transforms.format)) {
    try {
      const image = await Jimp.read(file.path);
      
      if (transforms.width && transforms.height) {
        image.resize({ w: transforms.width, h: transforms.height });
      } else if (transforms.width) {
        image.resize({ w: transforms.width });
      } else if (transforms.height) {
        image.resize({ h: transforms.height });
      }

      let outputPath = file.path;
      if (transforms.format) {
        const fmt = transforms.format.toLowerCase();
        if (fmt.includes('png')) {
          finalMime = 'image/png';
          outputPath = file.path.replace(/\.[^/.]+$/, "") + ".png";
        } else if (fmt.includes('jpeg') || fmt.includes('jpg')) {
          finalMime = 'image/jpeg';
          outputPath = file.path.replace(/\.[^/.]+$/, "") + ".jpg";
        }
      }

      await image.write(outputPath as any);
      if (outputPath !== file.path) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        file.path = outputPath;
        file.filename = path.basename(outputPath);
        file.originalname = file.originalname.replace(/\.[^/.]+$/, "") + path.extname(outputPath);
      }
      finalSize = fs.statSync(file.path).size;
    } catch (err: any) {
      console.error('[Jimp] Image transformation failed:', err.message);
    }
  }

  // Enforce User Storage Quota (500 MB default per user)
  const quota = getUserStorageQuota(ownerId);
  if (quota.usedBytes + finalSize > quota.maxBytes) {
    if (fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (_) {}
    }
    throw new AppError(`User storage quota exceeded (${Math.round(quota.usedBytes / (1024*1024))} MB of ${Math.round(quota.maxBytes / (1024*1024))} MB used).`, 413);
  }

  const meta: AssetMetadata = {
    id: uuidv4(),
    ownerId,
    originalName: file.originalname,
    storedName: file.filename,
    mimeType: finalMime,
    sizeBytes: finalSize,
    absolutePath: file.path,
    uploadedAt: new Date().toISOString(),
    projectId,
    linkedCollectionId,
  };
  assetStore.save(meta);

  const pub = toPublicMeta(meta);
  if (projectId) {
    webhookService.dispatch(projectId, 'file.uploaded', pub);
  }

  return pub;
}

/** Computes current storage quota consumption for a user */
export function getUserStorageQuota(userId: string, limitBytes = 524288000): { usedBytes: number; maxBytes: number; fileCount: number; percentage: number } {
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as fileCount, SUM(sizeBytes) as usedBytes FROM assets WHERE ownerId = ?').get(userId) as any;
    const usedBytes = Number(row?.usedBytes || 0);
    const fileCount = Number(row?.fileCount || 0);
    const percentage = Math.min(100, Math.round((usedBytes / limitBytes) * 100));
    return {
      usedBytes,
      maxBytes: limitBytes,
      fileCount,
      percentage
    };
  } catch (_) {
    return { usedBytes: 0, maxBytes: limitBytes, fileCount: 0, percentage: 0 };
  }
}

/** Returns all assets owned by the requesting user or project. */
export function listAssets(ownerId: string, projectId?: string): PublicAssetMetadata[] {
  return assetStore.listByOwner(ownerId, projectId).map(toPublicMeta);
}

/** Returns metadata for a single asset (owner-scoped or project-scoped). */
export function getAsset(ownerId: string, assetId: string, projectId?: string): PublicAssetMetadata {
  return toPublicMeta(assetStore.findById(ownerId, assetId, projectId));
}

/**
 * Streams the asset file to the HTTP response.
 * Resolves the file path from the internal metadata store — never from
 * user-supplied input — making path traversal attacks impossible.
 */
export function streamAsset(ownerId: string, assetId: string, res: Response, projectId?: string): void {
  const meta = assetStore.findById(ownerId, assetId, projectId);

  if (!fs.existsSync(meta.absolutePath)) {
    throw new AppError('Asset file not found on disk. It may have been removed.', 404);
  }

  res.setHeader('Content-Type', meta.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${meta.originalName}"`);
  res.setHeader('Content-Length', meta.sizeBytes);
  res.setHeader('Cache-Control', 'private, max-age=3600');

  const readStream = fs.createReadStream(meta.absolutePath);
  readStream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to stream file.', data: null });
    }
  });
  readStream.pipe(res);
}

/**
 * Deletes an asset's metadata record AND its file from disk.
 */
export function deleteAsset(ownerId: string, assetId: string, projectId?: string): PublicAssetMetadata {
  const meta = assetStore.delete(ownerId, assetId, projectId);

  // Best-effort file deletion — don't fail the request if the file is already gone
  if (fs.existsSync(meta.absolutePath)) {
    try {
      fs.unlinkSync(meta.absolutePath);
    } catch (e) {
      console.error(`⚠️  Could not delete file at ${meta.absolutePath}:`, e);
    }
  }

  const pub = toPublicMeta(meta);
  if (meta.projectId) {
    webhookService.dispatch(meta.projectId, 'file.deleted', pub);
  }

  return pub;
}

export function generateSignedUploadUrl(
  ownerId: string,
  projectId: string,
  fileName: string,
  mimeType: string,
  expiresIn = 900
): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is missing.');

  const token = jwt.sign(
    { ownerId, projectId, fileName, mimeType },
    secret,
    { expiresIn }
  );

  return `/api/v1/storage/upload-signed?token=${token}`;
}

export function verifyUploadToken(token: string): { ownerId: string; projectId: string; fileName: string; mimeType: string } {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is missing.');

  return jwt.verify(token, secret) as any;
}
