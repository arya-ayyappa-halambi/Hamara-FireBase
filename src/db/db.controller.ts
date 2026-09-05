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
import { metricsService } from '../services/metrics.service';
import { networkAccessService } from '../services/network-access.service';
import { organizationService } from '../services/organization.service';
import {
  Collection,
  Document,
  DocumentObject,
  QueryResult,
  QueryOptions,
  FilterExpression,
  DocumentValue,
} from '../types/db.types';

function getOwnerId(req: Request): string {
  if (req.project?.ownerId) return req.project.ownerId;
  const user = req.user as any;
  if (user?.isProjectUser && user.projectId) {
    const db = getDb();
    const proj = db.prepare('SELECT ownerId FROM projects WHERE id = ?').get(user.projectId) as { ownerId: string } | undefined;
    if (proj) return proj.ownerId;
  }
  const sub = req.user?.sub;
  if (!sub) throw new AppError('Authentication context missing.', 401);
  return sub;
}

function getProjectId(req: Request): string {
  const headerProjId = req.headers['x-aegis-project-id'] as string | undefined;

  // 1. If using API key, req.project is set securely by api-key middleware.
  if (req.project?.id) {
    // Cross-project protection: If a project user token is also passed, it MUST match the API key's project
    const projectUser = req.projectUser || (req.user as any)?.isProjectUser ? (req.user as any) : undefined;
    if (projectUser?.projectId && projectUser.projectId !== req.project.id) {
      throw new AppError('Access denied: Authentication token does not match the project API key.', 403);
    }
    // Also enforce header consistency if explicitly passed
    if (headerProjId && headerProjId !== req.project.id) {
      throw new AppError('Access denied: x-aegis-project-id header does not match the authenticated project API key.', 403);
    }
    return req.project.id;
  }

  // 2. If it's a project user (via JWT), ensure they only access the project they belong to.
  const user = req.user as any;
  if (user?.isProjectUser && user.projectId) {
    if (headerProjId && headerProjId !== user.projectId) {
      throw new AppError('Access denied: Project users can only access their own project.', 403);
    }
    return user.projectId;
  }

  if (!headerProjId || typeof headerProjId !== 'string') {
    throw new AppError('Project context missing. Ensure API key or x-aegis-project-id header is provided.', 400);
  }

  // 3. If it's a super admin user, allow access to any project.
  const ownerId = getOwnerId(req);
  const db = getDb();

  if (user?.isSuperAdmin === true) {
    const proj = db.prepare('SELECT id FROM projects WHERE id = ?').get(headerProjId);
    if (!proj) {
      throw new AppError('Access denied: Project not found.', 404);
    }
    return headerProjId;
  }

  // 4. Verify user has access to this project (owner, member, or team grant)
  const effectiveRole = organizationService.getEffectiveProjectRole(ownerId, headerProjId);
  if (!effectiveRole) {
    throw new AppError('Access denied: Project not found or you do not have permission to access it.', 403);
  }

  return headerProjId;
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
    if (now.getMonth() !== monthStart.getMonth() || now.getFullYear() !== monthStart.getFullYear()) {
      userStore.resetMonthlyLimits(ownerId);
      owner.readsCount = 0;
      owner.writesCount = 0;
      owner.lockedUntil = undefined;
    }
  } else {
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

// ── Comprehensive Security Rules Engine ──────────────────────────────────────

export type DbAction = 'get' | 'list' | 'create' | 'update' | 'delete' | 'read' | 'write';

function getParentAction(action: DbAction): 'read' | 'write' {
  if (action === 'get' || action === 'list' || action === 'read') return 'read';
  return 'write';
}

function parseCollectionRules(rulesStr?: string | null): { rulesObj: any; parseError: boolean } {
  if (!rulesStr || rulesStr.trim().length === 0) {
    return { rulesObj: { read: true, write: true }, parseError: false };
  }
  try {
    const parsed = JSON.parse(rulesStr);
    if (typeof parsed === 'object' && parsed !== null) {
      return { rulesObj: parsed, parseError: false };
    }
    return { rulesObj: { read: false, write: false }, parseError: true };
  } catch {
    return { rulesObj: { read: false, write: false }, parseError: true };
  }
}

export function shouldEnforceRules(req: Request): boolean {
  // High-privilege service role bypasses all Security Rules
  if (req.isServiceRole === true) return false;

  // If client using API Key -> enforce rules
  if (req.user?.email?.startsWith('api-key::')) return true;

  // If project user accessing via token -> enforce rules
  const user = req.user as any;
  if (user?.isProjectUser) return true;
  if (req.projectUser) return true;

  // Dashboard developer / Super Admin accessing their project data -> bypass rules
  return false;
}

function getRuleAuthContext(req: Request): any {
  const rawAuth = req.projectUser || ((req.user as any)?.isProjectUser ? req.user : null);
  if (!rawAuth) return null;

  return {
    ...rawAuth,
    id: (rawAuth as any).sub || (rawAuth as any).id,
    sub: (rawAuth as any).sub || (rawAuth as any).id,
    uid: (rawAuth as any).sub || (rawAuth as any).id,
    email: rawAuth.email,
    role: (rawAuth as any).role || 'user',
    customClaims: (rawAuth as any).customClaims || {},
    isProjectUser: true,
    projectId: (rawAuth as any).projectId,
  };
}

export function evaluateRuleExpression(
  rule: any,
  context: {
    auth: any;
    data: any;
    resource: any;
    request: any;
  }
): boolean {
  if (rule === true) return true;
  if (rule === false || rule === null || rule === undefined) return false;
  if (typeof rule !== 'string') return false;

  const trimmed = rule.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Static AST / token defense against sandbox breakout attempts
  if (
    /process\s*\./i.test(trimmed) ||
    /require\s*\(/i.test(trimmed) ||
    /import\s*\(/i.test(trimmed) ||
    /child_process/i.test(trimmed) ||
    /constructor\s*\.\s*constructor/i.test(trimmed) ||
    /__proto__/i.test(trimmed) ||
    /global(This)?/i.test(trimmed)
  ) {
    return false;
  }

  try {
    const resourceObj = context.resource
      ? { ...context.resource, data: { ...context.resource } }
      : null;
    const dataObj = context.data
      ? { ...context.data, data: { ...context.data } }
      : null;

    const requestObj = {
      auth: context.auth,
      time: context.request?.time || new Date().toISOString(),
      method: context.request?.method || 'read',
      query: context.request?.query || {},
      data: dataObj,
      resource: { data: dataObj },
    };

    const sandbox = {
      auth: context.auth,
      data: dataObj,
      resource: resourceObj,
      request: requestObj,
      Math,
      Date,
      Number,
      String,
      Boolean,
      Array,
      Object,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      RegExp,
    };

    const vmContext = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false }
    } as any);
    const result = vm.runInContext(trimmed, vmContext, {
      timeout: 50
    });
    return !!result;
  } catch {
    return false; // Fail-closed on expression execution error
  }
}

