import { Request, Response, NextFunction } from 'express';
import { projectAuthService } from './project-auth.service';
import { AppError } from '../types/auth.types';
import { failedLoginService } from '../services/failed-login-limiter.service';
import { networkAccessService } from '../services/network-access.service';
import jwt from 'jsonwebtoken';
import { envelopeEncryptionService } from '../services/envelope-encryption.service';

function getResolvedProjectId(req: Request): string {
  // 1. Set securely by api-key middleware
  if (req.project && req.project.id) {
    const projectUser = req.projectUser || (req.user as any)?.isProjectUser ? (req.user as any) : undefined;
    if (projectUser?.projectId && projectUser.projectId !== req.project.id) {
      throw new AppError('Access denied: Authentication token does not match the project API key.', 403);
    }
    return req.project.id;
  }
  
  // 2. Used by Dashboard (Admin JWT) or Project User Token
  const headerProjId = req.headers['x-aegis-project-id'] as string;
  const bodyProjId = req.body.projectId as string;
  const user = req.user as any;

  if (user?.isProjectUser && user.projectId) {
    if (headerProjId && headerProjId !== user.projectId) {
      throw new AppError('Access denied: Project users can only access their own project.', 403);
    }
    return user.projectId;
  }

  const projectId = headerProjId || bodyProjId;
  
  if (!projectId) {
    throw new AppError('Project ID is missing. Provide x-aegis-api-key header or x-aegis-project-id header.', 400);
  }

  if (user && !user.isProjectUser) {
    const db = require('../db/sqlite.connection').getDb();
    if (user.isSuperAdmin !== true) {
      const { organizationService } = require('../services/organization.service');
      const role = organizationService.getEffectiveProjectRole(user.sub, projectId);
      if (!role) {
        throw new AppError('Access denied: Project not found or you do not have permission to access it.', 403);
      }
    }
  }

  return projectId;
}

export async function registerProjectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    // Basic bot protection honeypot
    if (req.body._hp_bot_catch) {
      throw new AppError('Suspicious activity detected.', 403);
    }
    const { email, password, provider } = req.body;
    const clientIp = networkAccessService.extractClientIp(req);
    const deviceFingerprint = (req.headers['x-device-fingerprint'] as string | undefined) ||
      (req.headers['x-fb-device-id'] as string | undefined) ||
      (req.headers['x-flare-device-id'] as string | undefined) ||
      req.body.deviceFingerprint;
    
    const result = await projectAuthService.registerUser(projectId, email, password, provider, clientIp, deviceFingerprint);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function loginProjectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = req.ip || 'unknown';
  const email = req.body?.email || '';

  try {
    const projectId = getResolvedProjectId(req);
    const { password } = req.body;

    const result = await projectAuthService.loginUser(projectId, email, password);
    failedLoginService.recordSuccessfulLogin(ip, email);

    res.status(200).json({
      success: true,
      message: 'User logged in successfully.',
      data: result
    });
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

export async function handleOAuthProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const { provider } = req.params;
    const { token } = req.body;

    const result = await projectAuthService.handleOAuth(projectId, provider, token);

    res.status(200).json({
      success: true,
      message: `User authenticated via ${provider} successfully.`,
      data: result
    });
  } catch (err) { next(err); }
}

export async function refreshProjectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const { refreshToken } = req.body;

    const result = await projectAuthService.rotateRefreshToken(projectId, refreshToken);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully.',
      data: result
    });
  } catch (err) { next(err); }
}

export async function logoutProjectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const { refreshToken } = req.body;

    await projectAuthService.logoutUser(projectId, refreshToken);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
      data: null
    });
  } catch (err) { next(err); }
}

export async function deleteProjectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    
    // Security: Only allow Service Role or Project Owner
    if (!req.isServiceRole && (!req.user || (req.user as any).isProjectUser)) {
      throw new AppError('Access denied: This operation requires a Service Role Key or Project Owner privileges.', 403);
    }

    const userId = req.params.id;
    
    await projectAuthService.deleteProjectUser(projectId, userId, undefined, false);
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully.'
    });
  } catch (err) { next(err); }
}

export async function listProjectUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    
    // Security: Only allow Service Role or Project Owner
    if (!req.isServiceRole && (!req.user || (req.user as any).isProjectUser)) {
      throw new AppError('Access denied: This operation requires a Service Role Key or Project Owner privileges.', 403);
    }

    // Directly query the db for simplicity here (or move to service)
    const db = require('../db/sqlite.connection').getDb();
    const usersRaw = db.prepare('SELECT id, email, provider, role, customClaims, status, createdAt, lastLoginAt FROM project_users WHERE projectId = ? ORDER BY createdAt DESC').all(projectId) as any[];
    
    const users = usersRaw.map(u => ({
      ...u,
      role: u.role || 'viewer',
      status: u.status || 'active',
      email: envelopeEncryptionService.decryptField(
        typeof u.email === 'string' && u.email.startsWith('{') ? JSON.parse(u.email) : u.email,
        projectId
      ) || u.email
    }));

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully.',
      data: users
    });
  } catch (err) { next(err); }
}

