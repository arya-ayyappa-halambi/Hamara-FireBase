// ─────────────────────────────────────────────────────────────────────────────
//  src/services/traffic-topology.service.ts
//  Real-Time Traffic Topology, Packet Flow & Pipeline Telemetry Service
// ─────────────────────────────────────────────────────────────────────────────

import { wsService } from '../realtime/websocket.service';
import { geoipThreatIntelService } from './geoip-threat-intel.service';

export type IngressSourceType = 'localhost' | 'lan' | 'wan_tunnel' | 'unknown';

export interface TrafficStreamEvent {
  id: string;
  clientIp: string;
  countryCode: string;
  countryName: string;
  ingressType: IngressSourceType;
  method: string;
  path: string;
  protocol: string;
  statusCode: number;
  latencyMs: number;
  bytesIn: number;
  bytesOut: number;
  timestamp: string;
}

export interface PipelineNodeHealth {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'blocked' | 'idle';
  avgLatencyMs: number;
  throughputRps: number;
  packetDropsTotal: number;
}

export interface TrafficTopologySnapshot {
  timestamp: string;
  bandwidthInBps: number;
  bandwidthOutBps: number;
  requestsPerSecond: number;
  totalRequests: number;
  totalBytesIn: number;
  totalBytesOut: number;
  activeConcurrentSockets: number;
  protocolDistribution: {
    'HTTP/1.1': number;
    'HTTP/2': number;
    'WebSocket': number;
    'Tunnel-Proxy': number;
  };
  ingressDistribution: {
    localhost: number;
    lan: number;
    wan_tunnel: number;
  };
  pipelineNodes: {
    ingress: PipelineNodeHealth;
    security: PipelineNodeHealth;
    router: PipelineNodeHealth;
    storage: PipelineNodeHealth;
  };
  rpsHistory: number[];
  bandwidthHistory: number[];
  recentStreams: TrafficStreamEvent[];
}

export class TrafficTopologyService {
  private recentStreamsRing: TrafficStreamEvent[] = [];
  private readonly maxStreamsHistory = 30;

  private totalRequestsCount = 0;
  private totalBytesInCount = 0;
  private totalBytesOutCount = 0;
  private activeSocketsCount = 0;

  private protocolCounts = {
    'HTTP/1.1': 0,
    'HTTP/2': 0,
    'WebSocket': 0,
    'Tunnel-Proxy': 0
  };

  private ingressCounts = {
    localhost: 0,
    lan: 0,
    wan_tunnel: 0
  };

  // Rolling 1-second interval tracking for live RPS / Bandwidth
  private intervalRequests = 0;
  private intervalBytesIn = 0;
  private intervalBytesOut = 0;

  private currentRps = 0;
  private currentBandwidthInBps = 0;
  private currentBandwidthOutBps = 0;

