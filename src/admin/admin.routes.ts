import { Router } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { requireSuperAdmin } from '../middleware/admin.middleware';
import {
  getStats,
  getUsers,
  updateRateLimits,
  updateUserLimits,
  deleteUser,
  resetUserMfa,
  getSecurityAdvisorReport,
  getAuditLogs,
  listBackups,
  createBackup
} from './admin.controller';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Only allow Super Admins
router.use(authenticateJwt, requireSuperAdmin);
router.use(apiLimiter);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.patch('/users/:id/limits', updateUserLimits);
router.delete('/users/:id', deleteUser);
router.post('/users/:id/reset-mfa', resetUserMfa);
router.patch('/rate-limits', updateRateLimits);
router.get('/security-advisor', getSecurityAdvisorReport);
router.get('/audit-logs', getAuditLogs);
router.get('/backups', listBackups);
router.post('/backups', createBackup);

export default router;
