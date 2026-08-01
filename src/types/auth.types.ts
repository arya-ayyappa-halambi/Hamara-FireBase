// ─────────────────────────────────────────────────────────────────────────────
//  Express Request augmentation
//  Adds req.user (populated by authenticateJwt middleware) to the global type.
// ─────────────────────────────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      /** Populated by authenticateJwt or authenticateApiKey after verification. */
      user?: import('./auth.types').JwtPayload;
      /** Populated when authenticated via x-aegis-api-key */
      project?: import('./project.types').Project;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  src/types/auth.types.ts
//  All shared TypeScript interfaces and types for the Auth module.
// ─────────────────────────────────────────────────────────────────────────────

// ── Request DTOs ──────────────────────────────────────────────────────────────

/** Payload expected on POST /api/v1/auth/register */
export interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

/** Payload expected on POST /api/v1/auth/login */
export interface LoginDto {
  email: string;
  password: string;
}

/** Payload expected on POST /api/v1/auth/refresh and POST /api/v1/auth/logout */
export interface RefreshTokenDto {
  refreshToken: string;
}

// ── Internal Domain Models ────────────────────────────────────────────────────

/** Full user record as stored internally (includes password hash). */
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isSuperAdmin?: boolean;
  createdAt: Date;
  updatedAt: Date;
  apiLimit?: number;
  readLimit?: number;
  writeLimit?: number;
  readsCount?: number;
  writesCount?: number;
  lockoutMinutes?: number;
  lockedUntil?: Date;
  billingMonthStart?: Date;
}

/** Refresh token record persisted in SQLite. */
export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Public-facing user record returned in API responses.
 * The passwordHash field is intentionally omitted.
 */
export type PublicUser = Omit<User, 'passwordHash'>;

// ── JWT ───────────────────────────────────────────────────────────────────────

/** Shape of the JWT payload AegisDB signs and verifies. */
export interface JwtPayload {
  sub: string;   // Subject — the user's UUID
  email: string;
  isSuperAdmin?: boolean;
  iat?: number;  // Issued-at (added automatically by jsonwebtoken)
  exp?: number;  // Expiry  (added automatically by jsonwebtoken)
}

// ── API Response Envelope ─────────────────────────────────────────────────────

/**
 * Uniform API response shape used across all endpoints.
 *
 * @example
 * // Success
 * { success: true, data: { user, token, refreshToken }, message: "Registered successfully" }
 *
 * // Error
 * { success: false, data: null, message: "Invalid credentials" }
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
}

/** Shape returned from register / login / refresh endpoints. */
export interface AuthResponseData {
  user: PublicUser;
  token: string;
  refreshToken: string;
}

// ── Custom Error Types ────────────────────────────────────────────────────────

/** HTTP-aware application error. Carries a status code alongside the message. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true; // distinguishes known errors from unexpected bugs

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }
}
