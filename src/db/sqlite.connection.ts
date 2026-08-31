// ─────────────────────────────────────────────────────────────────────────────
//  src/db/sqlite.connection.ts
//  AegisDB — SQLite Database Connection & Migration Manager.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import Database from 'better-sqlite3';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'aegis.db');

let dbInstance: Database.Database | null = null;
let readerDbPool: Database.Database[] = [];
let currentReaderIndex = 0;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('synchronous = NORMAL');
    dbInstance.pragma('busy_timeout = 5000');
    dbInstance.pragma('cache_size = -20000');
    dbInstance.pragma('temp_store = MEMORY');
  }
  return dbInstance;
}

export function getReaderDb(): Database.Database {
  // If in-memory database path or write instance not yet initialized, fall back to write database
  if (DB_PATH === ':memory:') {
    return getDb();
  }
  if (readerDbPool.length === 0) {
    for (let i = 0; i < 3; i++) {
      const reader = new Database(DB_PATH, { readonly: true });
      reader.pragma('foreign_keys = ON');
      reader.pragma('journal_mode = WAL');
      reader.pragma('synchronous = NORMAL');
      reader.pragma('busy_timeout = 5000');
      reader.pragma('cache_size = -20000');
      reader.pragma('temp_store = MEMORY');
      readerDbPool.push(reader);
    }
  }
  const reader = readerDbPool[currentReaderIndex];
  currentReaderIndex = (currentReaderIndex + 1) % readerDbPool.length;
  return reader;
}

/**
 * Helper: Generate secure API Keys (Anon & Service) and SHA-256 hashes.
 */
export function generateProjectKeys(): {
  anonKey: string;
  anonKeyHash: string;
  serviceKey: string;
  serviceKeyHash: string;
} {
  const anonHex = crypto.randomBytes(16).toString('hex');
  const anonKey = `aegis_pk_${anonHex}`;
  const anonKeyHash = crypto.createHash('sha256').update(anonKey).digest('hex');

  const serviceHex = crypto.randomBytes(16).toString('hex');
  const serviceKey = `aegis_sk_${serviceHex}`;
  const serviceKeyHash = crypto.createHash('sha256').update(serviceKey).digest('hex');

  return { anonKey, anonKeyHash, serviceKey, serviceKeyHash };
}

export function generateApiKey(): { rawApiKey: string; apiKeyHash: string } {
  const keys = generateProjectKeys();
  return { rawApiKey: keys.anonKey, apiKeyHash: keys.anonKeyHash };
}

/**
 * Initialize all database tables, columns, indexes, and Super Admin seed.
 */
