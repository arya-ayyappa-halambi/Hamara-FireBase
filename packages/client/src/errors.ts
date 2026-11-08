// ─────────────────────────────────────────────────────────────────────────────
//  @flarebase/client — errors.ts
//  Standardized error handling class for FlareBase SDK operations.
// ─────────────────────────────────────────────────────────────────────────────

export interface FlareBaseErrorOptions {
  status?: number;
  code?: string;
  data?: unknown;
  originalError?: unknown;
}

export class FlareBaseError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly data: unknown;
  public readonly originalError?: unknown;
  public readonly isFlareBaseError = true;

  constructor(message: string, options: FlareBaseErrorOptions = {}) {
    super(message);
    this.name = 'FlareBaseError';
    this.status = options.status ?? 0;
    this.code = options.code ?? (this.status === 0 ? 'NETWORK_ERROR' : `HTTP_${this.status}`);
    this.data = options.data ?? null;
    this.originalError = options.originalError;

    // Maintain proper stack trace in V8 / Node.js
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FlareBaseError);
    }
  }

  static fromResponse(status: number, payload: any): FlareBaseError {
    const message = payload?.message || payload?.error || `Request failed with HTTP status ${status}`;
    const code = payload?.code || (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : `HTTP_${status}`);
    return new FlareBaseError(message, {
      status,
      code,
      data: payload?.data ?? payload
    });
  }

  static network(originalError: unknown, baseUrl: string): FlareBaseError {
    return new FlareBaseError(
      `Network error or FlareBase server unreachable at ${baseUrl}. Please verify host connectivity and server status.`,
      {
        status: 0,
        code: 'NETWORK_ERROR',
        originalError
      }
    );
  }
}
