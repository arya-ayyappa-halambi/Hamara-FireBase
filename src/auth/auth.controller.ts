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
import { registerUser, loginUser, refreshAccessToken, logoutUser, setupMfa, verifyAndEnableMfa, disableMfa, changePassword, updateUserProfile, googleLoginUser } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ApiResponse, AuthResponseData, AppError } from '../types/auth.types';
import { failedLoginService } from '../services/failed-login-limiter.service';
import { verifyGoogleToken } from './auth.google';
import { getDb } from '../db/sqlite.connection';

// ── Google Auth & Config ──────────────────────────────────────────────────────

export async function getConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT googleAuthEnabled, googleClientId FROM platform_settings WHERE id = ?').get('default') as any;
    
    res.status(200).json({
      success: true,
      message: 'Auth config retrieved',
      data: {
        googleAuthEnabled: settings ? settings.googleAuthEnabled === 1 : false,
        googleClientId: settings ? settings.googleClientId : ''
      }
    });
  } catch (err) { next(err); }
}

export async function googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = req.ip || 'unknown';
  try {
    const { token } = req.body;
    if (!token) throw new AppError('Google token is required.', 400);

    const { email, name } = await verifyGoogleToken(token);
    
    const data = await googleLoginUser(email, name);
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
    const dto: RegisterDto = {
      email:    req.body.email,
      password: req.body.password,
      name:     req.body.name,
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
  const ip = req.ip || 'unknown';
  const email = req.body?.email || '';

  try {
    const dto: LoginDto & { totpCode?: string } = {
      email:    req.body.email,
      password: req.body.password,
      totpCode: req.body.totpCode,
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
