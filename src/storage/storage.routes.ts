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
import { apiLimiter } from '../middleware/rateLimit.middleware';
import { uploadMiddleware } from './storage.service';
import {
  uploadAsset,
  listUserAssets,
  getAssetMetadata,
  downloadAsset,
  removeAsset,
  getSignedUrl,
  uploadSignedAsset,
} from './storage.controller';

const router = Router();

// Signed upload endpoint (bypasses global API Key / JWT middleware, auth via token query param)
router.post('/upload-signed', uploadMiddleware, uploadSignedAsset);

// Apply API Key / JWT auth to ALL OTHER routes in this router
router.use(authenticateApiKeyOrJwt);

// ── Routes ────────────────────────────────────────────────────────────────────

// Upload: authenticateJwt (via router.use) → multer → controller
router.post('/upload', uploadMiddleware, uploadAsset);
router.post('/signed-url', apiLimiter, getSignedUrl);

// Asset metadata
router.get('/assets',         listUserAssets);
router.get('/assets/:id',     getAssetMetadata);
router.get('/assets/:id/file', downloadAsset);
router.delete('/assets/:id',  removeAsset);

export default router;
