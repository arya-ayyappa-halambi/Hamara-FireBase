const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const { getDb, initSqlite } = require('./dist/db/sqlite.connection');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbBak = new Database('aegis.db.bak', { readonly: true });
initSqlite();
const dbMain = getDb();

const projectUsers = dbBak.prepare('SELECT * FROM project_users').all();

const insertProjUser = dbMain.prepare(`
  INSERT INTO project_users (
    id, projectId, email, emailHash, passwordHash, provider, createdAt, updatedAt,
    lastLoginAt, role, customClaims, mfaEnabled, mfaSecret
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let count = 0;
// We'll just do it outside of a strict db.transaction to avoid nested issues,
// since it's a one-off script anyway. Or use db.transaction.
const restore = dbMain.transaction(() => {
  dbMain.prepare('DELETE FROM project_users').run();
  
  for (const pu of projectUsers) {
    const emailHash = envelopeEncryptionService.hashBlindIndex(pu.email.trim().toLowerCase());
    const encEmail = envelopeEncryptionService.encryptField(pu.email.trim().toLowerCase(), pu.projectId);
    const encMfa = pu.mfaSecret ? envelopeEncryptionService.encryptField(pu.mfaSecret, pu.projectId) : null;
    
    insertProjUser.run(
      pu.id, pu.projectId, JSON.stringify(encEmail), emailHash, pu.passwordHash, pu.provider,
      pu.createdAt, pu.updatedAt, pu.lastLoginAt, pu.role, pu.customClaims,
      pu.mfaEnabled, encMfa ? JSON.stringify(encMfa) : null
    );
    count++;
  }
});
restore();

console.log(`✅ Restored and encrypted ${count} project_users from aegis.db.bak`);
