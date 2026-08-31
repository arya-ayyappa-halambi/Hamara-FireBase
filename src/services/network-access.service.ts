// ─────────────────────────────────────────────────────────────────────────────
//  src/services/network-access.service.ts
//  AegisDB — Network Access Control & Real-Time Device Tracking Service
// ─────────────────────────────────────────────────────────────────────────────

import { getDb, getReaderDb } from '../db/sqlite.connection';
import { v4 as uuidv4 } from 'uuid';
import { wsService } from '../realtime/websocket.service';
import os from 'os';

export interface NetworkAccessRule {
  id: string;
  ipPattern: string;
  label: string;
  ruleType: 'ip' | 'cidr' | 'range';
  action: 'allow' | 'deny';
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
}

export interface TrackedClientDevice {
  ipAddress: string;
  userAgent?: string | null;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'bot';
  osName: string;
  browserName: string;
  lastUserId?: string | null;
  lastUserEmail?: string | null;
  requestCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  isBlocked: boolean;
  isWhitelisted?: boolean;
}

export interface NetworkSettings {
  ipFilteringEnabled: boolean;
  ipFilterDefaultPolicy: 'allow' | 'deny';
  detectedNetworkIp?: string;
  serverHost?: string;
  serverPort?: number;
}

export class NetworkAccessService {
  private static instance: NetworkAccessService;
  private memoryTracker = new Map<string, TrackedClientDevice>();
  private dirtyIps = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // Flush dirty device metrics to database every 5 seconds
    this.flushTimer = setInterval(() => {
      this.flushDevicesToDb();
    }, 5000);
  }

  public static getInstance(): NetworkAccessService {
    if (!NetworkAccessService.instance) {
      NetworkAccessService.instance = new NetworkAccessService();
    }
    return NetworkAccessService.instance;
  }

  // ── IP Utilities ───────────────────────────────────────────────────────────

  public normalizeIp(ip: string | undefined | null): string {
    if (!ip) return '127.0.0.1';
    let clean = ip.trim();
    if (clean.startsWith('::ffff:')) {
      clean = clean.replace('::ffff:', '');
    }
    if (clean === '::1') {
      clean = '127.0.0.1';
    }
    return clean;
  }

  public getHostMachineIps(): Set<string> {
    const hostIps = new Set<string>(['127.0.0.1', '::1', 'localhost']);
    try {
      const ifaces = os.networkInterfaces();
      for (const name of Object.keys(ifaces)) {
        const netList = ifaces[name];
        if (netList) {
          for (const net of netList) {
            if (net.address) {
              hostIps.add(this.normalizeIp(net.address));
            }
          }
        }
      }
    } catch {}
    return hostIps;
  }

  public isHostMachineIp(ip: string): boolean {
    const clean = this.normalizeIp(ip);
    const hostIps = this.getHostMachineIps();
    return hostIps.has(clean);
  }

  public isLocalhost(ip: string): boolean {
    return this.isHostMachineIp(ip);
  }

  private ipToLong(ip: string): number {
    return ip
      .split('.')
      .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
  }

  public matchIpPattern(clientIp: string, pattern: string, ruleType?: 'ip' | 'cidr' | 'range'): boolean {
    const ip = this.normalizeIp(clientIp);
    const target = pattern.trim();

    // 1. Exact match or wildcard
    if (target === '*' || target === '0.0.0.0/0' || target === ip) {
      return true;
    }

    // 2. CIDR notation (e.g. 192.168.1.0/24)
    if (target.includes('/') || ruleType === 'cidr') {
      try {
        const [subnet, bitsStr] = target.split('/');
        const bits = parseInt(bitsStr, 10);
        if (isNaN(bits) || bits < 0 || bits > 32) return false;
        const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        const ipLong = this.ipToLong(ip);
        const subnetLong = this.ipToLong(subnet);
        return (ipLong & mask) === (subnetLong & mask);
      } catch {
        return false;
      }
    }

    // 3. IP Range notation (e.g. 192.168.1.10-192.168.1.50)
    if (target.includes('-') || ruleType === 'range') {
      try {
        const [startIp, endIp] = target.split('-').map(s => s.trim());
        const ipLong = this.ipToLong(ip);
        const startLong = this.ipToLong(startIp);
        const endLong = this.ipToLong(endIp);
        return ipLong >= startLong && ipLong <= endLong;
      } catch {
        return false;
      }
    }

    return false;
  }

  // ── Access Verification (Middleware Entry Point) ───────────────────────────

  public isAccessAllowed(clientIp: string): { allowed: boolean; reason: string } {
    const ip = this.normalizeIp(clientIp);

    // 1. Localhost Safety Guarantee: Always allow 127.0.0.1 to avoid lockouts
    if (this.isLocalhost(ip)) {
      return { allowed: true, reason: 'Localhost host bypass' };
    }

    // 2. Check if explicitly blocked in tracked devices table
    const device = this.memoryTracker.get(ip);
    if (device && device.isBlocked) {
      return { allowed: false, reason: 'Device is explicitly blocked by Administrator' };
    }

    // 3. Evaluate configured Deny Rules first (Explicit Blacklist)
    const rules = this.getRules();
    const denyMatch = rules.find(r => r.action === 'deny' && this.matchIpPattern(ip, r.ipPattern, r.ruleType));
    if (denyMatch) {
      return { allowed: false, reason: `Denied by rule: "${denyMatch.label}" (${denyMatch.ipPattern})` };
    }

    // 4. If IP Whitelisting is disabled, allow all other local network traffic
    const settings = this.getNetworkSettings();
    if (!settings.ipFilteringEnabled) {
      return { allowed: true, reason: 'Open LAN mode' };
    }

    // 5. Check allow rules (Whitelisting)
    const allowMatch = rules.find(r => r.action === 'allow' && this.matchIpPattern(ip, r.ipPattern, r.ruleType));
    if (allowMatch) {
      return { allowed: true, reason: `Allowed by rule: "${allowMatch.label}" (${allowMatch.ipPattern})` };
    }

    // Default policy fallback (if whitelist enabled and no allow rule matched)
    if (settings.ipFilterDefaultPolicy === 'deny' || settings.ipFilteringEnabled) {
      return { allowed: false, reason: 'Device IP is not on the approved whitelist' };
    }

    return { allowed: true, reason: 'Default allow policy' };
  }

  // ── Device Fingerprinting & Real-Time Tracking ────────────────────────────

  public parseUserAgent(ua: string | undefined | null): { deviceType: 'mobile' | 'desktop' | 'tablet' | 'bot'; osName: string; browserName: string } {
    if (!ua) {
      return { deviceType: 'desktop', osName: 'Unknown OS', browserName: 'Unknown Client' };
    }

    // 1. Device Type
    let deviceType: 'mobile' | 'desktop' | 'tablet' | 'bot' = 'desktop';
    if (/bot|crawler|spider|curl|wget|postman/i.test(ua)) {
      deviceType = 'bot';
    } else if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
      deviceType = 'tablet';
    } else if (/mobile|iphone|ipod|android/i.test(ua)) {
      deviceType = 'mobile';
    }

    // 2. OS Name
    let osName = 'Unknown OS';
    if (/iphone|ipad|ipod/i.test(ua)) osName = 'iOS';
    else if (/macintosh|mac os x/i.test(ua)) osName = 'macOS';
    else if (/android/i.test(ua)) osName = 'Android';
    else if (/windows/i.test(ua)) osName = 'Windows';
    else if (/linux/i.test(ua)) osName = 'Linux';

    // 3. Browser Name
    let browserName = 'Browser';
    if (/postman/i.test(ua)) browserName = 'Postman';
    else if (/curl/i.test(ua)) browserName = 'cURL';
    else if (/edg/i.test(ua)) browserName = 'Microsoft Edge';
    else if (/chrome|crios/i.test(ua)) browserName = 'Google Chrome';
    else if (/firefox|fxios/i.test(ua)) browserName = 'Mozilla Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browserName = 'Apple Safari';

    return { deviceType, osName, browserName };
  }

  public recordDeviceActivity(params: {
    ipAddress: string;
    userAgent?: string | null;
    userId?: string | null;
    userEmail?: string | null;
  }): void {
    const ip = this.normalizeIp(params.ipAddress);
    const now = new Date().toISOString();

    let existing = this.memoryTracker.get(ip);
    if (!existing) {
      // Check database
      try {
        const db = getReaderDb();
        const row = db.prepare('SELECT * FROM tracked_client_devices WHERE ipAddress = ?').get(ip) as any;
        if (row) {
          existing = {
            ipAddress: row.ipAddress,
            userAgent: row.userAgent,
            deviceType: row.deviceType,
            osName: row.osName,
            browserName: row.browserName,
            lastUserId: row.lastUserId,
            lastUserEmail: row.lastUserEmail,
            requestCount: row.requestCount,
            firstSeenAt: row.firstSeenAt,
            lastSeenAt: row.lastSeenAt,
            isBlocked: !!row.isBlocked
          };
        }
      } catch {}
    }

    if (existing) {
      existing.requestCount += 1;
      existing.lastSeenAt = now;
      if (params.userAgent && params.userAgent !== existing.userAgent) {
        existing.userAgent = params.userAgent;
        const parsed = this.parseUserAgent(params.userAgent);
        existing.deviceType = parsed.deviceType;
        existing.osName = parsed.osName;
        existing.browserName = parsed.browserName;
      }
      if (params.userId) existing.lastUserId = params.userId;
      if (params.userEmail) existing.lastUserEmail = params.userEmail;
      this.memoryTracker.set(ip, existing);
    } else {
      const parsed = this.parseUserAgent(params.userAgent);
      existing = {
        ipAddress: ip,
        userAgent: params.userAgent || null,
        deviceType: parsed.deviceType,
        osName: parsed.osName,
        browserName: parsed.browserName,
        lastUserId: params.userId || null,
        lastUserEmail: params.userEmail || null,
        requestCount: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        isBlocked: false
      };
      this.memoryTracker.set(ip, existing);

      // Broadcast new device discovery to Super Admin console
      try {
        wsService.broadcast('DEVICE_TRACKER_UPDATED', { device: existing });
      } catch {}
    }

    this.dirtyIps.add(ip);
  }

  public flushDevicesToDb(): void {
    if (this.dirtyIps.size === 0) return;
    const ipsToFlush = Array.from(this.dirtyIps);
    this.dirtyIps.clear();

    try {
      const db = getDb();
      const insertOrUpdate = db.prepare(`
        INSERT INTO tracked_client_devices (
          ipAddress, userAgent, deviceType, osName, browserName,
          lastUserId, lastUserEmail, requestCount, firstSeenAt, lastSeenAt, isBlocked
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ipAddress) DO UPDATE SET
          userAgent = excluded.userAgent,
          deviceType = excluded.deviceType,
          osName = excluded.osName,
          browserName = excluded.browserName,
          lastUserId = COALESCE(excluded.lastUserId, tracked_client_devices.lastUserId),
          lastUserEmail = COALESCE(excluded.lastUserEmail, tracked_client_devices.lastUserEmail),
          requestCount = excluded.requestCount,
          lastSeenAt = excluded.lastSeenAt,
          isBlocked = excluded.isBlocked
      `);

      const tx = db.transaction(() => {
        for (const ip of ipsToFlush) {
          const d = this.memoryTracker.get(ip);
          if (d) {
            insertOrUpdate.run(
              d.ipAddress,
              d.userAgent || null,
              d.deviceType,
              d.osName,
              d.browserName,
              d.lastUserId || null,
              d.lastUserEmail || null,
              d.requestCount,
              d.firstSeenAt,
              d.lastSeenAt,
              d.isBlocked ? 1 : 0
            );
          }
        }
      });
      tx();
    } catch (e) {
      console.error('Failed to flush tracked devices to SQLite:', e);
    }
  }

  // ── Network Rules CRUD ────────────────────────────────────────────────────

  public getRules(): NetworkAccessRule[] {
    try {
      const db = getReaderDb();
      const rows = db.prepare('SELECT * FROM network_access_rules ORDER BY createdAt DESC').all() as any[];
      return rows.map(r => ({
        id: r.id,
        ipPattern: r.ipPattern,
        label: r.label,
        ruleType: r.ruleType || 'ip',
        action: r.action || 'allow',
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdBy: r.createdBy
      }));
    } catch {
      return [];
    }
  }

  public addRule(data: { ipPattern: string; label: string; ruleType?: 'ip' | 'cidr' | 'range'; action?: 'allow' | 'deny'; createdBy?: string }): NetworkAccessRule {
    const id = uuidv4();
    const now = new Date().toISOString();
    const pattern = data.ipPattern.trim();
    let ruleType: 'ip' | 'cidr' | 'range' = data.ruleType || 'ip';

    if (pattern.includes('/')) ruleType = 'cidr';
    else if (pattern.includes('-')) ruleType = 'range';

    const action = data.action || 'allow';
    const label = data.label.trim() || `Rule for ${pattern}`;

    const db = getDb();
    db.prepare(`
      INSERT INTO network_access_rules (id, ipPattern, label, ruleType, action, createdAt, updatedAt, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, pattern, label, ruleType, action, now, now, data.createdBy || null);

    const rule: NetworkAccessRule = {
      id,
      ipPattern: pattern,
      label,
      ruleType,
      action,
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy || null
    };

    try {
      wsService.broadcast('NETWORK_RULES_UPDATED', { rules: this.getRules() });
    } catch {}

    return rule;
  }

  public deleteRule(id: string): boolean {
    const db = getDb();
    const res = db.prepare('DELETE FROM network_access_rules WHERE id = ?').run(id);
    if (res.changes > 0) {
      try {
        wsService.broadcast('NETWORK_RULES_UPDATED', { rules: this.getRules() });
      } catch {}
      return true;
    }
    return false;
  }

  // ── Tracked Devices Query & Actions ────────────────────────────────────────

  public getTrackedDevices(limit = 100): TrackedClientDevice[] {
    // Flush dirty buffer first
    this.flushDevicesToDb();

    try {
      const db = getReaderDb();
      const rows = db.prepare('SELECT * FROM tracked_client_devices ORDER BY lastSeenAt DESC LIMIT ?').all(limit) as any[];
      const rules = this.getRules();

      return rows.map(r => {
        const isWhitelisted = rules.some(rule => rule.action === 'allow' && this.matchIpPattern(r.ipAddress, rule.ipPattern, rule.ruleType));
        return {
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
          deviceType: r.deviceType,
          osName: r.osName,
          browserName: r.browserName,
          lastUserId: r.lastUserId,
          lastUserEmail: r.lastUserEmail,
          requestCount: r.requestCount,
          firstSeenAt: r.firstSeenAt,
          lastSeenAt: r.lastSeenAt,
          isBlocked: !!r.isBlocked,
          isWhitelisted
        };
      });
    } catch {
      return [];
    }
  }

  public toggleBlockDevice(ipAddress: string, blockState?: boolean): { success: boolean; isBlocked: boolean } {
    const ip = this.normalizeIp(ipAddress);
    if (this.isHostMachineIp(ip)) {
      throw new Error(`Host machine interface (${ip}) cannot be blocked to prevent administrator lockout.`);
    }

    const device = this.memoryTracker.get(ip);
    const newBlocked = blockState !== undefined ? blockState : (device ? !device.isBlocked : true);

    if (device) {
      device.isBlocked = newBlocked;
      this.memoryTracker.set(ip, device);
      this.dirtyIps.add(ip);
    }

    const db = getDb();
    db.prepare('UPDATE tracked_client_devices SET isBlocked = ? WHERE ipAddress = ?').run(newBlocked ? 1 : 0, ip);

    try {
      wsService.broadcast('DEVICE_TRACKER_UPDATED', { ipAddress: ip, isBlocked: newBlocked });
    } catch {}

    return { success: true, isBlocked: newBlocked };
  }

  // ── Platform Network Settings ──────────────────────────────────────────────

  public getNetworkSettings(): NetworkSettings {
    try {
      const db = getReaderDb();
      const row = db.prepare("SELECT ipFilteringEnabled, ipFilterDefaultPolicy, serverHost, serverPort FROM platform_settings WHERE id = 'default'").get() as any;
      return {
        ipFilteringEnabled: row ? !!row.ipFilteringEnabled : false,
        ipFilterDefaultPolicy: row?.ipFilterDefaultPolicy === 'deny' ? 'deny' : 'allow',
        serverHost: row?.serverHost || '0.0.0.0',
        serverPort: row?.serverPort || 3000
      };
    } catch {
      return {
        ipFilteringEnabled: false,
        ipFilterDefaultPolicy: 'allow',
        serverHost: '0.0.0.0',
        serverPort: 3000
      };
    }
  }

  public updateNetworkSettings(data: { ipFilteringEnabled?: boolean; ipFilterDefaultPolicy?: 'allow' | 'deny' }): NetworkSettings {
    const db = getDb();
    if (data.ipFilteringEnabled !== undefined) {
      db.prepare("UPDATE platform_settings SET ipFilteringEnabled = ? WHERE id = 'default'").run(data.ipFilteringEnabled ? 1 : 0);
    }
    if (data.ipFilterDefaultPolicy !== undefined) {
      db.prepare("UPDATE platform_settings SET ipFilterDefaultPolicy = ? WHERE id = 'default'").run(data.ipFilterDefaultPolicy);
    }

    const updated = this.getNetworkSettings();
    try {
      wsService.broadcast('NETWORK_SETTINGS_UPDATED', { settings: updated });
    } catch {}
    return updated;
  }
}

export const networkAccessService = NetworkAccessService.getInstance();
