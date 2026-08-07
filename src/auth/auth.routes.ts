// ─────────────────────────────────────────────────────────────────────────────
//  src/auth/auth.routes.ts
//  Defines the Auth module's public route surface.
//
//  Mounted at /api/v1/auth by server.ts, so full paths are:
//    POST /api/v1/auth/register
//    POST /api/v1/auth/login
//    POST /api/v1/auth/refresh
//    POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { register, login, refresh, logout, setupMfaController, verifyMfaController } from './auth.controller';
import { validateBody, registerSchema, loginSchema, refreshTokenSchema } from '../middleware/validate.middleware';
import { checkFailedLoginLockout } from '../middleware/failed-login.middleware';
import { authenticateJwt } from '../middleware/auth.middleware';

const router = Router();

// ── POST /register ────────────────────────────────────────────────────────────
router.post(
  '/register',
  validateBody(registerSchema),
  register,
);

// ── POST /login ───────────────────────────────────────────────────────────────
router.post(
  '/login',
  checkFailedLoginLockout,
  validateBody(loginSchema),
  login,
);

// ── POST /refresh ─────────────────────────────────────────────────────────────
router.post(
  '/refresh',
  validateBody(refreshTokenSchema),
  refresh,
);

// ── POST /logout ──────────────────────────────────────────────────────────────
router.post(
  '/logout',
  validateBody(refreshTokenSchema),
  logout,
);

// ── TOTP MFA Routes ───────────────────────────────────────────────────────────
router.post('/mfa/setup', authenticateJwt, setupMfaController);
router.post('/mfa/verify', authenticateJwt, verifyMfaController);

export default router;
