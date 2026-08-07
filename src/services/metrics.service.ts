// ─────────────────────────────────────────────────────────────────────────────
//  src/services/metrics.service.ts
//  Prometheus Metrics Collection Service (GET /metrics)
// ─────────────────────────────────────────────────────────────────────────────

export class MetricsService {
  private httpRequestsTotal = new Map<string, number>();
  private rateLimitHitsTotal = new Map<string, number>();
  private websocketConnectionsActive = 0;
  private databaseOperationsCount = 0;
  private databaseOperationsDurationTotal = 0;

  recordHttpRequest(method: string, path: string, status: number): void {
    // Group path parameters to avoid high-cardinality metrics
    const cleanPath = path.split('?')[0].replace(/[0-9a-fA-F-]{36}/g, ':id');
    const key = `method="${method.toUpperCase()}",path="${cleanPath}",status="${status}"`;
    const count = this.httpRequestsTotal.get(key) || 0;
    this.httpRequestsTotal.set(key, count + 1);
  }

  recordRateLimitHit(type: string = 'api'): void {
    const count = this.rateLimitHitsTotal.get(type) || 0;
    this.rateLimitHitsTotal.set(type, count + 1);
  }

  setWsConnections(count: number): void {
    this.websocketConnectionsActive = count;
  }

  incWsConnections(): void {
    this.websocketConnectionsActive++;
  }

  decWsConnections(): void {
    this.websocketConnectionsActive = Math.max(0, this.websocketConnectionsActive - 1);
  }

  recordDbOperation(durationMs: number): void {
    this.databaseOperationsCount++;
    this.databaseOperationsDurationTotal += durationMs / 1000;
  }

  generatePrometheusMetrics(): string {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptimeSec = process.uptime();

    const lines: string[] = [
      '# HELP process_cpu_seconds_total Total user and system CPU time spent in seconds.',
      '# TYPE process_cpu_seconds_total counter',
      `process_cpu_seconds_total ${(cpu.user + cpu.system) / 1000000}`,
      '',
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${mem.rss}`,
      '',
      '# HELP process_heap_bytes Process heap memory usage bytes.',
      '# TYPE process_heap_bytes gauge',
      `process_heap_bytes{type="used"} ${mem.heapUsed}`,
      `process_heap_bytes{type="total"} ${mem.heapTotal}`,
      '',
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds counter',
      `process_uptime_seconds ${uptimeSec}`,
      '',
      '# HELP websocket_connections_active Number of active WebSocket change stream client connections.',
      '# TYPE websocket_connections_active gauge',
      `websocket_connections_active ${this.websocketConnectionsActive}`,
      '',
      '# HELP database_operations_total Total database queries executed.',
      '# TYPE database_operations_total counter',
      `database_operations_total ${this.databaseOperationsCount}`,
      '',
      '# HELP database_operations_duration_seconds Total time spent in database operations.',
      '# TYPE database_operations_duration_seconds counter',
      `database_operations_duration_seconds ${this.databaseOperationsDurationTotal.toFixed(6)}`,
      '',
      '# HELP rate_limit_hits_total Total rate limit 429 rejections.',
      '# TYPE rate_limit_hits_total counter'
    ];

    for (const [type, count] of this.rateLimitHitsTotal.entries()) {
      lines.push(`rate_limit_hits_total{type="${type}"} ${count}`);
    }

    lines.push('');
    lines.push('# HELP http_requests_total Total HTTP requests processed.');
    lines.push('# TYPE http_requests_total counter');

    for (const [key, count] of this.httpRequestsTotal.entries()) {
      lines.push(`http_requests_total{${key}} ${count}`);
    }

    return lines.join('\n') + '\n';
  }
}

export const metricsService = new MetricsService();
