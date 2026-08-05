// ─────────────────────────────────────────────────────────────────────────────
//  src/db/db.service.ts
//  Dynamic Schema Database Engine — Collection & Document Manager (SQLite-backed).
//
//  Key design properties:
//    • Schemaless: documents are stored as arbitrary JSON objects in SQLite
//    • Owner-isolated: collections and documents are filtered by ownerId
//    • Queryable: field equality + comparison operators + sort + pagination
//    • Persistent: powered by SQLite for durability across restarts
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import { AppError } from '../types/auth.types';
import {
  Collection,
  Document,
  DocumentObject,
  DocumentValue,
  FieldOperators,
  FilterExpression,
  QueryOptions,
  QueryResult,
  CreateCollectionDto,
} from '../types/db.types';
import { getDb, getReaderDb } from './sqlite.connection';
import { wsService } from '../realtime/websocket.service';
import { encryptValue, decryptValue, isEncryptedField } from '../utils/encryption.helper';
import { webhookService } from '../services/webhook.service';
import { cosineSimilarity } from '../utils/vector.helper';

function preprocessVectorSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const cloned = JSON.parse(JSON.stringify(schema));
  
  if (cloned.properties) {
    for (const key of Object.keys(cloned.properties)) {
      const prop = cloned.properties[key];
      if (prop && prop.type === 'vector') {
        prop.type = 'array';
        prop.items = { type: 'number' };
      }
    }
  }
  return cloned;
}

// ── Encryption Helpers ────────────────────────────────────────────────────────

