import { AppError } from '../types/auth.types';

/**
 * Calculates the cosine similarity between two numeric vector arrays.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) {
    throw new AppError('Vectors must be non-empty arrays.', 400);
  }
  if (a.length !== b.length) {
    throw new AppError(`Vectors must have the same dimension (got ${a.length} vs ${b.length}).`, 400);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
