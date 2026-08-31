import * as net from 'net';
import * as os from 'os';
import { getDb } from '../db/sqlite.connection';

export interface PortDiagnosticResult {
  port: number;
  status: 'active_aegis' | 'free' | 'occupied' | 'scheduled_reserved' | 'privileged';
  label: string;
  available: boolean;
  reason?: string;
}

export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  family: string;
  type: 'wifi' | 'ethernet' | 'loopback' | 'all';
}

export interface NetworkDiagnosticsReport {
  currentPort: number;
  currentHost: string;
  detectedNetworkIp: string;
  interfaces: NetworkInterfaceInfo[];
  candidatePorts: PortDiagnosticResult[];
  pendingMigrations: any[];
}

export class NetworkDiagnosticsService {
  /**
   * Probe whether a specific port is free to bind on the given host.
   * Performs a dual-stage probe:
   * 1. Active TCP Connect Probe on loopback & IPv6 to detect answering processes.
   * 2. Multi-Host Bind Probe (0.0.0.0 & 127.0.0.1) to detect active socket listeners.
   * 3. Pending Migration Reservation check in SQLite.
   */
  public async checkPortAvailability(port: number, host: string = '0.0.0.0'): Promise<{ available: boolean; status: 'active_aegis' | 'free' | 'occupied' | 'scheduled_reserved' | 'privileged'; reason: string }> {
    if (isNaN(port) || port < 1 || port > 65535) {
      return { available: false, status: 'occupied', reason: 'Invalid port number (must be between 1 and 65535)' };
    }

    if (port < 1024 && process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
      return { available: false, status: 'privileged', reason: `Port ${port} is a privileged system port (< 1024) requiring root/sudo` };
    }

    // Check if the port is currently reserved by a pending scheduled migration
    try {
      const db = getDb();
      const pendingMigration = db.prepare("SELECT * FROM scheduled_endpoint_migrations WHERE status = 'pending' AND targetPort = ?").get(port) as any;
      if (pendingMigration) {
        return {
          available: false,
          status: 'scheduled_reserved',
          reason: `Port ${port} is reserved for scheduled migration at ${new Date(pendingMigration.scheduledAt).toLocaleTimeString()}`
        };
      }
    } catch (_) {}

    // Stage 1: Active TCP Connection Probe (detects active listening services immediately)
    const connectProbe = (targetHost: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(200);
        socket.on('connect', () => {
          socket.destroy();
          resolve(true); // Connected = Service is active on this port!
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.on('error', () => {
          socket.destroy();
          resolve(false); // ECONNREFUSED = No active listener answering
        });
        socket.connect(port, targetHost);
      });
    };

    const isAnswering = await Promise.race([
      connectProbe('127.0.0.1'),
      connectProbe('::1'),
      connectProbe('localhost')
    ]);

    if (isAnswering) {
      return {
        available: false,
        status: 'occupied',
        reason: `Port ${port} is currently in use by an active application or service`
      };
    }

    // Stage 2: Multi-Host Server Bind Probe (detects exclusive bindings across interfaces)
    const bindProbe = (targetHost: string): Promise<{ free: boolean; err?: string }> => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on('error', (err: any) => {
          resolve({ free: false, err: err.code || err.message });
        });
        server.listen(port, targetHost, () => {
          server.close(() => resolve({ free: true }));
        });
      });
    };

    // Test binding on 0.0.0.0 (all interfaces)
    const b0 = await bindProbe('0.0.0.0');
    if (!b0.free) {
      return { available: false, status: 'occupied', reason: `Port ${port} is already in use (${b0.err})` };
    }

    // Test binding on 127.0.0.1 (loopback interface)
    const b1 = await bindProbe('127.0.0.1');
    if (!b1.free) {
      return { available: false, status: 'occupied', reason: `Port ${port} is already in use on localhost (${b1.err})` };
    }

    // Test binding on specific host if custom
    if (host && host !== '0.0.0.0' && host !== '127.0.0.1' && host !== 'localhost') {
      const bHost = await bindProbe(host);
      if (!bHost.free) {
        return { available: false, status: 'occupied', reason: `Port ${port} is already in use on ${host} (${bHost.err})` };
      }
    }

    return {
      available: true,
      status: 'free',
      reason: `Port ${port} is free and ready to bind`
    };
  }

  /**
   * Scan candidate ports and detect available network interfaces.
   */
  public async getDiagnosticsReport(currentPort: number, currentHost: string): Promise<NetworkDiagnosticsReport> {
    const candidatePortList = [3000, 3001, 3002, 4000, 5000, 5001, 8000, 8080, 8888, 9000];
    if (!candidatePortList.includes(currentPort)) {
      candidatePortList.unshift(currentPort);
    }

    let pendingMigrations: any[] = [];
    try {
      const db = getDb();
      pendingMigrations = db.prepare("SELECT * FROM scheduled_endpoint_migrations WHERE status = 'pending'").all() as any[];
      for (const pm of pendingMigrations) {
        if (pm.targetPort && !candidatePortList.includes(pm.targetPort)) {
          candidatePortList.push(pm.targetPort);
        }
      }
    } catch (_) {}

    // Detect Interfaces
    const interfaces: NetworkInterfaceInfo[] = [];
    let detectedNetworkIp = '127.0.0.1';
    const netIfaces = os.networkInterfaces();

    // Add Dual host entry
    interfaces.push({
      name: 'Dual Host (All Interfaces)',
      address: '0.0.0.0',
      family: 'IPv4',
      type: 'all'
    });

    // Add Loopback
    interfaces.push({
      name: 'Localhost (Loopback)',
      address: '127.0.0.1',
      family: 'IPv4',
      type: 'loopback'
    });

    for (const [name, ifaceList] of Object.entries(netIfaces)) {
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const isWifi = name.toLowerCase().includes('en0') || name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi');
          if (detectedNetworkIp === '127.0.0.1' || isWifi) {
            detectedNetworkIp = iface.address;
          }
          interfaces.push({
            name: `${name} (${isWifi ? 'Wi-Fi' : 'Ethernet/LAN'})`,
            address: iface.address,
            family: 'IPv4',
            type: isWifi ? 'wifi' : 'ethernet'
          });
        }
      }
    }

    // Sort candidate ports numerically
    candidatePortList.sort((a, b) => a - b);

    // Probe candidate ports concurrently
    const candidatePorts: PortDiagnosticResult[] = await Promise.all(
      candidatePortList.map(async (p) => {
        if (p === currentPort) {
          return {
            port: p,
            status: 'active_aegis',
            label: 'Active AegisDB Server',
            available: true,
            reason: `Port ${p} is the currently running active AegisDB server`
          };
        }

        const res = await this.checkPortAvailability(p, '0.0.0.0');
        let label = 'Free & Available';
        if (res.status === 'scheduled_reserved') {
          label = 'Reserved for Scheduled Migration';
        } else if (res.status === 'occupied') {
          label = res.reason || 'Occupied / In Use';
        } else if (res.status === 'privileged') {
          label = 'Privileged System Port (< 1024)';
        }

        return {
          port: p,
          status: res.status,
          label,
          available: res.available,
          reason: res.reason
        };
      })
    );

    return {
      currentPort,
      currentHost,
      detectedNetworkIp,
      interfaces,
      candidatePorts,
      pendingMigrations
    };
  }

  /**
   * Generates a comprehensive Cluster Port Diagnostics Matrix with latency probing and resource telemetry.
   */
  public async getClusterDiagnosticsReport(currentPort: number, currentHost: string) {
    const startUptime = process.uptime();
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const portsToProbe = [3000, 3001, 3002, 4000, 5000, 8000, 8080, 8443, 9000];

    if (!portsToProbe.includes(currentPort)) {
      portsToProbe.unshift(currentPort);
    }
    portsToProbe.sort((a, b) => a - b);

    const portMatrix = await Promise.all(
      portsToProbe.map(async (port) => {
        const start = performance.now();
        if (port === currentPort) {
          const latencyMs = Math.round((performance.now() - start) * 100) / 100;
          return {
            port,
            status: 'active_aegis' as const,
            latencyMs,
            description: 'Active AegisDB Master Instance',
            recommended: false
          };
        }

        const res = await this.checkPortAvailability(port, '0.0.0.0');
        const latencyMs = Math.round((performance.now() - start) * 100) / 100;

        return {
          port,
          status: res.status,
          latencyMs,
          description: res.reason || (res.available ? 'Ready for hot-swap / cluster node' : 'Occupied'),
          recommended: res.available
        };
      })
    );

    const interfaces: NetworkInterfaceInfo[] = [];
    let detectedNetworkIp = '127.0.0.1';
    const netIfaces = os.networkInterfaces();

    interfaces.push({
      name: 'All Interfaces (0.0.0.0)',
      address: '0.0.0.0',
      family: 'IPv4',
      type: 'all'
    });

    for (const [name, ifaceList] of Object.entries(netIfaces)) {
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const isWifi = name.toLowerCase().includes('en0') || name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi');
          if (detectedNetworkIp === '127.0.0.1' || isWifi) {
            detectedNetworkIp = iface.address;
          }
          interfaces.push({
            name: `${name} (${isWifi ? 'Wi-Fi' : 'Ethernet'})`,
            address: iface.address,
            family: 'IPv4',
            type: isWifi ? 'wifi' : 'ethernet'
          });
        }
      }
    }

    return {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(startUptime),
      memoryUsageMb: Math.round(mem.rss / (1024 * 1024) * 10) / 10,
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024) * 10) / 10,
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
      cpuCores: cpus.length,
      cpuModel: cpus[0]?.model || 'Standard CPU',
      cpuLoadAvg: os.loadavg(),
      currentPort,
      currentHost,
      detectedNetworkIp,
      interfaces,
      portMatrix
    };
  }
}

export const networkDiagnosticsService = new NetworkDiagnosticsService();

