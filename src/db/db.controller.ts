// ─────────────────────────────────────────────────────────────────────────────
//  src/db/db.controller.ts
//  HTTP adapter for the Dynamic Schema Database Engine.
//
//  Convention: always reads ownerId from req.user.sub (set by authenticateJwt).
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { dbStore } from './db.service';
import { userStore } from '../store/user.store';
import vm from 'vm';
import { auditLogService } from '../services/audit-log.service';
import { getDb } from './sqlite.connection';
import { AppError, ApiResponse } from '../types/auth.types';
import { sseRealtimeService } from '../services/sse-realtime.service';
import {
  Collection,
  Document,
  QueryResult,
  QueryOptions,
  FilterExpression,
  DocumentValue,
} from '../types/db.types';

function getOwnerId(req: Request): string {
  const sub = req.user?.sub;
  if (!sub) throw new AppError('Authentication context missing.', 401);
  return sub;
}

function getProjectId(req: Request): string {
  // 1. If using API key, req.project is set securely by api-key middleware.
  if (req.project?.id) return req.project.id;

  const projectId = req.headers['x-aegis-project-id'];
  if (!projectId || typeof projectId !== 'string') {
    throw new AppError('Project context missing. Ensure API key or x-aegis-project-id header is provided.', 400);
  }

  // 2. If it's a project user (via JWT), ensure they only access the project they belong to.
  const user = req.user as any;
  if (user?.isProjectUser) {
    if (user.projectId !== projectId) {
      throw new AppError('Access denied: Project users can only access their own project.', 403);
    }
    return projectId;
  }

  // 3. If it's a platform user, ensure they own the project they are trying to access.
  const ownerId = getOwnerId(req);
  const db = getDb();
  const proj = db.prepare('SELECT id FROM projects WHERE id = ? AND ownerId = ?').get(projectId, ownerId);
  if (!proj) {
    throw new AppError('Access denied: Project not found or you do not have permission to access it.', 403);
  }

  return projectId;
}

// ── Helper: Check Rate Limits & Lockout ───────────────────────────────────────

async function checkLimitsAndLockout(ownerId: string, operation: 'read' | 'write'): Promise<void> {
  const users = await userStore.getAllUsers();
  const owner = users.find(u => u.id === ownerId) as any;
  if (!owner) return;
  
  const now = new Date();
  
  // 1. Check Monthly Reset
  if (owner.billingMonthStart) {
    const monthStart = new Date(owner.billingMonthStart);
    // If it's a new calendar month (or 30 days passed). Here we do calendar month.
    if (now.getMonth() !== monthStart.getMonth() || now.getFullYear() !== monthStart.getFullYear()) {
      userStore.resetMonthlyLimits(ownerId);
      owner.readsCount = 0;
      owner.writesCount = 0;
      owner.lockedUntil = undefined;
    }
  } else {
    // initialize billing month start
    userStore.resetMonthlyLimits(ownerId);
    owner.readsCount = 0;
    owner.writesCount = 0;
  }
  
  // 2. Check Lockout
  if (owner.lockedUntil && new Date(owner.lockedUntil) > now) {
    throw new AppError(`You are locked out until ${new Date(owner.lockedUntil).toISOString()} due to exceeding your limits.`, 429);
  }
  
  // 3. Check Current Limits
  if (operation === 'read' && (owner.readsCount ?? 0) >= (owner.readLimit ?? Infinity)) {
    userStore.applyLockout(ownerId, owner.lockoutMinutes || 1440);
    throw new AppError(`Read limit exceeded for this month. You have been locked out for ${owner.lockoutMinutes || 1440} minutes.`, 429);
  }
  
  if (operation === 'write' && (owner.writesCount ?? 0) >= (owner.writeLimit ?? Infinity)) {
    userStore.applyLockout(ownerId, owner.lockoutMinutes || 1440);
    throw new AppError(`Write limit exceeded for this month. You have been locked out for ${owner.lockoutMinutes || 1440} minutes.`, 429);
  }
}

// ── Helper: Evaluate Security Rules ───────────────────────────────────────────

