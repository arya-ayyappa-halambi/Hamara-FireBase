// ─────────────────────────────────────────────────────────────────────────────
//  src/auth/auth.controller.ts
//  HTTP adapter layer for authentication.
//
//  Controllers do exactly three things:
//    1. Extract and shape data from the HTTP request
//    2. Call the appropriate service function
//    3. Send the HTTP response (or forward errors to next())
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { registerUser, loginUser, refreshAccessToken, logoutUser, setupMfa, verifyAndEnableMfa, disableMfa, changePassword, updateUserProfile, googleLoginUser, requestPasswordReset, executePasswordReset } from './auth.service';
import { projectAuthService } from '../project-auth/project-auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ApiResponse, AuthResponseData, AppError } from '../types/auth.types';
import { failedLoginService } from '../services/failed-login-limiter.service';
import { verifyGoogleToken } from './auth.google';
import { getDb } from '../db/sqlite.connection';
import { userStore } from '../store/user.store';
import { networkAccessService } from '../services/network-access.service';

// ── Google Auth & Config ──────────────────────────────────────────────────────

export async function getConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT googleAuthEnabled, googleClientId, demoLoginEnabled, magicLinkAuthEnabled, passkeyAuthEnabled FROM platform_settings WHERE id = ?').get('default') as any;
    
    const envGoogleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    const googleClientId = envGoogleClientId || (settings?.googleClientId ? settings.googleClientId : '');
    const googleAuthEnabled = Boolean(envGoogleClientId || (settings && settings.googleAuthEnabled === 1));

    res.status(200).json({
      success: true,
      message: 'Auth config retrieved',
      data: {
        googleAuthEnabled,
        googleClientId,
        demoLoginEnabled: settings ? (settings.demoLoginEnabled === 1 || settings.demoLoginEnabled === true) : true,
        magicLinkAuthEnabled: settings ? (settings.magicLinkAuthEnabled === 1 || settings.magicLinkAuthEnabled === true) : false,
        passkeyAuthEnabled: settings ? (settings.passkeyAuthEnabled === 1 || settings.passkeyAuthEnabled === true) : false
      }
    });
  } catch (err) { next(err); }
}

