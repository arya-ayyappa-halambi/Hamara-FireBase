// ─────────────────────────────────────────────────────────────────────────────
//  src/admin/admin.routes.ts
//  Mounted at /api/v1/admin by server.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { requireSuperAdmin } from '../middleware/admin.middleware';
import { getStats, updateRateLimits } from './admin.controller';

const router = Router();

router.use(authenticateJwt);
router.use(requireSuperAdmin);

router.get('/stats', getStats);
router.patch('/rate-limits', updateRateLimits);

export default router;
