// ─────────────────────────────────────────────────────────────────────────────
//  src/storage/storage.controller.ts
//  HTTP adapter for the Biometric Asset Storage module.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { AppError, ApiResponse } from '../types/auth.types';
import { PublicAssetMetadata } from '../types/storage.types';
import {
  saveAssetMetadata,
  listAssets,
  getAsset,
  streamAsset,
  deleteAsset,
} from './storage.service';

// ── Helper ────────────────────────────────────────────────────────────────────

function getOwnerId(req: Request): string {
  const sub = req.user?.sub;
  if (!sub) throw new AppError('Authentication context missing.', 401);
  return sub;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/storage/upload
 *
 * Expects multipart/form-data with field `biometric` containing an image file.
 * Optional body field: `linkedCollectionId`
 *
 * The multer middleware (uploadMiddleware) runs BEFORE this handler in the
 * route chain and populates `req.file`. By the time this handler runs, the
 * file is already written to disk.
 */
export async function uploadAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded. Use the "biometric" multipart field.', 400);
    }

    const ownerId = getOwnerId(req);
    const linkedCollectionId = req.body.linkedCollectionId as string | undefined;

    const meta = saveAssetMetadata(ownerId, req.file, linkedCollectionId);

    res.status(201).json({
      success: true,
      message: 'Biometric asset uploaded successfully.',
      data: meta,
    } as ApiResponse<PublicAssetMetadata>);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/storage/assets
 * Returns all asset metadata records owned by the authenticated user.
 */
export async function listUserAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const assets = listAssets(getOwnerId(req));
    res.status(200).json({
      success: true,
      message: `${assets.length} asset(s) found.`,
      data: assets,
    } as ApiResponse<PublicAssetMetadata[]>);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/storage/assets/:id
 * Returns metadata for a single asset (owner-scoped).
 */
export async function getAssetMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const meta = getAsset(getOwnerId(req), req.params.id);
    res.status(200).json({
      success: true,
      message: 'Asset retrieved.',
      data: meta,
    } as ApiResponse<PublicAssetMetadata>);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/storage/assets/:id/file
 * Streams the raw file bytes to the response with the correct Content-Type.
 * File path is resolved internally via metadata — never from user input.
 */
export async function downloadAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    streamAsset(getOwnerId(req), req.params.id, res);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/storage/assets/:id
 * Deletes the metadata record and the physical file from disk.
 */
export async function removeAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deleted = deleteAsset(getOwnerId(req), req.params.id);
    res.status(200).json({
      success: true,
      message: 'Asset deleted.',
      data: deleted,
    } as ApiResponse<PublicAssetMetadata>);
  } catch (err) {
    next(err);
  }
}
