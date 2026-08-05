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
  const apiKeyHeader = req.headers['x-aegis-api-key'];

  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    const rawApiKey = apiKeyHeader.trim();
    if (!rawApiKey.startsWith('aegis_pk_') && !rawApiKey.startsWith('aegis_sk_')) {
      return next(new AppError('Invalid API Key format. API keys must start with "aegis_pk_" or "aegis_sk_".', 401));
    }

    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
    let project;
    let isServiceRole = false;

    if (rawApiKey.startsWith('aegis_pk_')) {
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
      if (secret) {
        try {
          const decoded = jwt.verify(token, secret) as any;
          req.projectUser = decoded;
        } catch (_) {
          // Ignore invalid/expired token so administrative API key access works
        }
      }
    }

    return next();
  }

  // Fallback to standard Bearer JWT authentication
  return authenticateJwt(req, res, next);
}
