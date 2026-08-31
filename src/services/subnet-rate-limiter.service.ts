// ─────────────────────────────────────────────────────────────────────────────
//  src/services/subnet-rate-limiter.service.ts
//  AegisDB — Adaptive Subnet-Level Rate Limiting & Bandwidth Throttling Engine
// ─────────────────────────────────────────────────────────────────────────────

import { getDb, getReaderDb } from '../db/sqlite.connection';
import { v4 as uuidv4 } from 'uuid';
import { networkAccessService } from './network-access.service';

export interface SubnetRatePolicy {
  id: string;
  subnetPattern: string;
  label: string;
  requestsPerMinute: number;
  burstLimit: number;
  bandwidthLimitKbps: number;
  actionOnExceed: 'throttle' | 'block';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  throttled: boolean;
  delayMs?: number;
  remaining: number;
  limit: number;
  resetSeconds: number;
  reason?: string;
  matchedSubnet?: string;
}

interface ClientBucket {
  timestamps: number[];
  byteTimestamps: Array<{ ts: number; bytes: number }>;
}

export class SubnetRateLimiterService {
  private static instance: SubnetRateLimiterService;
  private ipBuckets = new Map<string, ClientBucket>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // Prune inactive IP buckets every 30 seconds
    this.cleanupTimer = setInterval(() => {
      this.pruneStaleBuckets();
    }, 30000);
  }

  public static getInstance(): SubnetRateLimiterService {
    if (!SubnetRateLimiterService.instance) {
      SubnetRateLimiterService.instance = new SubnetRateLimiterService();
    }
    return SubnetRateLimiterService.instance;
  }

  private pruneStaleBuckets(): void {
    const cutoff = Date.now() - 60000;
    for (const [ip, bucket] of this.ipBuckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter(ts => ts > cutoff);
      bucket.byteTimestamps = bucket.byteTimestamps.filter(b => b.ts > cutoff);
      if (bucket.timestamps.length === 0 && bucket.byteTimestamps.length === 0) {
        this.ipBuckets.delete(ip);
      }
    }
  }

  // ── Rate Limit Verification Engine ──────────────────────────────────────────

  public checkRateLimit(clientIp: string, byteSize = 512): RateLimitCheckResult {
    const ip = networkAccessService.normalizeIp(clientIp);

    // 1. Anti-Lockout Guarantee: Host machine loopback (127.0.0.1 / ::1) is exempt from rate limits
    if (networkAccessService.isHostMachineIp(ip)) {
      return {
        allowed: true,
        throttled: false,
        remaining: 9999,
        limit: 10000,
        resetSeconds: 60
      };
    }

    const netSettings = networkAccessService.getNetworkSettings() as any;
    const isGloballyEnabled = Boolean(netSettings.enableSubnetRateLimiting);
    const defaultRpm = Number(netSettings.defaultSubnetRequestsPerMin || 300);

    const now = Date.now();
    const windowStart = now - 60000;

    // Get or create client memory bucket
    let bucket = this.ipBuckets.get(ip);
    if (!bucket) {
      bucket = { timestamps: [], byteTimestamps: [] };
      this.ipBuckets.set(ip, bucket);
    }

    // Filter past 60-second window
    bucket.timestamps = bucket.timestamps.filter(ts => ts > windowStart);
    bucket.byteTimestamps = bucket.byteTimestamps.filter(b => b.ts > windowStart);

    // Find matching active policy for this IP / subnet
    const policies = this.getPolicies().filter(p => p.isActive);
    let matchedPolicy = policies.find(p => networkAccessService.matchIpPattern(ip, p.subnetPattern));

    // Fallback to global default if enabled but no explicit subnet policy matched
    const rpmLimit = matchedPolicy ? matchedPolicy.requestsPerMinute : (isGloballyEnabled ? defaultRpm : 0);
    const burstLimit = matchedPolicy ? matchedPolicy.burstLimit : 50;
    const bandwidthLimitKbps = matchedPolicy ? matchedPolicy.bandwidthLimitKbps : 10000;
    const actionOnExceed = matchedPolicy ? matchedPolicy.actionOnExceed : 'block';

    // If rate limiting is disabled for this IP / subnet
    if (rpmLimit <= 0) {
      bucket.timestamps.push(now);
      bucket.byteTimestamps.push({ ts: now, bytes: byteSize });
      return {
        allowed: true,
        throttled: false,
        remaining: 9999,
        limit: 9999,
        resetSeconds: 60
      };
    }

    const currentCount = bucket.timestamps.length;
    const oldestTimestamp = bucket.timestamps[0] || now;
    const resetSeconds = Math.max(1, Math.ceil((oldestTimestamp + 60000 - now) / 1000));

    // Check Bandwidth consumption (KB in last 60s)
    const totalBytesInWindow = bucket.byteTimestamps.reduce((sum, b) => sum + b.bytes, 0);
    const totalKbps = (totalBytesInWindow * 8) / (60 * 1000); // Kilobits per second average

    // Burst rate check: requests in last 5 seconds
    const fiveSecStart = now - 5000;
    const burstCount = bucket.timestamps.filter(ts => ts > fiveSecStart).length;

    // Check if limits exceeded
    const isRpmExceeded = currentCount >= rpmLimit;
    const isBurstExceeded = burstCount >= burstLimit;
    const isBandwidthExceeded = totalKbps >= bandwidthLimitKbps;

    if (isRpmExceeded || isBurstExceeded || isBandwidthExceeded) {
      if (actionOnExceed === 'throttle') {
        // Apply artificial delay
        const delayMs = Math.min(2000, Math.max(200, (currentCount - rpmLimit + 1) * 150));
        bucket.timestamps.push(now);
        bucket.byteTimestamps.push({ ts: now, bytes: byteSize });

        return {
          allowed: true,
          throttled: true,
          delayMs,
          remaining: 0,
          limit: rpmLimit,
          resetSeconds,
          reason: `Subnet request rate throttled (${currentCount}/${rpmLimit} req/min, ${delayMs}ms delay).`,
          matchedSubnet: matchedPolicy?.subnetPattern
        };
      } else {
        // Block request
        return {
          allowed: false,
          throttled: false,
          remaining: 0,
          limit: rpmLimit,
          resetSeconds,
          reason: `Subnet rate limit exceeded (${currentCount}/${rpmLimit} req/min). Please slow down.`,
          matchedSubnet: matchedPolicy?.subnetPattern
        };
      }
    }

    // Record this request and compute remaining quota post-request
    bucket.timestamps.push(now);
    bucket.byteTimestamps.push({ ts: now, bytes: byteSize });
    const remaining = Math.max(0, rpmLimit - bucket.timestamps.length);

    return {
      allowed: true,
      throttled: false,
      remaining,
      limit: rpmLimit,
      resetSeconds,
      matchedSubnet: matchedPolicy?.subnetPattern
    };
  }

  // ── Subnet Policy CRUD ─────────────────────────────────────────────────────

  public getPolicies(): SubnetRatePolicy[] {
    try {
      const db = getReaderDb();
      const rows = db.prepare('SELECT * FROM subnet_rate_limit_policies ORDER BY createdAt DESC').all() as any[];
      return rows.map(r => ({
        id: r.id,
        subnetPattern: r.subnetPattern,
        label: r.label,
        requestsPerMinute: r.requestsPerMinute,
        burstLimit: r.burstLimit,
        bandwidthLimitKbps: r.bandwidthLimitKbps,
        actionOnExceed: r.actionOnExceed,
        isActive: !!r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }));
    } catch {
      return [];
    }
  }

  public addPolicy(data: {
    subnetPattern: string;
    label: string;
    requestsPerMinute?: number;
    burstLimit?: number;
    bandwidthLimitKbps?: number;
    actionOnExceed?: 'throttle' | 'block';
    isActive?: boolean;
  }): SubnetRatePolicy {
    const id = uuidv4();
    const now = new Date().toISOString();
    const pattern = data.subnetPattern.trim();
    const label = data.label.trim() || `Rate limit for ${pattern}`;
    const rpm = Number(data.requestsPerMinute || 300);
    const burst = Number(data.burstLimit || 50);
    const bandwidth = Number(data.bandwidthLimitKbps || 10000);
    const action = data.actionOnExceed || 'block';
    const active = data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1;

    const db = getDb();
    db.prepare(`
      INSERT INTO subnet_rate_limit_policies (
        id, subnetPattern, label, requestsPerMinute, burstLimit, bandwidthLimitKbps, actionOnExceed, isActive, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, pattern, label, rpm, burst, bandwidth, action, active, now, now);

    return {
      id,
      subnetPattern: pattern,
      label,
      requestsPerMinute: rpm,
      burstLimit: burst,
      bandwidthLimitKbps: bandwidth,
      actionOnExceed: action,
      isActive: Boolean(active),
      createdAt: now,
      updatedAt: now
    };
  }

  public updatePolicy(id: string, data: Partial<SubnetRatePolicy>): SubnetRatePolicy | null {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM subnet_rate_limit_policies WHERE id = ?').get(id) as any;
    if (!existing) return null;

    const now = new Date().toISOString();
    const pattern = data.subnetPattern !== undefined ? data.subnetPattern.trim() : existing.subnetPattern;
    const label = data.label !== undefined ? data.label.trim() : existing.label;
    const rpm = data.requestsPerMinute !== undefined ? Number(data.requestsPerMinute) : existing.requestsPerMinute;
    const burst = data.burstLimit !== undefined ? Number(data.burstLimit) : existing.burstLimit;
    const bandwidth = data.bandwidthLimitKbps !== undefined ? Number(data.bandwidthLimitKbps) : existing.bandwidthLimitKbps;
    const action = data.actionOnExceed !== undefined ? data.actionOnExceed : existing.actionOnExceed;
    const active = data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.isActive;

    db.prepare(`
      UPDATE subnet_rate_limit_policies SET
        subnetPattern = ?, label = ?, requestsPerMinute = ?, burstLimit = ?,
        bandwidthLimitKbps = ?, actionOnExceed = ?, isActive = ?, updatedAt = ?
      WHERE id = ?
    `).run(pattern, label, rpm, burst, bandwidth, action, active, now, id);

    return {
      id,
      subnetPattern: pattern,
      label,
      requestsPerMinute: rpm,
      burstLimit: burst,
      bandwidthLimitKbps: bandwidth,
      actionOnExceed: action,
      isActive: Boolean(active),
      createdAt: existing.createdAt,
      updatedAt: now
    };
  }

  public deletePolicy(id: string): boolean {
    const db = getDb();
    const res = db.prepare('DELETE FROM subnet_rate_limit_policies WHERE id = ?').run(id);
    return res.changes > 0;
  }

  // ── Live Telemetry & Consumption Metrics ───────────────────────────────────

  public getLiveSubnetMetrics(): Array<{
    ipAddress: string;
    requestsLast60s: number;
    currentRps: number;
    bandwidthKbps: number;
  }> {
    const now = Date.now();
    const windowStart = now - 60000;
    const metrics: Array<{ ipAddress: string; requestsLast60s: number; currentRps: number; bandwidthKbps: number }> = [];

    for (const [ip, bucket] of this.ipBuckets.entries()) {
      const activeTimestamps = bucket.timestamps.filter(ts => ts > windowStart);
      const activeBytes = bucket.byteTimestamps.filter(b => b.ts > windowStart);
      const totalBytes = activeBytes.reduce((s, b) => s + b.bytes, 0);

      if (activeTimestamps.length > 0) {
        metrics.push({
          ipAddress: ip,
          requestsLast60s: activeTimestamps.length,
          currentRps: Number((activeTimestamps.length / 60).toFixed(2)),
          bandwidthKbps: Number(((totalBytes * 8) / (60 * 1000)).toFixed(2))
        });
      }
    }

    return metrics.sort((a, b) => b.requestsLast60s - a.requestsLast60s);
  }
}

export const subnetRateLimiterService = SubnetRateLimiterService.getInstance();
