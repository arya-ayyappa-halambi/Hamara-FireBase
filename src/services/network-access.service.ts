// ─────────────────────────────────────────────────────────────────────────────
//  src/services/network-access.service.ts
//  AegisDB — Network Access Control & Real-Time Device Tracking Service
// ─────────────────────────────────────────────────────────────────────────────

import { getDb, getReaderDb } from '../db/sqlite.connection';
import { v4 as uuidv4 } from 'uuid';
import { wsService } from '../realtime/websocket.service';
import os from 'os';
import { geoipThreatIntelService, GeoIpThreatData } from './geoip-threat-intel.service';

export interface NetworkAccessRule {
  id: string;
  ipPattern: string;
  label: string;
  ruleType: 'ip' | 'cidr' | 'range' | 'geo_country';
  action: 'allow' | 'deny';
  scope?: 'global' | 'admin_only' | 'db_write_only' | 'project';
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  expiresAt?: string | null;
  isTemporary?: boolean;
  durationLabel?: string;
  isExpired?: boolean;
  remainingSeconds?: number;
}

export interface JailedIpRecord {
  id: string;
  ipAddress: string;
  reason: string;
  failedAttempts: number;
  jailedAt: string;
  expiresAt: string | null;
  durationMinutes: number;
  status: 'active' | 'pardoned' | 'expired';
  unjailedAt?: string | null;
  unjailedBy?: string | null;
  remainingSeconds?: number;
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
  countryCode?: string;
  countryName?: string;
  countryFlag?: string;
  city?: string;
  isp?: string;
  threatType?: 'normal' | 'datacenter' | 'vpn_proxy' | 'tor_node';
  threatScore?: number;
}

export interface NetworkSettings {
  ipFilteringEnabled: boolean;
  ipFilterDefaultPolicy: 'allow' | 'deny';
  adminEndpointIpLockEnabled: boolean;
  adminAllowedSubnet: string;
  requireWriteIpWhitelist: boolean;
  enableSubnetRateLimiting?: boolean;
  defaultSubnetRequestsPerMin?: number;
  detectedNetworkIp?: string;
  serverHost?: string;
  serverPort?: number;
}

export class NetworkAccessService {
  private static instance: NetworkAccessService;
  private memoryTracker = new Map<string, TrackedClientDevice>();
  private failedAttemptsMap = new Map<string, { count: number; firstAttemptAt: number }>();
  private memoryJailMap = new Map<string, JailedIpRecord>();
  private dirtyIps = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadJailRecordsFromDb();

    // Flush dirty device metrics to database every 5 seconds
    this.flushTimer = setInterval(() => {
      this.flushDevicesToDb();
    }, 5000);

