// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/client — types.ts
//  Complete TypeScript definitions for FlareBase Client SDK.
// ─────────────────────────────────────────────────────────────────────────────

export interface FlareBaseClientOptions {
  /** Base URL of the FlareBase instance (e.g. http://localhost:3000 or https://api.myflarebase.com) */
  baseUrl?: string;
  /** Public project API key (e.g. flare_pk_... or flarebase_pk_...) */
  apiKey?: string;
  /** Initial JWT user session token */
  token?: string | null;
  /** Personal Access Token (PAT) for backend/CLI automation (sent via x-flarebase-pat) */
  pat?: string | null;
  /** Explicit Project ID (if not resolved automatically by API key) */
  projectId?: string | null;
  /** Custom storage key prefix for browser localStorage */
  storageKeyPrefix?: string;
  /** Callback fired whenever auth state changes (login, logout, token refresh) */
  onAuthChange?: (state: { token: string | null; user: AuthUser | null }) => void;
  /** Global error interceptor callback */
  onError?: (error: unknown) => void;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data: T;
  error?: string;
  code?: string;
  [key: string]: any;
}

export interface DocumentRecord<T = Record<string, any>> {
  id: string;
  _id?: string;
  data: T;
  _createdAt?: string;
  _updatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  _rules?: RowLevelSecurityRules;
  [key: string]: any;
}

export interface RowLevelSecurityRules {
  read?: string;
  write?: string;
  delete?: string;
  [key: string]: string | undefined;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: Record<string, any> | string;
  where?: Record<string, any>;
}

export interface QueryResult<T = Record<string, any>> {
  items: Array<DocumentRecord<T>>;
  total?: number;
  limit?: number;
  offset?: number;
}

export interface SnapshotChange<T = Record<string, any>> {
  type: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  event?: string;
  document?: DocumentRecord<T> | T | any;
  id?: string;
  timestamp?: string;
  collection?: string;
  [key: string]: any;
}

export type Unsubscribe = () => void;

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  isSuperAdmin?: boolean;
  avatarUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: AuthUser;
  expiresIn?: string | number;
}

export interface ProjectAuthConfig {
  googleAuthEnabled?: boolean;
  googleClientId?: string;
  magicLinkAuthEnabled?: boolean;
  passkeyAuthEnabled?: boolean;
  registrationEnabled?: boolean;
  enabledProviders?: string[];
  [key: string]: any;
}

export interface StorageAsset {
  id: string;
  filename: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface StorageQuota {
  usedBytes: number;
  maxBytes: number;
  fileCount: number;
  percentage?: number;
  percentUsed?: number;
}

export interface SignedUrlResponse {
  url: string;
  expiresAt?: string;
  assetId?: string;
  filename?: string;
}