function getFieldsToEncrypt(coll: Collection): string[] {
  const fields = new Set<string>(['ssn', 'creditCard', 'biometrics', 'password', 'faceEncoding', 'secret']);
  if (coll.schema) {
    try {
      const parsed = JSON.parse(coll.schema);
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

function encryptDocumentFields(doc: any, coll: Collection, projectId: string): any {
  if (!doc) return doc;
  const fieldsToEncrypt = getFieldsToEncrypt(coll);
  const cloned = { ...doc };
  for (const field of fieldsToEncrypt) {
    if (cloned[field] !== undefined && cloned[field] !== null && !isEncryptedField(cloned[field])) {
      cloned[field] = encryptValue(cloned[field], projectId);
    }
  }
  return cloned;
}

function decryptDocumentFields(doc: any, projectId: string): any {
  if (!doc) return doc;
  const cloned = { ...doc };
  for (const key of Object.keys(cloned)) {
    if (isEncryptedField(cloned[key])) {
      cloned[key] = decryptValue(cloned[key], projectId);
    }
  }
  return cloned;
}


const ajv = new Ajv({ strict: false });

// ── Constants ─────────────────────────────────────────────────────────────────

const COLLECTION_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/;
const MAX_QUERY_LIMIT = 10000;
const DEFAULT_QUERY_LIMIT = 20;

// ── Filter Engine ─────────────────────────────────────────────────────────────

/**
 * Tests whether a single document field value satisfies an operator expression.
 * Supports: $eq, $ne, $gt, $gte, $lt, $lte, $contains
 */
function matchesOperators(fieldValue: DocumentValue, ops: FieldOperators): boolean {
  if (ops.$eq !== undefined && fieldValue !== ops.$eq) return false;
  if (ops.$ne !== undefined && fieldValue === ops.$ne) return false;

  const num = typeof fieldValue === 'number' ? fieldValue : NaN;
  if (ops.$gt !== undefined  && (isNaN(num) || num <= ops.$gt))  return false;
  if (ops.$gte !== undefined && (isNaN(num) || num < ops.$gte))  return false;
  if (ops.$lt !== undefined  && (isNaN(num) || num >= ops.$lt))  return false;
  if (ops.$lte !== undefined && (isNaN(num) || num > ops.$lte))  return false;

  if (ops.$contains !== undefined) {
    if (typeof fieldValue !== 'string') return false;
    if (!fieldValue.includes(ops.$contains)) return false;
  }

  return true;
}

/**
 * Returns true if the document matches ALL entries in the filter expression.
 */
function matchesFilter(doc: Document, filter: FilterExpression): boolean {
  for (const [field, condition] of Object.entries(filter)) {
    const docValue = doc[field] as DocumentValue;

    if (
      condition !== null &&
      typeof condition === 'object' &&
      !Array.isArray(condition) &&
      Object.keys(condition).some((k) => k.startsWith('$'))
    ) {
      // Operator object
      if (!matchesOperators(docValue, condition as FieldOperators)) return false;
    } else {
      // Literal equality
      if (docValue !== condition) return false;
    }
  }
  return true;
}

// ── Sort Engine ───────────────────────────────────────────────────────────────

function sortDocuments(docs: Document[], sortBy: string, order: 'asc' | 'desc'): Document[] {
  return [...docs].sort((a, b) => {
    const av = a[sortBy] as DocumentValue;
    const bv = b[sortBy] as DocumentValue;

    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else if (typeof av === 'string' && typeof bv === 'string') {
      cmp = av.localeCompare(bv);
    } else if (av === undefined || av === null) {
      cmp = 1; // push nulls to end
    } else if (bv === undefined || bv === null) {
      cmp = -1;
    }

    return order === 'desc' ? -cmp : cmp;
  });
}

// ── SQLite DB Store ───────────────────────────────────────────────────────────

class SqliteDbStore {
  // ── Collections ────────────────────────────────────────────────────────────

  createCollection(ownerId: string, projectId: string, dto: CreateCollectionDto): Collection {
    const { name, description = '', schema = null, rules = null } = dto;

    if (!COLLECTION_NAME_REGEX.test(name)) {
      throw new AppError(
        'Collection name must start with a letter, and contain only letters, numbers, underscores, or hyphens (2–64 chars).',
        400,
      );
    }

    // Validate schema format if provided
    if (schema) {
      try {
        let parsedSchema = JSON.parse(schema);
        parsedSchema = preprocessVectorSchema(parsedSchema);
        ajv.compile(parsedSchema); // Check if it's a valid JSON schema
      } catch (e: any) {
        throw new AppError(`Invalid JSON Schema: ${e.message}`, 400);
      }
    }

    const db = getDb();
    const existing = db.prepare('SELECT 1 FROM collections WHERE ownerId = ? AND projectId = ? AND name = ?').get(ownerId, projectId, name);
    if (existing) {
      throw new AppError(`Collection "${name}" already exists in this project.`, 409);
    }

    const now = new Date().toISOString();
    const meta: Collection = {
      name,
      description,
      ownerId,
      schema: schema || undefined,
      rules: rules || undefined,
      documentCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO collections (ownerId, projectId, name, description, schema, rules, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ownerId, projectId, name, description, schema, rules, now, now);

    return meta;
  }

  listCollections(ownerId: string, projectId: string): Collection[] {
    const db = getReaderDb();
    const rows = db.prepare(`
      SELECT c.name, c.description, c.ownerId, c.schema, c.rules, c.createdAt, c.updatedAt,
             COUNT(d.id) as documentCount
      FROM collections c
      LEFT JOIN documents d ON c.ownerId = d.ownerId AND c.projectId = d.projectId AND c.name = d.collectionName
      WHERE c.ownerId = ? AND c.projectId = ?
      GROUP BY c.name, c.description, c.ownerId, c.schema, c.rules, c.createdAt, c.updatedAt
      ORDER BY c.createdAt ASC
    `).all(ownerId, projectId) as (Collection & { documentCount: number })[];

    return rows;
  }

  getCollection(ownerId: string, projectId: string, name: string): Collection {
    if (!COLLECTION_NAME_REGEX.test(name)) {
      throw new AppError(
        'Collection name must start with a letter, and contain only letters, numbers, underscores, or hyphens (2–64 chars).',
        400,
      );
    }
    const db = getReaderDb();
    const row = db.prepare(`
      SELECT c.name, c.description, c.ownerId, c.schema, c.rules, c.createdAt, c.updatedAt,
             COUNT(d.id) as documentCount
      FROM collections c
      LEFT JOIN documents d ON c.ownerId = d.ownerId AND c.projectId = d.projectId AND c.name = d.collectionName
      WHERE c.ownerId = ? AND c.projectId = ? AND c.name = ?
      GROUP BY c.name, c.description, c.ownerId, c.schema, c.rules, c.createdAt, c.updatedAt
    `).get(ownerId, projectId, name) as Collection | undefined;

    if (!row) {
      // Auto-create collection to match Firebase behavior
      this.createCollection(ownerId, projectId, { name });
      return this.getCollection(ownerId, projectId, name);
    }

    return row;
  }

  updateCollection(ownerId: string, projectId: string, name: string, patch: { description?: string; schema?: string; rules?: string }): Collection {
    const existing = this.getCollection(ownerId, projectId, name);
    const db = getDb();

    if (patch.schema !== undefined) {
      if (patch.schema) {
        try {
          let parsedSchema = JSON.parse(patch.schema);
          parsedSchema = preprocessVectorSchema(parsedSchema);
          ajv.compile(parsedSchema);
        } catch (e: any) {
          throw new AppError(`Invalid JSON Schema: ${e.message}`, 400);
        }
      }
    }

    const newDescription = patch.description !== undefined ? patch.description : existing.description;
    const newSchema = patch.schema !== undefined ? patch.schema : existing.schema;
    const newRules = patch.rules !== undefined ? patch.rules : existing.rules;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE collections SET description = ?, schema = ?, rules = ?, updatedAt = ?
      WHERE ownerId = ? AND projectId = ? AND name = ?
    `).run(newDescription, newSchema, newRules, now, ownerId, projectId, name);

    return this.getCollection(ownerId, projectId, name);
  }

  deleteCollection(ownerId: string, projectId: string, name: string): void {
    const db = getDb();
    const info = db.prepare('DELETE FROM collections WHERE ownerId = ? AND projectId = ? AND name = ?').run(ownerId, projectId, name);
    if (info.changes === 0) {
      throw new AppError(`Collection "${name}" not found.`, 404);
    }
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  insertDocument(ownerId: string, projectId: string, collectionName: string, data: DocumentObject, docId?: string): Document {
    // Guard against reserved system field injection
    for (const key of Object.keys(data)) {
      if (key.startsWith('_')) {
        throw new AppError(`Field "${key}" is reserved. User-supplied fields must not start with "_".`, 400);
      }
    }

    // Ensure collection exists and validate schema
    const coll = this.getCollection(ownerId, projectId, collectionName);
    if (coll.schema) {
      const validate = ajv.compile(preprocessVectorSchema(JSON.parse(coll.schema)));
      const valid = validate(data);
      if (!valid) {
        throw new AppError(`Schema validation failed: ${ajv.errorsText(validate.errors)}`, 400);
      }
    }

    const now = new Date().toISOString();
    const finalDocId = docId || uuidv4();

    // Encrypt fields before writing to database
    const encryptedData = encryptDocumentFields(data, coll, projectId);

    const dbPayload: Document = {
      ...encryptedData,
      _id: finalDocId,
      _ownerId: ownerId,
      _projectId: projectId,
      _createdAt: now,
      _updatedAt: now,
    };

    const db = getDb();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO documents (id, ownerId, projectId, collectionName, data, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(finalDocId, ownerId, projectId, collectionName, JSON.stringify(dbPayload), now, now);

      db.prepare(`
        UPDATE collections SET updatedAt = ? WHERE ownerId = ? AND projectId = ? AND name = ?
      `).run(now, ownerId, projectId, collectionName);
    })();

    // Return and broadcast decrypted version
    const returnedDoc: Document = {
      ...data,
      _id: finalDocId,
      _ownerId: ownerId,
      _projectId: projectId,
      _createdAt: now,
      _updatedAt: now,
    };

    wsService.broadcastChange(ownerId, collectionName, 'document:inserted', returnedDoc);

    // Trigger webhook event
    webhookService.dispatch(projectId, 'document.created', returnedDoc);

    return returnedDoc;
  }

  queryDocuments(ownerId: string, projectId: string, collectionName: string, opts: QueryOptions = {}): QueryResult {
    // Ensure collection exists
    this.getCollection(ownerId, projectId, collectionName);

    const {
      filter,
      limit = DEFAULT_QUERY_LIMIT,
      offset = 0,
      sortBy,
      sortOrder = 'asc',
    } = opts;

    const cappedLimit = Math.min(Math.max(1, limit), MAX_QUERY_LIMIT);
    const safeOffset = Math.max(0, offset);

    const db = getReaderDb();
    const rows = db.prepare(`
      SELECT data FROM documents WHERE ownerId = ? AND projectId = ? AND collectionName = ?
    `).all(ownerId, projectId, collectionName) as { data: string }[];

    let docs: Document[] = rows.map((r) => {
      const doc = JSON.parse(r.data);
      return decryptDocumentFields(doc, projectId);
    });

    // Apply filter
    if (filter && Object.keys(filter).length > 0) {
      docs = docs.filter((doc) => matchesFilter(doc, filter));
    }

    const total = docs.length;

    // Apply sort
    if (sortBy) {
      docs = sortDocuments(docs, sortBy, sortOrder);
    } else {
      docs = sortDocuments(docs, '_createdAt', 'asc');
    }

    // Apply pagination
    const paginated = docs.slice(safeOffset, safeOffset + cappedLimit);

    return {
      documents: paginated,
      total,
      limit: cappedLimit,
      offset: safeOffset,
    };
  }

  getDocument(ownerId: string, projectId: string, collectionName: string, docId: string): Document {
    this.getCollection(ownerId, projectId, collectionName);

    const db = getReaderDb();
    const row = db.prepare(`
      SELECT data FROM documents WHERE id = ? AND ownerId = ? AND projectId = ? AND collectionName = ?
    `).get(docId, ownerId, projectId, collectionName) as { data: string } | undefined;

    if (!row) {
      throw new AppError(`Document "${docId}" not found in collection "${collectionName}".`, 404);
    }

    const doc = JSON.parse(row.data);
    return decryptDocumentFields(doc, projectId);
  }


  updateDocument(
    ownerId: string,
    projectId: string,
    collectionName: string,
    docId: string,
    patch: DocumentObject,
  ): Document {
    // Guard reserved field injection in patch
    for (const key of Object.keys(patch)) {
      if (key.startsWith('_')) {
        throw new AppError(`Field "${key}" is reserved and cannot be patched.`, 400);
      }
    }

    const coll = this.getCollection(ownerId, projectId, collectionName);
    const existing = this.getDocument(ownerId, projectId, collectionName, docId);
    
    // Create candidate document to validate
    const candidateData = {
      ...existing,
      ...patch,
    };
    
    // Remove internal fields for validation
    const { _id, _ownerId, _projectId, _createdAt, _updatedAt, ...validationData } = candidateData;

    if (coll.schema) {
      const validate = ajv.compile(preprocessVectorSchema(JSON.parse(coll.schema)));
      const valid = validate(validationData);
      if (!valid) {
        throw new AppError(`Schema validation failed: ${ajv.errorsText(validate.errors)}`, 400);
      }
    }

    const now = new Date().toISOString();

    const updated: Document = {
      ...candidateData,
      _id: existing._id,
      _ownerId: existing._ownerId,
      _projectId: existing._projectId || projectId,
      _createdAt: existing._createdAt,
      _updatedAt: now,
    };

    // Encrypt fields in candidate data before storing in DB
    const { _id: dbId, _ownerId: dbOwner, _projectId: pId, _createdAt: dbCreated, _updatedAt: dbUpdated, ...userFields } = updated;
    const encryptedFields = encryptDocumentFields(userFields, coll, projectId);
    const dbPayload = {
      ...encryptedFields,
      _id: dbId,
      _ownerId: dbOwner,
      _projectId: pId,
      _createdAt: dbCreated,
      _updatedAt: dbUpdated,
    };

    const db = getDb();
    db.transaction(() => {
      db.prepare(`
        UPDATE documents SET data = ?, updatedAt = ? WHERE id = ? AND ownerId = ? AND projectId = ? AND collectionName = ?
      `).run(JSON.stringify(dbPayload), now, docId, ownerId, projectId, collectionName);

      db.prepare(`
        UPDATE collections SET updatedAt = ? WHERE ownerId = ? AND projectId = ? AND name = ?
      `).run(now, ownerId, projectId, collectionName);
    })();

    wsService.broadcastChange(ownerId, collectionName, 'document:updated', updated);

    // Trigger webhook event
    webhookService.dispatch(projectId, 'document.updated', updated);

    return updated;
  }


  deleteDocument(ownerId: string, projectId: string, collectionName: string, docId: string): void {
    this.getDocument(ownerId, projectId, collectionName, docId);
    const now = new Date().toISOString();

    const db = getDb();
    db.transaction(() => {
      db.prepare('DELETE FROM documents WHERE id = ? AND ownerId = ? AND projectId = ? AND collectionName = ?').run(docId, ownerId, projectId, collectionName);
      db.prepare('UPDATE collections SET updatedAt = ? WHERE ownerId = ? AND projectId = ? AND name = ?').run(now, ownerId, projectId, collectionName);
    })();

    wsService.broadcastChange(ownerId, collectionName, 'document:deleted', { _id: docId });

    // Trigger webhook event
    webhookService.dispatch(projectId, 'document.deleted', { _id: docId, collectionName });
  }

  queryDocumentsByVector(
    ownerId: string,
    projectId: string,
    collectionName: string,
    vectorField: string,
    queryVector: number[],
    topK = 5
  ): { document: Document; similarity: number }[] {
    const db = getReaderDb();
    
    // Check collection exists
    const collection = this.getCollection(ownerId, projectId, collectionName);

    // Retrieve all documents for this collection
    const rows = db.prepare(`
      SELECT data FROM documents
      WHERE ownerId = ? AND projectId = ? AND collectionName = ?
    `).all(ownerId, projectId, collectionName) as { data: string }[];

    const results: { document: Document; similarity: number }[] = [];

    for (const row of rows) {
      let doc: Document;
      try {
        doc = JSON.parse(row.data);
      } catch (_) {
        continue;
      }

      // Decrypt any encrypted fields transparently
      const decryptedDoc = decryptDocumentFields(doc, projectId);

      const docVector = decryptedDoc[vectorField];
      if (Array.isArray(docVector)) {
        try {
          const similarity = cosineSimilarity(queryVector, docVector);
          results.push({ document: decryptedDoc, similarity });
        } catch (_) {
          // Ignore dimension mismatches
        }
      }
    }

    // Sort descending by similarity score
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, topK);
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const dbStore = new SqliteDbStore();