export async function googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = networkAccessService.extractClientIp(req);
  try {
    const { token } = req.body;
    if (!token) throw new AppError('Google token is required.', 400);

    const apiKey = (req.headers['x-aegis-api-key'] as string | undefined) || (req.project as any)?.apiKey;
    const headerProjId = req.headers['x-aegis-project-id'] as string | undefined;
    const bodyProjId = req.body.projectId as string | undefined;

    // If an API key or project header is present, route this to projectAuthService (project end-user)
    if (apiKey || headerProjId || bodyProjId || req.project?.id) {
      let projectId = req.project?.id || headerProjId || bodyProjId;
      if (!projectId && apiKey) {
        const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const proj = getDb().prepare('SELECT id FROM projects WHERE apiKeyHash = ?').get(hash) as any;
        if (!proj) {
          throw new AppError('Invalid x-aegis-api-key provided.', 401);
        }
        projectId = proj.id;
      }
      if (!projectId) {
        throw new AppError('Project ID is required for project user login.', 400);
      }

      const result = await projectAuthService.handleOAuth(projectId, 'google', token);
      failedLoginService.recordSuccessfulLogin(ip, result.user.email);
      res.status(200).json({
        success: true,
        message: 'Project user logged in with Google successfully.',
        data: result
      });
      return;
    }

    const { email, name } = await verifyGoogleToken(token);
    const userAgent = req.headers['user-agent'] as string | undefined;
    
    const data = await googleLoginUser(email, name, ip, userAgent);
    failedLoginService.recordSuccessfulLogin(ip, email);

    const response: ApiResponse<AuthResponseData> = {
      success: true,
      message: 'Logged in with Google successfully.',
      data,
    };

    res.status(200).json(response);
  } catch (err) { next(err); }
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Basic bot protection honeypot
    if (req.body._hp_bot_catch) {
      throw new AppError('Suspicious activity detected.', 403);
    }

    const apiKey = (req.headers['x-aegis-api-key'] as string | undefined) || (req.project as any)?.apiKey;
    const headerProjId = req.headers['x-aegis-project-id'] as string | undefined;
    const bodyProjId = req.body.projectId as string | undefined;

    // If an API key or project header is present, route this to projectAuthService (project end-user)
    if (apiKey || headerProjId || bodyProjId || req.project?.id) {
      let projectId = req.project?.id || headerProjId || bodyProjId;
      if (!projectId && apiKey) {
        const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const proj = getDb().prepare('SELECT id FROM projects WHERE apiKeyHash = ?').get(hash) as any;
        if (!proj) {
          throw new AppError('Invalid x-aegis-api-key provided.', 401);
        }
        projectId = proj.id;
      }
      if (!projectId) {
        throw new AppError('Project ID is required for project user registration.', 400);
      }

      const result = await projectAuthService.registerUser(projectId, req.body.email, req.body.password, req.body.provider || 'email');
      res.status(201).json({
        success: true,
        message: 'Project user registered successfully.',
        data: result
      });
      return;
    }

    const ip = networkAccessService.extractClientIp(req);
    const dto: RegisterDto & { clientIp?: string; userAgent?: string } = {
      email:    req.body.email,
      password: req.body.password,
      name:     req.body.name,
      clientIp: ip,
      userAgent: req.headers['user-agent'] as string,
    };

    const data = await registerUser(dto);

    const response: ApiResponse<AuthResponseData> = {
      success: true,
      message: 'Account created successfully.',
      data,
    };

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = networkAccessService.extractClientIp(req);
  const email = req.body?.email || '';

  try {
    const apiKey = (req.headers['x-aegis-api-key'] as string | undefined) || (req.project as any)?.apiKey;
    const headerProjId = req.headers['x-aegis-project-id'] as string | undefined;
    const bodyProjId = req.body.projectId as string | undefined;

    // If an API key or project header is present, route this to projectAuthService (project end-user)
    if (apiKey || headerProjId || bodyProjId || req.project?.id) {
      let projectId = req.project?.id || headerProjId || bodyProjId;
      if (!projectId && apiKey) {
        const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const proj = getDb().prepare('SELECT id FROM projects WHERE apiKeyHash = ?').get(hash) as any;
        if (!proj) {
          throw new AppError('Invalid x-aegis-api-key provided.', 401);
        }
        projectId = proj.id;
      }
      if (!projectId) {
        throw new AppError('Project ID is required for project user login.', 400);
      }

      const result = await projectAuthService.loginUser(projectId, req.body.email, req.body.password);
      failedLoginService.recordSuccessfulLogin(ip, email);
      res.status(200).json({
        success: true,
        message: 'Project user logged in successfully.',
        data: result
      });
      return;
    }

    const dto: LoginDto & { totpCode?: string; clientIp?: string; userAgent?: string } = {
      email:    req.body.email,
      password: req.body.password,
      totpCode: req.body.totpCode,
      clientIp: ip,
      userAgent: req.headers['user-agent'] as string,
    };

    const data = await loginUser(dto);
    failedLoginService.recordSuccessfulLogin(ip, email);

    const response: ApiResponse<AuthResponseData> = {
      success: true,
      message: 'Logged in successfully.',
      data,
    };

    res.status(200).json(response);
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 401) {
      const result = failedLoginService.recordFailedAttempt(ip, email);
      if (result.locked) {
        res.setHeader('Retry-After', result.remainingSec);
        return next(new AppError(`Account temporarily locked due to 5 consecutive failed login attempts. Please try again in 15 minutes.`, 429));
      }
    }
    next(err);
  }
}

// ── Refresh Token ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/refresh
 *
 * Validates the refresh token, performs token rotation, and returns a new access JWT + new refresh token.
 */
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto: RefreshTokenDto = {
      refreshToken: req.body.refreshToken,
    };

    const data = await refreshAccessToken(dto.refreshToken);

    const response: ApiResponse<AuthResponseData> = {
      success: true,
      message: 'Token refreshed successfully.',
      data,
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/logout
 *
 * Revokes the provided refresh token.
 */
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto: RefreshTokenDto = {
      refreshToken: req.body.refreshToken,
    };

    await logoutUser(dto.refreshToken);

    const response: ApiResponse<null> = {
      success: true,
      message: 'Logged out successfully.',
      data: null,
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

// ── MFA Setup & Verify Handlers ───────────────────────────────────────────────

export async function setupMfaController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const data = await setupMfa(userId);
    res.status(200).json({
      success: true,
      message: 'MFA setup initialized.',
      data
    });
  } catch (err) { next(err); }
}

export async function verifyMfaController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { totpCode } = req.body;
    if (!totpCode) throw new AppError('TOTP code is required.', 400);

    await verifyAndEnableMfa(userId, totpCode);
    res.status(200).json({
      success: true,
      message: 'MFA successfully enabled for account.',
      data: { mfaEnabled: true }
    });
  } catch (err) { next(err); }
}

export async function disableMfaController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { password, totpCode } = req.body;
    if (!password) throw new AppError('Account password is required for security verification.', 400);
    if (!totpCode) throw new AppError('Current 6-digit TOTP code is required for security verification.', 400);

    await disableMfa(userId, password, totpCode);
    res.status(200).json({
      success: true,
      message: 'MFA successfully disabled.',
      data: { mfaEnabled: false }
    });
  } catch (err) { next(err); }
}

export async function changePasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { currentPassword, newPassword, totpCode } = req.body;
    if (!currentPassword) throw new AppError('Current password is required.', 400);
    if (!newPassword) throw new AppError('New password is required.', 400);

    await changePassword(userId, currentPassword, newPassword, totpCode);
    res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
      data: null
    });
  } catch (err) { next(err); }
}

