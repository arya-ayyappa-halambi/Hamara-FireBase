// ─────────────────────────────────────────────────────────────────────────────
//  src/hoster/hoster.routes.ts
//  AegisDB — Hoster API route definitions.
//
//  All routes require a valid JWT (applied at router level via authenticateJwt).
//  Mounted at /api/v1/hoster in server.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authenticateApiKeyOrJwt } from '../middleware/apikey.middleware';
import { apiLimiter } from '../middleware/rateLimit.middleware';
import { uploadProjectMiddleware } from './hoster.service';
import * as controller from './hoster.controller';

const router = Router();

// All hoster routes accept API Key or Bearer token
router.use(authenticateApiKeyOrJwt);
router.use(apiLimiter);

// ── Project deployment ─────────────────────────────────────────────────────────
// POST   /api/v1/hoster/deploy
//   Upload a .zip project and deploy it (Process or Docker mode).
//   Multipart field: "project" → zip file.
//   Body fields: name*, startCommand, image, envVars (JSON string), description, memoryLimitMb
router.post('/deploy', uploadProjectMiddleware, controller.deployHandler);

// ── Deployment listing ─────────────────────────────────────────────────────────
// GET    /api/v1/hoster/deployments
//   List all deployments owned by the authenticated user.
router.get('/deployments', controller.listDeploymentsHandler);

// ── Single deployment CRUD ─────────────────────────────────────────────────────
// GET    /api/v1/hoster/deployments/:id   — Status + live sync
// POST   /api/v1/hoster/deployments/:id/start    — Re-start a stopped/errored deployment
// POST   /api/v1/hoster/deployments/:id/stop     — Gracefully stop a running deployment
// POST   /api/v1/hoster/deployments/:id/restart  — Stop then start
// GET    /api/v1/hoster/deployments/:id/logs     — Tail logs (?lines=N, max 1000)
// DELETE /api/v1/hoster/deployments/:id          — Remove deployment + workspace + port
router.get(    '/deployments/:id',          controller.getDeploymentHandler);
router.post(   '/deployments/:id/start',    controller.startDeploymentHandler);
router.post(   '/deployments/:id/stop',     controller.stopDeploymentHandler);
router.post(   '/deployments/:id/restart',  controller.restartDeploymentHandler);
router.get(    '/deployments/:id/logs',     controller.getLogsHandler);
router.delete( '/deployments/:id',          controller.removeDeploymentHandler);

export default router;