export async function attestApp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientAttestationToken } = req.body;
    const project = req.project;
    if (!project) {
      throw new AppError('Project context required for App Check attestation.', 400);
    }
    
    if (!clientAttestationToken) {
      throw new AppError('Client attestation token is required.', 400);
    }
    
    const secret = `${process.env.JWT_SECRET}::${project.id}`;
    const token = jwt.sign(
      { projectId: project.id, exp: Math.floor(Date.now() / 1000) + 3600 },
      secret
    );
    
    res.status(200).json({ success: true, message: 'Attestation successful.', data: { token } });
  } catch (err) { next(err); }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    
    // Security: Only allow Service Role or Project Owner
    if (!req.isServiceRole && (!req.user || (req.user as any).isProjectUser)) {
      throw new AppError('Access denied: This operation requires a Service Role Key or Project Owner privileges.', 403);
    }

    const userId = req.params.id;
    const { role, customClaims } = req.body;
    
    if (!role) {
      throw new AppError('Role is required.', 400);
    }
    
    await projectAuthService.updateUserRoleAndClaims(projectId, userId, role, customClaims);
    
    res.status(200).json({
      success: true,
      message: 'User role and custom claims updated successfully.'
    });
  } catch (err) { next(err); }
}

export async function getPublicProjectAuthConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const db = require('../db/sqlite.connection').getDb();
    const proj = db.prepare('SELECT authConfig FROM projects WHERE id = ?').get(projectId);
    let authConfig = proj?.authConfig ? JSON.parse(proj.authConfig) : { email: { enabled: true }, google: { enabled: false } };
    
    // Sanitize to only expose public client IDs and registration policy
    const publicConfig: Record<string, any> = {
      allowPublicRegistration: authConfig.allowPublicRegistration !== false
    };
    if (authConfig.email) publicConfig.email = { enabled: authConfig.email.enabled !== false };
    
    const googleId = (authConfig.google?.clientId || '').trim();
    publicConfig.google = { enabled: !!authConfig.google?.enabled && googleId.length > 0, clientId: googleId };

    const appleId = (authConfig.apple?.clientId || '').trim();
    publicConfig.apple = { enabled: !!authConfig.apple?.enabled && appleId.length > 0, clientId: appleId };

    const githubId = (authConfig.github?.clientId || '').trim();
    publicConfig.github = { enabled: !!authConfig.github?.enabled && githubId.length > 0, clientId: githubId };

    publicConfig.magicLink = { enabled: !!authConfig.magicLink?.enabled };
    publicConfig.passkeys = { enabled: !!authConfig.passkeys?.enabled };
    publicConfig.anonymous = { enabled: !!authConfig.anonymous?.enabled };

    res.status(200).json({ success: true, data: publicConfig });
  } catch (err) { next(err); }
}

// ── End-User Data Portability & Account Erasure (GDPR Art. 17 & 20) ───────────

export async function exportProjectUserData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const userId = (req as any).projectUser?.sub || (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required. Provide a valid Bearer token.', 401);

    const exportData = await projectAuthService.exportUserData(projectId, userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="project_user_data_${userId.substring(0, 8)}.json"`);
    res.status(200).json({
      success: true,
      message: 'User data export generated successfully.',
      data: exportData
    });
  } catch (err) { next(err); }
}

export async function deleteProjectUserSelf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const userId = (req as any).projectUser?.sub || (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required. Provide a valid Bearer token.', 401);

    const { password } = req.body;
    const result = await projectAuthService.deleteProjectUser(projectId, userId, password, true);

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

export async function cancelProjectUserSelf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const userId = (req as any).projectUser?.sub || (req as any).user?.sub || (req as any).user?.id;
    if (!userId) throw new AppError('Authentication required. Provide a valid Bearer token.', 401);

    const result = await projectAuthService.cancelProjectUserDeletion(projectId, userId, 'user');

    res.status(200).json({
      success: true,
      message: result.message,
      data: null
    });
  } catch (err) { next(err); }
}

export async function deleteProjectUserAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projectId = getResolvedProjectId(req);
    const { userId } = req.params;
    if (!userId) throw new AppError('User ID is required.', 400);

    const result = await projectAuthService.deleteProjectUser(projectId, userId, undefined, false);

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



