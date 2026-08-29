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
import { register, login, refresh, logout, setupMfaController, verifyMfaController, disableMfaController, changePasswordController, updateProfileController, googleLogin, getConfig, setInitialPasswordController, forgotPassword, resetPassword, exportDataController, deleteAccountController, cancelDeletionController, acceptPolicyController, getActiveNoticeController, submitAppealController, getMeController } from './auth.controller';
import { validateBody, registerSchema, loginSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema } from '../middleware/validate.middleware';
import { checkFailedLoginLockout } from '../middleware/failed-login.middleware';
import { authenticateJwt } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// ── GET /config (Public Discovery - Never rate-limited by authLimiter) ──────
router.get('/config', getConfig);
router.get('/me', authenticateJwt, getMeController);

// ── POST /google ──────────────────────────────────────────────────────────────
router.post('/google', authLimiter, googleLogin);

// ── POST /register ────────────────────────────────────────────────────────────
router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  register,
);

// ── POST /login ───────────────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
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

// ── Profile & Password Routes ─────────────────────────────────────────────────
router.patch('/profile', authenticateJwt, updateProfileController);
router.post('/change-password', authenticateJwt, changePasswordController);
router.post('/set-initial-password', authenticateJwt, setInitialPasswordController);

// ── Data Portability & Account Erasure (GDPR / CCPA) ──────────────────────────
router.get('/export-data', authenticateJwt, exportDataController);
router.delete('/account', authenticateJwt, deleteAccountController);
router.post('/cancel-deletion', authenticateJwt, cancelDeletionController);

// ── Password Recovery ─────────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  validateBody(forgotPasswordSchema),
  forgotPassword
);
router.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  resetPassword
);

// ── Policy Consent & Compliance Notices ───────────────────────────────────────
router.post('/accept-policy', authenticateJwt, acceptPolicyController);
router.get('/active-notice', authenticateJwt, getActiveNoticeController);
router.post('/notice/appeal', authenticateJwt, submitAppealController);

// ── TOTP MFA Routes ───────────────────────────────────────────────────────────
router.post('/mfa/setup', authenticateJwt, setupMfaController);
router.post('/mfa/verify', authenticateJwt, checkFailedLoginLockout, verifyMfaController);
router.post('/mfa/disable', authenticateJwt, disableMfaController);

export default router;
