import os from 'os';
import net from 'net';
import { getDb } from '../db/sqlite.connection';

export type MeshProtocol = 'auto' | 'n2n' | 'tailscale' | 'wireguard' | 'zerotier' | 'custom' | 'none';

export interface DetectedMeshInterface {
  interfaceName: string;
  protocol: 'n2n' | 'tailscale' | 'wireguard' | 'zerotier' | 'generic';
  protocolDisplayName: string;
  ipv4: string | null;
  ipv6: string | null;
  netmask: string | null;
  cidr: string | null;
  mac: string;
  internal: boolean;
}

export interface MeshVpnStatusReport {
  enabled: boolean;
  status: 'online' | 'standby' | 'disabled';
  protocol: MeshProtocol;
  protocolDisplayName: string;
  interfaceName: string | null;
  meshIp: string | null;
  meshIpv6: string | null;
  meshPort: number;
  meshDirectUrl: string | null;
  autoWhitelistEnabled: boolean;
  customIpConfigured: string;
  detectedInterfaces: DetectedMeshInterface[];
  commandsGuide: {
    n2n: string;
    tailscale: string;
    wireguard: string;
    zerotier: string;
  };
}

export class MeshVpnService {
  /**
   * Inspect all operating system network adapters to find virtual mesh VPN interfaces.
   */
  public scanNetworkInterfaces(): DetectedMeshInterface[] {
    const detected: DetectedMeshInterface[] = [];
    try {
      const ifaces = os.networkInterfaces();
      for (const [name, netList] of Object.entries(ifaces)) {
        if (!netList || netList.length === 0) continue;

        let ipv4: string | null = null;
        let ipv6: string | null = null;
        let netmask: string | null = null;
        let cidr: string | null = null;
        let mac = '';
        let internal = false;

        for (const item of netList) {
          if (item.family === 'IPv4' || (item as any).family === 4) {
            ipv4 = item.address;
            netmask = item.netmask;
            cidr = (item as any).cidr || null;
            mac = item.mac;
            internal = item.internal;
          } else if (item.family === 'IPv6' || (item as any).family === 6) {
            if (!item.address.startsWith('fe80:')) {
              ipv6 = item.address;
            }
          }
        }

        const lowerName = name.toLowerCase();

        // 1. n2n P2P Edge identification
        if (lowerName.startsWith('edge') || lowerName.startsWith('n2n')) {
          detected.push({
            interfaceName: name,
            protocol: 'n2n',
            protocolDisplayName: 'n2n P2P Mesh (Edge)',
            ipv4,
            ipv6,
            netmask,
            cidr,
            mac,
            internal
          });
          continue;
        }

        // 2. Tailscale Overlay identification (tailscale0 or macOS/Linux utun with CGNAT 100.64.0.0/10)
        const isTailscaleCgnat = ipv4 ? this.isTailscaleIp(ipv4) : false;
        if (lowerName.startsWith('tailscale') || (lowerName.startsWith('utun') && isTailscaleCgnat)) {
          detected.push({
            interfaceName: name,
            protocol: 'tailscale',
            protocolDisplayName: 'Tailscale Mesh VPN',
            ipv4,
            ipv6,
            netmask,
            cidr,
            mac,
            internal
          });
          continue;
        }

        // 3. WireGuard Overlay identification
        if (lowerName.startsWith('wg') || lowerName.includes('wireguard')) {
          detected.push({
            interfaceName: name,
            protocol: 'wireguard',
            protocolDisplayName: 'WireGuard Mesh Network',
            ipv4,
            ipv6,
            netmask,
            cidr,
            mac,
            internal
          });
          continue;
        }

        // 4. ZeroTier Virtual LAN identification
        const isZeroTierRange = ipv4 ? (ipv4.startsWith('10.147.') || ipv4.startsWith('10.144.')) : false;
        if (lowerName.startsWith('zt') || lowerName.includes('zerotier') || isZeroTierRange) {
          detected.push({
            interfaceName: name,
            protocol: 'zerotier',
            protocolDisplayName: 'ZeroTier Virtual LAN',
            ipv4,
            ipv6,
            netmask,
            cidr,
            mac,
            internal
          });
          continue;
        }

        // 5. Generic Virtual TUN/TAP
        if ((lowerName.startsWith('tun') || lowerName.startsWith('tap')) && ipv4 && !ipv4.startsWith('127.')) {
          detected.push({
            interfaceName: name,
            protocol: 'generic',
            protocolDisplayName: 'Generic P2P VPN / TUN',
            ipv4,
            ipv6,
            netmask,
            cidr,
            mac,
            internal
          });
        }
      }
    } catch (_) {}

    return detected;
  }

