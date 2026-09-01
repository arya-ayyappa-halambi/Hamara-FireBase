// ─────────────────────────────────────────────────────────────────────────────
//  src/auth/user-feature.controller.ts
//  HTTP Controller for Magic Links, Active Sessions, PATs, and Security Logs
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { magicLinkService } from '../services/magic-link.service';
import { userSessionService } from '../services/user-session.service';
import { patService, PatScope } from '../services/pat.service';
import { generateToken, toPublicUser } from './auth.service';
import { tokenFamilyService } from '../services/token-family.service';
import { networkAccessService } from '../services/network-access.service';
import { userStore } from '../store/user.store';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';

// ── 1. Magic Link / Email OTP Handlers ─────────────────────────────────────────

export async function requestMagicLinkHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT magicLinkAuthEnabled FROM platform_settings WHERE id = ?').get('default') as any;
    if (!settings || (settings.magicLinkAuthEnabled !== 1 && settings.magicLinkAuthEnabled !== true)) {
      throw new AppError('Passwordless Magic Link & Email OTP authentication is disabled by the administrator.', 403);
    }

    const { email } = req.body;
    if (!email) throw new AppError('Email is required.', 400);

    const { magicToken, otpCode, expiresAt } = magicLinkService.generateMagicAuth(email);
    const origin = req.headers.origin || `http://${req.headers.host || 'localhost:3000'}`;
    const magicUrl = `${origin}/?magicToken=${magicToken}`;

    res.status(200).json({
      success: true,
      message: 'Magic authentication link & 6-digit code generated.',
      data: {
        email,
        magicToken,
        otpCode, // Displayed in development/demo mode for convenience
        magicUrl,
        expiresAt
      }
    });
  } catch (err) { next(err); }
}

export async function verifyMagicAuthHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT magicLinkAuthEnabled FROM platform_settings WHERE id = ?').get('default') as any;
    if (!settings || (settings.magicLinkAuthEnabled !== 1 && settings.magicLinkAuthEnabled !== true)) {
      throw new AppError('Passwordless Magic Link & Email OTP authentication is disabled by the administrator.', 403);
    }

    const { token, otpCode, email } = req.body;
    const { userId } = magicLinkService.verifyMagicAuth({ token, otpCode, email });

    const user = await userStore.findById(userId);
    if (!user) throw new AppError('User not found.', 404);

    const clientIp = networkAccessService.extractClientIp(req);
    const userAgent = req.headers['user-agent'] as string;

    const { verifyAdminLoginSecurity } = await import('./auth.service');
    verifyAdminLoginSecurity(user, clientIp);

    const authToken = generateToken(user);
    const { refreshToken } = tokenFamilyService.createTokenFamily(user.id);

    userSessionService.registerSession({
      userId: user.id,
      refreshToken,
      ipAddress: clientIp,
      userAgent
    });

    userSessionService.logSecurityAction({
      userId: user.id,
      actionType: 'login_magic_link_success',
      ipAddress: clientIp,
      userAgent,
      details: 'Logged in via passwordless Magic Link / OTP'
    });

    res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      data: {
        user: toPublicUser(user),
        token: authToken,
        refreshToken
      }
    });
  } catch (err) { next(err); }
}

// ── 2. User Active Sessions Handlers ──────────────────────────────────────────

export async function listUserSessionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const currentRefreshToken = req.headers['x-refresh-token'] as string | undefined;
    const sessions = userSessionService.listUserSessions(userId, currentRefreshToken);

    res.status(200).json({
      success: true,
      message: 'Active sessions retrieved.',
      data: sessions
    });
  } catch (err) { next(err); }
}

export async function revokeUserSessionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { sessionId } = req.params;
    const success = userSessionService.revokeSession(userId, sessionId);
    if (!success) throw new AppError('Session not found or already revoked.', 404);

    res.status(200).json({
      success: true,
      message: 'Session revoked successfully. Remote device has been logged out.',
      data: null
    });
  } catch (err) { next(err); }
}

export async function revokeAllOtherSessionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const currentRefreshToken = req.headers['x-refresh-token'] as string | undefined;
    const count = userSessionService.revokeAllOtherSessions(userId, currentRefreshToken);

    res.status(200).json({
      success: true,
      message: `Logged out of ${count} other active device(s).`,
      data: { revokedCount: count }
    });
  } catch (err) { next(err); }
}

// ── 3. User Security & Activity Logs Handlers ─────────────────────────────────

export async function listUserSecurityLogsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const limit = Number(req.query.limit || 50);
    const logs = userSessionService.listUserSecurityLogs(userId, limit);

    res.status(200).json({
      success: true,
      message: 'User security activity logs retrieved.',
      data: logs
    });
  } catch (err) { next(err); }
}

// ── 4. Personal Access Tokens (PATs) Handlers ─────────────────────────────────

export async function listPatsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const pats = patService.listUserPats(userId);
    res.status(200).json({
      success: true,
      message: 'Personal access tokens retrieved.',
      data: pats
    });
  } catch (err) { next(err); }
}

export async function createPatHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { name, scopes, expirationDays } = req.body;
    const pat = patService.createPat({
      userId,
      name,
      scopes: scopes as PatScope[],
      expirationDays: expirationDays !== undefined ? Number(expirationDays) : 30
    });

    userSessionService.logSecurityAction({
      userId,
      actionType: 'pat_created',
      ipAddress: networkAccessService.extractClientIp(req),
      userAgent: req.headers['user-agent'] as string,
      details: `Generated Personal Access Token "${pat.name}" with scopes: ${pat.scopes.join(', ')}`
    });

    res.status(201).json({
      success: true,
      message: 'Personal Access Token created successfully. Copy it now, as it will not be shown again.',
      data: pat
    });
  } catch (err) { next(err); }
}

export async function revokePatHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { id } = req.params;
    const revoked = patService.revokePat(userId, id);
    if (!revoked) throw new AppError('PAT not found.', 404);

    userSessionService.logSecurityAction({
      userId,
      actionType: 'pat_revoked',
      ipAddress: networkAccessService.extractClientIp(req),
      userAgent: req.headers['user-agent'] as string,
      details: `Revoked Personal Access Token ID ${id}`
    });

    res.status(200).json({
      success: true,
      message: 'Personal Access Token revoked successfully.',
      data: null
    });
  } catch (err) { next(err); }
}