/**
 * Evaluates collection-scoped security rules (e.g. list, query).
 */
export function evaluateCollectionAccess(
  collection: Collection,
  action: 'list' | 'read',
  req: Request
): boolean {
  if (!shouldEnforceRules(req)) return true;

  const { rulesObj, parseError } = parseCollectionRules(collection.rules);
  if (parseError) return false;

  const parentAction = getParentAction(action);
  let rule: any;

  // 1. Scoped rules: rulesObj.collection
  if (rulesObj.collection && typeof rulesObj.collection === 'object') {
    if (rulesObj.collection[action] !== undefined) {
      rule = rulesObj.collection[action];
    } else if (rulesObj.collection[parentAction] !== undefined) {
      rule = rulesObj.collection[parentAction];
    }
  }

  // 2. Flat collection rules
  if (rule === undefined) {
    if (rulesObj[action] !== undefined) {
      rule = rulesObj[action];
    } else if (rulesObj[parentAction] !== undefined) {
      rule = rulesObj[parentAction];
    } else {
      rule = true; // default permissive if unconfigured
    }
  }

  const auth = getRuleAuthContext(req);
  return evaluateRuleExpression(rule, {
    auth,
    data: null,
    resource: null,
    request: {
      auth,
      method: action,
      time: new Date().toISOString(),
      query: req.query || {},
    },
  });
}

/**
 * Evaluates document-scoped security rules (get, create, update, delete).
 */
