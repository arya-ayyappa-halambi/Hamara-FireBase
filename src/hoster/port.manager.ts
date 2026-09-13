// ─────────────────────────────────────────────────────────────────────────────
//  src/hoster/port.manager.ts
//  FlareBase — Dynamic port allocator for hosted deployments.
//
//  Manages a fixed pool of host ports (8100–8299).
//  Each active deployment holds exactly one port; it is released on removal.
// ─────────────────────────────────────────────────────────────────────────────

import { AppError } from '../types/auth.types';

const MIN_PORT = 8100;
const MAX_PORT = 8299;
const POOL_SIZE = MAX_PORT - MIN_PORT + 1; // 200 slots

// ── Port Manager ──────────────────────────────────────────────────────────────

class PortManager {
  private readonly allocated = new Set<number>();

  /**
   * Allocate the next available port from the pool.
   * @throws AppError 503 if the pool is exhausted.
   */
  allocate(): number {
    for (let port = MIN_PORT; port <= MAX_PORT; port++) {
      if (!this.allocated.has(port)) {
        this.allocated.add(port);
        return port;
      }
    }
    throw new AppError(
      `Port pool exhausted — all ${POOL_SIZE} deployment slots are in use. ` +
        'Remove an existing deployment before creating a new one.',
      503,
    );
  }

  /**
   * Return a port to the pool. Safe to call multiple times.
   */
  release(port: number): void {
    this.allocated.delete(port);
  }

  /** Whether a given port is currently allocated. */
  isAllocated(port: number): boolean {
    return this.allocated.has(port);
  }

  /** Snapshot of allocation state (useful for health/metrics endpoints). */
  stats(): {
    allocated: number;
    available: number;
    total: number;
    range: [number, number];
  } {
    return {
      allocated: this.allocated.size,
      available: POOL_SIZE - this.allocated.size,
      total: POOL_SIZE,
      range: [MIN_PORT, MAX_PORT],
    };
  }
}

// Singleton — shared by the entire process lifetime.
export const portManager = new PortManager();
