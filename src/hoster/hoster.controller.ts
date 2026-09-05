// ─────────────────────────────────────────────────────────────────────────────
//  src/hoster/hoster.controller.ts
//  AegisDB — Hoster HTTP adapter layer.
//
//  Reads ownerId from req.user.sub (set by authenticateJwt middleware).
//  All business logic is delegated to hoster.service.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { type Request, type Response, type NextFunction } from 'express';
import { AppError, type ApiResponse } from '../types/auth.types';
import { type PublicDeployment } from '../types/hoster.types';
import * as service from './hoster.service';

// ── Shared helper ─────────────────────────────────────────────────────────────

function ownerId(req: Request): string {
  if (req.project?.ownerId) return req.project.ownerId;
  const user = req.user as any;
  if (user?.isProjectUser) {
    throw new AppError('Forbidden: Project end-users cannot access hoster deployment APIs.', 403);
  }
  const sub = req.user?.sub;
  if (!sub) throw new AppError('Authentication context missing.', 401);
  return sub;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/hoster/deploy
 *
 * Multipart request:
 *   - Field `project`     : .zip archive (required)
 *   - Field `name`        : project name (required)
 *   - Field `startCommand`: shell command (optional, default: node index.js)
 *   - Field `image`       : Docker image (optional, default: node:18-alpine)
 *   - Field `envVars`     : JSON string of env vars (optional)
 *   - Field `description` : human description (optional)
 *   - Field `memoryLimitMb`: number (optional, default: 512)
 */
export async function deployHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError(
        'No project archive provided. ' +
          'Send a multipart/form-data request with a "project" field containing a .zip file.',
        400,
      );
    }

    const { name, description, image, startCommand, memoryLimitMb } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new AppError('"name" is required.', 400);
    }

    // envVars must arrive as a JSON string (form-data doesn't natively support objects)
    let envVars: Record<string, string> | undefined;
    if (req.body.envVars) {
      try {
        const parsed = JSON.parse(req.body.envVars) as unknown;
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error('not an object');
        }
        // Validate that all values are strings
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v !== 'string') {
            throw new Error(`value of "${k}" must be a string`);
          }
        }
        envVars = parsed as Record<string, string>;
      } catch (e) {
        throw new AppError(
          `"envVars" must be a valid JSON object of string values. ` +
            `Example: {"KEY":"value"}. Error: ${(e as Error).message}`,
          400,
        );
      }
    }

    const memMb = memoryLimitMb ? Number(memoryLimitMb) : undefined;
    if (memMb !== undefined && (isNaN(memMb) || memMb < 64 || memMb > 4096)) {
      throw new AppError('"memoryLimitMb" must be a number between 64 and 4096.', 400);
    }

    const deployment = await service.deployProject(
      ownerId(req),
      { name, description, image, startCommand, envVars, memoryLimitMb: memMb },
      req.file,
    );

    // 201 = deployment created & running; 207 = created but start failed
    const httpStatus = deployment.status === 'error' ? 207 : 201;

    res.status(httpStatus).json({
      success: deployment.status !== 'error',
      message:
        deployment.status === 'running'
          ? `Deployment "${deployment.name}" is running on port ${deployment.allocatedPort}.`
          : `Deployment "${deployment.name}" was created but failed to start: ${deployment.errorMessage ?? 'unknown error'}.`,
      data: deployment,
    } satisfies ApiResponse<PublicDeployment>);
  } catch (err) {
    next(err);
  }
}

/** GET /api/v1/hoster/deployments */
export async function listDeploymentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deployments = service.listDeployments(ownerId(req));
    res.status(200).json({
      success: true,
      message: `${deployments.length} deployment(s) found.`,
      data: deployments,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/v1/hoster/deployments/:id */
export async function getDeploymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dep = await service.getDeployment(ownerId(req), req.params.id);
    res.status(200).json({
      success: true,
      message: 'Deployment retrieved.',
      data: dep,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/v1/hoster/deployments/:id/start */
export async function startDeploymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dep = await service.startDeployment(ownerId(req), req.params.id);
    res.status(200).json({
      success: true,
      message: `Deployment "${dep.name}" started. Status: ${dep.status}.`,
      data: dep,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/v1/hoster/deployments/:id/stop */
export async function stopDeploymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dep = await service.stopDeployment(ownerId(req), req.params.id);
    res.status(200).json({
      success: true,
      message: `Deployment "${dep.name}" stopped.`,
      data: dep,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/v1/hoster/deployments/:id/restart */
export async function restartDeploymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dep = await service.restartDeployment(ownerId(req), req.params.id);
    res.status(200).json({
      success: true,
      message: `Deployment "${dep.name}" restarted. Status: ${dep.status}.`,
      data: dep,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/hoster/deployments/:id/logs
 * Query params:
 *   ?lines=200  (default 100, max 1000)
 */
export async function getLogsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawLines = req.query.lines;
    const lines    = rawLines ? (parseInt(String(rawLines), 10) || 100) : 100;

    const logs = await service.getDeploymentLogs(ownerId(req), req.params.id, lines);

    res.status(200).json({
      success: true,
      message: 'Logs retrieved.',
      data: {
        deploymentId: req.params.id,
        requestedLines: lines,
        logs,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/v1/hoster/deployments/:id */
export async function removeDeploymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dep = await service.removeDeployment(ownerId(req), req.params.id);
    res.status(200).json({
      success: true,
      message: `Deployment "${dep.name}" removed. Port ${dep.allocatedPort} has been released.`,
      data: dep,
    });
  } catch (err) {
    next(err);
  }
}
