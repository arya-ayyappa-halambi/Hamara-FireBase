// ─────────────────────────────────────────────────────────────────────────────
//  src/services/anti-abuse.service.ts
//  FlareBase — Anti-Abuse, Multi-Account Prevention & Anti-Spam Intelligence
//
//  Capabilities:
//    1. Email Canonicalization & Sub-Addressing Normalization (+alias / dot stripping).
//    2. Comprehensive Disposable / Burner Email Domain Blacklist.
//    3. Subnet-level Registration Velocity & Cluster Throttling (/24 & /48).
//    4. Zero-Friction Honeypot Trap Field Detection.
//    5. Robotic Form Submission Timing Heuristics (<800ms).
//    6. Automated Bot & Headless User-Agent Identification.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { networkAccessService } from './network-access.service';
import { getDb } from '../db/sqlite.connection';
import { v4 as uuidv4 } from 'uuid';

// ── Extended Disposable / Burner Email Domains ───────────────────────────────
export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  'mailinator.com',
  '10minutemail.com',
  '10minutemail.net',
  'tempmail.com',
  'temp-mail.org',
  'tempmailo.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.biz',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.me',
  'sharklasers.com',
  'getairmail.com',
  'dispostable.com',
  'yopmail.com',
  'yopmail.net',
  'yopmail.fr',
  'fakeinbox.com',
  'mytempemail.com',
  'mytemp.email',
  'mohmal.com',
  'emailondeck.com',
  'burnermail.io',
  'inboxbear.com',
  'maildrop.cc',
  'crazymailing.com',
  'getnada.com',
  'abv.bg',
  'dropmail.me',
  'fakemailgenerator.com',
  'generator.email',
  'nada.ltd',
  'nada.email',
  'inboxkitten.com',
  'tempail.com',
  'trashmail.ws',
  'throwawayemailaddress.com',
  'temporarymail.com',
  'discard.email',
  'discardmail.com',
  'spambog.com',
  'spamgourmet.com',
  'mailnesia.com',
  'mytrashmail.com',
  'mailcatch.com',
  'harakirimail.com',
  'mytempemail.org',
  'tempm.com',
  'minutemail.com',
  'mailforspam.com',
  'mail-temporaire.fr',
  'jetable.org',
  'kasmail.com',
  'deadaddress.com',
  'armyspy.com',
  'cuvox.de',
  'dayrep.com',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'teleworm.us',
  'einrot.com',
  'eyepaste.com',
  'instantemailaddress.com',
  'mohmal.im',
  'mohmal.in',
  'tmail.ws',
  'bupmail.com',
  'zetmail.com',
  'tempm.email'
]);

const DISPOSABLE_DOMAIN_PATTERNS = [
  /^(temp|throw|trash|fake|dispos|burner|guerrilla|shark|10minute|mohmal|anon).*mail/i,
  /.*mail(inator|drop|box|junk|dump|kill|catch|trap)\.(com|net|org|io|cc|me)$/i,
  /.*(disposable|temporary|throwaway).*\.(com|net|org|xyz|top|pw)$/i
];

// ── Known Bot User Agents ────────────────────────────────────────────────────
const BOT_USER_AGENT_PATTERNS = [
  /HeadlessChrome/i,
  /PhantomJS/i,
  /Selenium/i,
  /Puppeteer/i,
  /Playwright/i,
  /python-requests/i,
  /aiohttp/i,
  /httpx/i,
  /curl\//i,
  /Wget\//i,
  /Go-http-client/i,
  /node-fetch/i,
  /axios\//i,
  /PostmanRuntime/i,
  /Apache-HttpClient/i,
  /Java\//i,
  /libwww-perl/i,
  /Scrapy/i,
  /zgrab/i,
  /sqlmap/i,
  /nikto/i
];

export interface CanonicalEmailResult {
  rawEmail: string;
  normalizedEmail: string;
  canonicalEmail: string;
  canonicalHash: string;
  domain: string;
  localPart: string;
  isDisposable: boolean;
  isSubAddressed: boolean;
}

