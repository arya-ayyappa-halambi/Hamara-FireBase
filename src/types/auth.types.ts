// ─────────────────────────────────────────────────────────────────────────────
//  Express Request augmentation
//  Adds req.user (populated by authenticateJwt middleware) to the global type.
// ─────────────────────────────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      /** Populated by authenticateJwt or authenticateApiKey after verification. */
      user?: import('./auth.types').JwtPayload;
      /** Populated when authenticated via x-flarebase-api-key */
      project?: import('./project.types').Project;
      /** Populated when both API key and user JWT are present */
      projectUser?: any;
      /** Set to true when request uses a service role key */
      isServiceRole?: boolean;
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

export type AdminPermissionScope =
  | '*'
  | 'all'
  | 'telemetry'
  | 'tenants'
  | 'user_management'
  | 'rate_limits'
  | 'network'
  | 'server_hosting'
  | 'sec_ops'
  | 'platform_policies';

/** Full user record as stored internally (includes password hash). */
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isSuperAdmin?: boolean;
  adminPermissions?: AdminPermissionScope[] | string[];
  adminAllowedIpSubnet?: string | null;
  adminRequireMfa?: boolean;
  adminStatus?: 'active' | 'suspended';
  mfaEnabled?: number;
  mfaSecret?: string;
  status?: 'active' | 'pending_deletion' | 'erased';
  deletionInitiatedAt?: string;
  scheduledDeletionAt?: string;
  isFlagged?: boolean | number;
  riskScore?: number;
  activeNoticeId?: string;
  noticeStatus?: 'none' | 'notice_issued' | 'appealed' | 'action_required';
  acceptedTermsVersion?: string;
  acceptedTermsAt?: string;
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

export interface AccountSecurityFlag {
  id: string;
  userId: string;
  userEmail: string;
  reason: 'bot_activity' | 'spam' | 'malicious_traffic' | 'illegal_content' | 'compromised_account';
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  detectionSource: 'system_automated_heuristic' | 'super_admin_manual';
  triggerEvidence?: string | Record<string, any>;
  flaggedAt: string;
  status: 'active' | 'resolved';
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AccountComplianceNotice {
  id: string;
  userId: string;
  userEmail: string;
  category: string;
  title: string;
  details: string;
  issuedAt: string;
  deadlineAt: string;
  userExplanation?: string;
  explanationSubmittedAt?: string;
  adminDecision?: 'pending' | 'accepted' | 'rejected' | 'expired';
  decisionNotes?: string;
  decidedAt?: string;
  status: 'open' | 'appealed' | 'revoked' | 'scheduled_for_purge' | 'purged';
  daysRemaining?: number;
}

export interface PlatformPolicy {
  id: string;
  version: string;
  termsAndConditions: string;
  securityPolicy: string;
  backupPolicy: string;
  effectiveDate: string;
  updatedAt: string;
  updatedBy: string;
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

/** Shape of the JWT payload FlareBase signs and verifies. */
export interface JwtPayload {
  sub: string;   // Subject — the user's UUID
  email: string;
  isSuperAdmin?: boolean;
  isOttLogin?: boolean;
  ottId?: string;
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
  mfaRequired?: boolean;
  requiresPasswordSetup?: boolean;
  isPendingDeletion?: boolean;
  scheduledDeletionAt?: string;
  daysRemaining?: number;
  requiresPolicyConsent?: boolean;
  activePolicyVersion?: string;
  activeNotice?: AccountComplianceNotice | null;
}

// ── Custom Error Types ────────────────────────────────────────────────────────

/** HTTP-aware application error. Carries a status code alongside the message. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true; // distinguishes known errors from unexpected bugs
    this.details = details;

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }
}