  /**
   * Determine whether an IP address belongs to the CGNAT Tailscale range (100.64.0.0/10).
   */
  public isTailscaleIp(ip: string): boolean {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || isNaN(parts[0]) || isNaN(parts[1])) return false;
    return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
  }

  /**
   * Determine whether an IP address is a private Mesh / LAN / Overlay IP.
   */
  public isMeshOrPrivateIp(ip: string): boolean {
    if (!ip) return false;
    const clean = ip.replace(/^::ffff:/, '').trim();
    if (clean === '127.0.0.1' || clean === 'localhost' || clean === '::1') return true;
    if (this.isTailscaleIp(clean)) return true;
    if (clean.startsWith('10.')) return true;
    if (clean.startsWith('192.168.')) return true;
    if (clean.startsWith('172.')) {
      const secondOctet = parseInt(clean.split('.')[1] || '0', 10);
      if (secondOctet >= 16 && secondOctet <= 31) return true;
    }
    if (clean.startsWith('fd') || clean.startsWith('fc')) return true; // IPv6 ULA
    return false;
  }

  /**
   * Retrieve live Mesh VPN status and configuration.
   */
  public getMeshStatus(overridePort?: number): MeshVpnStatusReport {
    const db = getDb();
    const settings = db.prepare("SELECT * FROM platform_settings WHERE id = 'default'").get() as any;

    const enabled = Boolean(settings?.meshVpnEnabled ?? 1);
    const configuredProtocol = (settings?.meshVpnProtocol as MeshProtocol) || 'auto';
    const customIp = (settings?.meshVpnCustomIp || '').trim();
    const autoWhitelist = Boolean(settings?.meshVpnAutoWhitelist ?? 1);
    const port = Number(overridePort || process.env.PORT || settings?.serverPort || 3000);

    const detected = this.scanNetworkInterfaces();

    let activeInterface: DetectedMeshInterface | null = null;
    let activeIp: string | null = null;
    let activeIpv6: string | null = null;
    let activeProtocol: MeshProtocol = 'none';
    let protocolName = 'Mesh VPN (Standby)';

    if (customIp) {
      activeIp = customIp;
      activeProtocol = configuredProtocol !== 'auto' ? configuredProtocol : 'custom';
      protocolName = `Custom Mesh Overlay (${activeProtocol.toUpperCase()})`;
    } else if (detected.length > 0) {
      // Pick matching protocol or first active detected interface
      if (configuredProtocol !== 'auto') {
        activeInterface = detected.find((d) => d.protocol === configuredProtocol) || detected[0];
      } else {
        activeInterface = detected[0];
      }

      if (activeInterface) {
        activeIp = activeInterface.ipv4;
        activeIpv6 = activeInterface.ipv6;
        activeProtocol = activeInterface.protocol as MeshProtocol;
        protocolName = activeInterface.protocolDisplayName;
      }
    }

    const status: 'online' | 'standby' | 'disabled' = !enabled
      ? 'disabled'
      : activeIp
        ? 'online'
        : 'standby';

    const meshDirectUrl = activeIp ? `http://${activeIp}:${port}` : null;

    return {
      enabled,
      status,
      protocol: activeProtocol,
      protocolDisplayName: protocolName,
      interfaceName: activeInterface?.interfaceName || null,
      meshIp: activeIp,
      meshIpv6: activeIpv6,
      meshPort: port,
      meshDirectUrl,
      autoWhitelistEnabled: autoWhitelist,
      customIpConfigured: customIp,
      detectedInterfaces: detected,
      commandsGuide: {
        n2n: `edge -d edge0 -a 10.1.0.5 -c aegis_mesh -k aegis_secret_key -l supernode.ntop.org:7777`,
        tailscale: `tailscale up && tailscale ip -4`,
        wireguard: `wg-quick up wg0`,
        zerotier: `zerotier-cli join <your-network-id>`
      }
    };
  }

  /**
   * Update and persist Mesh VPN settings.
   */
  public updateMeshSettings(settings: {
    enabled?: boolean;
    protocol?: MeshProtocol;
    customIp?: string;
    autoWhitelist?: boolean;
  }): MeshVpnStatusReport {
    const db = getDb();
    const current = db.prepare("SELECT * FROM platform_settings WHERE id = 'default'").get() as any;

    const enabledVal = settings.enabled !== undefined ? (settings.enabled ? 1 : 0) : (current?.meshVpnEnabled ?? 1);
    const protoVal = settings.protocol || current?.meshVpnProtocol || 'auto';
    const customIpVal = settings.customIp !== undefined ? settings.customIp.trim() : (current?.meshVpnCustomIp || '');
    const autoWhitelistVal = settings.autoWhitelist !== undefined ? (settings.autoWhitelist ? 1 : 0) : (current?.meshVpnAutoWhitelist ?? 1);

    db.prepare(`
      UPDATE platform_settings
      SET meshVpnEnabled = ?,
          meshVpnProtocol = ?,
          meshVpnCustomIp = ?,
          meshVpnAutoWhitelist = ?
      WHERE id = 'default'
    `).run(enabledVal, protoVal, customIpVal, autoWhitelistVal);

    return this.getMeshStatus();
  }

  /**
   * Probe a peer mesh node by TCP socket connection to verify reachability and latency.
   */
  public async probePeerReachability(targetHost: string, targetPort: number = 3000, timeoutMs: number = 2500): Promise<{
    reachable: boolean;
    latencyMs: number | null;
    target: string;
    error?: string;
  }> {
    const cleanHost = targetHost.trim().replace(/^https?:\/\//, '').split(':')[0];
    const startTime = Date.now();

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        const latencyMs = Date.now() - startTime;
        socket.destroy();
        resolve({
          reachable: true,
          latencyMs,
          target: `${cleanHost}:${targetPort}`
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          reachable: false,
          latencyMs: null,
          target: `${cleanHost}:${targetPort}`,
          error: `Connection timed out after ${timeoutMs}ms`
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({
          reachable: false,
          latencyMs: null,
          target: `${cleanHost}:${targetPort}`,
          error: err.message
        });
      });

      socket.connect(targetPort, cleanHost);
    });
  }
}

export const meshVpnService = new MeshVpnService();
