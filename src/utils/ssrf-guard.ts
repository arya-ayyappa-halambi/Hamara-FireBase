// ─────────────────────────────────────────────────────────────────────────────
//  src/utils/ssrf-guard.ts
//  AegisDB — Webhook SSRF Protection Guard.
// ─────────────────────────────────────────────────────────────────────────────

import dns from 'dns';
import net from 'net';
import { URL } from 'url';

export interface SsrfCheckResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

/**
 * Checks whether an IPv4 or IPv6 string falls within private/internal/reserved networks.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;

  // Normalize IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  let normalizedIp = ip.trim().toLowerCase();
  if (normalizedIp.startsWith('::ffff:')) {
    normalizedIp = normalizedIp.replace('::ffff:', '');
  }

  // IPv4 Address Check
  if (net.isIPv4(normalizedIp)) {
    const parts = normalizedIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Invalid IPv4 treated as unsafe
    }

    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 10.0.0.0/8 (Private)
    if (a === 10) return true;

    // 172.16.0.0/12 (Private: 172.16.0.0 – 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 (Link-local & AWS/GCP Cloud Metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;

    // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 – 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 (Reserved / Broadcast)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 Address Check
  if (net.isIPv6(normalizedIp)) {
    // ::1 (Loopback)
    if (normalizedIp === '::1' || normalizedIp === '0:0:0:0:0:0:0:1') return true;

    // :: (Unspecified address)
    if (normalizedIp === '::' || normalizedIp === '0:0:0:0:0:0:0:0') return true;

    // Unique Local Address (fc00::/7 - fc00:: to fdff::)
    if (normalizedIp.startsWith('fc') || normalizedIp.startsWith('fd')) return true;

    // Link-Local Address (fe80::/10 - fe80:: to febf::)
    if (
      normalizedIp.startsWith('fe8') ||
      normalizedIp.startsWith('fe9') ||
      normalizedIp.startsWith('fea') ||
      normalizedIp.startsWith('feb')
    ) {
      return true;
    }

    return false;
  }

  return true; // Unknown format treated as unsafe
}

/**
 * Validates a target URL against SSRF attacks:
 * 1. Verifies HTTP / HTTPS protocol.
 * 2. Checks static hostname against forbidden patterns (localhost, .local, .internal).
 * 3. Asynchronously resolves DNS to all IPv4/IPv6 addresses and checks for private IP ranges.
 */
export async function validateSsrfUrl(urlStr: string): Promise<SsrfCheckResult> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // Protocol Restriction: Only HTTP and HTTPS allowed
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      safe: false,
      reason: `Blocked protocol '${parsedUrl.protocol}'. Only http: and https: are allowed.`,
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase().trim();

  // Hostname Blacklist Checks
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === '0.0.0.0'
  ) {
    return { safe: false, reason: `Blocked internal hostname '${hostname}'` };
  }

  // If hostname is directly an IP address
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return {
        safe: false,
        reason: `Blocked private or restricted IP address '${hostname}'`,
        resolvedIp: hostname,
      };
    }
    return { safe: true, resolvedIp: hostname };
  }

  // Perform DNS resolution for domain names
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });

    if (!addresses || addresses.length === 0) {
      return { safe: false, reason: `Unable to resolve DNS for hostname '${hostname}'` };
    }

    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return {
          safe: false,
          reason: `Hostname '${hostname}' resolved to restricted private IP '${addr.address}'`,
          resolvedIp: addr.address,
        };
      }
    }

    return { safe: true, resolvedIp: addresses[0].address };
  } catch (err: any) {
    return { safe: false, reason: `DNS lookup failed for '${hostname}': ${err.message}` };
  }
}

/**
 * Asserts that a URL is safe for outgoing webhooks. Throws an error if unsafe.
 */
export async function assertSafeWebhookUrl(urlStr: string): Promise<string> {
  const result = await validateSsrfUrl(urlStr);
  if (!result.safe) {
    throw new Error(`SSRF Guard Violation: ${result.reason}`);
  }
  return urlStr;
}