export function initSqlite(): void {
  const db = getDb();

  db.exec(`
    -- 1. Users Table (Platform Administrators/Developers)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      emailHash TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      isSuperAdmin INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      apiLimit INTEGER DEFAULT 10000,
      readLimit INTEGER DEFAULT 50000,
      writeLimit INTEGER DEFAULT 20000,
      readsCount INTEGER DEFAULT 0,
      writesCount INTEGER DEFAULT 0,
      lockoutMinutes INTEGER DEFAULT 1440,
      lockedUntil TEXT,
      billingMonthStart TEXT,
      mfaEnabled INTEGER DEFAULT 0,
      mfaSecret TEXT
    );

    -- Run migrations for existing users table
    PRAGMA table_info(users);
  `);

  try {
    db.exec('ALTER TABLE platform_settings ADD COLUMN backupRetentionDays INTEGER DEFAULT 7');
  } catch (e: any) {
    // Ignore if column already exists
  }

  db.exec(`
    -- 2. Projects Table
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      name TEXT NOT NULL,
      apiKeyHash TEXT UNIQUE NOT NULL,
      serviceKeyHash TEXT UNIQUE,
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
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (ownerId, projectId, collectionName) REFERENCES collections(ownerId, projectId, name) ON DELETE CASCADE
    );

    -- Platform settings table schema
    CREATE TABLE IF NOT EXISTS platform_settings (
      id TEXT PRIMARY KEY,
      googleAuthEnabled INTEGER DEFAULT 0,
      googleClientId TEXT,
      demoLoginEnabled INTEGER DEFAULT 1,
      maintenanceMode INTEGER DEFAULT 0,
      backupMode TEXT DEFAULT 'none',
      backupIntervalMinutes INTEGER DEFAULT 1440,
      backupRetentionDays INTEGER DEFAULT 7,
      s3BucketName TEXT,
      s3Region TEXT,
      s3AccessKey TEXT,
      s3SecretKey TEXT,
      lastBackupAt TEXT,
      lastBackupStatus TEXT,
      lastBackupS3Status TEXT,
      serverHost TEXT DEFAULT '0.0.0.0',
      serverPort INTEGER DEFAULT 3000,
      serverHostingMode TEXT DEFAULT 'both',
      customDomain TEXT DEFAULT ''
    );

    -- Scheduled endpoint migrations table schema
    CREATE TABLE IF NOT EXISTS scheduled_endpoint_migrations (
      id TEXT PRIMARY KEY,
      targetHost TEXT NOT NULL,
      targetPort INTEGER NOT NULL,
      targetMode TEXT NOT NULL,
      customDomain TEXT,
      scheduledAt TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      noticeMessage TEXT,
      createdAt TEXT NOT NULL,
      executedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_docs_owner_proj_coll ON documents(ownerId, projectId, collectionName);

    -- Project Encryption Keys Table (Envelope Encryption DEK/KEK)
    CREATE TABLE IF NOT EXISTS project_keys (
      projectId TEXT PRIMARY KEY,
      dekEncrypted TEXT NOT NULL,
      dekIv TEXT NOT NULL,
      dekTag TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- System Encryption Keys Table
    CREATE TABLE IF NOT EXISTS system_keys (
      id TEXT PRIMARY KEY,
      dekEncrypted TEXT NOT NULL,
      dekIv TEXT NOT NULL,
      dekTag TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    -- System Environment Backup Table
    CREATE TABLE IF NOT EXISTS system_env_backup (
      id TEXT PRIMARY KEY,
      envData TEXT NOT NULL
    );

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
      isRevoked INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(userId);

    -- 8. Project End-Users Table (Firebase-style Auth)
    CREATE TABLE IF NOT EXISTS project_users (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      email TEXT NOT NULL,
      emailHash TEXT NOT NULL,
      passwordHash TEXT,
      provider TEXT NOT NULL DEFAULT 'email',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastLoginAt TEXT,
      role TEXT DEFAULT 'viewer',
      customClaims TEXT,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(projectId, emailHash)
    );

    CREATE INDEX IF NOT EXISTS idx_project_users_project ON project_users(projectId);

    -- 9. Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      actorId TEXT,
      actorEmail TEXT,
      actorEmailHash TEXT,
      actionType TEXT NOT NULL,
      projectId TEXT,
      ipAddress TEXT,
      status TEXT NOT NULL,
      details TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(projectId);

    -- 10. Webhooks Table
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(projectId);

    -- 11. Account Deletion Lifecycle & Grace Period Table
    CREATE TABLE IF NOT EXISTS account_deletion_requests (
      id TEXT PRIMARY KEY,
      accountType TEXT NOT NULL, -- 'developer' | 'project_user'
      userId TEXT NOT NULL,
      projectId TEXT,
      userEmail TEXT NOT NULL,
      initiatedAt TEXT NOT NULL,
      gracePeriodDays INTEGER DEFAULT 7,
      scheduledDeletionAt TEXT NOT NULL,
      cancelledAt TEXT,
      cancelledBy TEXT, -- 'user' | 'admin'
      deletedAt TEXT,
      status TEXT NOT NULL DEFAULT 'pending' -- 'pending' | 'cancelled' | 'completed'
    );

    CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON account_deletion_requests(status);
    CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON account_deletion_requests(userId);

    -- 12. Account Threat Flags Table (Automated Heuristics & Super Admin Flags)
    CREATE TABLE IF NOT EXISTS account_security_flags (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      userEmail TEXT NOT NULL,
      reason TEXT NOT NULL, -- 'bot_activity' | 'spam' | 'malicious_traffic' | 'illegal_content' | 'compromised_account'
      severity TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high' | 'critical'
      riskScore INTEGER NOT NULL DEFAULT 0,
      detectionSource TEXT NOT NULL DEFAULT 'system_automated_heuristic', -- 'system_automated_heuristic' | 'super_admin_manual'
      triggerEvidence TEXT,
      flaggedAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'resolved'
      resolvedAt TEXT,
      resolvedBy TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_flags_user ON account_security_flags(userId);
    CREATE INDEX IF NOT EXISTS idx_flags_status ON account_security_flags(status);

    -- 13. Account Compliance Notices Table (Violations, Appeals & Purge Workflow)
    CREATE TABLE IF NOT EXISTS account_compliance_notices (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      userEmail TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      issuedAt TEXT NOT NULL,
      deadlineAt TEXT NOT NULL,
      userExplanation TEXT,
      explanationSubmittedAt TEXT,
      adminDecision TEXT DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected' | 'expired'
      decisionNotes TEXT,
      decidedAt TEXT,
      status TEXT NOT NULL DEFAULT 'open' -- 'open' | 'appealed' | 'revoked' | 'scheduled_for_purge' | 'purged'
    );

    CREATE INDEX IF NOT EXISTS idx_notices_user ON account_compliance_notices(userId);
    CREATE INDEX IF NOT EXISTS idx_notices_status ON account_compliance_notices(status);

    -- 14. Platform Policies & Terms Table (Versioning & Dynamic Rollout)
    CREATE TABLE IF NOT EXISTS platform_policies (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      termsAndConditions TEXT NOT NULL,
      securityPolicy TEXT NOT NULL,
      backupPolicy TEXT NOT NULL,
      effectiveDate TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      updatedBy TEXT NOT NULL
    );
  `);

  // Column migration checks for users & project_users status, deletion, flags, and policy versions
  const userModerationCols = [
    { table: 'users', col: 'status', def: "TEXT DEFAULT 'active'" },
    { table: 'users', col: 'deletionInitiatedAt', def: 'TEXT' },
    { table: 'users', col: 'scheduledDeletionAt', def: 'TEXT' },
    { table: 'users', col: 'isFlagged', def: 'INTEGER DEFAULT 0' },
    { table: 'users', col: 'riskScore', def: 'INTEGER DEFAULT 0' },
    { table: 'users', col: 'activeNoticeId', def: 'TEXT' },
    { table: 'users', col: 'noticeStatus', def: "TEXT DEFAULT 'none'" },
    { table: 'users', col: 'acceptedTermsVersion', def: "TEXT DEFAULT 'v1.0.0'" },
    { table: 'users', col: 'acceptedTermsAt', def: 'TEXT' },
    { table: 'project_users', col: 'status', def: "TEXT DEFAULT 'active'" },
    { table: 'project_users', col: 'deletionInitiatedAt', def: 'TEXT' },
    { table: 'project_users', col: 'scheduledDeletionAt', def: 'TEXT' },
    { table: 'project_users', col: 'isFlagged', def: 'INTEGER DEFAULT 0' },
    { table: 'project_users', col: 'riskScore', def: 'INTEGER DEFAULT 0' },
    { table: 'project_users', col: 'activeNoticeId', def: 'TEXT' },
    { table: 'project_users', col: 'noticeStatus', def: "TEXT DEFAULT 'none'" },
    { table: 'project_users', col: 'acceptedTermsVersion', def: "TEXT DEFAULT 'v1.0.0'" },
    { table: 'project_users', col: 'acceptedTermsAt', def: 'TEXT' }
  ];
  for (const { table, col, def } of userModerationCols) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
    } catch {}
  }

  // Column migration check for isSuperAdmin if users table existed previously
  try {
    db.exec(`ALTER TABLE users ADD COLUMN isSuperAdmin INTEGER DEFAULT 0;`);
  } catch {
    // Already exists
  }

  // Backup and Hosting configuration columns for platform_settings
  const platformCols = [
    { name: 'backupMode', def: "TEXT DEFAULT 'none'" },
    { name: 'backupIntervalMinutes', def: 'INTEGER DEFAULT 1440' },
    { name: 's3BucketName', def: 'TEXT' },
    { name: 's3Region', def: 'TEXT' },
    { name: 's3AccessKey', def: 'TEXT' },
    { name: 's3SecretKey', def: 'TEXT' },
    { name: 'maintenanceMode', def: 'INTEGER DEFAULT 0' },
    { name: 'demoLoginEnabled', def: 'INTEGER DEFAULT 1' },
    { name: 'serverHost', def: "TEXT DEFAULT '0.0.0.0'" },
    { name: 'serverPort', def: 'INTEGER DEFAULT 3000' },
    { name: 'serverHostingMode', def: "TEXT DEFAULT 'both'" },
    { name: 'customDomain', def: "TEXT DEFAULT ''" },
    { name: 'ipFilteringEnabled', def: 'INTEGER DEFAULT 0' },
    { name: 'ipFilterDefaultPolicy', def: "TEXT DEFAULT 'allow'" }
  ];
  for (const col of platformCols) {
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN ${col.name} ${col.def};`);
    } catch {}
  }

  // Network Access Control & Device Tracking Tables
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS network_access_rules (
        id TEXT PRIMARY KEY,
        ipPattern TEXT NOT NULL,
        label TEXT NOT NULL,
        ruleType TEXT NOT NULL DEFAULT 'ip',
        action TEXT NOT NULL DEFAULT 'allow',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        createdBy TEXT,
        expiresAt TEXT,
        isTemporary INTEGER DEFAULT 0,
        durationLabel TEXT DEFAULT 'Permanent'
      );
      CREATE INDEX IF NOT EXISTS idx_net_rules_pattern ON network_access_rules(ipPattern);

      CREATE TABLE IF NOT EXISTS tracked_client_devices (
        ipAddress TEXT PRIMARY KEY,
        userAgent TEXT,
        deviceType TEXT DEFAULT 'desktop',
        osName TEXT DEFAULT 'Unknown',
        browserName TEXT DEFAULT 'Unknown',
        lastUserId TEXT,
        lastUserEmail TEXT,
        requestCount INTEGER DEFAULT 1,
        firstSeenAt TEXT NOT NULL,
        lastSeenAt TEXT NOT NULL,
        isBlocked INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_tracked_dev_lastSeen ON tracked_client_devices(lastSeenAt);

      CREATE TABLE IF NOT EXISTS jailed_ip_records (
        id TEXT PRIMARY KEY,
        ipAddress TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT 'brute_force',
        failedAttempts INTEGER DEFAULT 1,
        jailedAt TEXT NOT NULL,
        expiresAt TEXT,
        durationMinutes INTEGER DEFAULT 15,
        status TEXT DEFAULT 'active',
        unjailedAt TEXT,
        unjailedBy TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jailed_ip_lookup ON jailed_ip_records(ipAddress, status);

      CREATE TABLE IF NOT EXISTS subnet_rate_limit_policies (
        id TEXT PRIMARY KEY,
        subnetPattern TEXT NOT NULL,
        label TEXT NOT NULL,
        requestsPerMinute INTEGER DEFAULT 300,
        burstLimit INTEGER DEFAULT 50,
        bandwidthLimitKbps INTEGER DEFAULT 10000,
        actionOnExceed TEXT DEFAULT 'block',
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_subnet_rate_pattern ON subnet_rate_limit_policies(subnetPattern);
    `);

    // Safe column migrations for existing databases
    try {
      db.exec(`ALTER TABLE network_access_rules ADD COLUMN expiresAt TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE network_access_rules ADD COLUMN isTemporary INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE network_access_rules ADD COLUMN durationLabel TEXT DEFAULT 'Permanent';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE network_access_rules ADD COLUMN scope TEXT DEFAULT 'global';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE network_access_rules ADD COLUMN projectId TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN adminEndpointIpLockEnabled INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN adminAllowedSubnet TEXT DEFAULT '127.0.0.1';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN requireWriteIpWhitelist INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN enableSubnetRateLimiting INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN defaultSubnetRequestsPerMin INTEGER DEFAULT 300;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN emergencyLockdownLevel TEXT DEFAULT 'normal';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN emergencyLockdownReason TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN emergencyLockdownActivatedAt TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN maintenanceWindowEnabled INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN maintenanceMessage TEXT DEFAULT 'System is temporarily undergoing scheduled maintenance.';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN maintenanceStartAt TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN maintenanceEndAt TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN maintenanceRetryAfterSeconds INTEGER DEFAULT 300;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN wafEnabled INTEGER DEFAULT 1;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN wafBlockSqlInjection INTEGER DEFAULT 1;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN wafBlockXss INTEGER DEFAULT 1;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN wafBlockPrototypePollution INTEGER DEFAULT 1;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN wafBlockPathTraversal INTEGER DEFAULT 1;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN wafBlockScanners INTEGER DEFAULT 1;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN wafAutoJailRepeatOffenders INTEGER DEFAULT 1;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN tunnelEnabled INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN tunnelProvider TEXT DEFAULT 'localtunnel';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN tunnelAuthToken TEXT DEFAULT '';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN tunnelCustomDomain TEXT DEFAULT '';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN tunnelPublicUrl TEXT DEFAULT '';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN tunnelStartedAt TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN tunnelExpiresAt TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE platform_settings ADD COLUMN tunnelAutoCloseMinutes INTEGER DEFAULT 60;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE tracked_client_devices ADD COLUMN countryCode TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE tracked_client_devices ADD COLUMN countryName TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE tracked_client_devices ADD COLUMN city TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE tracked_client_devices ADD COLUMN isp TEXT;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE tracked_client_devices ADD COLUMN threatType TEXT DEFAULT 'normal';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE tracked_client_devices ADD COLUMN threatScore INTEGER DEFAULT 0;`);
    } catch (_) {}
  } catch {}

  // Ensure scheduled_endpoint_migrations table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_endpoint_migrations (
        id TEXT PRIMARY KEY,
        targetHost TEXT NOT NULL,
        targetPort INTEGER NOT NULL,
        targetMode TEXT NOT NULL,
        customDomain TEXT,
        scheduledAt TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        noticeMessage TEXT,
        createdAt TEXT NOT NULL,
        executedAt TEXT
      );
    `);
  } catch {}

  // Backup config for projects
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN backupConfig TEXT;`);
  } catch {}

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

  // Migrate project_users to add role and customClaims
  try {
    db.exec(`ALTER TABLE project_users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE project_users ADD COLUMN customClaims TEXT;`);
  } catch {}

  // Migrate users & project_users for TOTP MFA support
  try { db.exec(`ALTER TABLE users ADD COLUMN mfaEnabled INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN mfaSecret TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE project_users ADD COLUMN mfaEnabled INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE project_users ADD COLUMN mfaSecret TEXT;`); } catch {}

  // Migrate refresh_tokens for Token Family Rotation & Reuse Detection
  try { db.exec(`ALTER TABLE refresh_tokens ADD COLUMN familyId TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE refresh_tokens ADD COLUMN isSpent INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE refresh_tokens ADD COLUMN isRevoked INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(familyId);`); } catch {}

  // Migrate documents to add version column
  try {
    db.exec(`ALTER TABLE documents ADD COLUMN version INTEGER NOT NULL DEFAULT 1;`);
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

  // Migrate projects table to add serviceKeyHash
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN serviceKeyHash TEXT;`);
    // Create unique index for serviceKeyHash
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_serviceKeyHash ON projects(serviceKeyHash);`);
  } catch {}

  // Backfill serviceKeyHash for existing projects
  try {
    const projects = db.prepare('SELECT id FROM projects WHERE serviceKeyHash IS NULL').all() as { id: string }[];
    for (const p of projects) {
      const hexService = crypto.randomBytes(16).toString('hex');
      const serviceKey = `aegis_sk_${hexService}`;
      const serviceKeyHash = crypto.createHash('sha256').update(serviceKey).digest('hex');
      db.prepare('UPDATE projects SET serviceKeyHash = ? WHERE id = ?').run(serviceKeyHash, p.id);
      console.log(`ℹ️ Generated service role key for existing project ${p.id}.`);
    }
  } catch (e) {
    // Ignore if table doesn't have the column yet or other db errors
  }

  // Ensure default platform settings exist
  try {
    db.exec(`ALTER TABLE platform_settings ADD COLUMN lastBackupLocation TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE platform_settings ADD COLUMN lastBackupS3Url TEXT;`);
  } catch {}

  try {
    db.exec(`INSERT OR IGNORE INTO platform_settings (id, googleAuthEnabled, googleClientId, backupMode, backupIntervalMinutes, s3BucketName, s3Region, s3AccessKey, s3SecretKey, lastBackupAt, lastBackupStatus, lastBackupS3Status, lastBackupLocation, lastBackupS3Url) VALUES ('default', 0, '', 'none', 1440, '', '', '', '', null, null, null, null, null);`);
  } catch (e) {
    console.error('Failed to insert default platform settings', e);
  }

  // Ensure default platform policies exist (v1.0.0)
  try {
    const existingPolicy = db.prepare('SELECT id FROM platform_policies WHERE id = ?').get('default');
    if (!existingPolicy) {
      const now = new Date().toISOString();
      const defaultTerms = `# AegisDB Platform Terms & Conditions (v1.0.0)\n\n### 1. Acceptance of Terms\nBy creating an account, connecting client applications, or utilizing AegisDB APIs, SDKs, and storage services, you agree to comply with these terms. You agree not to engage in malicious scraping, DDoS, credential harvesting, unlawful payload transmission, or unauthorized multi-tenant tampering.\n\n### 2. Trust, Safety & Automated Moderation\nAegisDB continuously monitors incoming requests for abusive, bot, or malicious activity. Accounts exhibiting high-risk behavioral anomalies may be flagged, issued formal compliance violation notices, or subjected to permanent automated erasure.\n\n### 3. Data Ownership & Portability\nYou retain ownership of all data stored within your projects. Under GDPR Article 20, you may export your data bundle at any time.`;

      const defaultSecurity = `# AegisDB Security & Cryptographic Policy (v1.0.0)\n\n### 1. Zero-Trust Architecture\nAll data at rest is protected with two-tier envelope encryption (AES-256-GCM) with hardware-isolated HKDF Master Key Derivation. All traffic requires TLS 1.3 / HTTPS.\n\n### 2. Credential Protection\nDevelopers and users are responsible for safeguarding API keys, JWT access tokens, and RFC 6238 TOTP authenticator devices. Compromised credentials or accounts with excessive lockout velocity will be flagged for investigation.`;

      const defaultBackup = `# AegisDB Backup & Disaster Recovery Policy (v1.0.0)\n\n### 1. Automated Snapshotting\nAegisDB provides localized snapshotting and automated S3-compatible remote backup mechanisms.\n\n### 2. Right to Erasure & Grace Period\nIn accordance with GDPR Article 17, account deletion enforces a 7-day cooling-off grace period before permanent, irreversible cascading erasure.`;

      db.prepare(`
        INSERT INTO platform_policies (id, version, termsAndConditions, securityPolicy, backupPolicy, effectiveDate, updatedAt, updatedBy)
        VALUES ('default', 'v1.0.0', ?, ?, ?, ?, ?, 'system')
      `).run(defaultTerms, defaultSecurity, defaultBackup, now, now);
      console.log('📜 Default platform policies seeded (version v1.0.0).');
    }
  } catch (e: any) {
    console.error('Failed to seed default platform policies:', e.message);
  }

  // Ensure One-Time Admin Tokens (OTT) table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS one_time_admin_tokens (
        id TEXT PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        createdByUserId TEXT NOT NULL,
        ipRestriction TEXT,
        expiresAt TEXT NOT NULL,
        isUsed INTEGER DEFAULT 0,
        usedAt TEXT,
        usedByIp TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ott_token ON one_time_admin_tokens(token);
    `);
  } catch {}

  // Ensure Zero-Trust Device Access Requests table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_access_requests (
        id TEXT PRIMARY KEY,
        ipAddress TEXT NOT NULL,
        userAgent TEXT NOT NULL,
        deviceName TEXT NOT NULL,
        fingerprintHash TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        requestedAt TEXT NOT NULL,
        decidedAt TEXT,
        decidedBy TEXT,
        expiresAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_device_requests_ip ON device_access_requests(ipAddress);
    `);
  } catch {}

  // Seed Super Admin Account if absent
  seedSuperAdminSync(db);

  console.log(`🗄️  SQLite database initialised at ${DB_PATH}`);
}

