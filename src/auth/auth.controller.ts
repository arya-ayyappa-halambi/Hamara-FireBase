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
import { registerUser, loginUser, refreshAccessToken, logoutUser, setupMfa, verifyAndEnableMfa } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ApiResponse, AuthResponseData, AppError } from '../types/auth.types';
import { failedLoginService } from '../services/failed-login-limiter.service';

// ── Register ──────────────────────────────────────────────────────────────────

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
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
