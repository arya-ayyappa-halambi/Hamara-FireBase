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
import { register, login, refresh, logout, setupMfaController, verifyMfaController, disableMfaController, changePasswordController, updateProfileController, googleLogin, getConfig, setInitialPasswordController, forgotPassword, resetPassword, exportDataController, deleteAccountController, cancelDeletionController, acceptPolicyController, getActiveNoticeController, submitAppealController, getMeController, redeemOttController, requestDeviceAccessController } from './auth.controller';
import { validateBody, registerSchema, loginSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema } from '../middleware/validate.middleware';
import { checkFailedLoginLockout } from '../middleware/failed-login.middleware';
import { authenticateJwt, requirePlatformDeveloper } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// ── GET /config (Public Discovery - Never rate-limited by authLimiter) ──────
router.get('/config', getConfig);
router.get('/me', authenticateJwt, requirePlatformDeveloper, getMeController);

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
router.patch('/profile', authenticateJwt, requirePlatformDeveloper, updateProfileController);
router.post('/change-password', authenticateJwt, requirePlatformDeveloper, changePasswordController);
router.post('/set-initial-password', authenticateJwt, requirePlatformDeveloper, setInitialPasswordController);

// ── Data Portability & Account Erasure (GDPR / CCPA) ──────────────────────────
router.get('/export-data', authenticateJwt, requirePlatformDeveloper, exportDataController);
router.delete('/account', authenticateJwt, requirePlatformDeveloper, deleteAccountController);
router.post('/cancel-deletion', authenticateJwt, requirePlatformDeveloper, cancelDeletionController);

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
router.post('/accept-policy', authenticateJwt, requirePlatformDeveloper, acceptPolicyController);
router.get('/active-notice', authenticateJwt, requirePlatformDeveloper, getActiveNoticeController);
router.post('/notice/appeal', authenticateJwt, requirePlatformDeveloper, submitAppealController);

// ── TOTP MFA Routes ───────────────────────────────────────────────────────────
router.post('/mfa/setup', authenticateJwt, requirePlatformDeveloper, setupMfaController);
router.post('/mfa/verify', authenticateJwt, requirePlatformDeveloper, checkFailedLoginLockout, verifyMfaController);
router.post('/mfa/disable', authenticateJwt, requirePlatformDeveloper, disableMfaController);

// ── Ephemeral One-Time Token (OTT) & Zero-Trust Device Approvals ───────────
router.post('/ott/redeem', authLimiter, redeemOttController);
router.post('/device-access/request', authLimiter, requestDeviceAccessController);

// ── Passkeys / WebAuthn (FIDO2) ───────────────────────────────────────────────
import {
  getRegistrationOptionsHandler,
  verifyRegistrationHandler,
  getLoginOptionsHandler,
  verifyLoginAssertionHandler,
  listPasskeysHandler,
  deletePasskeyHandler
} from './passkey.controller';

router.post('/passkeys/register-options', authenticateJwt, requirePlatformDeveloper, getRegistrationOptionsHandler);
router.post('/passkeys/register-verify', authenticateJwt, requirePlatformDeveloper, verifyRegistrationHandler);
router.get('/passkeys/login-options', getLoginOptionsHandler);
router.post('/passkeys/login-verify', authLimiter, verifyLoginAssertionHandler);
router.get('/passkeys', authenticateJwt, requirePlatformDeveloper, listPasskeysHandler);
router.delete('/passkeys/:id', authenticateJwt, requirePlatformDeveloper, deletePasskeyHandler);

// ── Passwordless Magic Link & Email OTP ───────────────────────────────────────
import {
  requestMagicLinkHandler,
  verifyMagicAuthHandler,
  listUserSessionsHandler,
  revokeUserSessionHandler,
  revokeAllOtherSessionsHandler,
  listUserSecurityLogsHandler,
  listPatsHandler,
  createPatHandler,
  revokePatHandler
} from './user-feature.controller';

router.post('/magic-link/request', authLimiter, requestMagicLinkHandler);
router.post('/magic-link/verify', authLimiter, verifyMagicAuthHandler);

// ── User Active Sessions (1-Click Remote Logout) ──────────────────────────────
router.get('/sessions', authenticateJwt, requirePlatformDeveloper, listUserSessionsHandler);
router.delete('/sessions/other', authenticateJwt, requirePlatformDeveloper, revokeAllOtherSessionsHandler);
router.delete('/sessions/:sessionId', authenticateJwt, requirePlatformDeveloper, revokeUserSessionHandler);

// ── User Security & Activity Logs ─────────────────────────────────────────────
router.get('/security-logs', authenticateJwt, requirePlatformDeveloper, listUserSecurityLogsHandler);

// ── Personal Access Tokens (PATs) ─────────────────────────────────────────────
router.get('/pats', authenticateJwt, requirePlatformDeveloper, listPatsHandler);
router.post('/pats', authenticateJwt, requirePlatformDeveloper, createPatHandler);
router.delete('/pats/:id', authenticateJwt, requirePlatformDeveloper, revokePatHandler);

export default router;