    // Prune expired temporary rules and jails every 5 seconds
    this.pruneTimer = setInterval(() => {
      this.pruneExpiredRulesAndJails();
    }, 5000);
  }

  private loadJailRecordsFromDb(): void {
    try {
      const db = getReaderDb();
      const rows = db.prepare("SELECT * FROM jailed_ip_records WHERE status = 'active'").all() as any[];
      const now = Date.now();
      for (const r of rows) {
        let isStillActive = true;
        if (r.expiresAt && now >= new Date(r.expiresAt).getTime()) {
          isStillActive = false;
        }
        if (isStillActive) {
          this.memoryJailMap.set(r.ipAddress, {
            id: r.id,
            ipAddress: r.ipAddress,
            reason: r.reason,
            failedAttempts: r.failedAttempts || 1,
            jailedAt: r.jailedAt,
            expiresAt: r.expiresAt || null,
            durationMinutes: r.durationMinutes || 15,
            status: 'active'
          });
        }
      }
    } catch {}
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

  /**
   * Authoritatively extract the true origin client IP across direct connections,
   * Cloudflare Tunnels (cf-connecting-ip), Ngrok, Localtunnel, and reverse proxies (x-forwarded-for).
   */
  public extractClientIp(req: any): string {
    if (!req) return '127.0.0.1';
    const headers = req.headers || {};

    const cfIp = headers['cf-connecting-ip'] as string;
    if (cfIp && typeof cfIp === 'string' && cfIp.trim()) {
      return this.normalizeIp(cfIp.split(',')[0].trim());
    }

    const trueClientIp = headers['true-client-ip'] as string;
    if (trueClientIp && typeof trueClientIp === 'string' && trueClientIp.trim()) {
      return this.normalizeIp(trueClientIp.split(',')[0].trim());
    }

    const xRealIp = headers['x-real-ip'] as string;
    if (xRealIp && typeof xRealIp === 'string' && xRealIp.trim()) {
      return this.normalizeIp(xRealIp.split(',')[0].trim());
    }

    const xForwardedFor = headers['x-forwarded-for'] as string;
    if (xForwardedFor && typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
      return this.normalizeIp(xForwardedFor.split(',')[0].trim());
    }

    return this.normalizeIp(req.ip || req.socket?.remoteAddress || '127.0.0.1');
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

  public matchIpPattern(clientIp: string, pattern: string, ruleType?: 'ip' | 'cidr' | 'range' | 'geo_country'): boolean {
    if (ruleType === 'geo_country') return false; // Evaluated via Geo-IP country resolver
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
    const res = this.isEndpointAccessAllowed({ clientIp, path: '/', method: 'GET' });
    return { allowed: res.allowed, reason: res.reason };
  }

  public isEndpointAccessAllowed(params: {
    clientIp: string;
    path: string;
    method: string;
    projectId?: string | null;
  }): { allowed: boolean; reason: string; code?: string } {
    const ip = this.normalizeIp(params.clientIp);

    // 1. Localhost Safety Guarantee: Always allow 127.0.0.1 / host machine interface to avoid lockouts
    if (this.isLocalhost(ip)) {
      return { allowed: true, reason: 'Localhost host bypass' };
    }

    // 2. Quarantine Jail Check: If IP is actively jailed for brute-force / flood, block immediately
    const jailCheck = this.isIpJailed(ip);
    if (jailCheck.jailed) {
      const remainMsg = jailCheck.remainingSeconds ? ` (${jailCheck.remainingSeconds}s remaining)` : '';
      return {
        allowed: false,
        code: 'IP_JAILED',
        reason: `Device IP is quarantined in jail due to suspicious activity: ${jailCheck.reason || 'Quarantine'}${remainMsg}`
      };
    }

    // 3. Check if explicitly blocked in tracked devices table
    const device = this.memoryTracker.get(ip);
    if (device && device.isBlocked) {
      return { allowed: false, code: 'DEVICE_BLOCKED', reason: 'Device is explicitly blocked by Administrator' };
    }

    const settings = this.getNetworkSettings();
    const allRules = this.getRules().filter(r => !r.isExpired);

    // 4. Super Admin Endpoint Perimeter Lock (/api/v1/admin/*)
    if (settings.adminEndpointIpLockEnabled && params.path.startsWith('/api/v1/admin')) {
      const allowedAdminSubnets = (settings.adminAllowedSubnet || '127.0.0.1').split(',').map(s => s.trim()).filter(Boolean);
      const matchesAdminSubnet = allowedAdminSubnets.some(sub => this.matchIpPattern(ip, sub));
      const hasAdminAllowRule = allRules.some(r => r.action === 'allow' && (r.scope === 'admin_only' || r.scope === 'global') && this.matchIpPattern(ip, r.ipPattern, r.ruleType));

      if (!matchesAdminSubnet && !hasAdminAllowRule) {
        return {
          allowed: false,
          code: 'ADMIN_PERIMETER_RESTRICTED',
          reason: 'Access restricted: Super Admin endpoints can only be accessed from authorized management devices.'
        };
      }
    }

    // 5. DB Write Operations Mutation Shield (POST, PATCH, PUT, DELETE on /api/v1/db/*)
    const isWriteMethod = ['POST', 'PATCH', 'PUT', 'DELETE'].includes((params.method || 'GET').toUpperCase());
    if (settings.requireWriteIpWhitelist && isWriteMethod && params.path.startsWith('/api/v1/db')) {
      const hasWriteAllowRule = allRules.some(r => r.action === 'allow' && (r.scope === 'db_write_only' || r.scope === 'global') && this.matchIpPattern(ip, r.ipPattern, r.ruleType));
      if (!hasWriteAllowRule) {
        return {
          allowed: false,
          code: 'WRITE_MUTATION_RESTRICTED',
          reason: 'Database write mutations require an approved trusted IP. Read queries remain available.'
        };
      }
    }

    // 6. Per-Project Tenant IP Whitelist Isolation
    if (params.projectId) {
      const projectRules = allRules.filter(r => r.scope === 'project' && r.projectId === params.projectId);
      if (projectRules.length > 0) {
        const projDeny = projectRules.find(r => r.action === 'deny' && this.matchIpPattern(ip, r.ipPattern, r.ruleType));
        if (projDeny) {
          return {
            allowed: false,
            code: 'PROJECT_IP_RESTRICTED',
            reason: `Denied by project IP rule: "${projDeny.label}"`
          };
        }

        const projAllow = projectRules.find(r => r.action === 'allow' && this.matchIpPattern(ip, r.ipPattern, r.ruleType));
        if (!projAllow) {
          return {
            allowed: false,
            code: 'PROJECT_IP_RESTRICTED',
            reason: `Device IP is not authorized for tenant project (${params.projectId}).`
          };
        }
      }
    }

    // 6b. Real-Time Geo-Fencing & Country-Level Access Rules
    const countryCode = device?.countryCode || (geoipThreatIntelService.isPrivateIp(ip) ? 'LAN' : undefined);
    if (countryCode && countryCode !== 'LAN') {
      const geoCheck = geoipThreatIntelService.evaluateGeoCountryRules(countryCode, allRules);
      if (!geoCheck.allowed) {
        return {
          allowed: false,
          code: geoCheck.code || 'GEO_COUNTRY_BLOCKED',
          reason: geoCheck.reason || 'Access denied by Geo-Fence country policy'
        };
      }
    }

    // 7. Global Rules Evaluation (Deny first, then Whitelist / Open LAN)
    const globalRules = allRules.filter(r => !r.scope || r.scope === 'global');
    const denyMatch = globalRules.find(r => r.action === 'deny' && this.matchIpPattern(ip, r.ipPattern, r.ruleType));
    if (denyMatch) {
      return { allowed: false, code: 'GLOBAL_DENIED', reason: `Denied by rule: "${denyMatch.label}" (${denyMatch.ipPattern})` };
    }

    if (!settings.ipFilteringEnabled) {
      return { allowed: true, reason: 'Open LAN mode' };
    }

    const allowMatch = globalRules.find(r => r.action === 'allow' && this.matchIpPattern(ip, r.ipPattern, r.ruleType));
    if (allowMatch) {
      return { allowed: true, reason: `Allowed by rule: "${allowMatch.label}" (${allowMatch.ipPattern})` };
    }

    if (settings.ipFilterDefaultPolicy === 'deny' || settings.ipFilteringEnabled) {
      return { allowed: false, code: 'WHITELIST_REJECTED', reason: 'Device IP is not on the approved whitelist' };
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
            isBlocked: !!row.isBlocked,
            countryCode: row.countryCode || (geoipThreatIntelService.isPrivateIp(ip) ? 'LAN' : undefined),
            countryName: row.countryName || (geoipThreatIntelService.isPrivateIp(ip) ? 'Local Area Network' : undefined),
            countryFlag: geoipThreatIntelService.getCountryFlagEmoji(row.countryCode || (geoipThreatIntelService.isPrivateIp(ip) ? 'LA' : '')),
            city: row.city,
            isp: row.isp,
            threatType: row.threatType || 'normal',
            threatScore: row.threatScore || 0
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

      // Asynchronously enrich Geo-IP if missing
      if (!existing.countryCode) {
        geoipThreatIntelService.lookupIp(ip).then(geo => {
          if (existing) {
            existing.countryCode = geo.countryCode;
            existing.countryName = geo.countryName;
            existing.countryFlag = geo.countryFlag;
            existing.city = geo.city;
            existing.isp = geo.isp;
            existing.threatType = geo.threatType;
            existing.threatScore = geo.threatScore;
            this.dirtyIps.add(ip);
          }
        }).catch(() => {});
      }

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
        isBlocked: false,
        countryCode: geoipThreatIntelService.isPrivateIp(ip) ? 'LAN' : undefined,
        countryName: geoipThreatIntelService.isPrivateIp(ip) ? 'Local Area Network' : undefined,
        countryFlag: geoipThreatIntelService.isPrivateIp(ip) ? '🏠' : '🌐',
        threatType: 'normal',
        threatScore: 0
      };
      this.memoryTracker.set(ip, existing);

      // Asynchronously enrich Geo-IP and threat intel
      geoipThreatIntelService.lookupIp(ip).then(geo => {
        if (existing) {
          existing.countryCode = geo.countryCode;
          existing.countryName = geo.countryName;
          existing.countryFlag = geo.countryFlag;
          existing.city = geo.city;
          existing.isp = geo.isp;
          existing.threatType = geo.threatType;
          existing.threatScore = geo.threatScore;
          this.dirtyIps.add(ip);
          try {
            wsService.broadcast('DEVICE_TRACKER_UPDATED', { device: existing });
          } catch {}
        }
      }).catch(() => {});

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
          lastUserId, lastUserEmail, requestCount, firstSeenAt, lastSeenAt, isBlocked,
          countryCode, countryName, city, isp, threatType, threatScore
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ipAddress) DO UPDATE SET
          userAgent = excluded.userAgent,
          deviceType = excluded.deviceType,
          osName = excluded.osName,
          browserName = excluded.browserName,
          lastUserId = COALESCE(excluded.lastUserId, tracked_client_devices.lastUserId),
          lastUserEmail = COALESCE(excluded.lastUserEmail, tracked_client_devices.lastUserEmail),
          requestCount = excluded.requestCount,
          lastSeenAt = excluded.lastSeenAt,
          isBlocked = excluded.isBlocked,
          countryCode = COALESCE(excluded.countryCode, tracked_client_devices.countryCode),
          countryName = COALESCE(excluded.countryName, tracked_client_devices.countryName),
          city = COALESCE(excluded.city, tracked_client_devices.city),
          isp = COALESCE(excluded.isp, tracked_client_devices.isp),
          threatType = COALESCE(excluded.threatType, tracked_client_devices.threatType),
          threatScore = COALESCE(excluded.threatScore, tracked_client_devices.threatScore)
      `);

      const tx = db.transaction(() => {
        for (const ip of ipsToFlush) {
          const device = this.memoryTracker.get(ip);
          if (device) {
            insertOrUpdate.run(
              device.ipAddress,
              device.userAgent || null,
              device.deviceType,
              device.osName,
              device.browserName,
              device.lastUserId || null,
              device.lastUserEmail || null,
              device.requestCount,
              device.firstSeenAt,
              device.lastSeenAt,
              device.isBlocked ? 1 : 0,
              device.countryCode || null,
              device.countryName || null,
              device.city || null,
              device.isp || null,
              device.threatType || 'normal',
              device.threatScore || 0
            );
          }
        }
      });
      tx();
    } catch (e) {
      console.error('Failed to flush tracked devices to SQLite:', e);
    }
  }

  // ── Network Rules CRUD (with Temporary / TTL Passes & Scopes) ─────────────

  public getRules(scope?: string, projectId?: string): NetworkAccessRule[] {
    try {
      const db = getReaderDb();
      let query = 'SELECT * FROM network_access_rules';
      const params: any[] = [];
      if (projectId) {
        query += ' WHERE projectId = ? ORDER BY createdAt DESC';
        params.push(projectId);
      } else if (scope) {
        query += ' WHERE scope = ? ORDER BY createdAt DESC';
        params.push(scope);
      } else {
        query += ' ORDER BY createdAt DESC';
      }

      const rows = db.prepare(query).all(...params) as any[];
      const now = Date.now();
      return rows.map(r => {
        let isExpired = false;
        let remainingSeconds: number | undefined;
        if (r.expiresAt) {
          const expTime = new Date(r.expiresAt).getTime();
          if (now >= expTime) {
            isExpired = true;
            remainingSeconds = 0;
          } else {
            remainingSeconds = Math.max(0, Math.ceil((expTime - now) / 1000));
          }
        }

        return {
          id: r.id,
          ipPattern: r.ipPattern,
          label: r.label,
          ruleType: r.ruleType || 'ip',
          action: r.action || 'allow',
          scope: r.scope || 'global',
          projectId: r.projectId || null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          createdBy: r.createdBy,
          expiresAt: r.expiresAt || null,
          isTemporary: !!r.isTemporary,
          durationLabel: r.durationLabel || (r.expiresAt ? 'Temporary' : 'Permanent'),
          isExpired,
          remainingSeconds
        };
      });
    } catch {
      return [];
    }
  }

  public addRule(data: {
    ipPattern: string;
    label: string;
    ruleType?: 'ip' | 'cidr' | 'range' | 'geo_country';
    action?: 'allow' | 'deny';
    scope?: 'global' | 'admin_only' | 'db_write_only' | 'project';
    projectId?: string | null;
    createdBy?: string;
    durationMinutes?: number;
    durationLabel?: string;
    expiresAt?: string;
  }): NetworkAccessRule {
    const id = uuidv4();
    const now = new Date();
    const pattern = data.ipPattern.trim();
    let ruleType: 'ip' | 'cidr' | 'range' | 'geo_country' = data.ruleType || 'ip';

    if (data.ruleType === 'geo_country' || (pattern.length === 2 && /^[a-zA-Z]{2}$/.test(pattern))) {
      ruleType = 'geo_country';
    } else if (pattern.includes('/')) {
      ruleType = 'cidr';
    } else if (pattern.includes('-')) {
      ruleType = 'range';
    }

    const action = data.action || 'allow';
    const label = data.label.trim() || `Rule for ${pattern}`;
    const scope = data.scope || (data.projectId ? 'project' : 'global');
    const projectId = data.projectId || null;

    let expiresAt: string | null = null;
    let isTemporary = false;
    let durationLabel = data.durationLabel || 'Permanent';

    if (data.expiresAt) {
      expiresAt = data.expiresAt;
      isTemporary = true;
    } else if (data.durationMinutes && data.durationMinutes > 0) {
      expiresAt = new Date(now.getTime() + data.durationMinutes * 60000).toISOString();
      isTemporary = true;
      if (!data.durationLabel) {
        durationLabel = data.durationMinutes >= 1440
          ? `${Math.round(data.durationMinutes / 1440)} Days`
          : data.durationMinutes >= 60
            ? `${Math.round(data.durationMinutes / 60)} Hours`
            : `${data.durationMinutes} Minutes`;
      }
    }

    const db = getDb();
    db.prepare(`
      INSERT INTO network_access_rules (
        id, ipPattern, label, ruleType, action, scope, projectId, createdAt, updatedAt, createdBy,
        expiresAt, isTemporary, durationLabel
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, pattern, label, ruleType, action, scope, projectId, now.toISOString(), now.toISOString(), data.createdBy || null,
      expiresAt, isTemporary ? 1 : 0, durationLabel
    );

    const rule: NetworkAccessRule = {
      id,
      ipPattern: pattern,
      label,
      ruleType,
      action,
      scope,
      projectId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: data.createdBy || null,
      expiresAt,
      isTemporary,
      durationLabel,
      isExpired: false,
      remainingSeconds: expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 1000)) : undefined
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

  // ── Automated Brute-Force & Flood IP Quarantine / Jail ─────────────────────

  public recordFailedAuthAttempt(clientIp: string, targetEmail?: string): { jailed: boolean; attempts: number; remainingUntilJail: number; jailRecord?: JailedIpRecord } {
    const ip = this.normalizeIp(clientIp);
    if (this.isHostMachineIp(ip)) {
      return { jailed: false, attempts: 0, remainingUntilJail: 999 };
    }

    const now = Date.now();
    const windowMs = 60 * 1000; // 60s rolling detection window
    const threshold = 5;

    let record = this.failedAttemptsMap.get(ip);
    if (!record || (now - record.firstAttemptAt > windowMs)) {
      record = { count: 1, firstAttemptAt: now };
    } else {
      record.count += 1;
    }
    this.failedAttemptsMap.set(ip, record);

    if (record.count >= threshold) {
      this.failedAttemptsMap.delete(ip);
      const jailRecord = this.jailIpManually({
        ipAddress: ip,
        reason: `Brute-Force Guard: Exceeded ${threshold} failed authentication attempts in 60s (${targetEmail ? 'Target: ' + targetEmail : 'Login'})`,
        durationMinutes: 15,
        jailedBy: 'Automated Threat Shield'
      });
      return { jailed: true, attempts: record.count, remainingUntilJail: 0, jailRecord };
    }

    return {
      jailed: false,
      attempts: record.count,
      remainingUntilJail: Math.max(0, threshold - record.count)
    };
  }

  public recordSuccessfulAuth(clientIp: string): void {
    const ip = this.normalizeIp(clientIp);
    this.failedAttemptsMap.delete(ip);
  }

  public isIpJailed(clientIp: string): { jailed: boolean; reason?: string; expiresAt?: string | null; remainingSeconds?: number } {
    const ip = this.normalizeIp(clientIp);
    if (this.isHostMachineIp(ip)) {
      return { jailed: false };
    }

    const jail = this.memoryJailMap.get(ip);
    if (!jail || jail.status !== 'active') {
      return { jailed: false };
    }

    if (jail.expiresAt) {
      const expTime = new Date(jail.expiresAt).getTime();
      const now = Date.now();
      if (now >= expTime) {
        this.pardonJailedIp(ip, 'System Auto-Expire');
        return { jailed: false };
      }
      return {
        jailed: true,
        reason: jail.reason,
        expiresAt: jail.expiresAt,
        remainingSeconds: Math.ceil((expTime - now) / 1000)
      };
    }

    return {
      jailed: true,
      reason: jail.reason,
      expiresAt: null
    };
  }

  public jailIpManually(data: { ipAddress: string; reason?: string; durationMinutes?: number; jailedBy?: string }): JailedIpRecord {
    const ip = this.normalizeIp(data.ipAddress);
    if (this.isHostMachineIp(ip)) {
      throw new Error(`Host machine interface (${ip}) cannot be quarantined to prevent administrator lockout.`);
    }

    const duration = data.durationMinutes !== undefined ? data.durationMinutes : 15;
    const now = new Date();
    const expiresAt = duration > 0 ? new Date(now.getTime() + duration * 60000).toISOString() : null;
    const id = uuidv4();
    const reason = data.reason || 'Administrative Quarantine';

    const jailRecord: JailedIpRecord = {
      id,
      ipAddress: ip,
      reason,
      failedAttempts: 5,
      jailedAt: now.toISOString(),
      expiresAt,
      durationMinutes: duration,
      status: 'active',
      remainingSeconds: duration > 0 ? duration * 60 : undefined
    };

    this.memoryJailMap.set(ip, jailRecord);

    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO jailed_ip_records (id, ipAddress, reason, failedAttempts, jailedAt, expiresAt, durationMinutes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(id, ip, reason, 5, jailRecord.jailedAt, expiresAt, duration);
    } catch (e) {
      console.error('Failed to insert jailed_ip_record into SQLite:', e);
    }

    try {
      wsService.broadcast('IP_JAILED', { jail: jailRecord });
      wsService.broadcast('JAIL_RECORDS_UPDATED', { jails: this.getJailedIps() });
    } catch {}

    return jailRecord;
  }

  public pardonJailedIp(ipAddress: string, unjailedBy = 'Super Admin'): boolean {
    const ip = this.normalizeIp(ipAddress);
    this.memoryJailMap.delete(ip);
    this.failedAttemptsMap.delete(ip);

    const now = new Date().toISOString();
    try {
      const db = getDb();
      db.prepare(`
        UPDATE jailed_ip_records
        SET status = 'pardoned', unjailedAt = ?, unjailedBy = ?
        WHERE ipAddress = ? AND status = 'active'
      `).run(now, unjailedBy, ip);
    } catch {}

    try {
      wsService.broadcast('IP_UNJAILED', { ipAddress: ip, unjailedBy, unjailedAt: now });
      wsService.broadcast('JAIL_RECORDS_UPDATED', { jails: this.getJailedIps() });
    } catch {}

    return true;
  }

  public getJailedIps(): JailedIpRecord[] {
    try {
      const db = getReaderDb();
      const rows = db.prepare('SELECT * FROM jailed_ip_records ORDER BY jailedAt DESC LIMIT 100').all() as any[];
      const now = Date.now();
      return rows.map(r => {
        let remainingSeconds: number | undefined;
        if (r.status === 'active' && r.expiresAt) {
          const expTime = new Date(r.expiresAt).getTime();
          remainingSeconds = Math.max(0, Math.ceil((expTime - now) / 1000));
        }
        return {
          id: r.id,
          ipAddress: r.ipAddress,
          reason: r.reason,
          failedAttempts: r.failedAttempts || 1,
          jailedAt: r.jailedAt,
          expiresAt: r.expiresAt || null,
          durationMinutes: r.durationMinutes || 15,
          status: r.status || 'active',
          unjailedAt: r.unjailedAt,
          unjailedBy: r.unjailedBy,
          remainingSeconds
        };
      });
    } catch {
      return Array.from(this.memoryJailMap.values());
    }
  }

  public clearAllJails(unjailedBy = 'Super Admin'): number {
    this.memoryJailMap.clear();
    this.failedAttemptsMap.clear();
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const res = db.prepare(`
        UPDATE jailed_ip_records SET status = 'pardoned', unjailedAt = ?, unjailedBy = ? WHERE status = 'active'
      `).run(now, unjailedBy);
      try {
        wsService.broadcast('JAIL_RECORDS_UPDATED', { jails: this.getJailedIps() });
      } catch {}
      return res.changes;
    } catch {
      return 0;
    }
  }

  public pruneExpiredRulesAndJails(): void {
    const now = Date.now();
    const nowIso = new Date().toISOString();

    // 1. Prune expired temporary rules
    try {
      const db = getDb();
      const expiredRules = db.prepare('SELECT id, ipPattern, label FROM network_access_rules WHERE expiresAt IS NOT NULL AND expiresAt <= ?').all(nowIso) as any[];
      if (expiredRules.length > 0) {
        db.prepare('DELETE FROM network_access_rules WHERE expiresAt IS NOT NULL AND expiresAt <= ?').run(nowIso);
        try {
          wsService.broadcast('NETWORK_RULES_UPDATED', { rules: this.getRules() });
        } catch {}
      }
    } catch {}

    // 2. Prune expired jails
    for (const [ip, jail] of this.memoryJailMap.entries()) {
      if (jail.status === 'active' && jail.expiresAt) {
        const exp = new Date(jail.expiresAt).getTime();
        if (now >= exp) {
          this.pardonJailedIp(ip, 'Automated Expire');
        }
      }
    }
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
        const isPrivate = geoipThreatIntelService.isPrivateIp(r.ipAddress);
        const countryCode = r.countryCode || (isPrivate ? 'LAN' : 'WAN');
        const countryName = r.countryName || (isPrivate ? (r.ipAddress === '127.0.0.1' ? 'Host Machine (Loopback)' : 'Local Area Network') : 'Public WAN');
        const countryFlag = geoipThreatIntelService.getCountryFlagEmoji(countryCode === 'LAN' ? 'LA' : countryCode);

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
          isWhitelisted,
          countryCode,
          countryName,
          countryFlag,
          city: r.city || (isPrivate ? 'Private Subnet' : 'External Gateway'),
          isp: r.isp || (isPrivate ? 'Local Infrastructure' : 'External ISP'),
          threatType: r.threatType || 'normal',
          threatScore: r.threatScore || 0
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
      const row = db.prepare("SELECT ipFilteringEnabled, ipFilterDefaultPolicy, adminEndpointIpLockEnabled, adminAllowedSubnet, requireWriteIpWhitelist, enableSubnetRateLimiting, defaultSubnetRequestsPerMin, serverHost, serverPort FROM platform_settings WHERE id = 'default'").get() as any;
      return {
        ipFilteringEnabled: row ? !!row.ipFilteringEnabled : false,
        ipFilterDefaultPolicy: row?.ipFilterDefaultPolicy === 'deny' ? 'deny' : 'allow',
        adminEndpointIpLockEnabled: row ? !!row.adminEndpointIpLockEnabled : false,
        adminAllowedSubnet: row?.adminAllowedSubnet || '127.0.0.1',
        requireWriteIpWhitelist: row ? !!row.requireWriteIpWhitelist : false,
        enableSubnetRateLimiting: row ? !!row.enableSubnetRateLimiting : false,
        defaultSubnetRequestsPerMin: row?.defaultSubnetRequestsPerMin || 300,
        serverHost: row?.serverHost || '0.0.0.0',
        serverPort: row?.serverPort || 3000
      };
    } catch {
      return {
        ipFilteringEnabled: false,
        ipFilterDefaultPolicy: 'allow',
        adminEndpointIpLockEnabled: false,
        adminAllowedSubnet: '127.0.0.1',
        requireWriteIpWhitelist: false,
        enableSubnetRateLimiting: false,
        defaultSubnetRequestsPerMin: 300,
        serverHost: '0.0.0.0',
        serverPort: 3000
      };
    }
  }

  public updateNetworkSettings(data: {
    ipFilteringEnabled?: boolean;
    ipFilterDefaultPolicy?: 'allow' | 'deny';
    adminEndpointIpLockEnabled?: boolean;
    adminAllowedSubnet?: string;
    requireWriteIpWhitelist?: boolean;
    enableSubnetRateLimiting?: boolean;
    defaultSubnetRequestsPerMin?: number;
  }): NetworkSettings {
    const db = getDb();
    if (data.ipFilteringEnabled !== undefined) {
      db.prepare("UPDATE platform_settings SET ipFilteringEnabled = ? WHERE id = 'default'").run(data.ipFilteringEnabled ? 1 : 0);
    }
    if (data.ipFilterDefaultPolicy !== undefined) {
      db.prepare("UPDATE platform_settings SET ipFilterDefaultPolicy = ? WHERE id = 'default'").run(data.ipFilterDefaultPolicy);
    }
    if (data.adminEndpointIpLockEnabled !== undefined) {
      db.prepare("UPDATE platform_settings SET adminEndpointIpLockEnabled = ? WHERE id = 'default'").run(data.adminEndpointIpLockEnabled ? 1 : 0);
    }
    if (data.adminAllowedSubnet !== undefined) {
      db.prepare("UPDATE platform_settings SET adminAllowedSubnet = ? WHERE id = 'default'").run(data.adminAllowedSubnet.trim());
    }
    if (data.requireWriteIpWhitelist !== undefined) {
      db.prepare("UPDATE platform_settings SET requireWriteIpWhitelist = ? WHERE id = 'default'").run(data.requireWriteIpWhitelist ? 1 : 0);
    }
    if (data.enableSubnetRateLimiting !== undefined) {
      db.prepare("UPDATE platform_settings SET enableSubnetRateLimiting = ? WHERE id = 'default'").run(data.enableSubnetRateLimiting ? 1 : 0);
    }
    if (data.defaultSubnetRequestsPerMin !== undefined) {
      db.prepare("UPDATE platform_settings SET defaultSubnetRequestsPerMin = ? WHERE id = 'default'").run(Number(data.defaultSubnetRequestsPerMin));
    }

    const updated = this.getNetworkSettings();
    try {
      wsService.broadcast('NETWORK_SETTINGS_UPDATED', { settings: updated });
    } catch {}
    return updated;
  }
}

export const networkAccessService = NetworkAccessService.getInstance();
