// ─────────────────────────────────────────────────────────────────────────────
//  src/services/waf-shield.service.ts
//  AegisDB — Layer-7 Web Application Firewall (WAF) & Payload Shield
//
//  In-memory, zero-dependency deep packet inspection engine detecting:
//    - SQL Injection (SQLi)
//    - Cross-Site Scripting (XSS)
//    - Prototype Pollution (__proto__)
//    - Directory / Path Traversal (../)
//    - Malicious Scanners & Exploitation Bots (sqlmap, nikto, dirbuster)
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { networkAccessService } from './network-access.service';

export interface WafSettings {
  enabled: boolean;
  blockSqlInjection: boolean;
  blockXss: boolean;
  blockPrototypePollution: boolean;
  blockPathTraversal: boolean;
  blockScanners: boolean;
  autoJailRepeatOffenders: boolean;
}

export interface WafThreatDetectionResult {
  blocked: boolean;
  threatType?: 'sqli' | 'xss' | 'prototype_pollution' | 'path_traversal' | 'scanner';
  description?: string;
  matchedPattern?: string;
  riskScore: number;
}

export interface WafEventLog {
  id: string;
  timestamp: string;
  clientIp: string;
  method: string;
  path: string;
  threatType: string;
  description: string;
  matchedSnippet: string;
}

export interface WafStats {
  totalInspected: number;
  totalBlocked: number;
  threatBreakdown: {
    sqli: number;
    xss: number;
    prototype_pollution: number;
    path_traversal: number;
    scanner: number;
  };
  recentEvents: WafEventLog[];
}

class WafShieldService {
  private settings: WafSettings = {
    enabled: true,
    blockSqlInjection: true,
    blockXss: true,
    blockPrototypePollution: true,
    blockPathTraversal: true,
    blockScanners: true,
    autoJailRepeatOffenders: true,
  };

  private stats: WafStats = {
    totalInspected: 0,
    totalBlocked: 0,
    threatBreakdown: {
      sqli: 0,
      xss: 0,
      prototype_pollution: 0,
      path_traversal: 0,
      scanner: 0,
    },
    recentEvents: [],
  };

  private ipOffenseCounts = new Map<string, { count: number; lastSeen: number }>();
  private initialized: boolean = false;

