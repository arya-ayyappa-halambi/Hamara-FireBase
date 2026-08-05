import { Router } from 'express';
import { registerProjectUser, loginProjectUser, handleOAuthProvider, listProjectUsers, deleteProjectUser, attestApp } from './project-auth.controller';
import { authenticateApiKeyOrJwt } from '../middleware/apikey.middleware';
import { enforceAppCheck } from '../middleware/appcheck.middleware';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Project-level auth routes require the project API Key (or JWT from dashboard for testing)
router.use(authenticateApiKeyOrJwt);
router.use(apiLimiter);

// Attestation itself does not require App Check
router.post('/attest', attestApp);

// Other routes require strict App Check (if enabled on project)
router.post('/register', enforceAppCheck, registerProjectUser);
router.post('/login', enforceAppCheck, loginProjectUser);
router.post('/oauth/:provider', enforceAppCheck, handleOAuthProvider);

// Admin routes for managing project users
router.get('/users', enforceAppCheck, listProjectUsers);
router.delete('/users/:id', enforceAppCheck, deleteProjectUser);

export default router;
