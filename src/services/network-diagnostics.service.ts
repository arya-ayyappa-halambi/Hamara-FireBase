import * as net from 'net';
import * as os from 'os';

export interface PortDiagnosticResult {
  port: number;
  status: 'active_aegis' | 'free' | 'occupied';
  label: string;
  available: boolean;
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
}

export class NetworkDiagnosticsService {
  /**
   * Probe whether a specific port is free to bind on the given host.
   */
  public async checkPortAvailability(port: number, host: string = '0.0.0.0'): Promise<{ available: boolean; reason?: string }> {
    if (isNaN(port) || port < 1 || port > 65535) {
      return { available: false, reason: 'Invalid port number (must be between 1 and 65535)' };
    }

    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve({ available: false, reason: `Port ${port} is already in use by another process` });
        } else if (err.code === 'EACCES') {
          resolve({ available: false, reason: `Port ${port} requires elevated/root privileges` });
        } else {
          resolve({ available: false, reason: err.message || 'Port binding error' });
        }
      });

      server.listen({ port, host: host === '0.0.0.0' ? undefined : host }, () => {
        server.close(() => {
          resolve({ available: true, reason: `Port ${port} is free and ready to bind` });
        });
      });
    });
  }

  /**
   * Scan candidate ports and detect available network interfaces.
   */
  public async getDiagnosticsReport(currentPort: number, currentHost: string): Promise<NetworkDiagnosticsReport> {
    const candidatePortList = [3000, 3001, 3002, 4000, 5000, 5001, 8000, 8080, 8888, 9000];
    if (!candidatePortList.includes(currentPort)) {
      candidatePortList.unshift(currentPort);
    }

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

    // Probe candidate ports concurrently
    const candidatePorts: PortDiagnosticResult[] = await Promise.all(
      candidatePortList.map(async (p) => {
        if (p === currentPort) {
          return {
            port: p,
            status: 'active_aegis',
            label: 'Active AegisDB Server',
            available: true
          };
        }

        const res = await this.checkPortAvailability(p, '0.0.0.0');
        if (res.available) {
          return {
            port: p,
            status: 'free',
            label: 'Free & Available',
            available: true
          };
        } else {
          return {
            port: p,
            status: 'occupied',
            label: res.reason || 'Occupied / In Use',
            available: false
          };
        }
      })
    );

    return {
      currentPort,
      currentHost,
      detectedNetworkIp,
      interfaces,
      candidatePorts
    };
  }
}

export const networkDiagnosticsService = new NetworkDiagnosticsService();
