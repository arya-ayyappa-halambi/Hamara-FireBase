// ─────────────────────────────────────────────────────────────────────────────
//  src/server.ts
//  AegisDB — Main application entry point.
//
//  Responsibilities:
//    1. Load environment variables
//    2. Guard required env vars at startup (fail fast)
//    3. Configure Express middleware
//    4. Mount route modules
//    5. Register 404 and global error handlers
//    6. Start the HTTP server with graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'; // must be first — loads .env before anything else reads process.env

import express, { Application, Request, Response } from 'express';
import * as path from 'path';
import * as os from 'os';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';

import authRouter        from './auth/auth.routes';
import dbRouter          from './db/db.routes';
import storageRouter     from './storage/storage.routes';
import projectAuthRouter from './project-auth/project-auth.routes';
import hosterRouter      from './hoster/hoster.routes';
import projectRouter     from './project/project.routes';
import adminRouter       from './admin/admin.routes';
import systemRouter      from './system/system.routes';
import policyRouter      from './routes/policy.routes';
import orgRouter         from './routes/organization.routes';
import notificationRouter from './routes/notification.routes';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';
import { authLimiter, apiLimiter } from './middleware/rateLimit.middleware';
import { ensureUploadDir }   from './storage/storage.service';
import { ensureHosterDirs, initRuntimeAdapter } from './hoster/hoster.service';
import { initSqlite, getDb } from './db/sqlite.connection';

import { wsService } from './realtime/websocket.service';
import { replicationService } from './services/replication.service';
import metricsRouter      from './routes/metrics.routes';
import { metricsService } from './services/metrics.service';
import { securityHeaders, dynamicCors } from './middleware/security.middleware';
import { maintenanceModeMiddleware } from './middleware/maintenance.middleware';
import { ipAccessControlMiddleware } from './middleware/ip-access-control.middleware';
import { accountPurgeSchedulerService } from './services/account-purge-scheduler.service';
import { endpointMigrationScheduler } from './services/endpoint-migration-scheduler.service';
import { trafficTopologyService } from './services/traffic-topology.service';
import { tunnelManagerService } from './services/tunnel-manager.service';
import { networkAccessService } from './services/network-access.service';

// ── Environment Guard ─────────────────────────────────────────────────────────

/**
 * Validate critical environment variables at startup.
 * The server will refuse to start rather than run with dangerous defaults.
 */
function validateEnv(): void {
  const required = ['JWT_SECRET', 'EMAIL_HASH_PEPPER', 'RECOVERY_PIN', 'ENCRYPTION_KEY'] as const;
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ FATAL: Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in the required values.');
    process.exit(1);
  }

  const secret = process.env.JWT_SECRET!;
  if (secret.length < 32) {
    console.error('❌ JWT_SECRET is too short. Use at least 32 characters.');
    process.exit(1);
  }

  const encKey = process.env.ENCRYPTION_KEY!;
  if (encKey.length < 32) {
    console.error('❌ ENCRYPTION_KEY is too short. Use at least 32 characters.');
    process.exit(1);
  }

  const pepper = process.env.EMAIL_HASH_PEPPER!;
  if (pepper.length < 32) {
    console.error('❌ EMAIL_HASH_PEPPER is too short. Use at least 32 characters.');
    process.exit(1);
  }
}

// ── App Factory ───────────────────────────────────────────────────────────────

