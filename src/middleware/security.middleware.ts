import { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Default Production Security Headers
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy (CSP)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src 'self' data: blob: https:;"
  );

  next();
}

// Dynamic Project-Aware CORS Middleware
export const dynamicCors = cors((req: Request, callback: (err: Error | null, options?: cors.CorsOptions) => void) => {
  const origin = req.headers.origin;

  // Allow server-to-server or local dev origins
  if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return callback(null, { origin: true, credentials: true });
  }

  // Parse allowed origins from project if context is loaded
  const projectAllowedOrigins: string[] = (req as any).project?.allowedOrigins || [];
  
  if (projectAllowedOrigins.length === 0 || projectAllowedOrigins.includes(origin)) {
    callback(null, { origin: origin, credentials: true });
  } else {
    callback(new Error(`CORS policy violation: Origin ${origin} is not allowed for this project.`));
  }
});
