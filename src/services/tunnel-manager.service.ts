// ─────────────────────────────────────────────────────────────────────────────
//  src/services/tunnel-manager.service.ts
//  1-Click Global Public Tunneling Manager (Cloudflare, Ngrok & Localtunnel)
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { getDb } from '../db/sqlite.connection';
import { wsService } from '../realtime/websocket.service';

export type TunnelProvider = 'cloudflare' | 'ngrok' | 'localtunnel';
export type TunnelStatusState = 'offline' | 'starting' | 'online' | 'error';

export interface TunnelStatusReport {
  enabled: boolean;
  status: TunnelStatusState;
  provider: TunnelProvider;
  publicUrl: string | null;
  authTokenConfigured: boolean;
  maskedAuthToken: string;
  customDomain: string;
  hostPublicIp: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  autoCloseMinutes: number;
  remainingSeconds: number | null;
  stats: {
    totalRequests: number;
    bytesTransferred: number;
    activeClients: number;
    uptimeSeconds: number;
  };
  lastError?: string | null;
}

export interface StartTunnelOptions {
  provider?: TunnelProvider;
  authToken?: string;
  customDomain?: string;
  autoCloseMinutes?: number;
  port?: number;
}

export class TunnelManagerService {
  private activeTunnel: any = null;
  private currentStatus: TunnelStatusState = 'offline';
  private currentPublicUrl: string | null = null;
  private currentProvider: TunnelProvider = 'cloudflare';
  private cachedHostPublicIp: string | null = null;
  private startedAtTime: Date | null = null;
  private expiresAtTime: Date | null = null;
  private autoCloseTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastErrorMessage: string | null = null;
  private totalRequestsCount: number = 0;
  private bytesTransferredCount: number = 0;

  constructor() {
    this.refreshHostPublicIp();
  }

  /**
   * Resolve and cache the host machine's public IPv4 address.
   */
  public async refreshHostPublicIp(): Promise<string | null> {
    try {
      const res = await axios.get('https://api.ipify.org?format=json', { timeout: 4000 });
      if (res.data && res.data.ip) {
        this.cachedHostPublicIp = res.data.ip;
        return this.cachedHostPublicIp;
      }
    } catch (_) {
      try {
        const res2 = await axios.get('https://icanhazip.com', { timeout: 4000 });
        if (typeof res2.data === 'string' && res2.data.trim()) {
          this.cachedHostPublicIp = res2.data.trim();
          return this.cachedHostPublicIp;
        }
      } catch (_) {}
    }
    return this.cachedHostPublicIp;
  }

  /**
   * Return the current live tunnel status report.
   */
  public getTunnelStatus(): TunnelStatusReport {
    const db = getDb();
    const settings = db.prepare("SELECT * FROM platform_settings WHERE id = 'default'").get() as any;

    const authToken = settings?.tunnelAuthToken || '';
    const maskedAuthToken = authToken
      ? (authToken.length > 8 ? `${authToken.slice(0, 4)}••••${authToken.slice(-4)}` : '••••••••')
      : '';

    let remainingSeconds: number | null = null;
    if (this.expiresAtTime && this.currentStatus === 'online') {
      const diff = Math.floor((this.expiresAtTime.getTime() - Date.now()) / 1000);
      remainingSeconds = diff > 0 ? diff : 0;
    }

    const uptimeSeconds = this.startedAtTime && this.currentStatus === 'online'
      ? Math.floor((Date.now() - this.startedAtTime.getTime()) / 1000)
      : 0;

    return {
      enabled: this.currentStatus === 'online' || this.currentStatus === 'starting',
      status: this.currentStatus,
      provider: this.currentProvider,
      publicUrl: this.currentPublicUrl,
      authTokenConfigured: Boolean(authToken),
      maskedAuthToken,
      customDomain: settings?.tunnelCustomDomain || '',
      hostPublicIp: this.cachedHostPublicIp,
      startedAt: this.startedAtTime ? this.startedAtTime.toISOString() : (settings?.tunnelStartedAt || null),
      expiresAt: this.expiresAtTime ? this.expiresAtTime.toISOString() : (settings?.tunnelExpiresAt || null),
      autoCloseMinutes: Number(settings?.tunnelAutoCloseMinutes ?? 60),
      remainingSeconds,
      stats: {
        totalRequests: this.totalRequestsCount,
        bytesTransferred: this.bytesTransferredCount,
        activeClients: this.currentStatus === 'online' ? 1 : 0,
        uptimeSeconds
      },
      lastError: this.lastErrorMessage
    };
  }