export interface RegistrationRiskContext {
  email: string;
  clientIp?: string;
  userAgent?: string;
  body?: Record<string, any>;
  projectId?: string;
  deviceFingerprint?: string;
}

export interface RiskEvaluationResult {
  riskScore: number;
  isSpam: boolean;
  isBot: boolean;
  isSubnetSpam: boolean;
  isDeviceSpam: boolean;
  isDisposable: boolean;
  isHoneypotTriggered: boolean;
  isCanonicalCollision: boolean;
  isSharedNetwork: boolean;
  reasons: string[];
  canonical: CanonicalEmailResult;
  subnet: string;
  deviceFingerprint?: string;
}

class AntiAbuseService {
  /** Map of subnet -> array of timestamp (ms) for registration velocity window */
  private readonly subnetRegistrations = new Map<string, number[]>();
  /** Map of deviceFingerprint -> array of timestamp (ms) for device registration velocity */
  private readonly deviceRegistrations = new Map<string, number[]>();

  /**
   * Canonicalize email by stripping sub-addressing (+tags) and removing dots
   * for major email providers (Gmail, Googlemail, ProtonMail, Fastmail, etc.).
   */
  public canonicalizeEmail(email: string): CanonicalEmailResult {
    const raw = (email || '').trim();
    const normalized = raw.toLowerCase();
    const parts = normalized.split('@');

    if (parts.length !== 2) {
      return {
        rawEmail: raw,
        normalizedEmail: normalized,
        canonicalEmail: normalized,
        canonicalHash: crypto.createHash('sha256').update(normalized).digest('hex'),
        domain: '',
        localPart: normalized,
        isDisposable: false,
        isSubAddressed: false
      };
    }

    let localPart = parts[0];
    let domain = parts[1];
    let isSubAddressed = false;

    // Normalize googlemail.com to gmail.com
    if (domain === 'googlemail.com') {
      domain = 'gmail.com';
    }

    // Gmail & Googlemail: ignore dots, strip plus-addressing
    if (domain === 'gmail.com') {
      if (localPart.includes('+')) {
        localPart = localPart.split('+')[0];
        isSubAddressed = true;
      }
      localPart = localPart.replace(/\./g, '');
    }
    // ProtonMail, Fastmail, Outlook, Hotmail, Yahoo, iCloud: strip plus-addressing
    else if (
      domain === 'proton.me' ||
      domain === 'protonmail.com' ||
      domain === 'fastmail.com' ||
      domain === 'outlook.com' ||
      domain === 'hotmail.com' ||
      domain === 'live.com' ||
      domain === 'yahoo.com' ||
      domain === 'icloud.com' ||
      domain === 'me.com'
    ) {
      if (localPart.includes('+')) {
        localPart = localPart.split('+')[0];
        isSubAddressed = true;
      }
    }
    // Generic plus tag stripping for all other domains if present
    else if (localPart.includes('+')) {
      localPart = localPart.split('+')[0];
      isSubAddressed = true;
    }

    const canonicalEmail = `${localPart}@${domain}`;
    const canonicalHash = crypto.createHash('sha256').update(canonicalEmail).digest('hex');
    const isDisposable = this.isDisposableDomain(domain);

    return {
      rawEmail: raw,
      normalizedEmail: normalized,
      canonicalEmail,
      canonicalHash,
      domain,
      localPart,
      isDisposable,
      isSubAddressed
    };
  }

