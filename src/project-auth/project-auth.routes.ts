import { Router } from 'express';
import { registerProjectUser, loginProjectUser, handleOAuthProvider } from './project-auth.controller';
import { authenticateApiKeyOrJwt } from '../middleware/apikey.middleware';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Project-level auth routes require the project API Key (or JWT from dashboard for testing)
router.use(authenticateApiKeyOrJwt);
router.use(apiLimiter);

router.post('/register', registerProjectUser);
router.post('/login', loginProjectUser);
router.post('/oauth/:provider', handleOAuthProvider);

export default router;