function checkRules(collection: Collection, operation: 'read' | 'write', req: Request): void {
  // If this is a client using an API Key, enforce rules.
  // If it's a dashboard user (JWT), they have full access to their own resources.
  const isApiKey = req.user?.email?.startsWith('api-key::') || req.user?.email?.startsWith('service-role::');
  if (!isApiKey) return;

  // High-privilege service role bypasses all Security Rules!
  if (req.isServiceRole === true) return;

  // Default to allowing access if no rules are defined (backwards compatibility)
  let rulesObj: { read?: boolean | string; write?: boolean | string } = { read: true, write: true };
  
  if (collection.rules) {
    try {
      rulesObj = JSON.parse(collection.rules);
    } catch (e) {
      // Invalid rules syntax fails closed
      rulesObj = { read: false, write: false };
    }
  }

  const rule = rulesObj[operation];
  let allowed = false;

  if (rule === true) {
    allowed = true;
  } else if (rule === false) {
    allowed = false;
  } else if (typeof rule === 'string') {
    const auth = (req as any).projectUser || { role: 'anonymous' };
    const data = req.body?.data || null;
    let resource: any = null;
    if (req.params.id) {
      try {
        const ownerId = getOwnerId(req);
        const projectId = getProjectId(req);
        resource = dbStore.getDocument(ownerId, projectId, collection.name, req.params.id);
      } catch (_) {
        // Document not found / doesn't exist yet
      }
    }
    const requestContext = {
      time: new Date().toISOString()
    };
    allowed = evaluateExpression(rule, { auth, data, resource, request: requestContext });
  } else {
    allowed = true;
  }

  if (!allowed) {
    throw new AppError(`Permission denied by collection security rules for operation: ${operation}.`, 403);
  }
}

function evaluateExpression(expr: string, context: { auth: any; data: any; resource: any; request: any }): boolean {
  try {
    const sandbox = {
      auth: context.auth,
      data: context.data,
      resource: context.resource,
      request: context.request,
    };

    vm.createContext(sandbox);

    // Limit evaluation execution time to 50ms to prevent CPU exhaustion
    const result = vm.runInContext(expr, sandbox, { timeout: 50 });
    return !!result;
  } catch (e) {
    return false;
  }
}

// ── Helper: parse query-string filter ────────────────────────────────────────
//
// Converts a flat query-string object like:
//   ?filter[age]=36&filter[name]=Ada
// into a FilterExpression: { age: 36, name: 'Ada' }
//
// Also supports JSON-encoded operator objects:
//   ?filter[age]={"$gt":30}
//
function parseFilter(raw: unknown): FilterExpression | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const filter: FilterExpression = {};
  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      // Try JSON parse first (for operator objects like {"$gt":30})
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          filter[field] = parsed as FilterExpression[string];
          continue;
        }
      } catch { /* not JSON — treat as literal */ }

      // Auto-coerce to number / boolean / null if possible
      if (value === 'null')  { filter[field] = null;  continue; }
      if (value === 'true')  { filter[field] = true;  continue; }
      if (value === 'false') { filter[field] = false; continue; }
      const n = Number(value);
      filter[field] = isNaN(n) ? value : (n as DocumentValue);
    }
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

// ── Collection Handlers ───────────────────────────────────────────────────────

export async function createCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    const schema = typeof req.body.schema === 'object' ? JSON.stringify(req.body.schema) : req.body.schema;
    const rules = typeof req.body.rules === 'object' ? JSON.stringify(req.body.rules) : req.body.rules;
    const collection = dbStore.createCollection(ownerId, projectId, {
      name: req.body.name,
      description: req.body.description,
      schema,
      rules,
    });
    res.status(201).json({ success: true, message: 'Collection created.', data: collection } as ApiResponse<Collection>);
  } catch (err) { next(err); }
}

export async function listCollections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const collections = dbStore.listCollections(getOwnerId(req), getProjectId(req));
    res.status(200).json({ success: true, message: 'Collections retrieved.', data: collections } as ApiResponse<Collection[]>);
  } catch (err) { next(err); }
}

export async function getCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const collection = dbStore.getCollection(getOwnerId(req), getProjectId(req), req.params.name);
    res.status(200).json({ success: true, message: 'Collection retrieved.', data: collection } as ApiResponse<Collection>);
  } catch (err) { next(err); }
}

export async function updateCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const schema = typeof req.body.schema === 'object' ? JSON.stringify(req.body.schema) : req.body.schema;
    const rules = typeof req.body.rules === 'object' ? JSON.stringify(req.body.rules) : req.body.rules;
    const patch = {
      description: req.body.description,
      schema,
      rules,
    };
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    const collection = dbStore.updateCollection(ownerId, projectId, req.params.name, patch);

    auditLogService.logAction({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actionType: 'collection_update',
      projectId: projectId,
      ipAddress: req.ip,
      status: 'success',
      details: `Collection "${req.params.name}" schema/rules updated.`
    });

    res.status(200).json({ success: true, message: 'Collection updated.', data: collection } as ApiResponse<Collection>);
  } catch (err) { next(err); }
}

export async function deleteCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    dbStore.deleteCollection(getOwnerId(req), getProjectId(req), req.params.name);
    res.status(200).json({ success: true, message: `Collection "${req.params.name}" deleted.`, data: null } as ApiResponse<null>);
  } catch (err) { next(err); }
}

// ── Document Handlers ─────────────────────────────────────────────────────────