function createApp(): Application {
  const app = express();

  // Enable trust proxy so Express recognizes Cloudflare/Ngrok/Localtunnel reverse proxies
  app.set('trust proxy', true);

  // ── Global Security & CORS Middleware ────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // Let custom securityHeaders handle CSP
    crossOriginEmbedderPolicy: false // Prevent breaking local UI assets
  }));
  app.use(hpp());
  app.use(securityHeaders);
  app.use(dynamicCors);

  // ── Prometheus Metrics Middleware ────────────────────────────────────────
  app.use((req, res, next) => {
    res.on('finish', () => {
      let projectId: string | undefined = req.project?.id;
      if (!projectId && typeof req.headers['x-aegis-project-id'] === 'string') {
        projectId = req.headers['x-aegis-project-id'];
      }
      if (!projectId && req.user && (req.user as any).isProjectUser) {
        projectId = (req.user as any).projectId;
      }
      metricsService.recordHttpRequest(req.method, req.path, res.statusCode, projectId);
    });
    next();
  });

  // ── Traffic Topology & Packet Flow Telemetry Middleware ─────────────────
  app.use((req, res, next) => {
    const startMs = Date.now();
    const bytesIn = Number(req.headers['content-length'] || 0) + (req.url ? req.url.length : 0) + 128;
    const hostHeader = (req.headers.host || '').toLowerCase();
    const isTunnel = Boolean(
      req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-proto'] ||
      req.headers['x-forwarded-host'] ||
      hostHeader.includes('.trycloudflare.com') ||
      hostHeader.includes('.loca.lt') ||
      hostHeader.includes('.ngrok')
    );

    res.on('finish', () => {
      const durationMs = Math.max(0.5, Date.now() - startMs);
      const bytesOut = Number(res.getHeader('content-length') || 256);
      const clientIp = networkAccessService.extractClientIp(req);

      trafficTopologyService.recordRequest({
        ip: clientIp,
        method: req.method,
        path: req.path || req.url || '/',
        protocol: req.httpVersion ? `HTTP/${req.httpVersion}` : 'HTTP/1.1',
        statusCode: res.statusCode,
        latencyMs: durationMs,
        bytesIn,
        bytesOut,
        isTunnel
      });

      if (isTunnel) {
        tunnelManagerService.recordTraffic(bytesIn + bytesOut, hostHeader);
      }
    });
    next();
  });

  app.use(express.json({ limit: '50mb' }));   // Increased cap to allow large high-res image uploads
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ── Request Logger (dev only) ────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    app.use((req, _res, next) => {
      console.log(`→ ${req.method} ${req.path}`);
      next();
    });
  }

  // ── Network Access Control & Device Tracking Middleware ─────────────────
  app.use(ipAccessControlMiddleware);

  // ── Static Files (Web Dashboard) ───────────────────────────────────────────
  app.use(express.static('public', {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));

  app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/reset-password.html'));
  });

  // ── Public Well-Known & Metrics Endpoints ─────────────────────────────────
  app.use('/', metricsRouter);

  // ── Health Check (Permissive CORS for Cross-Port & Remote Device Probes) ──
  app.get(['/health', '/api/health', '/api/v1/health', '/api/v1/system/health'], (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.status(200).json({
      success: true,
      message: 'AegisDB is running.',
      data: {
        status: 'ok',
        port: activePort,
        host: activeHost,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV ?? 'development',
      },
    });
  });

  // ── Maintenance Mode ─────────────────────────────────────────────────────
  app.use(maintenanceModeMiddleware);

  // ── API Routes ───────────────────────────────────────────────────────────
  app.use('/api/v1/auth',     authRouter);
  app.use('/api/v1/project-auth', projectAuthRouter);
  app.use('/api/v1/projects', projectRouter);
  app.use('/api/v1/db',       dbRouter);
  app.use('/api/v1/storage',  storageRouter);
  app.use('/api/v1/hoster',   hosterRouter);
  app.use('/api/v1/admin',    adminRouter);
  app.use('/api/v1/system',   systemRouter);
  app.use('/api/v1/policies', policyRouter);
  app.use('/api/v1/orgs',     orgRouter);
  app.use('/api/v1/notifications', notificationRouter);

  // ── Multi-Region Logical Sync Replication Route ──────────────────────────────────
  app.post('/api/v1/replication/sync', (req, res, next) => {
    try {
      const replicationKey = req.headers['x-aegis-replication-key'] as string | undefined;
      const expectedKey = replicationService.getReplicationSecret();

      if (!replicationKey || replicationKey !== expectedKey) {
        res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing replication secret.' });
        return;
      }

      const { senderNodeId, mutations } = req.body;
      if (!mutations || !Array.isArray(mutations)) {
        res.status(400).json({ success: false, message: 'mutations array required.' });
        return;
      }
      replicationService.applyMutations(mutations);
      res.status(200).json({ success: true, message: 'Sync complete.' });
    } catch (err) {
      next(err);
    }
  });

  // ── 404 Handler (after routes, before error handler) ────────────────────
  app.use(notFoundHandler);

  // ── Global Error Handler (must be last) ─────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}

import http from 'http';

