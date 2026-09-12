import { Router } from 'express';
import { authenticateJwt, requirePlatformDeveloper } from '../middleware/auth.middleware';
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
  deleteWebhook,
  testWebhook,
  rotateApiKey,
  getProjectStats,
  getWebhookLogs,
  getBackupConfig,
  updateBackupConfig,
  triggerBackup,
  listProjectCollaborators,
  addProjectCollaborator,
  removeProjectCollaborator,
  getProjectThreatIntelligence,
  runProjectSecurityAudit,
  unflagProjectUser,
  quarantineProjectUser,
  exportProjectThreatIntelligence,
  purgeProjectResolvedIncidents
} from './project.controller';

const router = Router();

router.use(authenticateJwt);
router.use(requirePlatformDeveloper);
router.use(apiLimiter);

router.post('/', createProject);
router.get('/', listProjects);
router.get('/:id/stats', getProjectStats);
router.get('/:id/threat-intelligence', getProjectThreatIntelligence);
router.post('/:id/threat-intelligence/run-scan', runProjectSecurityAudit);
router.post('/:id/threat-intelligence/unflag-user/:userId', unflagProjectUser);
router.post('/:id/threat-intelligence/quarantine-user/:userId', quarantineProjectUser);
router.get('/:id/threat-intelligence/export', exportProjectThreatIntelligence);
router.post('/:id/threat-intelligence/purge-resolved', purgeProjectResolvedIncidents);
router.get('/:id/webhook-logs', getWebhookLogs);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);
router.post('/:id/rotate-keys', rotateApiKey);
router.get('/:id/auth-config', getAuthConfig);
router.patch('/:id/auth-config', updateAuthConfig);

router.get('/:id/backup-config', getBackupConfig);
router.patch('/:id/backup-config', updateBackupConfig);
router.post('/:id/backup', triggerBackup);

// Collaborator endpoints
router.get('/:id/collaborators', listProjectCollaborators);
router.post('/:id/collaborators', addProjectCollaborator);
router.delete('/:id/collaborators/:userId', removeProjectCollaborator);

// Webhook endpoints
router.get('/:id/webhooks', listWebhooks);
router.post('/:id/webhooks', registerWebhook);
router.post('/:id/webhooks/test', testWebhook);
router.delete('/:id/webhooks/:webhookId', deleteWebhook);

export default router;
