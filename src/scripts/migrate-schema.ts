import dotenv from 'dotenv';
dotenv.config();
import { initSqlite, getDb } from '../db/sqlite.connection';
import { envelopeEncryptionService } from '../services/envelope-encryption.service';
import fs from 'fs';

// Force environment variables for migration if missing
process.env.JWT_SECRET = process.env.JWT_SECRET || 'aegisdb_default_master_encryption_key_32_chars';
process.env.EMAIL_HASH_PEPPER = process.env.EMAIL_HASH_PEPPER || 'aegisdb_default_email_hash_pepper_32_chars';

function runMigration() {
  console.log('🚀 Starting Schema & Encryption Migration...');
  initSqlite();
  const db = getDb();
  db.pragma('foreign_keys = OFF');

  // Create temporary tables with the NEW schema
  db.exec(`
    CREATE TABLE _new_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      emailHash TEXT UNIQUE NOT NULL,
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
      billingMonthStart TEXT,
      mfaEnabled INTEGER DEFAULT 0,
      mfaSecret TEXT
    );

    CREATE TABLE _new_project_users (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      email TEXT NOT NULL,
      emailHash TEXT NOT NULL,
      passwordHash TEXT,
      provider TEXT NOT NULL DEFAULT 'email',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastLoginAt TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      customClaims TEXT,
      mfaEnabled INTEGER DEFAULT 0,
      mfaSecret TEXT,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(projectId, emailHash)
    );
  `);

  // 1. Migrate Users
  const users = db.prepare('SELECT * FROM users').all() as any[];
  const insertUser = db.prepare(`
    INSERT INTO _new_users (
      id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt,
      apiLimit, readLimit, writeLimit, readsCount, writesCount, lockoutMinutes,
      lockedUntil, billingMonthStart, mfaEnabled, mfaSecret
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of users) {
    const emailHash = envelopeEncryptionService.hashBlindIndex(u.email.trim().toLowerCase());
    const encEmail = envelopeEncryptionService.encryptField(u.email.trim().toLowerCase(), 'SYSTEM');
    const encName = envelopeEncryptionService.encryptField(u.name, 'SYSTEM');
    const encMfa = u.mfaSecret ? envelopeEncryptionService.encryptField(u.mfaSecret, 'SYSTEM') : null;

    insertUser.run(
      u.id, JSON.stringify(encEmail), emailHash, JSON.stringify(encName), u.passwordHash,
      u.isSuperAdmin, u.createdAt, u.updatedAt, u.apiLimit, u.readLimit, u.writeLimit,
      u.readsCount, u.writesCount, u.lockoutMinutes, u.lockedUntil, u.billingMonthStart,
      u.mfaEnabled, encMfa ? JSON.stringify(encMfa) : null
    );
  }
  console.log(`✅ Migrated ${users.length} users to new encrypted structure.`);

  // 2. Migrate Project Users
  const projectUsers = db.prepare('SELECT * FROM project_users').all() as any[];
  const insertProjUser = db.prepare(`
    INSERT INTO _new_project_users (
      id, projectId, email, emailHash, passwordHash, provider, createdAt, updatedAt,
      lastLoginAt, role, customClaims, mfaEnabled, mfaSecret
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const pu of projectUsers) {
    const emailHash = envelopeEncryptionService.hashBlindIndex(pu.email.trim().toLowerCase());
    const encEmail = envelopeEncryptionService.encryptField(pu.email.trim().toLowerCase(), pu.projectId);
    const encMfa = pu.mfaSecret ? envelopeEncryptionService.encryptField(pu.mfaSecret, pu.projectId) : null;
    
    // customClaims is left plaintext as per rules
    insertProjUser.run(
      pu.id, pu.projectId, JSON.stringify(encEmail), emailHash, pu.passwordHash, pu.provider,
      pu.createdAt, pu.updatedAt, pu.lastLoginAt, pu.role, pu.customClaims,
      pu.mfaEnabled, encMfa ? JSON.stringify(encMfa) : null
    );
  }
  console.log(`✅ Migrated ${projectUsers.length} project_users to new encrypted structure.`);

  // 3. Drop Old Tables and Rename New
  db.transaction(() => {
    db.exec(`
      DROP TABLE users;
      ALTER TABLE _new_users RENAME TO users;
      
      DROP TABLE project_users;
      ALTER TABLE _new_project_users RENAME TO project_users;
      CREATE INDEX idx_project_users_project ON project_users(projectId);
    `);
  })();
  
  db.pragma('foreign_keys = ON');

  // 4. Add actorEmailHash to audit_logs
  try {
    db.exec(`ALTER TABLE audit_logs ADD COLUMN actorEmailHash TEXT;`);
  } catch(e) {}
  
  const logs = db.prepare('SELECT id, actorEmail, projectId FROM audit_logs').all() as any[];
  let logCount = 0;
  for (const log of logs) {
    if (log.actorEmail) {
      const isSystem = log.actorEmail.startsWith('api-key::') || log.actorEmail.startsWith('service-role::');
      const hash = envelopeEncryptionService.hashBlindIndex(log.actorEmail);
      // Project ID is not always set if action is global admin
      let contextId = log.projectId ? log.projectId : 'SYSTEM';
      if (contextId !== 'SYSTEM') {
        const projExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(contextId);
        if (!projExists) contextId = 'SYSTEM';
      }
      const enc = envelopeEncryptionService.encryptField(log.actorEmail.trim().toLowerCase(), contextId);
      db.prepare('UPDATE audit_logs SET actorEmail = ?, actorEmailHash = ? WHERE id = ?').run(JSON.stringify(enc), hash, log.id);
      logCount++;
    }
  }
  console.log(`✅ Migrated ${logCount} audit_logs.`);

  // 5. Encrypt Webhook Secrets
  const hooks = db.prepare('SELECT id, secret, projectId FROM webhooks').all() as any[];
  for (const h of hooks) {
    if (h.secret && !h.secret.includes('{"_encrypted":true')) {
      const enc = envelopeEncryptionService.encryptField(h.secret, h.projectId);
      db.prepare('UPDATE webhooks SET secret = ? WHERE id = ?').run(JSON.stringify(enc), h.id);
    }
  }
  console.log(`✅ Migrated ${hooks.length} webhooks.`);

  // 6. Encrypt Platform Settings
  const settings = db.prepare('SELECT id, s3AccessKey, s3SecretKey FROM platform_settings').all() as any[];
  for (const s of settings) {
    let access = s.s3AccessKey;
    let secret = s.s3SecretKey;
    let modified = false;

    if (access && !access.includes('{"_encrypted":true')) {
      access = JSON.stringify(envelopeEncryptionService.encryptField(access, 'SYSTEM'));
      modified = true;
    }
    if (secret && !secret.includes('{"_encrypted":true')) {
      secret = JSON.stringify(envelopeEncryptionService.encryptField(secret, 'SYSTEM'));
      modified = true;
    }
    
    if (modified) {
      db.prepare('UPDATE platform_settings SET s3AccessKey = ?, s3SecretKey = ? WHERE id = ?').run(access, secret, s.id);
    }
  }
  console.log(`✅ Migrated platform_settings.`);
  console.log('🎉 Migration complete.');
}

runMigration();