let currentApp: Application | null = null;
let currentServer: http.Server | null = null;
let activePort = 3000;
let activeHost = '0.0.0.0';

/**
 * Dynamically rebinds the HTTP and WebSocket server to a new port and host in-memory.
 */
export function rebindServer(newPort: number, newHost: string = '0.0.0.0'): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!currentApp) {
      return reject(new Error('Application is not initialized'));
    }

    // Always bind on 0.0.0.0 unless localhost (127.0.0.1) is explicitly requested
    const hostToBind = (newHost === '127.0.0.1' || newHost === 'localhost') ? '127.0.0.1' : '0.0.0.0';

    if (activePort === newPort && activeHost === newHost && currentServer?.listening) {
      return resolve();
    }

    const oldServer = currentServer;
    const newServer = http.createServer(currentApp!);
    currentServer = newServer;

    newServer.on('error', (err: any) => {
      console.error(`❌ [Server] Failed to bind to port ${newPort} on ${hostToBind}:`, err.message);
      if (oldServer) currentServer = oldServer;
      reject(err);
    });

    const startListen = () => {
      newServer.listen(newPort, hostToBind, () => {
        activePort = newPort;
        activeHost = newHost;
        process.env.PORT = newPort.toString();
        process.env.HOST = newHost;

        try {
          const db = getDb();
          db.prepare(`UPDATE platform_settings SET serverPort = ?, serverHost = ? WHERE id = 'default'`).run(newPort, newHost);
        } catch (_) {}

        const interfaces = os.networkInterfaces();
        let netIp = '127.0.0.1';
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
              netIp = iface.address;
              break;
            }
          }
        }

        console.log('');
        console.log('┌────────────────────────────────────────────────────────────┐');
        console.log('│        AegisDB Server Live Port Switch (Rebound) 🛡️        │');
        console.log('├────────────────────────────────────────────────────────────┤');
        console.log(`│  ➜  Local:    http://localhost:${newPort}`.padEnd(61) + '│');
        console.log(`│  ➜  Network:  http://${netIp}:${newPort}`.padEnd(61) + '│');
        console.log('├────────────────────────────────────────────────────────────┤');
        console.log(`│  Status  : Switched to Port ${newPort}`.padEnd(61) + '│');
        console.log(`│  Access  : ${hostToBind === '0.0.0.0' ? 'Available via Localhost & Wi-Fi Network' : 'Localhost Only'}`.padEnd(61) + '│');
        console.log(`│  CLI     : PORT=${newPort} HOST=${newHost} npm run dev`.padEnd(61) + '│');
        console.log('└────────────────────────────────────────────────────────────┘');
        console.log('');

        wsService.init(newServer);

        // Gracefully close old server after new server is active
        if (oldServer && oldServer.listening && oldServer !== newServer) {
          try {
            if (typeof (oldServer as any).closeIdleConnections === 'function') {
              (oldServer as any).closeIdleConnections();
            }
            oldServer.close((err) => {
              if (err) console.warn('[Server] Notice during old socket close:', err.message);
            });
          } catch (_) {}
        }

        resolve();
      });
    };

    // If binding on same port (only host changed), close old socket first to avoid EADDRINUSE
    if (oldServer && oldServer.listening && activePort === newPort) {
      oldServer.close(() => {
        startListen();
      });
    } else {
      startListen();
    }
  });
}

