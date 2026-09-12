// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/anti-spam.middleware.ts
//  FlareBase — Anti-Spam, Bot Defense & Honeypot Protection Middleware
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { antiAbuseService } from '../services/anti-abuse.service';
import { networkAccessService } from '../services/network-access.service';
import { AppError } from '../types/auth.types';

export function antiSpamRegistrationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const body = req.body || {};
  const clientIp = networkAccessService.extractClientIp(req);
  const userAgent = req.headers['user-agent'] as string | undefined;

  // 1. Honeypot Trap Inspection
  const honeypot = antiAbuseService.inspectHoneypot(body);
  if (honeypot.isBot) {
    return next(new AppError('Bot trap triggered. Automated submission rejected.', 403, {
      code: 'BOT_HONEYPOT_TRIGGERED',
      trapField: honeypot.trapField
    }));
  }

  // 2. Headless Bot User-Agent Check
  const botAgent = antiAbuseService.isBotUserAgent(userAgent);
  if (botAgent.isBot) {
    // Flagged or blocked if explicit headless scraper
    if (userAgent?.includes('HeadlessChrome') || userAgent?.includes('PhantomJS') || userAgent?.includes('sqlmap')) {
      return next(new AppError('Automated bot client detected. Browser access required.', 403, {
        code: 'BOT_CLIENT_REJECTED'
      }));
    }
  }

  // 3. Disposable Email Verification
  if (body.email && typeof body.email === 'string') {
    const isDisposable = antiAbuseService.isDisposableEmail(body.email);
    if (isDisposable) {
      return next(new AppError('Disposable or temporary email addresses are not permitted. Please use a valid email provider.', 400, {
        code: 'DISPOSABLE_EMAIL_NOT_ALLOWED'
      }));
    }
  }

  // 4. Physical Device Registration Velocity Check
  const deviceFingerprint = (req.headers['x-device-fingerprint'] as string | undefined) ||
    (req.headers['x-fb-device-id'] as string | undefined) ||
    (req.headers['x-flare-device-id'] as string | undefined) ||
    body.deviceFingerprint ||
    (req as any).cookies?.fb_device_id;

  if (deviceFingerprint) {
    const devVel = antiAbuseService.checkDeviceRegistrationVelocity(deviceFingerprint, 2, 24 * 60 * 60 * 1000);
    if (!devVel.allowed) {
      return next(new AppError('Device registration limit reached. Maximum accounts created for this physical device.', 429, {
        code: 'DEVICE_REGISTRATION_RATE_LIMITED',
        deviceFingerprint: devVel.deviceFingerprint
      }));
    }
  }

  // 5. Subnet Registration Velocity with Shared-Network (Wi-Fi / NAT) Protection
  const velocity = antiAbuseService.checkSubnetRegistrationVelocity(clientIp, 10, 10 * 60 * 1000);
  const sharedConfidence = antiAbuseService.calculateSharedIpConfidence(clientIp);

  if (!velocity.allowed && !sharedConfidence.isSharedNetwork) {
    return next(new AppError(`Too many registrations from your network subnet (${velocity.subnet}). Please try again later.`, 429, {
      code: 'SUBNET_REGISTRATION_RATE_LIMITED',
      subnet: velocity.subnet
    }));
  }

  next();
}