export async function setInitialPasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { newPassword } = req.body;
    if (!newPassword) throw new AppError('New password is required.', 400);

    const { setInitialPassword } = await import('./auth.service');
    await setInitialPassword(userId, newPassword);
    
    res.status(200).json({
      success: true,
      message: 'Initial password set successfully.',
      data: null
    });
  } catch (err) { next(err); }
}

export async function updateProfileController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { name, email, currentPassword } = req.body;
    if (!name) throw new AppError('Name is required.', 400);

    const updatedUser = await updateUserProfile(userId, name, email, currentPassword);
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: { user: updatedUser }
    });
  } catch (err) { next(err); }
}

// ── Password Recovery ─────────────────────────────────────────────────────────

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    await requestPasswordReset(email);
    res.status(200).json({
      success: true,
      message: 'If an account matches that email, a reset request has been logged and an email has been sent if SMTP is configured.',
    });
  } catch (err) { next(err); }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body;
    await executePasswordReset(token, password);
    res.status(200).json({
      success: true,
      message: 'Password has been successfully reset.',
    });
  } catch (err) { next(err); }
}

// ── Data Portability & Account Deletion (GDPR / CCPA) ─────────────────────────

export async function exportDataController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { exportDeveloperData } = require('./auth.service');
    const exportData = await exportDeveloperData(userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="aegisdb_data_export_${userId.substring(0, 8)}.json"`);
    res.status(200).json({
      success: true,
      message: 'Data export generated successfully.',
      data: exportData
    });
  } catch (err) { next(err); }
}

export async function deleteAccountController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { password, totpCode } = req.body;
    if (!password) {
      throw new AppError('Password is required to confirm account deletion.', 400);
    }

    const { deleteDeveloperAccount } = require('./auth.service');
    const result = await deleteDeveloperAccount(userId, password, totpCode);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        scheduledDeletionAt: result.scheduledDeletionAt,
        daysRemaining: result.daysRemaining
      }
    });
  } catch (err) { next(err); }
}

export async function cancelDeletionController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { cancelDeveloperAccountDeletion } = require('./auth.service');
    const result = await cancelDeveloperAccountDeletion(userId, 'user');

    res.status(200).json({
      success: true,
      message: result.message,
      data: null
    });
  } catch (err) { next(err); }
}

export async function acceptPolicyController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);
    const { version } = req.body;
    if (!version) throw new AppError('Policy version is required.', 400);

    const { acceptPlatformPolicy } = require('./auth.service');
    const result = await acceptPlatformPolicy(userId, version);

    res.status(200).json({
      success: true,
      message: `Accepted platform policy version ${version} successfully.`,
      data: result
    });
  } catch (err) { next(err); }
}

export async function getActiveNoticeController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { getActiveUserNotice } = require('./auth.service');
    const notice = await getActiveUserNotice(userId);

    res.status(200).json({
      success: true,
      message: notice ? 'Active compliance notice retrieved.' : 'No active notice.',
      data: notice
    });
  } catch (err) { next(err); }
}

export async function submitAppealController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { noticeId, explanation } = req.body;
    if (!noticeId || !explanation) {
      throw new AppError('Notice ID and explanation text are required.', 400);
    }

    const { submitNoticeAppeal } = require('./auth.service');
    const result = await submitNoticeAppeal(userId, noticeId, explanation);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) { next(err); }
}

export async function getMeController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required.', 401);

    const user = await userStore.findById(userId);
    if (!user) throw new AppError('User not found.', 404);

    const { passwordHash: _omit, ...publicUser } = user;
    res.status(200).json({
      success: true,
      user: publicUser
    });
  } catch (err) { next(err); }
}

export async function redeemOttController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body;
    if (!token) throw new AppError('One-Time Token is required.', 400);

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || '127.0.0.1';
    const { remoteOttAccessService } = require('../services/remote-ott-access.service');
    const result = remoteOttAccessService.redeemOneTimeToken(token, clientIp);

    if (!result.valid) {
      throw new AppError(result.reason || 'Invalid or expired One-Time Token.', 401);
    }

    res.status(200).json({
      success: true,
      message: 'One-Time Token redeemed successfully. Authenticated as Super Administrator.',
      token: result.jwtToken,
      user: result.user
    });
  } catch (err) { next(err); }
}

export async function requestDeviceAccessController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deviceName } = req.body || {};
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown Device';

    const { remoteOttAccessService } = require('../services/remote-ott-access.service');
    const request = remoteOttAccessService.submitDeviceAccessRequest({
      ipAddress: clientIp,
      userAgent,
      deviceName
    });

    res.status(201).json({
      success: true,
      message: 'Device access request submitted. Awaiting Super Admin authorization.',
      data: request
    });
  } catch (err) { next(err); }
}