export async function insertDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.body.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) {
      throw new AppError('Request body must contain a "data" object.', 400);
    }
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    await checkLimitsAndLockout(ownerId, 'write');
    
    let coll;
    try {
      coll = dbStore.getCollection(ownerId, projectId, req.params.name);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 404) {
        // Implicitly create collection if it doesn't exist
        coll = dbStore.createCollection(ownerId, projectId, { name: req.params.name });
      } else {
        throw err;
      }
    }
    
    checkRules(coll, 'write', req);
    
    const docId = req.body.id || require('uuid').v4();
    const doc = (dbStore as any).insertDocument(ownerId, projectId, req.params.name, req.body.data, docId);
    userStore.incrementTelemetry(ownerId, 'write');
    res.status(201).json({ success: true, message: 'Document inserted.', data: doc } as ApiResponse<Document>);
  } catch (err) { next(err); }
}

export async function queryDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const opts: QueryOptions = {
      filter:    parseFilter(req.query.filter),
      limit:     req.query.limit  ? parseInt(String(req.query.limit),  10) : undefined,
      offset:    req.query.offset ? parseInt(String(req.query.offset), 10) : undefined,
      sortBy:    req.query.sortBy  ? String(req.query.sortBy)  : undefined,
      sortOrder: req.query.sortOrder === 'desc' ? 'desc' : 'asc',
    };
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    await checkLimitsAndLockout(ownerId, 'read');
    const coll = dbStore.getCollection(ownerId, projectId, req.params.name);
    checkRules(coll, 'read', req);
    
    const result = dbStore.queryDocuments(ownerId, projectId, req.params.name, opts);
    userStore.incrementTelemetry(ownerId, 'read');
    res.status(200).json({ success: true, message: 'Documents retrieved.', data: result } as ApiResponse<QueryResult>);
  } catch (err) { next(err); }
}

export async function getDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    await checkLimitsAndLockout(ownerId, 'read');
    const coll = dbStore.getCollection(ownerId, projectId, req.params.name);
    checkRules(coll, 'read', req);
    
    const doc = dbStore.getDocument(ownerId, projectId, req.params.name, req.params.id);
    userStore.incrementTelemetry(ownerId, 'read');
    res.status(200).json({ success: true, message: 'Document retrieved.', data: doc } as ApiResponse<Document>);
  } catch (err) { next(err); }
}

export async function updateDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.body.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) {
      throw new AppError('Request body must contain a "data" object with fields to patch.', 400);
    }
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    await checkLimitsAndLockout(ownerId, 'write');
    const coll = dbStore.getCollection(ownerId, projectId, req.params.name);
    checkRules(coll, 'write', req);
    
    const doc = dbStore.updateDocument(ownerId, projectId, req.params.name, req.params.id, req.body.data);
    userStore.incrementTelemetry(ownerId, 'write');
    res.status(200).json({ success: true, message: 'Document updated.', data: doc } as ApiResponse<Document>);
  } catch (err) { next(err); }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    await checkLimitsAndLockout(ownerId, 'write');
    const coll = dbStore.getCollection(ownerId, projectId, req.params.name);
    checkRules(coll, 'write', req);
    
    dbStore.deleteDocument(ownerId, projectId, req.params.name, req.params.id);
    userStore.incrementTelemetry(ownerId, 'write');
    res.status(200).json({ success: true, message: 'Document deleted.', data: null } as ApiResponse<null>);
  } catch (err) { next(err); }
}

export async function queryVector(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    const { vector, field, topK = 5 } = req.body;

    if (!vector || !Array.isArray(vector) || !field) {
      throw new AppError('vector (array of numbers) and field (string) are required.', 400);
    }

    const coll = dbStore.getCollection(ownerId, projectId, req.params.name);
    checkRules(coll, 'read', req);

    const results = dbStore.queryDocumentsByVector(ownerId, projectId, req.params.name, field, vector, topK);

    userStore.incrementTelemetry(ownerId, 'read');

    res.status(200).json({
      success: true,
      message: 'Vector query completed.',
      data: results
    });
  } catch (err) { next(err); }
}

function parseQueryFilter(queryObj: any) {
  const filter: any = {};
  for (const [field, value] of Object.entries(queryObj)) {
    if (field.startsWith('_') || ['limit', 'offset', 'sortBy', 'sortOrder', 'token'].includes(field)) {
      continue;
    }
    if (typeof value === 'string') {
      if (value === 'null') { filter[field] = null; continue; }
      if (value === 'true') { filter[field] = true; continue; }
      if (value === 'false') { filter[field] = false; continue; }
      const n = Number(value);
      filter[field] = isNaN(n) ? value : n;
    } else {
      filter[field] = value;
    }
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

export async function queryRealtime(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);

    const coll = dbStore.getCollection(ownerId, projectId, req.params.name);
    checkRules(coll, 'read', req);

    // Setup Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const filter = parseQueryFilter(req.query);

    sseRealtimeService.add(ownerId, req.params.name, res, filter);

    res.write(`data: ${JSON.stringify({ event: 'connected', collection: req.params.name })}\n\n`);
  } catch (err) { next(err); }
}

