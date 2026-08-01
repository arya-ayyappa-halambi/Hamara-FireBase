// ─────────────────────────────────────────────────────────────────────────────
//  src/types/db.types.ts
//  TypeScript interfaces for the Dynamic Schema Database Engine.
// ─────────────────────────────────────────────────────────────────────────────

// ── Documents ─────────────────────────────────────────────────────────────────

/**
 * A raw document value — any JSON-serialisable type.
 * Using `unknown` forces callers to perform type narrowing before use.
 */
export type DocumentValue = string | number | boolean | null | DocumentValue[] | DocumentObject;
export type DocumentObject = { [key: string]: DocumentValue };

/**
 * A persisted document. System fields (prefixed with `_`) are injected by the
 * DB engine and cannot be overwritten by callers.
 */
export interface Document extends DocumentObject {
  _id: string;
  _ownerId: string;
  _createdAt: string; // ISO-8601
  _updatedAt: string; // ISO-8601
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Supported comparison operators for field-level filtering.
 * Keys are MongoDB-style operators for familiarity.
 */
export interface FieldOperators {
  $eq?: DocumentValue;
  $ne?: DocumentValue;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $contains?: string; // substring match on string fields
}

/**
 * Filter expression: each key is a document field name.
 * Value is either a literal (exact equality) or a FieldOperators object.
 */
export type FilterExpression = Record<string, DocumentValue | FieldOperators>;

export type SortOrder = 'asc' | 'desc';

/** Options accepted by queryDocuments(). All fields are optional. */
export interface QueryOptions {
  filter?: FilterExpression;
  limit?: number;    // default 20, max 100
  offset?: number;   // default 0
  sortBy?: string;   // field name to sort by
  sortOrder?: SortOrder; // default 'asc'
}

/** Paginated result envelope returned by queryDocuments(). */
export interface QueryResult {
  documents: Document[];
  total: number;   // total matching documents (before pagination)
  limit: number;
  offset: number;
}

// ── Collections ───────────────────────────────────────────────────────────────

/** Collection metadata (no documents embedded). */
export interface Collection {
  name: string;
  description: string;
  ownerId: string;
  documentCount: number;
  schema?: string;     // JSON Schema string (optional)
  rules?: string;      // Security Rules JSON string (optional)
  createdAt: string;   // ISO-8601
  updatedAt: string;   // ISO-8601
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateCollectionDto {
  name: string;        // alphanumeric + underscores + hyphens, 2–64 chars
  description?: string;
  schema?: string;
  rules?: string;
}

export interface UpdateCollectionDto {
  description?: string;
  schema?: string;
  rules?: string;
}

export interface InsertDocumentDto {
  data: DocumentObject;
}

export interface UpdateDocumentDto {
  data: DocumentObject; // shallow-merged patch
}
