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

// ── Upload Directory ──────────────────────────────────────────────────────────

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'biometrics');

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
      INSERT INTO assets (id, ownerId, originalName, storedName, mimeType, sizeBytes, absolutePath, uploadedAt, linkedCollectionId)
      VALUES (@id, @ownerId, @originalName, @storedName, @mimeType, @sizeBytes, @absolutePath, @uploadedAt, @linkedCollectionId)
    `).run({ ...meta, linkedCollectionId: meta.linkedCollectionId ?? null });
    return meta;
  }

  findById(ownerId: string, assetId: string): AssetMetadata {
    const db = getDb();
    const row = db.prepare('SELECT * FROM assets WHERE id = ? AND ownerId = ?').get(assetId, ownerId) as AssetMetadata | undefined;
    if (!row) {
      throw new AppError(`Asset "${assetId}" not found.`, 404);
    }
    return row;
  }

  listByOwner(ownerId: string): AssetMetadata[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM assets WHERE ownerId = ? ORDER BY uploadedAt DESC').all(ownerId) as AssetMetadata[];
    return rows;
  }

  delete(ownerId: string, assetId: string): AssetMetadata {
    const meta = this.findById(ownerId, assetId);
    const db = getDb();
    db.prepare('DELETE FROM assets WHERE id = ? AND ownerId = ?').run(assetId, ownerId);
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
export function saveAssetMetadata(
  ownerId: string,
  file: Express.Multer.File,
  linkedCollectionId?: string,
): PublicAssetMetadata {
  const meta: AssetMetadata = {
    id: uuidv4(),
    ownerId,
    originalName: file.originalname,
    storedName: file.filename,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    absolutePath: file.path,
    uploadedAt: new Date().toISOString(),
    linkedCollectionId,
  };
  assetStore.save(meta);
  return toPublicMeta(meta);
}

/** Returns all assets owned by the requesting user. */
export function listAssets(ownerId: string): PublicAssetMetadata[] {
  return assetStore.listByOwner(ownerId).map(toPublicMeta);
}

/** Returns metadata for a single asset (owner-scoped). */
export function getAsset(ownerId: string, assetId: string): PublicAssetMetadata {
  return toPublicMeta(assetStore.findById(ownerId, assetId));
}

/**
 * Streams the asset file to the HTTP response.
 * Resolves the file path from the internal metadata store — never from
 * user-supplied input — making path traversal attacks impossible.
 */
export function streamAsset(ownerId: string, assetId: string, res: Response): void {
  const meta = assetStore.findById(ownerId, assetId);

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
export function deleteAsset(ownerId: string, assetId: string): PublicAssetMetadata {
  const meta = assetStore.delete(ownerId, assetId);

  // Best-effort file deletion — don't fail the request if the file is already gone
  if (fs.existsSync(meta.absolutePath)) {
    try {
      fs.unlinkSync(meta.absolutePath);
    } catch (e) {
      console.error(`⚠️  Could not delete file at ${meta.absolutePath}:`, e);
    }
  }

  return toPublicMeta(meta);
}
