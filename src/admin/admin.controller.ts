// ─────────────────────────────────────────────────────────────────────────────
//  src/admin/admin.controller.ts
//  HTTP controller for Super Admin telemetry and rate limit management.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service';
import { ApiResponse } from '../types/auth.types';
import { AdminSystemStats } from '../types/project.types';

export async function getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = adminService.getSystemStats();
    res.status(200).json({
      success: true,
      message: 'System statistics retrieved.',
      data: stats,
    } as ApiResponse<AdminSystemStats>);
  } catch (err) { next(err); }
}

export async function getUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await adminService.getUsers();
    res.status(200).json({
      success: true,
      message: 'Users retrieved.',
      data: users,
    } as ApiResponse<any>);
  } catch (err) { next(err); }
}

export async function updateUserLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout } = req.body;
    await adminService.updateUserLimits(id, apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout);
    res.status(200).json({
      success: true,
      message: 'User limits updated successfully.',
      data: null,
    } as ApiResponse<null>);
  } catch (err) { next(err); }
}

export async function updateRateLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = adminService.updateRateLimits(req.body);
    res.status(200).json({
      success: true,
      message: 'Rate limits updated successfully.',
      data: config,
    } as ApiResponse<typeof config>);
  } catch (err) { next(err); }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    adminService.deleteUser(id);
    res.status(200).json({
      success: true,
      message: 'User deleted successfully.',
      data: null,
    } as ApiResponse<null>);
  } catch (err) { next(err); }
}