import { terminalStreamService } from './services/terminal-stream.service';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  terminalStreamService.init();
  validateEnv();
  initSqlite();          // SQLite database initialization
  endpointMigrationScheduler.setRebindHandler(rebindServer);
  endpointMigrationScheduler.start(); // Scheduled host & port migration watcher
  ensureUploadDir();    // uploads/biometrics/
  ensureHosterDirs();   // uploads/projects/ + workspaces/
  await initRuntimeAdapter(); // detect Docker vs Process mode

  currentApp = createApp();

  // Load configured server port and host
  // CLI environment variables (process.env.PORT / HOST) have top priority; fall back to SQLite saved settings
  let configuredPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  let configuredHost = process.env.HOST || '0.0.0.0';
  let configuredMode = process.env.HOST_MODE || 'both';

  try {
    const db = getDb();
    const settings = db.prepare("SELECT serverPort, serverHost, serverHostingMode FROM platform_settings WHERE id = 'default'").get() as any;
    if (settings) {
      if (!process.env.PORT && settings.serverPort) {
        configuredPort = Number(settings.serverPort);
      }
      if (!process.env.HOST && settings.serverHost) {
        configuredHost = settings.serverHost;
      }
      if (!process.env.HOST_MODE && settings.serverHostingMode) {
        configuredMode = settings.serverHostingMode;
      }

      // Sync active settings to SQLite
      db.prepare(`
        UPDATE platform_settings SET
          serverPort = ?,
          serverHost = ?,
          serverHostingMode = ?
        WHERE id = 'default'
      `).run(configuredPort, configuredHost, configuredMode);
    }
  } catch (_) {}

  const PORT = configuredPort;
  const HOST = configuredHost;
  const hostToBind = (HOST === '127.0.0.1' || HOST === 'localhost') ? '127.0.0.1' : '0.0.0.0';

  const getNetworkIp = (): string => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  };

  const networkIp = getNetworkIp();
  activePort = PORT;
  activeHost = HOST;

  const server = http.createServer(currentApp);
  currentServer = server;

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ [Server] Fatal Error: Port ${PORT} is already in use by another process.`);
      console.error(`👉 Tip: Kill the process on port ${PORT} with 'lsof -ti :${PORT} | xargs kill -9' or start with a different port (e.g. PORT=${PORT + 1})\n`);
    } else {
      console.error(`\n❌ [Server] Failed to start HTTP server:`, err.message);
    }
    process.exit(1);
  });

  server.listen(PORT, hostToBind, () => {
    console.log('');
    console.log('┌────────────────────────────────────────────────────────────┐');
    console.log('│                   AegisDB Server  🛡️                       │');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log(`│  ➜  Local:    http://localhost:${PORT}`.padEnd(61) + '│');
    console.log(`│  ➜  Network:  http://${networkIp}:${PORT}`.padEnd(61) + '│');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log(`│  Status  : Running on Port ${PORT}`.padEnd(61) + '│');
    console.log(`│  Access  : ${hostToBind === '0.0.0.0' ? 'Available via Localhost & Wi-Fi Network' : 'Localhost Only'}`.padEnd(61) + '│');
    console.log(`│  Env     : ${(process.env.NODE_ENV ?? 'development')}`.padEnd(61) + '│');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log('│  Auth    : POST /api/v1/auth/register                      │');
    console.log('│            POST /api/v1/auth/login                         │');
    console.log('│            POST /api/v1/auth/refresh                       │');
    console.log('│            POST /api/v1/auth/logout                        │');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log('│  Projects: POST   /api/v1/projects                         │');
    console.log('│            GET    /api/v1/projects                         │');
    console.log('│            DELETE /api/v1/projects/:id                     │');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log('│  DB      : POST   /api/v1/db/collections                   │');
    console.log('│            GET    /api/v1/db/collections                   │');
    console.log('│            POST   /…/collections/:name/docs                │');
    console.log('│            GET    /…/collections/:name/docs                │');
    console.log('│            PATCH  /…/collections/:name/docs/:id            │');
    console.log('│            DELETE /…/collections/:name/docs/:id            │');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log('│  Realtime: WS /?token=...                                  │');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log('│  Admin   : GET   /api/v1/admin/stats                       │');
    console.log('│            PATCH /api/v1/admin/rate-limits                 │');
    console.log('└────────────────────────────────────────────────────────────┘');
    console.log('');
  });

  // Attach Real-Time WebSocket Server
  wsService.init(server);

  // Start 7-Day Account Deletion Grace Period Purge Scheduler
  accountPurgeSchedulerService.start();

  // ── Graceful Shutdown ────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    accountPurgeSchedulerService.stop();
    server.close(() => {
      console.log('✅ HTTP server closed.');
      process.exit(0);
    });

    // Force-close after 10 s if pending connections don't drain
    setTimeout(() => {
      console.error('⚠️  Forcefully shutting down after timeout.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // ── Unhandled Rejection Guard ──────────────────────────────────────────────────────
  process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled Promise Rejection:', reason);
    // In production, crash so a process manager (PM2/K8s) can restart cleanly
    if (process.env.NODE_ENV === 'production') process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Fatal bootstrap error:', err);
  process.exit(1);
});
