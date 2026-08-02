// ─────────────────────────────────────────────────────────────────────────────
//  src/db/sqlite.connection.ts
//  AegisDB — SQLite Database Connection & Migration Manager.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import Database from 'better-sqlite3';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const DB_PATH = path.resolve(process.cwd(), 'aegis.db');

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('journal_mode = WAL');
  }
  return dbInstance;
}

/**
 * Helper: Generate secure API Key in aegis_pk_... format and returns raw & SHA-256 hash.
 */
export function generateApiKey(): { rawApiKey: string; apiKeyHash: string } {
  const hex = crypto.randomBytes(16).toString('hex');
  const rawApiKey = `aegis_pk_${hex}`;
  const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
  return { rawApiKey, apiKeyHash };
}

/**
 * Initialize all database tables, columns, indexes, and Super Admin seed.
 */
export function initSqlite(): void {
  const db = getDb();

  db.exec(`
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      isSuperAdmin INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      apiLimit INTEGER DEFAULT 100,
      readLimit INTEGER DEFAULT 50000,
      writeLimit INTEGER DEFAULT 20000,
      readsCount INTEGER DEFAULT 0,
      writesCount INTEGER DEFAULT 0,
      lockoutMinutes INTEGER DEFAULT 1440,
      lockedUntil TEXT,
      billingMonthStart TEXT
    );

    -- Run migrations for existing users table
    PRAGMA table_info(users);


    -- 2. Projects Table
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      name TEXT NOT NULL,
      apiKeyHash TEXT UNIQUE NOT NULL,
      maxAssetSizeBytes INTEGER NOT NULL DEFAULT 10485760, -- 10MB default
      maxStorageBytes INTEGER NOT NULL DEFAULT 1073741824, -- 1GB default
      authConfig TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_apiKeyHash ON projects(apiKeyHash);
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(ownerId);

    -- 3. Collections Table
    CREATE TABLE IF NOT EXISTS collections (
      ownerId TEXT NOT NULL,
      name TEXT NOT NULL,
      projectId TEXT NOT NULL,
      description TEXT DEFAULT '',
      schema TEXT,
      rules TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (ownerId, projectId, name),
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 4. Documents Table
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      collectionName TEXT NOT NULL,
      projectId TEXT NOT NULL,
      data TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (ownerId, projectId, collectionName) REFERENCES collections(ownerId, projectId, name) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_docs_owner_proj_coll ON documents(ownerId, projectId, collectionName);

    -- 5. Assets Table (Biometric storage)
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      projectId TEXT,
      originalName TEXT NOT NULL,
      storedName TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL,
      absolutePath TEXT NOT NULL,
      uploadedAt TEXT NOT NULL,
      linkedCollectionId TEXT,
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(ownerId);

    -- 6. Deployments Table (Hoster module)
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      projectId TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      runtimeMode TEXT NOT NULL,
      containerId TEXT,
      pid INTEGER,
      allocatedPort INTEGER NOT NULL,
      workspaceDir TEXT NOT NULL,
      metadata TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      errorMessage TEXT,
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_owner ON deployments(ownerId);

    -- 7. Refresh Tokens Table
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tokenHash TEXT UNIQUE NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(userId);
  `);

  // Column migration check for isSuperAdmin if users table existed previously
  try {
    db.exec(`ALTER TABLE users ADD COLUMN isSuperAdmin INTEGER DEFAULT 0;`);
  } catch {
    // Already exists
  }

  // Column migration checks for projectId
  ['collections', 'documents', 'assets', 'deployments'].forEach((tbl) => {
    try {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN projectId TEXT;`);
    } catch {
      // Already exists
    }
  });

  // Schema & Rules migration for collections
  try {
    db.exec(`ALTER TABLE collections ADD COLUMN schema TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE collections ADD COLUMN rules TEXT;`);
  } catch {}

  // Project storage limits migration
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN maxAssetSizeBytes INTEGER NOT NULL DEFAULT 10485760;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN maxStorageBytes INTEGER NOT NULL DEFAULT 1073741824;`);
  } catch {}

  // User telemetry migration
  try {
    db.exec(`ALTER TABLE users ADD COLUMN apiLimit INTEGER DEFAULT 100;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN readLimit INTEGER DEFAULT 50000;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN writeLimit INTEGER DEFAULT 20000;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN readsCount INTEGER DEFAULT 0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN writesCount INTEGER DEFAULT 0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN lockoutMinutes INTEGER DEFAULT 1440;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN lockedUntil TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN billingMonthStart TEXT;`);
  } catch {}
  
  // Project Auth Config
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN authConfig TEXT;`);
  } catch {}

  // Seed Super Admin Account if absent
  seedSuperAdminSync(db);

  console.log(`🗄️  SQLite database initialised at ${DB_PATH}`);
}

function seedSuperAdminSync(db: Database.Database): void {
  const adminEmail = 'admin@aegis.dev';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const adminId = uuidv4();
    const now = new Date().toISOString();
    // Synchronously hash admin password
    argon2.hash('AdminPass123!').then((hash) => {
      db.prepare(`
        INSERT INTO users (id, email, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(adminId, adminEmail, 'Super Admin', hash, now, now);

      // Auto-create Default Project for Super Admin
      const { apiKeyHash } = generateApiKey();
      const projId = uuidv4();
      db.prepare(`
        INSERT INTO projects (id, ownerId, name, apiKeyHash, createdAt, updatedAt)
        VALUES (?, ?, 'Super Admin Default Project', ?, ?, ?)
      `).run(projId, adminId, apiKeyHash, now, now);

      console.log(`👑 Super Admin account seeded: ${adminEmail}`);
    }).catch(() => { /* silent */ });
  }
}
