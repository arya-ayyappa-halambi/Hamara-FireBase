// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/ip-access-control.middleware.ts
//  FlareBase — Network Access Control & IP Whitelist Security Guard
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { networkAccessService } from '../services/network-access.service';

export function ipAccessControlMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract true origin client IP address reliably across Cloudflare, Ngrok, Localtunnel & direct LAN
  const clientIp = networkAccessService.extractClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const cfCountry = req.headers['cf-ipcountry'] as string | undefined;

  // Attach normalized IP to req for downstream middlewares
  (req as any).clientIp = clientIp;

  // Extract user info if authenticated
  const user = (req as any).user;
  const userId = user?.id || null;
  const userEmail = user?.email || null;

  // 1. Record device activity in real time
  networkAccessService.recordDeviceActivity({
    ipAddress: clientIp,
    userAgent,
    userId,
    userEmail
  });

  // 2. Evaluate Emergency Lockdown & Scheduled Maintenance
  const { emergencyControlService } = require('../services/emergency-control.service');
  const emergencyCheck = emergencyControlService.evaluateRequest({
    method: req.method,
    path: req.path,
    clientIp,
    isSuperAdmin: user?.isSuperAdmin === true || Number(user?.isSuperAdmin) === 1
  });

  if (!emergencyCheck.allowed) {
    const isApi = req.path.startsWith('/api/') || req.headers.accept?.includes('application/json');
    if (emergencyCheck.retryAfter) {
      res.setHeader('Retry-After', String(emergencyCheck.retryAfter));
    }
    const statusCode = emergencyCheck.statusCode || 503;
    if (isApi) {
      res.status(statusCode).json({
        success: false,
        code: emergencyCheck.code || 'EMERGENCY_LOCKDOWN',
        message: emergencyCheck.message || 'Service temporarily unavailable.',
        clientIp,
        timestamp: new Date().toISOString()
      });
      return;
    }
    res.status(statusCode).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>FlareBase — ${emergencyCheck.code || 'Service Notice'}</title>
        <style>
          body { background: #030712; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 24px; padding: 40px; max-width: 520px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          h2 { color: #f87171; margin-top: 0; font-size: 22px; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
          .badge { display: inline-block; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; font-family: monospace; font-size: 12px; padding: 4px 12px; border-radius: 9999px; margin-top: 12px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🛡️ ${emergencyCheck.code || 'Service Status Notice'}</h2>
          <p>${emergencyCheck.message || 'System is currently in emergency maintenance or locked state.'}</p>
          <div class="badge">IP: ${clientIp}</div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // 2b. Layer-7 Web Application Firewall (WAF) Deep Packet Inspection
  const { wafShieldService } = require('../services/waf-shield.service');
  const wafCheck = wafShieldService.inspectRequest({
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    headers: req.headers,
    clientIp
  });

  if (wafCheck.blocked) {
    const isApi = req.path.startsWith('/api/') || req.headers.accept?.includes('application/json');
    if (isApi) {
      res.status(400).json({
        success: false,
        code: 'WAF_PAYLOAD_BLOCKED',
        threatType: wafCheck.threatType,
        message: `WAF Security Shield: ${wafCheck.description}`,
        matchedPattern: wafCheck.matchedPattern,
        clientIp,
        timestamp: new Date().toISOString()
      });
      return;
    }
    res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>FlareBase WAF — Threat Blocked</title>
        <style>
          body { background: #030712; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 24px; padding: 40px; max-width: 520px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          h2 { color: #fb7185; margin-top: 0; font-size: 22px; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
          .badge { display: inline-block; background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.3); color: #fda4af; font-family: monospace; font-size: 12px; padding: 4px 12px; border-radius: 9999px; margin-top: 12px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🛡️ WAF Security Shield Blocked Request</h2>
          <p>${wafCheck.description || 'Malicious payload injection attempt detected and dropped.'}</p>
          <div class="badge">Threat: ${wafCheck.threatType?.toUpperCase() || 'UNKNOWN'} | IP: ${clientIp}</div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // 3. Evaluate access permissions with perimeter and project scoping
  const hostHeader = (req.headers.host || '').toLowerCase();
  const isTunnel = Boolean(
    req.headers['x-forwarded-proto'] ||
    req.headers['cf-connecting-ip'] ||
    hostHeader.includes('trycloudflare.com') ||
    hostHeader.includes('.loca.lt') ||
    hostHeader.includes('.ngrok')
  );
  const projectId = (req.headers['x-flarebase-project-id'] as string) || (req.headers['x-project-id'] as string) || (req.query?.projectId as string) || null;
  const { allowed, reason, code } = networkAccessService.isEndpointAccessAllowed({
    clientIp,
    path: req.path,
    method: req.method,
    projectId,
    isTunnel,
    hostHeader
  });

  if (allowed) {
    // 2b. Evaluate Adaptive Subnet Rate Limiting & Bandwidth Throttling
    const { subnetRateLimiterService } = require('../services/subnet-rate-limiter.service');
    const approxByteSize = Number(req.headers['content-length'] || 512);
    const rateCheck = subnetRateLimiterService.checkRateLimit(clientIp, approxByteSize);

    res.setHeader('X-RateLimit-Limit', String(rateCheck.limit));
    res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
    res.setHeader('X-RateLimit-Reset', String(rateCheck.resetSeconds));

    if (!rateCheck.allowed) {
      const isApi = req.path.startsWith('/api/') || req.headers.accept?.includes('application/json');
      res.setHeader('Retry-After', String(rateCheck.resetSeconds));
      if (isApi) {
        res.status(429).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: rateCheck.reason || '429 Too Many Requests: Subnet rate limit exceeded.',
          clientIp,
          resetSeconds: rateCheck.resetSeconds,
          timestamp: new Date().toISOString()
        });
        return;
      }
      res.status(429).send(`429 Too Many Requests: Subnet rate quota exceeded. Retry in ${rateCheck.resetSeconds}s.`);
      return;
    }

    if (rateCheck.throttled && rateCheck.delayMs) {
      res.setHeader('X-FlareBase-Throttled', 'true');
      setTimeout(() => {
        next();
      }, rateCheck.delayMs);
      return;
    }

    return next();
  }

  // 3. Reject unauthorized device with HTTP 403 / 429
  const statusCode = code === 'IP_JAILED' ? 429 : 403;
  const isApiRequest = req.path.startsWith('/api/') || req.headers.accept?.includes('application/json');

  if (isApiRequest) {
    res.status(statusCode).json({
      success: false,
      code: code || 'NETWORK_ACCESS_DENIED',
      message: '403 Forbidden: Device Access Denied by FlareBase Network Security Policy.',
      clientIp,
      reason,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Render glassmorphic Access Denied HTML page for browser visits
  const deniedHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>403 Access Denied — FlareBase Security</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  </head>
  <body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4 selection:bg-rose-500 selection:text-white font-sans antialiased">
    <div class="max-w-md w-full p-8 rounded-3xl bg-slate-900/80 border border-rose-500/30 shadow-2xl backdrop-blur-xl text-center space-y-6">
      <div class="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400 text-2xl shadow-inner">
        <i class="fa-solid fa-shield-halved"></i>
      </div>
      <div class="space-y-2">
        <h1 class="text-xl font-bold text-white tracking-tight">403 Access Denied</h1>
        <p class="text-xs text-slate-400 leading-relaxed">This device is not authorized to access this FlareBase server instance.</p>
      </div>
      <div class="p-4 rounded-2xl bg-black/40 border border-white/5 text-left space-y-2 font-mono text-xs">
        <div class="flex justify-between text-slate-400">
          <span>Your IP Address:</span>
          <strong class="text-rose-400 font-bold">${clientIp}</strong>
        </div>
        <div class="flex justify-between text-slate-400">
          <span>Security Reason:</span>
          <span class="text-slate-200 text-right truncate max-w-[200px]" title="${reason}">${reason}</span>
        </div>
        <div class="flex justify-between text-slate-400">
          <span>Timestamp:</span>
          <span class="text-slate-400">${new Date().toLocaleTimeString()}</span>
        </div>
      </div>
      <p class="text-[11px] text-slate-500">Contact the Super Administrator of this server to add your IP address to the approved whitelist.</p>
    </div>
  </body>
  </html>
  `;

  res.status(403).setHeader('Content-Type', 'text/html').send(deniedHtml);
}
