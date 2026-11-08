// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/react — types.ts
//  Type definitions for FlareBase React hooks and context providers.
// ─────────────────────────────────────────────────────────────────────────────

import type * as React from 'react';
import type {
  FlareBaseClient,
  DocumentRecord,
  FlareBaseError,
  AuthUser,
  SnapshotChange,
  StorageQuota,
  StorageAsset,
  SignedUrlResponse
} from '@flarebase/client';

export interface FlareBaseProviderProps {
  client: FlareBaseClient;
  children?: React.ReactNode;
}

export interface UseCollectionOptions<T extends Record<string, any> = Record<string, any>> {
  query?: Record<string, any>;
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
  realTime?: boolean;
  initialData?: DocumentRecord<T>[];
}

export interface UseCollectionResult<T extends Record<string, any> = Record<string, any>> {
  data: DocumentRecord<T>[];
  loading: boolean;
  error: FlareBaseError | Error | null;
  insert: (doc: Partial<T> & Record<string, any>) => Promise<DocumentRecord<T>>;
  update: (id: string, updates: Partial<T> & Record<string, any>) => Promise<DocumentRecord<T>>;
  remove: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export interface UseDocumentOptions<T extends Record<string, any> = Record<string, any>> {
  realTime?: boolean;
  initialData?: DocumentRecord<T> | null;
}

export interface UseDocumentResult<T extends Record<string, any> = Record<string, any>> {
  data: DocumentRecord<T> | null;
  loading: boolean;
  error: FlareBaseError | Error | null;
  update: (updates: Partial<T> & Record<string, any>) => Promise<DocumentRecord<T> | null>;
  remove: () => Promise<boolean>;
  refetch: () => Promise<void>;
}

export interface UseAuthResult {
  user: AuthUser | null;
  loading: boolean;
  error: FlareBaseError | Error | null;
  isAuthenticated: boolean;
  login: (credentials: { email: string; password: string }) => Promise<any>;
  register: (payload: { email: string; password: string; name?: string; role?: string }) => Promise<any>;
  logout: () => Promise<void>;
  oauth: (provider: 'google' | 'github' | string, token: string) => Promise<any>;
  refresh: (refreshToken?: string) => Promise<any>;
}

export interface UseStorageResult {
  uploading: boolean;
  error: FlareBaseError | Error | null;
  upload: (file: any, fieldName?: string, customFilename?: string) => Promise<StorageAsset>;
  getSignedUrl: (filename: string, operation?: 'read' | 'write', expiresIn?: number) => Promise<SignedUrlResponse>;
  getQuota: () => Promise<StorageQuota>;
  deleteAsset: (id: string) => Promise<{ success: boolean; id: string }>;
}