function seedSuperAdminSync(db: Database.Database): void {
  const seedAccounts = [
    { email: 'admin@aegis.dev', pass: 'AdminPass123!' },
    { email: 'admin@aegisdb.dev', pass: 'Admin@123' },
  ];

  for (const acc of seedAccounts) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(acc.email);
    if (!existing) {
      const adminId = uuidv4();
      const now = new Date().toISOString();
      // Synchronously hash admin password
      argon2.hash(acc.pass).then((hash) => {
        const pepper = process.env.EMAIL_HASH_PEPPER || 'default_pepper';
        const emailHash = crypto.createHmac('sha256', pepper).update(acc.email).digest('hex');

        db.prepare(`
          INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `).run(adminId, acc.email, emailHash, 'Super Admin', hash, now, now);

        // Auto-create Default Project for Super Admin
        const keys = generateProjectKeys();
        const projId = uuidv4();
        db.prepare(`
          INSERT INTO projects (id, ownerId, name, apiKeyHash, serviceKeyHash, createdAt, updatedAt)
          VALUES (?, ?, 'Super Admin Default Project', ?, ?, ?, ?)
        `).run(projId, adminId, keys.anonKeyHash, keys.serviceKeyHash, now, now);

        console.log(`👑 Super Admin account seeded: ${acc.email}`);
        console.log(`🔑 Anon Key: ${keys.anonKey}`);
        console.log(`🔑 Service Key: ${keys.serviceKey}`);
      }).catch(() => { /* silent */ });
    }
  }
}