  // ── Regex Signatures ────────────────────────────────────────────────────────
  private sqliPatterns: RegExp[] = [
    /(\b(union(\s+all)?)\s+select\b)/i,
    /(\bselect\b.+\bfrom\b.+\bwhere\b)/i,
    /(\binsert\s+into\b.+\bvalues\b)/i,
    /(\bdrop\s+(table|database|view|schema)\b)/i,
    /(\bupdate\b.+\bset\b)/i,
    /(\bdelete\s+from\b)/i,
    /(\bexec(\s|\+)+(sp_|xp_))/i,
    /(\b(pg_sleep|sleep|benchmark)\s*\()/i,
    /('.+--)|(--\s*$)|(\/\*.*\*\/)/,
    /('|"|`|\b)(or|and)\s+('|"|`|\b)?([0-9a-zA-Z]+)('|"|`|\b)?\s*=\s*('|"|`|\b)?\4('|"|`|\b)?/i,
    /('|"|`|\b)(or|and)\s+('?1'?\s*=\s*'?1'|'?a'?\s*=\s*'?a'|true\s*=\s*true)/i,
  ];

  private xssPatterns: RegExp[] = [
    /<script\b[^>]*>([\s\S]*?)<\/script>/i,
    /<iframe\b[^>]*>/i,
    /<object\b[^>]*>/i,
    /<embed\b[^>]*>/i,
    /\bonerror\s*=\s*["']?[^"'>]+/i,
    /\bonload\s*=\s*["']?[^"'>]+/i,
    /\bonclick\s*=\s*["']?[^"'>]+/i,
    /\bjavascript\s*:\s*/i,
    /\bdata\s*:\s*text\/html/i,
  ];

  private scannerUserAgents: RegExp[] = [
    /sqlmap/i,
    /nikto/i,
    /dirbuster/i,
    /masscan/i,
    /zgrab/i,
    /nmap/i,
    /acunetix/i,
    /w3af/i,
    /gobuster/i,
    /wfuzz/i,
  ];

  constructor() {
    // Lazy initialize from DB
  }

  private initFromDb(): void {
    if (this.initialized) return;
    try {
      const db = getDb();
      const row = db.prepare(`
        SELECT 
          wafEnabled,
          wafBlockSqlInjection,
          wafBlockXss,
          wafBlockPrototypePollution,
          wafBlockPathTraversal,
          wafBlockScanners,
          wafAutoJailRepeatOffenders
        FROM platform_settings 
        WHERE id = 'default'
      `).get() as any;

      if (row) {
        if (row.wafEnabled !== undefined && row.wafEnabled !== null) this.settings.enabled = Number(row.wafEnabled) === 1;
        if (row.wafBlockSqlInjection !== undefined && row.wafBlockSqlInjection !== null) this.settings.blockSqlInjection = Number(row.wafBlockSqlInjection) === 1;
        if (row.wafBlockXss !== undefined && row.wafBlockXss !== null) this.settings.blockXss = Number(row.wafBlockXss) === 1;
        if (row.wafBlockPrototypePollution !== undefined && row.wafBlockPrototypePollution !== null) this.settings.blockPrototypePollution = Number(row.wafBlockPrototypePollution) === 1;
        if (row.wafBlockPathTraversal !== undefined && row.wafBlockPathTraversal !== null) this.settings.blockPathTraversal = Number(row.wafBlockPathTraversal) === 1;
        if (row.wafBlockScanners !== undefined && row.wafBlockScanners !== null) this.settings.blockScanners = Number(row.wafBlockScanners) === 1;
        if (row.wafAutoJailRepeatOffenders !== undefined && row.wafAutoJailRepeatOffenders !== null) this.settings.autoJailRepeatOffenders = Number(row.wafAutoJailRepeatOffenders) === 1;
      }
      this.initialized = true;
    } catch (_) {}
  }

  public getSettings(): WafSettings {
    this.initFromDb();
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<WafSettings>): WafSettings {
    this.initFromDb();
    this.settings = { ...this.settings, ...partial };

    const db = getDb();
    try {
      db.prepare(`
        UPDATE platform_settings SET
          wafEnabled = ?,
          wafBlockSqlInjection = ?,
          wafBlockXss = ?,
          wafBlockPrototypePollution = ?,
          wafBlockPathTraversal = ?,
          wafBlockScanners = ?,
          wafAutoJailRepeatOffenders = ?
        WHERE id = 'default'
      `).run(
        this.settings.enabled ? 1 : 0,
        this.settings.blockSqlInjection ? 1 : 0,
        this.settings.blockXss ? 1 : 0,
        this.settings.blockPrototypePollution ? 1 : 0,
        this.settings.blockPathTraversal ? 1 : 0,
        this.settings.blockScanners ? 1 : 0,
        this.settings.autoJailRepeatOffenders ? 1 : 0
      );
    } catch (_) {}

    return this.getSettings();
  }

  public getStats(): WafStats {
    return {
      ...this.stats,
      threatBreakdown: { ...this.stats.threatBreakdown },
      recentEvents: [...this.stats.recentEvents],
    };
  }

  /**
   * Deeply inspects an incoming request across URL, query params, headers, and body.
   */
  public inspectRequest(params: {
    method: string;
    path: string;
    query?: Record<string, any>;
    body?: any;
    headers?: Record<string, any>;
    clientIp: string;
  }): WafThreatDetectionResult {
    this.initFromDb();
    this.stats.totalInspected++;

    if (!this.settings.enabled) {
      return { blocked: false, riskScore: 0 };
    }

    const clientIp = networkAccessService.normalizeIp(params.clientIp);
    const userAgent = String(params.headers?.['user-agent'] || '');
    const urlString = decodeURIComponent(params.path + (params.query ? JSON.stringify(params.query) : ''));

    // 1. Scanner & Bad Bot Detection
    if (this.settings.blockScanners && userAgent) {
      for (const pattern of this.scannerUserAgents) {
        if (pattern.test(userAgent)) {
          return this.recordThreat({
            clientIp,
            method: params.method,
            path: params.path,
            threatType: 'scanner',
            description: `Automated vulnerability scanner / exploitation tool detected (${userAgent})`,
            matchedSnippet: userAgent,
            riskScore: 90,
          });
        }
      }
    }

    // 2. Directory / Path Traversal
    if (this.settings.blockPathTraversal) {
      const traversalPattern = /(\.\.[\/\\]|\/etc\/passwd|\\boot\.ini|system32)/i;
      if (traversalPattern.test(urlString)) {
        return this.recordThreat({
          clientIp,
          method: params.method,
          path: params.path,
          threatType: 'path_traversal',
          description: 'Directory traversal & path escape attack attempt detected.',
          matchedSnippet: urlString.slice(0, 100),
          riskScore: 95,
        });
      }
    }

    // 3. Stringify Body for Payload Deep Inspection
    let bodyString = '';
    if (params.body) {
      try {
        bodyString = typeof params.body === 'string' ? params.body : JSON.stringify(params.body);
      } catch (_) {
        bodyString = String(params.body);
      }
    }

    const payloadToCheck = `${urlString} ${bodyString}`;

    // 4. Prototype Pollution Shield
    if (this.settings.blockPrototypePollution) {
      if (this.checkPrototypePollution(params.body, payloadToCheck)) {
        return this.recordThreat({
          clientIp,
          method: params.method,
          path: params.path,
          threatType: 'prototype_pollution',
          description: 'Object Prototype Pollution payload injection detected.',
          matchedSnippet: '__proto__ / constructor.prototype',
          riskScore: 90,
        });
      }
    }

    // 5. Cross-Site Scripting (XSS) Shield
    if (this.settings.blockXss) {
      for (const pattern of this.xssPatterns) {
        const match = pattern.exec(payloadToCheck);
        if (match) {
          return this.recordThreat({
            clientIp,
            method: params.method,
            path: params.path,
            threatType: 'xss',
            description: 'Cross-Site Scripting (XSS) / executable markup injection detected.',
            matchedSnippet: match[0].slice(0, 100),
            riskScore: 85,
          });
        }
      }
    }

    // 6. SQL Injection (SQLi) Shield
    if (this.settings.blockSqlInjection) {
      for (const pattern of this.sqliPatterns) {
        const match = pattern.exec(payloadToCheck);
        if (match) {
          return this.recordThreat({
            clientIp,
            method: params.method,
            path: params.path,
            threatType: 'sqli',
            description: 'SQL Injection / SQL Operator attack pattern detected.',
            matchedSnippet: match[0].slice(0, 100),
            riskScore: 95,
          });
        }
      }
    }

    return { blocked: false, riskScore: 0 };
  }

  private checkPrototypePollution(body: any, payloadToCheck: string): boolean {
    if (payloadToCheck && /__proto__|constructor\.prototype|prototype\./i.test(payloadToCheck)) {
      return true;
    }
    if (!body || typeof body !== 'object') {
      return false;
    }

    try {
      const proto = Object.getPrototypeOf(body);
      if (proto && proto !== Object.prototype && typeof proto === 'object' && Object.keys(proto).length > 0) {
        return true;
      }

      const keys = Object.getOwnPropertyNames(body);
      for (const k of keys) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
        if (body[k] && typeof body[k] === 'object' && this.checkPrototypePollution(body[k], '')) return true;
      }
    } catch (_) {}

    return false;
  }

  private recordThreat(event: {
    clientIp: string;
    method: string;
    path: string;
    threatType: 'sqli' | 'xss' | 'prototype_pollution' | 'path_traversal' | 'scanner';
    description: string;
    matchedSnippet: string;
    riskScore: number;
  }): WafThreatDetectionResult {
    this.stats.totalBlocked++;
    this.stats.threatBreakdown[event.threatType]++;

    const logEntry: WafEventLog = {
      id: `waf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      clientIp: event.clientIp,
      method: event.method,
      path: event.path,
      threatType: event.threatType,
      description: event.description,
      matchedSnippet: event.matchedSnippet,
    };

    this.stats.recentEvents.unshift(logEntry);
    if (this.stats.recentEvents.length > 50) {
      this.stats.recentEvents.pop();
    }

    // Auto-jail repeat offenders (3+ violations in 5 minutes)
    if (this.settings.autoJailRepeatOffenders) {
      const now = Date.now();
      const current = this.ipOffenseCounts.get(event.clientIp) || { count: 0, lastSeen: now };
      if (now - current.lastSeen > 5 * 60 * 1000) {
        current.count = 1;
      } else {
        current.count += 1;
      }
      current.lastSeen = now;
      this.ipOffenseCounts.set(event.clientIp, current);

      if (current.count >= 2) {
        try {
          networkAccessService.jailIpManually({
            ipAddress: event.clientIp,
            durationMinutes: 30,
            reason: `WAF Shield: Multiple malicious ${event.threatType.toUpperCase()} attack payloads detected.`,
            jailedBy: 'WAF Automated Shield'
          });
        } catch (_) {}
      }
    }

    return {
      blocked: true,
      threatType: event.threatType,
      description: event.description,
      matchedPattern: event.matchedSnippet,
      riskScore: event.riskScore,
    };
  }
}

export const wafShieldService = new WafShieldService();
