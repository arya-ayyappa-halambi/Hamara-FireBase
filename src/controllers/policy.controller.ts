// ─────────────────────────────────────────────────────────────────────────────
//  src/controllers/policy.controller.ts
//  Controller for platform policies (Terms & Conditions, Security & Backup).
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { policyService } from '../services/policy.service';
import { ApiResponse, PlatformPolicy } from '../types/auth.types';

export async function getCurrentPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = policyService.getActivePolicy();
    res.status(200).json({
      success: true,
      message: 'Active platform policies retrieved.',
      data: policy,
    } as ApiResponse<PlatformPolicy>);
  } catch (err) {
    next(err);
  }
}

export async function updatePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user?.sub || 'system';
    const adminEmail = req.user?.email || 'admin@flarebase.dev';
    const { termsAndConditions, securityPolicy, backupPolicy, newVersion } = req.body;

    const updated = policyService.updatePolicy(adminId, adminEmail, {
      termsAndConditions,
      securityPolicy,
      backupPolicy,
      newVersion,
    });

    res.status(200).json({
      success: true,
      message: `Platform policies updated and rolled out successfully (Version: ${updated.version}).`,
      data: updated,
    } as ApiResponse<PlatformPolicy>);
  } catch (err) {
    next(err);
  }
}
