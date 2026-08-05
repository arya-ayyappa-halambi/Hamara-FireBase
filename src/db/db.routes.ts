// ─────────────────────────────────────────────────────────────────────────────
//  src/db/db.routes.ts
//  All DB routes are protected by authenticateJwt.
//  Mounted at /api/v1/db by server.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authenticateApiKeyOrJwt } from '../middleware/apikey.middleware';
import { enforceAppCheck } from '../middleware/appcheck.middleware';
import {
  createCollection,
  listCollections,
  getCollection,
  deleteCollection,
  insertDocument,
  queryDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  updateCollection,
  queryVector,
} from './db.controller';

import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Apply API Key / JWT auth to ALL routes in this router
router.use(authenticateApiKeyOrJwt);
router.use(enforceAppCheck);
router.use(apiLimiter);

// ── Collection Routes ─────────────────────────────────────────────────────────
router.post(  '/collections',       createCollection);
router.get(   '/collections',       listCollections);
router.get(   '/collections/:name', getCollection);
router.patch( '/collections/:name', updateCollection);
router.delete('/collections/:name', deleteCollection);

// ── Document Routes ───────────────────────────────────────────────────────────
router.post(  '/collections/:name/documents',      insertDocument);
router.get(   '/collections/:name/documents',      queryDocuments);
router.get(   '/collections/:name/documents/:id',  getDocument);
router.patch( '/collections/:name/documents/:id',  updateDocument);
router.delete('/collections/:name/documents/:id',  deleteDocument);
router.post(  '/collections/:name/query-vector',   queryVector);

export default router;
