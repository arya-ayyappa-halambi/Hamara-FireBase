// ─────────────────────────────────────────────────────────────────────────────
//  src/types/storage.types.ts
//  TypeScript interfaces for the Biometric Asset Storage module.
// ─────────────────────────────────────────────────────────────────────────────

// ── Asset Metadata ────────────────────────────────────────────────────────────

/** Full asset record as stored internally. */
export interface AssetMetadata {
  id: string;             // UUID
  ownerId: string;        // JWT sub claim of uploader
  originalName: string;   // original filename as uploaded (for display only)
  storedName: string;     // SHA-256 hashed filename on disk (never exposed externally)
  mimeType: string;       // e.g. 'image/jpeg'
  sizeBytes: number;
  absolutePath: string;   // full path on disk (never exposed externally)
  uploadedAt: string;     // ISO-8601
  projectId?: string;     // associated project
  linkedCollectionId?: string; // optional link to a DB collection name
}

/**
 * Public-facing asset metadata — strips internal file system details.
 * This is what the API returns in responses.
 */
export type PublicAssetMetadata = Omit<AssetMetadata, 'storedName' | 'absolutePath'>;

// ── Allowed MIME types ────────────────────────────────────────────────────────

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'text/plain',
  'text/csv',
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

// ── DTOs ──────────────────────────────────────────────────────────────────────

/** Body fields parsed from the multipart/form-data upload request. */
export interface UploadAssetDto {
  linkedCollectionId?: string; // optional collection to link this asset to
}