export function evaluateDocumentAccess(
  collection: Collection,
  action: 'get' | 'create' | 'update' | 'delete' | 'read' | 'write',
  req: Request,
  resource: Document | null,
  data: DocumentObject | null,
  rawPatch?: DocumentObject | null
): boolean {
  if (!shouldEnforceRules(req)) return true;

  const { rulesObj, parseError } = parseCollectionRules(collection.rules);
  if (parseError) return false;

  const parentAction = getParentAction(action);
  let rule: any;

  // 1. Row-Level Security rules (_rules on document or in payload)
  const targetRulesObj = action === 'create'
    ? (data && typeof (data as any)._rules === 'object' ? (data as any)._rules : null)
    : (resource && typeof (resource as any)._rules === 'object' ? (resource as any)._rules : null);

  if (targetRulesObj) {
    if (targetRulesObj[action] !== undefined) {
      rule = targetRulesObj[action];
    } else if (targetRulesObj[parentAction] !== undefined) {
      rule = targetRulesObj[parentAction];
    }
  }

  // 2. Collection-level document scoped rules: rulesObj.document
  if (rule === undefined && rulesObj.document && typeof rulesObj.document === 'object') {
    if (rulesObj.document[action] !== undefined) {
      rule = rulesObj.document[action];
    } else if (rulesObj.document[parentAction] !== undefined) {
      rule = rulesObj.document[parentAction];
    }
  }

  // 3. Flat collection rules
  if (rule === undefined) {
    if (rulesObj[action] !== undefined) {
      rule = rulesObj[action];
    } else if (rulesObj[parentAction] !== undefined) {
      rule = rulesObj[parentAction];
    } else {
      rule = true; // default permissive if unconfigured
    }
  }

  const auth = getRuleAuthContext(req);
  return evaluateRuleExpression(rule, {
    auth,
    data: data || rawPatch || null,
    resource: resource || null,
    request: {
      auth,
      method: action,
      time: new Date().toISOString(),
      query: req.query || {},
      data: rawPatch || data || null,
    },
  });
}

// ── Helper: parse query-string filter ────────────────────────────────────────
//
// Converts a flat query-string object like:
//   ?filter[age]=36&filter[name]=Ada
// or a JSON-encoded string like:
//   ?filter={"status":"active"}
// into a FilterExpression: { age: 36, name: 'Ada' }
//
function parseFilter(raw: unknown): FilterExpression | undefined {
  if (!raw) return undefined;

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as FilterExpression;
      }
    } catch { /* not JSON — treat as literal string */ }
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;

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
    } else {
      filter[field] = value as any;
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
      ipAddress: networkAccessService.extractClientIp(req),
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
    const rawBody = req.body;
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new AppError('Request body must contain document data (as a JSON object or { data: { ... } }).', 400);
    }

    let docData: Record<string, unknown>;
    let docId: string | undefined;

    if (rawBody.data && typeof rawBody.data === 'object' && !Array.isArray(rawBody.data)) {
      docData = { ...rawBody.data };
      docId = (rawBody.id || rawBody._id || rawBody.data.id || rawBody.data._id) as string | undefined;
    } else {
      docData = { ...rawBody };
      docId = (rawBody.id || rawBody._id) as string | undefined;
    }

    // Clean internal id keys from docData to avoid reserved field errors
    delete docData.id;
    delete docData._id;

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
    
    const allowed = evaluateDocumentAccess(coll, 'create', req, null, docData as DocumentObject);
    if (!allowed) {
      throw new AppError('Permission denied by security rules for operation: create.', 403);
    }
    
    const finalDocId = docId || require('uuid').v4();
    const t0 = performance.now();
    const doc = (dbStore as any).insertDocument(ownerId, projectId, req.params.name, docData, finalDocId);
    metricsService.recordDbOperation(performance.now() - t0, 'insert', projectId);
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
    
    const collectionAllowed = evaluateCollectionAccess(coll, 'list', req);
    if (!collectionAllowed) {
      throw new AppError('Permission denied by collection security rules for operation: list.', 403);
    }

    const t0 = performance.now();
    const isRuleEnforced = shouldEnforceRules(req);
    
    // If rules are enforced, fetch all matching rows to perform row-level security filtering
    const queryOpts: QueryOptions = isRuleEnforced
      ? { filter: opts.filter, sortBy: opts.sortBy, sortOrder: opts.sortOrder, limit: 10000, offset: 0 }
      : opts;

    let result = dbStore.queryDocuments(ownerId, projectId, req.params.name, queryOpts);

    if (isRuleEnforced) {
      const filteredDocs = result.documents.filter((doc) => {
        return evaluateDocumentAccess(coll, 'get', req, doc, null);
      });

      const safeOffset = Math.max(0, opts.offset || 0);
      const cappedLimit = Math.min(Math.max(1, opts.limit || 20), 10000);
      const paginatedDocs = filteredDocs.slice(safeOffset, safeOffset + cappedLimit);

      result = {
        documents: paginatedDocs,
        total: filteredDocs.length,
        limit: cappedLimit,
        offset: safeOffset,
      };
    }

    metricsService.recordDbOperation(performance.now() - t0, 'select', projectId);
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
    
    const t0 = performance.now();
    const doc = dbStore.getDocument(ownerId, projectId, req.params.name, req.params.id);

    const allowed = evaluateDocumentAccess(coll, 'get', req, doc, null);
    if (!allowed) {
      throw new AppError('Permission denied by security rules for operation: get.', 403);
    }

    metricsService.recordDbOperation(performance.now() - t0, 'select', projectId);
    userStore.incrementTelemetry(ownerId, 'read');
    res.status(200).json({ success: true, message: 'Document retrieved.', data: doc } as ApiResponse<Document>);
  } catch (err) { next(err); }
}

