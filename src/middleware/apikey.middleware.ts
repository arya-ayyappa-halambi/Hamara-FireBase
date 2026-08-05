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

export function authenticateApiKeyOrJwt(req: Request, res: Response, next: NextFunction): void {
  const apiKeyHeader = req.headers['x-aegis-api-key'];

  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    const rawApiKey = apiKeyHeader.trim();
    if (!rawApiKey.startsWith('aegis_pk_')) {
      return next(new AppError('Invalid API Key format. API keys must start with "aegis_pk_".', 401));
    }

    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
    const project = projectService.getProjectByApiKeyHash(apiKeyHash);

    if (!project) {
      return next(new AppError('Invalid API Key provided.', 401));
    }

    req.project = project;
    req.user = {
      sub: project.ownerId,
      email: `api-key::${project.name}`,
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