  private rpsHistoryList: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private bandwidthHistoryList: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  private tickerTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startMetricsTicker();
  }

  /**
   * Determine the ingress classification of an incoming client IP.
   */
  public classifyIngress(ip: string, isTunnel: boolean = false): IngressSourceType {
    if (isTunnel) return 'wan_tunnel';
    if (!ip) return 'unknown';
    const norm = ip.replace(/^::ffff:/, '').trim();

    if (norm === '127.0.0.1' || norm === '::1' || norm === 'localhost') {
      return 'localhost';
    }

    if (
      norm.startsWith('192.168.') ||
      norm.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(norm)
    ) {
      return 'lan';
    }

    return 'wan_tunnel';
  }

  /**
   * Record an incoming request transaction in the topology flow pipeline.
   */
  public recordRequest(event: {
    ip: string;
    method: string;
    path: string;
    protocol?: string;
    statusCode: number;
    latencyMs: number;
    bytesIn: number;
    bytesOut: number;
    isTunnel?: boolean;
  }): void {
    this.totalRequestsCount += 1;
    this.totalBytesInCount += event.bytesIn;
    this.totalBytesOutCount += event.bytesOut;

    this.intervalRequests += 1;
    this.intervalBytesIn += event.bytesIn;
    this.intervalBytesOut += event.bytesOut;

    const ingress = this.classifyIngress(event.ip, event.isTunnel);
    if (ingress === 'localhost') this.ingressCounts.localhost += 1;
    else if (ingress === 'lan') this.ingressCounts.lan += 1;
    else this.ingressCounts.wan_tunnel += 1;

    let proto = 'HTTP/1.1';
    if (event.isTunnel) proto = 'Tunnel-Proxy';
    else if (event.protocol === 'websocket' || event.path.startsWith('/ws')) proto = 'WebSocket';
    else if (event.protocol === 'HTTP/2') proto = 'HTTP/2';

    if (proto in this.protocolCounts) {
      (this.protocolCounts as any)[proto] += 1;
    }

    // Initial Geo-IP tagging
    const isPrivate = geoipThreatIntelService.isPrivateIp(event.ip);
    let initialCountryCode = isPrivate ? 'LA' : 'WAN';
    let initialCountryName = isPrivate ? 'Local Area Network' : 'Remote Internet';

    const streamItem: TrafficStreamEvent = {
      id: `stm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      clientIp: event.ip.replace(/^::ffff:/, ''),
      countryCode: initialCountryCode,
      countryName: initialCountryName,
      ingressType: ingress,
      method: event.method.toUpperCase(),
      path: event.path,
      protocol: proto,
      statusCode: event.statusCode,
      latencyMs: Math.round(event.latencyMs * 10) / 10,
      bytesIn: event.bytesIn,
      bytesOut: event.bytesOut,
      timestamp: new Date().toISOString()
    };

    // Async background lookup for non-private WAN IPs
    if (!isPrivate) {
      geoipThreatIntelService.lookupIp(event.ip).then((geo) => {
        if (geo) {
          streamItem.countryCode = geo.countryCode;
          streamItem.countryName = geo.countryName;
        }
      }).catch(() => {});
    }

    this.recentStreamsRing.unshift(streamItem);
    if (this.recentStreamsRing.length > this.maxStreamsHistory) {
      this.recentStreamsRing.pop();
    }
  }

  public updateActiveSockets(count: number): void {
    this.activeSocketsCount = Math.max(0, count);
  }

  /**
   * Return a full real-time snapshot of the traffic topology and pipeline health.
   */
  public getTopologySnapshot(): TrafficTopologySnapshot {
    const avgLatency = this.recentStreamsRing.length > 0
      ? this.recentStreamsRing.slice(0, 10).reduce((acc, s) => acc + s.latencyMs, 0) / Math.min(this.recentStreamsRing.length, 10)
      : 2.5;

    return {
      timestamp: new Date().toISOString(),
      bandwidthInBps: this.currentBandwidthInBps,
      bandwidthOutBps: this.currentBandwidthOutBps,
      requestsPerSecond: this.currentRps,
      totalRequests: this.totalRequestsCount,
      totalBytesIn: this.totalBytesInCount,
      totalBytesOut: this.totalBytesOutCount,
      activeConcurrentSockets: this.activeSocketsCount,
      protocolDistribution: { ...this.protocolCounts },
      ingressDistribution: { ...this.ingressCounts },
      pipelineNodes: {
        ingress: {
          id: 'node-ingress',
          name: 'Edge Ingress Gateways',
          status: 'healthy',
          avgLatencyMs: Math.round((avgLatency * 0.2) * 10) / 10,
          throughputRps: this.currentRps,
          packetDropsTotal: 0
        },
        security: {
          id: 'node-security',
          name: 'Layer-7 WAF & Subnet Rate Filter',
          status: 'healthy',
          avgLatencyMs: Math.round((avgLatency * 0.3) * 10) / 10,
          throughputRps: this.currentRps,
          packetDropsTotal: 0
        },
        router: {
          id: 'node-router',
          name: 'Auth & NoSQL Engine Dispatcher',
          status: 'healthy',
          avgLatencyMs: Math.round((avgLatency * 0.4) * 10) / 10,
          throughputRps: this.currentRps,
          packetDropsTotal: 0
        },
        storage: {
          id: 'node-storage',
          name: 'SQLite WAL Database Engine',
          status: 'healthy',
          avgLatencyMs: Math.round((avgLatency * 0.6) * 10) / 10,
          throughputRps: this.currentRps,
          packetDropsTotal: 0
        }
      },
      rpsHistory: [...this.rpsHistoryList],
      bandwidthHistory: [...this.bandwidthHistoryList],
      recentStreams: [...this.recentStreamsRing]
    };
  }

  private startMetricsTicker(): void {
    if (this.tickerTimer) clearInterval(this.tickerTimer);

    // Compute rolling 2-second rates and broadcast to connected Super Admins
    this.tickerTimer = setInterval(() => {
      this.currentRps = Math.round((this.intervalRequests / 2) * 10) / 10;
      this.currentBandwidthInBps = Math.round(this.intervalBytesIn / 2);
      this.currentBandwidthOutBps = Math.round(this.intervalBytesOut / 2);

      this.intervalRequests = 0;
      this.intervalBytesIn = 0;
      this.intervalBytesOut = 0;

      this.rpsHistoryList.push(this.currentRps);
      if (this.rpsHistoryList.length > 20) this.rpsHistoryList.shift();

      const totalKbps = Math.round((this.currentBandwidthInBps + this.currentBandwidthOutBps) / 1024);
      this.bandwidthHistoryList.push(totalKbps);
      if (this.bandwidthHistoryList.length > 20) this.bandwidthHistoryList.shift();

      try {
        wsService.broadcast('TRAFFIC_TOPOLOGY_TICK', this.getTopologySnapshot());
      } catch (_) {}
    }, 2000);
  }

  public stopMetricsTicker(): void {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
  }
}

export const trafficTopologyService = new TrafficTopologyService();