export async function updateDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawBody = req.body;
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new AppError('Request body must contain fields to patch (as a JSON object or { data: { ... } }).', 400);
    }

    let patchData: Record<string, unknown>;
    if (rawBody.data && typeof rawBody.data === 'object' && !Array.isArray(rawBody.data)) {
      patchData = { ...rawBody.data };
    } else {
      patchData = { ...rawBody };
    }

    delete patchData.id;
    delete patchData._id;

    const ownerId = getOwnerId(req);
    const projectId = getProjectId(req);
    await checkLimitsAndLockout(ownerId, 'write');
    const coll = dbStore.getCollection(ownerId, projectId, req.params.name);
    
    const existing = dbStore.getDocument(ownerId, projectId, req.params.name, req.params.id);
    const candidateData = { ...existing, ...patchData };

    const allowed = evaluateDocumentAccess(coll, 'update', req, existing, candidateData as any, patchData as any);
    if (!allowed) {
      throw new AppError('Permission denied by security rules for operation: update.', 403);
    }

    const t0 = performance.now();
    const doc = dbStore.updateDocument(ownerId, projectId, req.params.name, req.params.id, patchData as DocumentObject);
    metricsService.recordDbOperation(performance.now() - t0, 'update', projectId);
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
    
    const existing = dbStore.getDocument(ownerId, projectId, req.params.name, req.params.id);

    const allowed = evaluateDocumentAccess(coll, 'delete', req, existing, null);
    if (!allowed) {
      throw new AppError('Permission denied by security rules for operation: delete.', 403);
    }

    const t0 = performance.now();
    dbStore.deleteDocument(ownerId, projectId, req.params.name, req.params.id);
    metricsService.recordDbOperation(performance.now() - t0, 'delete', projectId);
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
    const collectionAllowed = evaluateCollectionAccess(coll, 'list', req);
    if (!collectionAllowed) {
      throw new AppError('Permission denied by collection security rules for operation: list.', 403);
    }

    const t0 = performance.now();
    let results = dbStore.queryDocumentsByVector(ownerId, projectId, req.params.name, field, vector, 1000);
    if (shouldEnforceRules(req)) {
      results = results.filter((r) => evaluateDocumentAccess(coll, 'get', req, r.document, null));
    }
    results = results.slice(0, topK);

    metricsService.recordDbOperation(performance.now() - t0, 'search', projectId);
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
    const collectionAllowed = evaluateCollectionAccess(coll, 'list', req);
    if (!collectionAllowed) {
      throw new AppError('Permission denied by collection security rules for operation: list.', 403);
    }

    // Setup Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const filter = parseQueryFilter(req.query);

    sseRealtimeService.add(ownerId, projectId, req.params.name, res, filter);

    res.write(`data: ${JSON.stringify({ event: 'connected', collection: req.params.name, projectId })}\n\n`);
  } catch (err) { next(err); }
}

