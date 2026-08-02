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
import cors from 'cors';

import authRouter        from './auth/auth.routes';
import dbRouter          from './db/db.routes';
import storageRouter     from './storage/storage.routes';
import projectAuthRouter from './project-auth/project-auth.routes';
import hosterRouter      from './hoster/hoster.routes';
import projectRouter     from './project/project.routes';
import adminRouter       from './admin/admin.routes';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';
import { authLimiter, apiLimiter } from './middleware/rateLimit.middleware';
import { ensureUploadDir }   from './storage/storage.service';
import { ensureHosterDirs, initRuntimeAdapter } from './hoster/hoster.service';
import { initSqlite } from './db/sqlite.connection';

import { wsService } from './realtime/websocket.service';

// ── Environment Guard ─────────────────────────────────────────────────────────

/**
 * Validate critical environment variables at startup.
 * The server will refuse to start rather than run with dangerous defaults.
 */
function validateEnv(): void {
  const required = ['JWT_SECRET'] as const;
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  const secret = process.env.JWT_SECRET!;
  if (secret.length < 32) {
    console.error('❌ JWT_SECRET is too short. Use at least 32 characters.');
    process.exit(1);
  }
}

// ── App Factory ───────────────────────────────────────────────────────────────

function createApp(): Application {
  const app = express();

  // ── Global Middleware ────────────────────────────────────────────────────
  app.use(cors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-aegis-api-key'],
  }));

  app.use(express.json({ limit: '10kb' }));   // hard cap on body size
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // ── Request Logger (dev only) ────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    app.use((req, _res, next) => {
      console.log(`→ ${req.method} ${req.path}`);
      next();
    });
  }

  // ── Static Files (Web Dashboard) ───────────────────────────────────────────
  app.use(express.static('public'));

  // ── Health Check ─────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'AegisDB is running.',
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV ?? 'development',
      },
    });
  });

  // ── API Routes ───────────────────────────────────────────────────────────
  app.use('/api/v1/auth',     authLimiter, authRouter);
  app.use('/api/v1/project-auth', projectAuthRouter);
  app.use('/api/v1/projects', projectRouter);
  app.use('/api/v1/db',       dbRouter);
  app.use('/api/v1/storage',  storageRouter);
  app.use('/api/v1/hoster',   hosterRouter);
  app.use('/api/v1/admin',    adminRouter);

  // ── 404 Handler (after routes, before error handler) ────────────────────
  app.use(notFoundHandler);

  // ── Global Error Handler (must be last) ─────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  validateEnv();
  initSqlite();          // SQLite database initialization
  ensureUploadDir();    // uploads/biometrics/
  ensureHosterDirs();   // uploads/projects/ + workspaces/
  await initRuntimeAdapter(); // detect Docker vs Process mode

  const app = createApp();
  const PORT = parseInt(process.env.PORT ?? '3000', 10);

  const server = app.listen(PORT, () => {
    console.log('');
    console.log('┌──────────────────────────────────────────────────────┐');
    console.log('│              AegisDB Server  🛡️                       │');
    console.log('├──────────────────────────────────────────────────────┤');
    console.log(`│  Status  : Running                                   │`);
    console.log(`│  Port    : ${PORT}                                        │`);
    console.log(`│  Env     : ${(process.env.NODE_ENV ?? 'development').padEnd(42)}│`);
    console.log('├──────────────────────────────────────────────────────┤');
    console.log('│  Auth    : POST /api/v1/auth/register                │');
    console.log('│            POST /api/v1/auth/login                   │');
    console.log('│            POST /api/v1/auth/refresh                 │');
    console.log('│            POST /api/v1/auth/logout                  │');
    console.log('├──────────────────────────────────────────────────────┤');
    console.log('│  Projects: POST   /api/v1/projects                   │');
    console.log('│            GET    /api/v1/projects                   │');
    console.log('│            DELETE /api/v1/projects/:id               │');
    console.log('├──────────────────────────────────────────────────────┤');
    console.log('│  DB      : POST   /api/v1/db/collections             │');
    console.log('│            GET    /api/v1/db/collections             │');
    console.log('│            POST   /…/collections/:name/docs          │');
    console.log('│            GET    /…/collections/:name/docs          │');
    console.log('│            PATCH  /…/collections/:name/docs/:id      │');
    console.log('│            DELETE /…/collections/:name/docs/:id      │');
    console.log('├──────────────────────────────────────────────────────┤');
    console.log('│  Realtime: WS /?token=...                            │');
    console.log('├──────────────────────────────────────────────────────┤');
    console.log('│  Admin   : GET   /api/v1/admin/stats                 │');
    console.log('│            PATCH /api/v1/admin/rate-limits           │');
    console.log('└──────────────────────────────────────────────────────┘');
    console.log('');
  });

  // Attach Real-Time WebSocket Server
  wsService.init(server);

  // ── Graceful Shutdown ────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
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
