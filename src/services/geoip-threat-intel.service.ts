// ─────────────────────────────────────────────────────────────────────────────
//  src/services/geoip-threat-intel.service.ts
//  AegisDB — Real-Time Geo-IP, Threat Intelligence & Geo-Fencing Engine
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';

export interface GeoIpThreatData {
  ipAddress: string;
  isPrivate: boolean;
  countryCode: string;   // e.g. 'IN', 'US', 'LAN'
  countryName: string;   // e.g. 'India', 'United States', 'Local Area Network'
  countryFlag: string;   // e.g. '🇮🇳', '🇺🇸', '🏠'
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  org?: string;
  asn?: string;
  threatType: 'normal' | 'datacenter' | 'vpn_proxy' | 'tor_node';
  threatScore: number;   // 0 (Clean) to 100 (Critical Malicious)
  isHosting: boolean;
  isProxy: boolean;
  isTor: boolean;
  cachedAt: number;
}

export class GeoIpThreatIntelService {
  private static instance: GeoIpThreatIntelService;
  private cache = new Map<string, GeoIpThreatData>();
  private cacheTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {}

  public static getInstance(): GeoIpThreatIntelService {
    if (!GeoIpThreatIntelService.instance) {
      GeoIpThreatIntelService.instance = new GeoIpThreatIntelService();
    }
    return GeoIpThreatIntelService.instance;
  }

  /**
   * Identifies if an IP is in a private RFC1918 / Loopback / Link-local subnet
   */
  public isPrivateIp(ip: string): boolean {
    const clean = ip.replace(/^::ffff:/, '').trim().toLowerCase();
    if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
    if (clean.startsWith('10.')) return true;
    if (clean.startsWith('192.168.')) return true;
    if (clean.startsWith('169.254.')) return true;
    if (clean.startsWith('fc00:') || clean.startsWith('fe80:')) return true;

    // 172.16.0.0 – 172.31.255.255
    if (clean.startsWith('172.')) {
      const parts = clean.split('.');
      if (parts.length >= 2) {
        const second = parseInt(parts[1], 10);
        if (!isNaN(second) && second >= 16 && second <= 31) return true;
      }
    }

    return false;
  }

  /**
   * Converts a 2-letter ISO country code into a unicode flag emoji (e.g. "US" -> "🇺🇸")
   */
  public getCountryFlagEmoji(countryCode: string): string {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    if (countryCode.toUpperCase() === 'LA') return '🏠';
    const code = countryCode.toUpperCase();
    const offset = 127397;
    return String.fromCodePoint(code.charCodeAt(0) + offset) + String.fromCodePoint(code.charCodeAt(1) + offset);
  }

