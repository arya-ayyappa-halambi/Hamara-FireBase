import { Request } from 'express';

interface TokenBucket {
  tokens: number;
  lastRefilled: number;
  totalRequests: number;
  blockedRequests: number;
}

export interface RateLimitTelemetry {
  key: string;
  tokens: number;
  totalRequests: number;
  blockedRequests: number;
  lastRefilled: string;
}

export class RateLimiterService {
  private buckets = new Map<string, TokenBucket>();

  // Default configuration: 120 requests per minute
  private defaultCapacity = 120;
  private defaultWindowMs = 60000;

  /**
   * Evaluate a rate limit request.
   * Returns an object indicating success, current tokens, and Retry-After wait seconds if blocked.
   */
  limit(key: string, capacity = this.defaultCapacity, windowMs = this.defaultWindowMs): {
    allowed: boolean;
    tokens: number;
    retryAfterSec: number;
  } {
    const now = Date.now();
    const refillRate = capacity / windowMs; // tokens per ms

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: capacity,
        lastRefilled: now,
        totalRequests: 0,
        blockedRequests: 0,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens
    const elapsed = now - bucket.lastRefilled;
    const refilledTokens = elapsed * refillRate;
    bucket.tokens = Math.min(capacity, bucket.tokens + refilledTokens);
    bucket.lastRefilled = now;
    bucket.totalRequests++;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, tokens: bucket.tokens, retryAfterSec: 0 };
    } else {
      bucket.blockedRequests++;
      const tokensNeeded = 1 - bucket.tokens;
      const waitMs = Math.ceil(tokensNeeded / refillRate);
      const retryAfterSec = Math.ceil(waitMs / 1000);
      return { allowed: false, tokens: bucket.tokens, retryAfterSec: Math.max(1, retryAfterSec) };
    }
  }

  /**
   * Reset rate limit state for a key.
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Retrieve all rate limit metrics.
   */
  getTelemetry(): RateLimitTelemetry[] {
    const result: RateLimitTelemetry[] = [];
    for (const [key, bucket] of this.buckets.entries()) {
      result.push({
        key,
        tokens: Number(bucket.tokens.toFixed(2)),
        totalRequests: bucket.totalRequests,
        blockedRequests: bucket.blockedRequests,
        lastRefilled: new Date(bucket.lastRefilled).toISOString(),
      });
    }
    return result;
  }
}

export const rateLimiterService = new RateLimiterService();
