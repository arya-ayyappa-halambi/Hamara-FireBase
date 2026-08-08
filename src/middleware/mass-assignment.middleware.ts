// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/mass-assignment.middleware.ts
//  AegisDB — Schema Mass Assignment Sanitizer Middleware.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { dbStore } from '../db/db.service';

/**
 * System and administrative fields that are protected from mass assignment by default.
 */
export const FORBIDDEN_SYSTEM_FIELDS = new Set<string>([
  'isSuperAdmin',
  'role',
  'passwordHash',
  'lockedUntil',
  'readsCount',
  'writesCount',
  'apiLimit',
  'readLimit',
  'writeLimit',
  'mfaEnabled',
  'mfaSecret',
  '_id',
  'createdAt',
  'updatedAt',
  'version',
  '__v',
]);

export interface SanitizerOptions {
  allowSystemFields?: boolean;
}

/**
 * Sanitizes an object payload against forbidden system properties and an optional JSON Schema definition.
 */
export function sanitizePayload<T extends Record<string, any>>(
  payload: T,
  schema?: Record<string, any>,
  options: SanitizerOptions = {}
): Partial<T> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const result: Record<string, any> = {};
  const schemaProperties = schema?.properties ? Object.keys(schema.properties) : null;
  const allowAdditional = schema?.additionalProperties !== false;

  for (const [key, value] of Object.entries(payload)) {
    // 1. Block forbidden system/admin fields unless explicitly permitted by options
    if (!options.allowSystemFields && FORBIDDEN_SYSTEM_FIELDS.has(key)) {
      continue;
    }

    // 2. If a JSON schema with `properties` exists, enforce property boundaries
    if (schemaProperties) {
      const isExplicitProperty = schemaProperties.includes(key);

      if (!isExplicitProperty && !allowAdditional) {
        // Strip property if not in schema properties and additionalProperties is false
        continue;
      }
    }

    // 3. Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      const nestedSchema = schema?.properties?.[key];
      result[key] = sanitizePayload(value, nestedSchema, options);
    } else {
      result[key] = value;
    }
  }

  return result as Partial<T>;
}

/**
 * Express middleware to prevent Mass Assignment vulnerability attacks on incoming HTTP payloads.
 */
export function sanitizeMassAssignment(options: SanitizerOptions = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next();
    }

    try {
      let schema: Record<string, any> | undefined;

      // Extract collection schema if collection name is present in route params
      const collectionName = req.params.name || req.params.collectionName;
      const user = (req as any).user;
      const activeProjectId = (req as any).activeProjectId || user?.projectId || 'default';

      if (collectionName && user?.id) {
        const coll = dbStore.getCollection(user.id, activeProjectId, collectionName);
        if (coll && coll.schema) {
          try {
            schema = typeof coll.schema === 'string' ? JSON.parse(coll.schema) : coll.schema;
          } catch {
            // Invalid schema ignored
          }
        }
      }

      req.body = sanitizePayload(req.body, schema, options);
      next();
    } catch (err) {
      next(err);
    }
  };
}
