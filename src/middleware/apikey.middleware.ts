// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/apikey.middleware.ts
//  API Key Authentication Middleware.
//
//  Intercepts requests with header `x-aegis-api-key: aegis_pk_...`, verifies hash,
//  and populates req.project and req.user.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { projectService } from '../project/project.service';
import { authenticateJwt, extractBearerToken } from './auth.middleware';
import { AppError } from '../types/auth.types';
import { auditLogService } from '../services/audit-log.service';

function isBrowserContext(req: Request): boolean {
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  
  if (origin || secFetchMode) return true;
  // Exclude dashboard requests on port 3000
  if (referer && !referer.includes('localhost:3000') && !referer.includes('127.0.0.1:3000')) {
    return true;
  }
  return false;
}

export function authenticateApiKeyOrJwt(req: Request, res: Response, next: NextFunction): void {
  const apiKeyCandidate =
    (req.headers['x-flare-api-key'] as string) ||
    (req.headers['x-aegis-api-key'] as string) ||
    (req.headers['x-api-key'] as string) ||
    (req.headers['apikey'] as string) ||
    (req.query?.apiKey as string) ||
    (req.query?.apikey as string);

  if (apiKeyCandidate && typeof apiKeyCandidate === 'string') {
    const rawApiKey = apiKeyCandidate.trim();
    const isAnonKey = rawApiKey.startsWith('flare_pk_') || rawApiKey.startsWith('aegis_pk_');
    const isServiceKey = rawApiKey.startsWith('flare_sk_') || rawApiKey.startsWith('aegis_sk_');

    if (!isAnonKey && !isServiceKey) {
      return next(new AppError('Invalid API Key format. API keys must start with "flare_pk_", "flare_sk_", "aegis_pk_", or "aegis_sk_".', 401));
    }

    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
    let project;
    let isServiceRole = false;

    if (isAnonKey) {
      project = projectService.getProjectByApiKeyHash(apiKeyHash);
    } else {
      // Service Role Key: check if from browser context
      if (isBrowserContext(req)) {
        return next(new AppError('Security violation: Service role keys must not be exposed in client-side/browser environments.', 403));
      }
      project = projectService.getProjectByServiceKeyHash(apiKeyHash);
      isServiceRole = true;
    }

    if (!project) {
      return next(new AppError('Invalid API Key provided.', 401));
    }

    if (isServiceRole) {
      auditLogService.logAction({
        actorEmail: `service-role::${project.name}`,
        actionType: 'service_key_access',
        projectId: project.id,
        ipAddress: req.ip,
        status: 'success',
        details: `Service role key used to request: ${req.method} ${req.originalUrl}`
      });
    }

    req.project = project;
    req.isServiceRole = isServiceRole;
    req.user = {
      sub: project.ownerId,
      email: isServiceRole ? `service-role::${project.name}` : `api-key::${project.name}`,
    };

    // Decode Bearer token if present to identify the authenticated project user
    const token = extractBearerToken(req);
    if (token) {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next(new AppError('Server JWT secret is not configured.', 500));
      }
      try {
        const decoded = jwt.verify(token, secret) as any;
        if (decoded.projectId && decoded.projectId !== project.id) {
          return next(new AppError('Forbidden: Project token does not match the specified API key project.', 403));
        }
        req.projectUser = decoded;
      } catch (err: any) {
        return next(new AppError('Invalid or expired Bearer token provided with API key.', 401));
      }
    }

    return next();
  }

  // Fallback to standard Bearer JWT authentication
  return authenticateJwt(req, res, next);
}
