// ─────────────────────────────────────────────────────────────────────────────
//  src/admin/admin.routes.ts
//  Mounted at /api/v1/admin by server.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { requireSuperAdmin } from '../middleware/admin.middleware';
import { getStats, getUsers, updateRateLimits, updateUserLimits, deleteUser } from './admin.controller';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Only allow Super Admins
router.use(authenticateJwt, requireSuperAdmin);
router.use(apiLimiter);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.patch('/users/:id/limits', updateUserLimits);
router.delete('/users/:id', deleteUser);
router.patch('/rate-limits', updateRateLimits);

export default router;
