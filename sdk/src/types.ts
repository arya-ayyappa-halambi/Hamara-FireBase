// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/types.ts
//  Type definitions for @flarebase/sdk.
// ─────────────────────────────────────────────────────────────────────────────

export interface FlareBaseConfig {
  /** FlareBase server HTTP base URL (e.g. 'http://localhost:3000'). Default: 'http://localhost:3000' */
  baseUrl?: string;
  /** FlareBase server WebSocket URL (e.g. 'ws://localhost:3000'). Default derived from baseUrl. */
  wsUrl?: string;
  /** Project API Key (e.g. 'flare_pk_...' or service key 'flare_sk_...'). */
  apiKey?: string;
  /** Specific Project ID context (optional). */
  projectId?: string;
  /** Pre-existing access token (optional). */
  accessToken?: string;
  /** Pre-existing refresh token (optional). */
  refreshToken?: string;
  /** Auto-refresh expired access tokens before requests (default: true). */
  autoRefresh?: boolean;
}


export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

// ── Auth Types ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponseData {
  user: User;
  token: string;
  refreshToken: string;
}

// ── DB Types ──────────────────────────────────────────────────────────────────

export interface Collection {
  name: string;
  description: string;
  ownerId: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export type DocumentValue = string | number | boolean | null;

export interface FieldOperators {
  $eq?: DocumentValue;
  $ne?: DocumentValue;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $contains?: string;
}

export type FilterCondition = DocumentValue | FieldOperators;
export type FilterExpression = Record<string, FilterCondition>;

export interface QueryOptions {
  filter?: FilterExpression;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DocumentRecord extends Record<string, unknown> {
  _id: string;
  _ownerId: string;
  _createdAt: string;
  _updatedAt: string;
}

export interface QueryResult {
  documents: DocumentRecord[];
  total: number;
  limit: number;
  offset: number;
}

// ── Storage Types ─────────────────────────────────────────────────────────────

export interface AssetMetadata {
  id: string;
  ownerId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  linkedCollectionId?: string;
}

// ── Hoster Types ──────────────────────────────────────────────────────────────

export type DeploymentStatus = 'pending' | 'building' | 'running' | 'stopped' | 'error' | 'removed';

export interface Deployment {
  id: string;
  ownerId: string;
  name: string;
  status: DeploymentStatus;
  runtimeMode: 'docker' | 'process';
  allocatedPort: number;
  metadata: {
    startCommand: string;
    image: string;
    envVars: Record<string, string>;
    memoryLimitMb: number;
    description: string;
  };
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

// ── Realtime Types ────────────────────────────────────────────────────────────

export type ChangeEventType = 'document:inserted' | 'document:updated' | 'document:deleted';

export interface ChangeStreamFrame {
  event: ChangeEventType;
  collection: string;
  data: DocumentRecord | { _id: string };
  timestamp: string;
}

export type ChangeStreamCallback = (frame: ChangeStreamFrame) => void;