  /**
   * Start a global public HTTPS tunnel using Cloudflare Quick Tunnels, Ngrok, or Localtunnel.
   */
  public async startTunnel(options: StartTunnelOptions = {}): Promise<TunnelStatusReport> {
    if (this.currentStatus === 'online' && this.activeTunnel) {
      return this.getTunnelStatus();
    }

    const db = getDb();
    const settings = db.prepare("SELECT * FROM platform_settings WHERE id = 'default'").get() as any;

    const provider = options.provider || (settings?.tunnelProvider as TunnelProvider) || 'cloudflare';
    const authToken = options.authToken !== undefined ? options.authToken : (settings?.tunnelAuthToken || '');
    const customDomain = options.customDomain !== undefined ? options.customDomain : (settings?.tunnelCustomDomain || '');
    const autoCloseMinutes = options.autoCloseMinutes !== undefined ? options.autoCloseMinutes : Number(settings?.tunnelAutoCloseMinutes ?? 60);
    const targetPort = options.port || Number(process.env.PORT || settings?.serverPort || 3000);

    this.currentStatus = 'starting';
    this.currentProvider = provider;
    this.lastErrorMessage = null;
    this.broadcastStatus();

    // Refresh public IP in background
    this.refreshHostPublicIp().catch(() => {});

    try {
      let publicUrl: string = '';

      if (provider === 'cloudflare') {
        // ── Provider 1: Cloudflare Quick Tunnel (Rock-Solid, Zero-Config, trycloudflare.com) ──
        const untun = await import('untun');
        const tunnelInstance = await untun.startTunnel({
          port: targetPort,
          hostname: '127.0.0.1',
          acceptCloudflareNotice: true
        });
        if (!tunnelInstance) {
          throw new Error('Could not establish Cloudflare quick tunnel instance');
        }
        this.activeTunnel = tunnelInstance;
        publicUrl = (await tunnelInstance.getURL()) || '';
      } else if (provider === 'ngrok') {
        // ── Provider 2: Ngrok (High Speed, Enterprise-grade) ──
        const ngrok = await import('@ngrok/ngrok');
        const connectOptions: any = {
          addr: targetPort
        };
        if (authToken) {
          connectOptions.authtoken = authToken;
        }
        if (customDomain) {
          connectOptions.domain = customDomain;
        }

        const listener = await ngrok.forward(connectOptions);
        this.activeTunnel = listener;
        publicUrl = listener.url() || '';
      } else {
        // ── Provider 3: Localtunnel (Community Fallback) ──
        const localtunnelModule = await import('localtunnel');
        const localtunnel = (localtunnelModule as any).default || localtunnelModule;
        const ltOptions: any = {
          port: targetPort,
          local_host: '127.0.0.1',
          host: 'https://localtunnel.me'
        };
        if (customDomain) {
          ltOptions.subdomain = customDomain.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
        }

        const tunnelInstance = await (localtunnel as any)(ltOptions);
        this.activeTunnel = tunnelInstance;
        publicUrl = tunnelInstance.url;

        tunnelInstance.on('close', () => {
          this.handleTunnelClosed();
        });

        tunnelInstance.on('error', (err: any) => {
          this.lastErrorMessage = err?.message || 'Localtunnel connection error';
          this.handleTunnelClosed();
        });
      }

      this.currentStatus = 'online';
      this.currentPublicUrl = publicUrl;
      this.startedAtTime = new Date();

      if (autoCloseMinutes > 0) {
        this.expiresAtTime = new Date(Date.now() + autoCloseMinutes * 60 * 1000);
        if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
        this.autoCloseTimer = setTimeout(() => {
          this.stopTunnel();
        }, autoCloseMinutes * 60 * 1000);
      } else {
        this.expiresAtTime = null;
      }

      this.startWatchdog(targetPort);

      // Persist to platform_settings
      db.prepare(`
        UPDATE platform_settings
        SET tunnelEnabled = 1,
            tunnelProvider = ?,
            tunnelAuthToken = ?,
            tunnelCustomDomain = ?,
            tunnelPublicUrl = ?,
            tunnelStartedAt = ?,
            tunnelExpiresAt = ?,
            tunnelAutoCloseMinutes = ?
        WHERE id = 'default'
      `).run(
        provider,
        authToken,
        customDomain,
        publicUrl,
        this.startedAtTime.toISOString(),
        this.expiresAtTime ? this.expiresAtTime.toISOString() : null,
        autoCloseMinutes
      );

      this.broadcastStatus();
      return this.getTunnelStatus();
    } catch (err: any) {
      this.currentStatus = 'error';
      this.currentPublicUrl = null;
      this.lastErrorMessage = err?.message || 'Failed to establish global public tunnel';
      this.broadcastStatus();
      throw new Error(`Tunnel start failed: ${this.lastErrorMessage}`);
    }
  }

