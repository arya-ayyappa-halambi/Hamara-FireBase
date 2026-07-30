// ─────────────────────────────────────────────────────────────────────────────
//  src/middleware/validate.middleware.ts
//  Lightweight request body validation middleware factory.
//
//  Usage:
//    router.post('/register', validateBody(registerSchema), registerHandler);
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/auth.types';

// ── Schema Types ──────────────────────────────────────────────────────────────

type FieldType = 'string' | 'number' | 'boolean' | 'email';

interface FieldRule {
  type: FieldType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}

/** Validation schema: a mapping of field names to their rules. */
export type ValidationSchema = Record<string, FieldRule>;

// ── Email Regex ───────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Core Validator ────────────────────────────────────────────────────────────

function validateField(value: unknown, fieldName: string, rule: FieldRule): string | null {
  // Required check
  if (rule.required !== false && (value === undefined || value === null || value === '')) {
    return `"${fieldName}" is required.`;
  }

  // Skip further checks if value is absent and not required
  if (value === undefined || value === null) return null;

  // Type checks
  if (rule.type === 'email') {
    if (typeof value !== 'string') return `"${fieldName}" must be a string.`;
    if (!EMAIL_REGEX.test(value)) return `"${fieldName}" must be a valid email address.`;
  } else if (typeof value !== rule.type) {
    return `"${fieldName}" must be of type ${rule.type}.`;
  }

  // String length checks
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return `"${fieldName}" must be at least ${rule.minLength} characters long.`;
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return `"${fieldName}" must not exceed ${rule.maxLength} characters.`;
    }
  }

  return null;
}

// ── Middleware Factory ────────────────────────────────────────────────────────

/**
 * Returns an Express middleware that validates `req.body` against the given
 * schema. If validation fails, it calls `next(AppError)` with a 400 status
 * and a descriptive message listing ALL failures at once (not just the first).
 *
 * @example
 * router.post('/register', validateBody(registerSchema), registerController);
 */
export function validateBody(schema: ValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Ensure the body is an object (guards against text/plain bodies etc.)
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next(new AppError('Request body must be a JSON object.', 400));
    }

    const errors: string[] = [];

    for (const [field, rule] of Object.entries(schema)) {
      const error = validateField(req.body[field], field, rule);
      if (error) errors.push(error);
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' '), 400));
    }

    next();
  };
}

// ── Pre-built Schemas ─────────────────────────────────────────────────────────

/** Validation schema for POST /api/v1/auth/register */
export const registerSchema: ValidationSchema = {
  name: {
    type: 'string',
    required: true,
    minLength: 2,
    maxLength: 100,
  },
  email: {
    type: 'email',
    required: true,
  },
  password: {
    type: 'string',
    required: true,
    minLength: 8,
    maxLength: 128,
  },
};

/** Validation schema for POST /api/v1/auth/login */
export const loginSchema: ValidationSchema = {
  email: {
    type: 'email',
    required: true,
  },
  password: {
    type: 'string',
    required: true,
    minLength: 1,
  },
};

/** Validation schema for POST /api/v1/auth/refresh and POST /api/v1/auth/logout */
export const refreshTokenSchema: ValidationSchema = {
  refreshToken: {
    type: 'string',
    required: true,
    minLength: 1,
  },
};
