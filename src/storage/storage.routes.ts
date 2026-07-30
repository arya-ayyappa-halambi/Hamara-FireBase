// ─────────────────────────────────────────────────────────────────────────────
//  src/storage/storage.routes.ts
//  All storage routes are protected by authenticateJwt.
//  Mounted at /api/v1/storage by server.ts.
//
//  Middleware chain for upload:
//    authenticateJwt → uploadMiddleware (multer) → uploadAsset controller
//
//  authenticateJwt runs BEFORE multer so that req.user.sub is available
//  inside multer's filename() callback (for SHA-256 hashing).
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authenticateApiKeyOrJwt } from '../middleware/apikey.middleware';
import { uploadMiddleware } from './storage.service';
import {
  uploadAsset,
  listUserAssets,
  getAssetMetadata,
  downloadAsset,
  removeAsset,
} from './storage.controller';

const router = Router();

// Apply API Key / JWT auth to ALL routes in this router
router.use(authenticateApiKeyOrJwt);

// ── Routes ────────────────────────────────────────────────────────────────────

// Upload: authenticateJwt (via router.use) → multer → controller
router.post('/upload', uploadMiddleware, uploadAsset);

// Asset metadata
router.get('/assets',         listUserAssets);
router.get('/assets/:id',     getAssetMetadata);
router.get('/assets/:id/file', downloadAsset);
router.delete('/assets/:id',  removeAsset);

export default router;