  /**
   * Disconnect and stop the active public tunnel.
   */
  public async stopTunnel(): Promise<TunnelStatusReport> {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    if (this.activeTunnel) {
      try {
        if (typeof this.activeTunnel.close === 'function') {
          await this.activeTunnel.close();
        } else if (typeof this.activeTunnel.disconnect === 'function') {
          await this.activeTunnel.disconnect();
        }
      } catch (_) {}
      this.activeTunnel = null;
    }

    this.currentStatus = 'offline';
    this.currentPublicUrl = null;
    this.startedAtTime = null;
    this.expiresAtTime = null;

    try {
      const db = getDb();
      db.prepare(`
        UPDATE platform_settings
        SET tunnelEnabled = 0,
            tunnelPublicUrl = '',
            tunnelStartedAt = null,
            tunnelExpiresAt = null
        WHERE id = 'default'
      `).run();
    } catch (_) {}

    this.broadcastStatus();
    return this.getTunnelStatus();
  }

  /**
   * Update tunnel provider configurations (Authtoken, Custom Domain, TTL).
   */
  public updateSettings(settings: {
    provider?: TunnelProvider;
    authToken?: string;
    customDomain?: string;
    autoCloseMinutes?: number;
  }): void {
    const db = getDb();
    const current = db.prepare("SELECT * FROM platform_settings WHERE id = 'default'").get() as any;

    const provider = settings.provider || current?.tunnelProvider || 'cloudflare';
    const authToken = settings.authToken !== undefined ? settings.authToken : (current?.tunnelAuthToken || '');
    const customDomain = settings.customDomain !== undefined ? settings.customDomain : (current?.tunnelCustomDomain || '');
    const autoCloseMinutes = settings.autoCloseMinutes !== undefined ? settings.autoCloseMinutes : Number(current?.tunnelAutoCloseMinutes ?? 60);

    this.currentProvider = provider;

    db.prepare(`
      UPDATE platform_settings
      SET tunnelProvider = ?,
          tunnelAuthToken = ?,
          tunnelCustomDomain = ?,
          tunnelAutoCloseMinutes = ?
      WHERE id = 'default'
    `).run(provider, authToken, customDomain, autoCloseMinutes);

    this.broadcastStatus();
  }

  /**
   * Record traffic passing through tunnel.
   */
  public recordTraffic(bytes: number): void {
    this.totalRequestsCount += 1;
    this.bytesTransferredCount += bytes;
  }

  private handleTunnelClosed(): void {
    if (this.currentStatus === 'online') {
      this.currentStatus = 'offline';
      this.currentPublicUrl = null;
      this.activeTunnel = null;
      this.broadcastStatus();
    }
  }

  private startWatchdog(targetPort: number): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);

    // Watchdog runs every 25 seconds to verify tunnel health and auto-heal if connection dropped
    this.watchdogTimer = setInterval(async () => {
      if (this.currentStatus !== 'online' || !this.currentPublicUrl) return;

      try {
        const pingRes = await axios.get(`${this.currentPublicUrl}/api/v1/system/health`, {
          timeout: 8000,
          headers: {
            'bypass-tunnel-reminder': 'true',
            'User-Agent': 'AegisDB-Watchdog/1.0'
          },
          validateStatus: () => true
        });

        if (pingRes.status >= 500 && (this.currentProvider === 'localtunnel' || this.currentProvider === 'cloudflare')) {
          console.warn(`[Tunnel Watchdog] Public tunnel returned HTTP ${pingRes.status}. Auto-healing connection...`);
          // Stop and restart
          await this.stopTunnel();
          await this.startTunnel({ provider: this.currentProvider, port: targetPort });
        }
      } catch (err: any) {
        if (this.currentStatus === 'online') {
          console.warn(`[Tunnel Watchdog] Health check error: ${err.message}`);
        }
      }
    }, 25000);
  }

  private broadcastStatus(): void {
    try {
      wsService.broadcast('TUNNEL_STATUS_UPDATED', this.getTunnelStatus());
    } catch (_) {}
  }
}

export const tunnelManagerService = new TunnelManagerService();