  /**
   * Check if an email domain is in the disposable/burner blacklist.
   */
  public isDisposableDomain(domain: string): boolean {
    const cleanDomain = (domain || '').toLowerCase().trim();
    if (DISPOSABLE_EMAIL_DOMAINS.has(cleanDomain)) {
      return true;
    }
    for (const pattern of DISPOSABLE_DOMAIN_PATTERNS) {
      if (pattern.test(cleanDomain)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if an email address uses a disposable domain.
   */
  public isDisposableEmail(email: string): boolean {
    const domain = (email || '').split('@')[1]?.toLowerCase().trim();
    return domain ? this.isDisposableDomain(domain) : false;
  }

  /**
   * Extract IPv4 /24 or IPv6 /48 subnet identifier for clustering.
   */
  public getSubnet(ip: string): string {
    const normIp = networkAccessService.normalizeIp(ip);
    if (!normIp || normIp === 'unknown') return '127.0.0.0/24';

    // IPv4: 192.168.1.55 -> 192.168.1.0/24
    if (normIp.includes('.')) {
      const octets = normIp.split('.');
      if (octets.length === 4) {
        return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
      }
      return normIp;
    }

    // IPv6: 2001:db8:85a3:: -> 2001:db8:85a3::/48
    if (normIp.includes(':')) {
      const parts = normIp.split(':').filter(Boolean);
      const prefix = parts.slice(0, 3).join(':');
      return `${prefix}::/48`;
    }

    return normIp;
  }

  /**
   * Check if a registration exceeds the maximum velocity per subnet.
   * Default: max 5 registrations per subnet per 10-minute sliding window.
   */
  public checkSubnetRegistrationVelocity(ip: string, maxPerSubnet = 5, windowMs = 10 * 60 * 1000): { allowed: boolean; count: number; subnet: string } {
    const subnet = this.getSubnet(ip);
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = this.subnetRegistrations.get(subnet) || [];
    const recent = timestamps.filter(t => t > cutoff);

    this.subnetRegistrations.set(subnet, recent);

    return {
      allowed: recent.length < maxPerSubnet,
      count: recent.length,
      subnet
    };
  }

  /**
   * Record a completed registration in the subnet tracker.
   */
  public recordSubnetRegistration(ip: string): void {
    const subnet = this.getSubnet(ip);
    const now = Date.now();
    const timestamps = this.subnetRegistrations.get(subnet) || [];
    timestamps.push(now);
    this.subnetRegistrations.set(subnet, timestamps);
  }

  /**
   * Check if a registration exceeds the maximum velocity per physical device.
   * Default: max 2 registrations per device per 24-hour sliding window.
   */
  public checkDeviceRegistrationVelocity(deviceFingerprint?: string, maxPerDevice = 2, windowMs = 24 * 60 * 60 * 1000): { allowed: boolean; count: number; deviceFingerprint: string } {
    if (!deviceFingerprint || deviceFingerprint.trim().length === 0) {
      return { allowed: true, count: 0, deviceFingerprint: 'unknown' };
    }

    const cleanFingerprint = deviceFingerprint.trim();
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = this.deviceRegistrations.get(cleanFingerprint) || [];
    const recent = timestamps.filter(t => t > cutoff);

    this.deviceRegistrations.set(cleanFingerprint, recent);

    return {
      allowed: recent.length < maxPerDevice,
      count: recent.length,
      deviceFingerprint: cleanFingerprint
    };
  }

  /**
   * Record a completed registration in the device tracker & SQLite database.
   */
  public recordDeviceRegistration(deviceFingerprint: string | undefined, userId: string, ipAddress?: string, projectId?: string): void {
    if (ipAddress) {
      this.recordSubnetRegistration(ipAddress);
    }
    if (!deviceFingerprint || deviceFingerprint.trim().length === 0) return;
    const cleanFingerprint = deviceFingerprint.trim();
    const now = Date.now();
    const timestamps = this.deviceRegistrations.get(cleanFingerprint) || [];
    timestamps.push(now);
    this.deviceRegistrations.set(cleanFingerprint, timestamps);

    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO device_registrations (id, deviceFingerprint, userId, projectId, ipAddress, registeredAt)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(uuidv4(), cleanFingerprint, userId, projectId || null, ipAddress || null);
    } catch (_) {}
  }

  /**
   * Check if a root canonical email address is already registered.
   */
  public checkCanonicalEmailCollision(canonicalEmailHash: string, projectId?: string): { hasCollision: boolean; collisionType?: 'platform_user' | 'project_user' } {
    if (!canonicalEmailHash) return { hasCollision: false };
    try {
      const db = getDb();
      if (projectId) {
        const row = db.prepare('SELECT id FROM project_users WHERE projectId = ? AND canonicalEmailHash = ?').get(projectId, canonicalEmailHash);
        if (row) return { hasCollision: true, collisionType: 'project_user' };
      } else {
        const row = db.prepare('SELECT id FROM users WHERE canonicalEmailHash = ?').get(canonicalEmailHash);
        if (row) return { hasCollision: true, collisionType: 'platform_user' };
      }
    } catch (_) {}
    return { hasCollision: false };
  }

  /**
   * Calculate Shared-IP Confidence to protect Genuine Shared Wi-Fi (Offices, Colleges, Cafes).
   * Computes the Device Uniqueness Ratio (Distinct Devices on IP / Total Signups on IP).
   */
  public calculateSharedIpConfidence(ipAddress?: string): { isSharedNetwork: boolean; uniquenessRatio: number; distinctDevices: number } {
    if (!ipAddress) return { isSharedNetwork: false, uniquenessRatio: 1.0, distinctDevices: 0 };
    const normIp = networkAccessService.normalizeIp(ipAddress);
    if (!normIp || normIp === '127.0.0.1' || normIp === 'unknown') {
      return { isSharedNetwork: true, uniquenessRatio: 1.0, distinctDevices: 1 };
    }

    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT deviceFingerprint FROM device_registrations 
        WHERE ipAddress = ? AND datetime(registeredAt) > datetime('now', '-30 minutes')
      `).all(normIp) as { deviceFingerprint: string }[];

      if (rows.length <= 1) {
        return { isSharedNetwork: false, uniquenessRatio: 1.0, distinctDevices: rows.length };
      }

      const uniqueFp = new Set(rows.map(r => r.deviceFingerprint).filter(Boolean));
      const ratio = uniqueFp.size / rows.length;

      return {
        isSharedNetwork: ratio >= 0.8 && uniqueFp.size > 1,
        uniquenessRatio: ratio,
        distinctDevices: uniqueFp.size
      };
    } catch (_) {
      return { isSharedNetwork: false, uniquenessRatio: 1.0, distinctDevices: 1 };
    }
  }

  /**
   * Inspect body for hidden honeypot trap fields that bots fill out.
   */
  public inspectHoneypot(body?: Record<string, any>): { isBot: boolean; trapField: string | null } {
    if (!body || typeof body !== 'object') {
      return { isBot: false, trapField: null };
    }

    const trapFieldNames = [
      '_hp_trap',
      '_hp_website',
      '_hp_company',
      'website_url_hp',
      '_trap_fax',
      'fax_number_hp'
    ];

    for (const field of trapFieldNames) {
      if (body[field] !== undefined && body[field] !== null && String(body[field]).trim().length > 0) {
        return { isBot: true, trapField: field };
      }
    }

    return { isBot: false, trapField: null };
  }

  /**
   * Inspect form submission duration. If renderedAt / _hp_ts is passed and
   * elapsed time is < 800ms, it is highly likely an automated script.
   */
  public inspectSubmissionTiming(body?: Record<string, any>): { isInstantSubmission: boolean; elapsedMs: number | null } {
    if (!body || typeof body !== 'object') {
      return { isInstantSubmission: false, elapsedMs: null };
    }

    const tsValue = body._hp_ts || body._renderedAt || body.formRenderTime;
    if (!tsValue) {
      return { isInstantSubmission: false, elapsedMs: null };
    }

    const renderTime = Number(tsValue);
    if (isNaN(renderTime) || renderTime <= 0) {
      return { isInstantSubmission: false, elapsedMs: null };
    }

    const elapsedMs = Date.now() - renderTime;
    // Less than 800ms from form load to submission indicates automated bot
    const isInstantSubmission = elapsedMs > 0 && elapsedMs < 800;

    return { isInstantSubmission, elapsedMs };
  }

  /**
   * Check if User-Agent matches known automated scraping / headless bot libraries.
   */
  public isBotUserAgent(userAgent?: string): { isBot: boolean; botType?: string } {
    if (!userAgent) return { isBot: false };

    for (const pattern of BOT_USER_AGENT_PATTERNS) {
      if (pattern.test(userAgent)) {
        return { isBot: true, botType: userAgent };
      }
    }

    return { isBot: false };
  }

  /**
   * Comprehensive Composite Registration Risk Evaluation (0 to 100).
   * Incorporates Device Velocity, Canonical Email Collision, and Shared Wi-Fi / NAT Confidence.
   */
  public evaluateRegistrationRisk(ctx: RegistrationRiskContext): RiskEvaluationResult {
    let riskScore = 0;
    const reasons: string[] = [];

    const canonical = this.canonicalizeEmail(ctx.email);
    const subnet = this.getSubnet(ctx.clientIp || '127.0.0.1');

    // 1. Disposable Email Domain (+75)
    if (canonical.isDisposable) {
      riskScore += 75;
      reasons.push(`Disposable / temporary email domain detected (${canonical.domain})`);
    }

    // 2. Sub-addressing / Alias Flooding (+25)
    if (canonical.isSubAddressed) {
      riskScore += 25;
      reasons.push(`Sub-addressed / alias email detected (+tag used on ${canonical.domain})`);
    }

    // 3. Canonical Email Duplicate Collision (+60)
    const collision = this.checkCanonicalEmailCollision(canonical.canonicalHash, ctx.projectId);
    if (collision.hasCollision) {
      riskScore += 60;
      reasons.push('Multiple account collision: Canonical root email address is already registered');
    }

    // 4. Honeypot Trap Trigger (+85)
    const honeypot = this.inspectHoneypot(ctx.body);
    if (honeypot.isBot) {
      riskScore += 85;
      reasons.push(`Bot trap honeypot field filled ("${honeypot.trapField}")`);
    }

    // 5. Form Timing (<800ms submission) (+35)
    const timing = this.inspectSubmissionTiming(ctx.body);
    if (timing.isInstantSubmission) {
      riskScore += 35;
      reasons.push(`Instant robotic form submission (${timing.elapsedMs}ms)`);
    }

    // 6. Bot User-Agent (+40)
    const botAgent = this.isBotUserAgent(ctx.userAgent);
    if (botAgent.isBot) {
      riskScore += 40;
      reasons.push(`Automated bot / headless browser User-Agent: ${ctx.userAgent}`);
    }

    // 7. Device Registration Velocity (+50)
    const deviceVelocity = this.checkDeviceRegistrationVelocity(ctx.deviceFingerprint);
    if (!deviceVelocity.allowed) {
      riskScore += 50;
      reasons.push(`Device velocity exceeded: Same physical hardware registered ${deviceVelocity.count} accounts recently`);
    }

    // 8. Shared Network (Wi-Fi / NAT) Intelligence vs. Subnet Rate Limiting
    const subnetVelocity = this.checkSubnetRegistrationVelocity(ctx.clientIp || '127.0.0.1');
    const sharedConfidence = this.calculateSharedIpConfidence(ctx.clientIp);

    if (!subnetVelocity.allowed) {
      if (sharedConfidence.isSharedNetwork) {
        // Legitimate Shared Wi-Fi (e.g. University / Office): Distinct devices verified -> ZERO penalty!
        reasons.push(`Shared network detected (NAT/Wi-Fi): ${sharedConfidence.distinctDevices} distinct devices on subnet (${subnet})`);
      } else {
        // Single device cycling or unverified flood -> Apply subnet penalty
        riskScore += 50;
        reasons.push(`High registration velocity from subnet ${subnet} (${subnetVelocity.count} recent sign-ups)`);
      }
    }

    const finalScore = Math.min(100, riskScore);

    return {
      riskScore: finalScore,
      isSpam: finalScore >= 40,
      isBot: honeypot.isBot || botAgent.isBot || timing.isInstantSubmission,
      isSubnetSpam: !subnetVelocity.allowed && !sharedConfidence.isSharedNetwork,
      isDeviceSpam: !deviceVelocity.allowed,
      isDisposable: canonical.isDisposable,
      isHoneypotTriggered: honeypot.isBot,
      isCanonicalCollision: collision.hasCollision,
      isSharedNetwork: sharedConfidence.isSharedNetwork,
      reasons,
      canonical,
      subnet,
      deviceFingerprint: ctx.deviceFingerprint
    };
  }
}

export const antiAbuseService = new AntiAbuseService();
