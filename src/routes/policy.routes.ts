// ─────────────────────────────────────────────────────────────────────────────
//  src/routes/policy.routes.ts
//  API routes for Platform Policies (Terms, Security & Backup).
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { getCurrentPolicy, updatePolicy } from '../controllers/policy.controller';
import { authenticateJwt } from '../middleware/auth.middleware';
import { requireSuperAdmin } from '../middleware/admin.middleware';

const router = Router();

// Public: Get current active platform policies
router.get('/current', getCurrentPolicy);

// Super Admin: Get and update policies
router.get('/admin', authenticateJwt, requireSuperAdmin, getCurrentPolicy);
router.put('/admin', authenticateJwt, requireSuperAdmin, updatePolicy);

export default router;
