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
import { registerUser, loginUser, refreshAccessToken, logoutUser } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ApiResponse, AuthResponseData } from '../types/auth.types';

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
  try {
    const dto: LoginDto = {
      email:    req.body.email,
      password: req.body.password,
    };

    const data = await loginUser(dto);

    const response: ApiResponse<AuthResponseData> = {
      success: true,
      message: 'Logged in successfully.',
      data,
    };

    res.status(200).json(response);
  } catch (err) {
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
