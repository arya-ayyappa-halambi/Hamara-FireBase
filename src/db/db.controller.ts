// ─────────────────────────────────────────────────────────────────────────────
//  src/db/db.controller.ts
//  HTTP adapter for the Dynamic Schema Database Engine.
//
//  Convention: always reads ownerId from req.user.sub (set by authenticateJwt).
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { dbStore } from './db.service';
import { AppError, ApiResponse } from '../types/auth.types';
import {
  Collection,
  Document,
  QueryResult,
  QueryOptions,
  FilterExpression,
  DocumentValue,
} from '../types/db.types';

// ── Helper: extract verified ownerId ──────────────────────────────────────────

function getOwnerId(req: Request): string {
  const sub = req.user?.sub;
  if (!sub) throw new AppError('Authentication context missing.', 401);
  return sub;
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
    const collection = dbStore.createCollection(ownerId, {
      name: req.body.name,
      description: req.body.description,
    });
    res.status(201).json({ success: true, message: 'Collection created.', data: collection } as ApiResponse<Collection>);
  } catch (err) { next(err); }
}

export async function listCollections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const collections = dbStore.listCollections(getOwnerId(req));
    res.status(200).json({ success: true, message: 'Collections retrieved.', data: collections } as ApiResponse<Collection[]>);
  } catch (err) { next(err); }
}

export async function getCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const collection = dbStore.getCollection(getOwnerId(req), req.params.name);
    res.status(200).json({ success: true, message: 'Collection retrieved.', data: collection } as ApiResponse<Collection>);
  } catch (err) { next(err); }
}

export async function deleteCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    dbStore.deleteCollection(getOwnerId(req), req.params.name);
    res.status(200).json({ success: true, message: `Collection "${req.params.name}" deleted.`, data: null } as ApiResponse<null>);
  } catch (err) { next(err); }
}

// ── Document Handlers ─────────────────────────────────────────────────────────

export async function insertDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.body.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) {
      throw new AppError('Request body must contain a "data" object.', 400);
    }
    const doc = dbStore.insertDocument(getOwnerId(req), req.params.name, req.body.data);
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
    const result = dbStore.queryDocuments(getOwnerId(req), req.params.name, opts);
    res.status(200).json({ success: true, message: 'Documents retrieved.', data: result } as ApiResponse<QueryResult>);
  } catch (err) { next(err); }
}

export async function getDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = dbStore.getDocument(getOwnerId(req), req.params.name, req.params.id);
    res.status(200).json({ success: true, message: 'Document retrieved.', data: doc } as ApiResponse<Document>);
  } catch (err) { next(err); }
}

export async function updateDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.body.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) {
      throw new AppError('Request body must contain a "data" object with fields to patch.', 400);
    }
    const doc = dbStore.updateDocument(getOwnerId(req), req.params.name, req.params.id, req.body.data);
    res.status(200).json({ success: true, message: 'Document updated.', data: doc } as ApiResponse<Document>);
  } catch (err) { next(err); }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    dbStore.deleteDocument(getOwnerId(req), req.params.name, req.params.id);
    res.status(200).json({ success: true, message: 'Document deleted.', data: null } as ApiResponse<null>);
  } catch (err) { next(err); }
}
