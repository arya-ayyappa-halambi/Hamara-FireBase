import { Router } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { apiLimiter } from '../middleware/rateLimit.middleware';
import {
  createProject,
  listProjects,
  deleteProject,
  updateProject,
  getAuthConfig,
  updateAuthConfig,
  listWebhooks,
  registerWebhook,
  deleteWebhook
} from './project.controller';

const router = Router();

router.use(authenticateJwt);
router.use(apiLimiter);

router.post('/', createProject);
router.get('/', listProjects);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);
router.get('/:id/auth-config', getAuthConfig);
router.patch('/:id/auth-config', updateAuthConfig);

// Webhook endpoints
router.get('/:id/webhooks', listWebhooks);
router.post('/:id/webhooks', registerWebhook);
router.delete('/:id/webhooks/:webhookId', deleteWebhook);

export default router;