  /**
   * Look up Geo-IP & Threat Intel data for any IP (cached, non-blocking)
   */
  public async lookupIp(ipAddress: string): Promise<GeoIpThreatData> {
    const ip = ipAddress.replace(/^::ffff:/, '').trim();

    // Check in-memory cache
    const cached = this.cache.get(ip);
    if (cached && (Date.now() - cached.cachedAt) < this.cacheTtlMs) {
      return cached;
    }

    // 1. Handle Private LAN / Host Loopback
    if (this.isPrivateIp(ip)) {
      const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
      const lanResult: GeoIpThreatData = {
        ipAddress: ip,
        isPrivate: true,
        countryCode: 'LAN',
        countryName: isLoopback ? 'Host Machine (Loopback)' : 'Local Area Network (LAN)',
        countryFlag: isLoopback ? '💻' : '🏠',
        city: isLoopback ? 'Localhost' : 'Private Subnet',
        region: 'Internal',
        isp: 'Private Infrastructure',
        threatType: 'normal',
        threatScore: 0,
        isHosting: false,
        isProxy: false,
        isTor: false,
        cachedAt: Date.now()
      };
      this.cache.set(ip, lanResult);
      return lanResult;
    }

    // 2. Query live Geo-IP & Threat database (with fast fallback & timeout)
    try {
      const res = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,as,hosting,proxy`, {
        timeout: 2500
      });

      if (res.data && res.data.status === 'success') {
        const isHosting = !!res.data.hosting;
        const isProxy = !!res.data.proxy;
        const org = (res.data.org || res.data.isp || '').toLowerCase();

        let threatType: 'normal' | 'datacenter' | 'vpn_proxy' | 'tor_node' = 'normal';
        let threatScore = 0;

        if (org.includes('tor') || org.includes('exit node')) {
          threatType = 'tor_node';
          threatScore = 95;
        } else if (isProxy || org.includes('vpn') || org.includes('proxy') || org.includes('mullvad') || org.includes('nordvpn')) {
          threatType = 'vpn_proxy';
          threatScore = 65;
        } else if (isHosting || org.includes('amazon') || org.includes('digitalocean') || org.includes('google cloud') || org.includes('microsoft') || org.includes('hetzner') || org.includes('ovh') || org.includes('cloudflare')) {
          threatType = 'datacenter';
          threatScore = 40;
        }

        const data: GeoIpThreatData = {
          ipAddress: ip,
          isPrivate: false,
          countryCode: (res.data.countryCode || 'XX').toUpperCase(),
          countryName: res.data.country || 'Unknown Country',
          countryFlag: this.getCountryFlagEmoji(res.data.countryCode),
          city: res.data.city || 'Unknown City',
          region: res.data.regionName || res.data.region || 'Unknown Region',
          latitude: res.data.lat,
          longitude: res.data.lon,
          isp: res.data.isp || 'Unknown ISP',
          org: res.data.org,
          asn: res.data.as,
          threatType,
          threatScore,
          isHosting,
          isProxy,
          isTor: threatType === 'tor_node',
          cachedAt: Date.now()
        };

        this.cache.set(ip, data);
        return data;
      }
    } catch {
      // Graceful fallback on network timeout
    }

    // 3. Fallback result for unresolvable WAN IPs
    const fallback: GeoIpThreatData = {
      ipAddress: ip,
      isPrivate: false,
      countryCode: 'WAN',
      countryName: 'Public Network',
      countryFlag: '🌐',
      city: 'Public WAN Gateway',
      region: 'Internet',
      isp: 'External ISP',
      threatType: 'normal',
      threatScore: 10,
      isHosting: false,
      isProxy: false,
      isTor: false,
      cachedAt: Date.now()
    };

    this.cache.set(ip, fallback);
    return fallback;
  }

  /**
   * Evaluates Geo-Fencing rules (e.g. allow only 'IN', or deny 'RU')
   */
  public evaluateGeoCountryRules(countryCode: string, rules: Array<{ ruleType?: string; ipPattern: string; action: string; label: string; isExpired?: boolean }>): {
    allowed: boolean;
    reason?: string;
    code?: string;
  } {
    if (!countryCode || countryCode === 'LAN') {
      return { allowed: true };
    }

    const code = countryCode.toUpperCase().trim();
    const activeCountryRules = rules.filter(r => (r.ruleType === 'geo_country' || r.ruleType === 'country') && !r.isExpired);

    if (activeCountryRules.length === 0) {
      return { allowed: true };
    }

    // 1. Check explicit Country Deny / Blacklist Rules
    const denyRule = activeCountryRules.find(r => r.action === 'deny' && r.ipPattern.toUpperCase().trim() === code);
    if (denyRule) {
      return {
        allowed: false,
        code: 'GEO_COUNTRY_BLOCKED',
        reason: `Access blocked by Geo-Fence rule for country [${code}]: "${denyRule.label}"`
      };
    }

    // 2. Check Country Whitelist Rules
    const allowCountryRules = activeCountryRules.filter(r => r.action === 'allow');
    if (allowCountryRules.length > 0) {
      const isAllowed = allowCountryRules.some(r => r.ipPattern.toUpperCase().trim() === code);
      if (!isAllowed) {
        return {
          allowed: false,
          code: 'GEO_COUNTRY_RESTRICTED',
          reason: `Access restricted: Country [${code}] is not on the allowed Geo-Fence whitelist.`
        };
      }
    }

    return { allowed: true };
  }
}

export const geoipThreatIntelService = GeoIpThreatIntelService.getInstance();
