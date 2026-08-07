// ─────────────────────────────────────────────────────────────────────────────
//  src/scripts/migrate-envelope-encryption.ts
//  Database Migration Script: Legacy Field Encryption -> Two-Tier Envelope Encryption
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { getDb } from '../db/sqlite.connection';
import { envelopeEncryptionService } from '../services/envelope-encryption.service';
import { decryptValue, isEncryptedField } from '../utils/encryption.helper';

interface CollectionRecord {
  ownerId: string;
  projectId: string;
  name: string;
  schema: string | null;
}

interface DocumentRecord {
  id: string;
  ownerId: string;
  projectId: string;
  collectionName: string;
  data: string;
}

function getEncryptedFieldsFromSchema(schemaStr: string | null): string[] {
  const fields = new Set<string>(['ssn', 'creditCard', 'biometrics', 'password', 'faceEncoding', 'secret']);
  if (schemaStr) {
    try {
      const parsed = JSON.parse(schemaStr);
      if (parsed && parsed.properties) {
        for (const [key, prop] of Object.entries(parsed.properties)) {
          if (prop && typeof prop === 'object' && (prop as any)['x-encrypted'] === true) {
            fields.add(key);
          }
        }
      }
    } catch (_) {}
  }
  return Array.from(fields);
}

export async function runEnvelopeEncryptionMigration(): Promise<void> {
  console.log('================================================================');
  console.log('🔒 Starting Envelope Encryption Migration (DEK / KEK)');
  console.log('================================================================\n');

  const startTime = Date.now();
  const db = getDb();

  // 1. Ensure project_keys table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_keys (
      projectId TEXT PRIMARY KEY,
      dekEncrypted TEXT NOT NULL,
      dekIv TEXT NOT NULL,
      dekTag TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);
  console.log('✅ Verified `project_keys` schema table.');

  // 2. Fetch all collections
  const collections = db.prepare('SELECT ownerId, projectId, name, schema FROM collections').all() as CollectionRecord[];
  console.log(`📋 Found ${collections.length} total collections in database.\n`);

  let totalDocsProcessed = 0;
  let totalFieldsMigrated = 0;
  let totalCollectionsMigrated = 0;

  const updateDocStmt = db.prepare('UPDATE documents SET data = ?, updatedAt = ? WHERE id = ?');

  // 3. Process each collection inside transaction
  for (const coll of collections) {
    const targetFields = getEncryptedFieldsFromSchema(coll.schema);
    const docs = db.prepare(
      'SELECT id, ownerId, projectId, collectionName, data FROM documents WHERE ownerId = ? AND projectId = ? AND collectionName = ?'
    ).all(coll.ownerId, coll.projectId, coll.name) as DocumentRecord[];

    if (docs.length === 0) continue;

    console.log(`📂 Collection [${coll.name}] (Project: ${coll.projectId}): Processing ${docs.length} documents...`);

    let collFieldsMigrated = 0;
    let collDocsMigrated = 0;

    const migrationTx = db.transaction(() => {
      for (const docRec of docs) {
        let parsedData: any;
        try {
          parsedData = JSON.parse(docRec.data);
        } catch {
          continue;
        }

        let docModified = false;

        for (const field of targetFields) {
          const val = parsedData[field];
          if (val === undefined || val === null) continue;

          // Check if field is legacy encrypted format
          if (isEncryptedField(val)) {
            // Legacy single-key encrypted field -> Decrypt legacy then re-encrypt with Envelope DEK
            try {
              const decryptedVal = decryptValue(val, docRec.projectId);
              parsedData[field] = envelopeEncryptionService.encryptField(decryptedVal, docRec.projectId);
              docModified = true;
              collFieldsMigrated++;
            } catch (err: any) {
              console.warn(`   ⚠️ Warning: Could not decrypt legacy field '${field}' on doc '${docRec.id}': ${err.message}`);
            }
          } else if (typeof val !== 'object' || !val._encrypted) {
            // Unencrypted raw value in an x-encrypted field -> Re-encrypt with Envelope DEK
            parsedData[field] = envelopeEncryptionService.encryptField(val, docRec.projectId);
            docModified = true;
            collFieldsMigrated++;
          }
        }

        if (docModified) {
          const now = new Date().toISOString();
          updateDocStmt.run(JSON.stringify(parsedData), now, docRec.id);
          collDocsMigrated++;
        }
      }
    });

    migrationTx();

    if (collDocsMigrated > 0) {
      totalCollectionsMigrated++;
      totalDocsProcessed += collDocsMigrated;
      totalFieldsMigrated += collFieldsMigrated;
      console.log(`   ✨ Migrated ${collDocsMigrated} docs (${collFieldsMigrated} fields re-wrapped).\n`);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log('================================================================');
  console.log('🎉 Envelope Encryption Migration Complete!');
  console.log(`   Collections Processed : ${totalCollectionsMigrated}`);
  console.log(`   Documents Migrated   : ${totalDocsProcessed}`);
  console.log(`   Fields Re-encrypted  : ${totalFieldsMigrated}`);
  console.log(`   Execution Time       : ${durationMs} ms`);
  console.log('================================================================');
}

// Run script if executed directly from CLI
if (require.main === module) {
  runEnvelopeEncryptionMigration().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}
