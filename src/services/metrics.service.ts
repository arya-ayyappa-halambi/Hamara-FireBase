// ─────────────────────────────────────────────────────────────────────────────
//  src/services/metrics.service.ts
//  Prometheus Metrics Collection Service (GET /metrics)
// ─────────────────────────────────────────────────────────────────────────────

export interface DbOperationMetrics {
  select: { count: number; totalMs: number };
  insert: { count: number; totalMs: number };
  update: { count: number; totalMs: number };
  delete: { count: number; totalMs: number };
  search: { count: number; totalMs: number };
}

export interface HttpStatusDistribution {
  '2xx': number;
  '4xx': number;
  '5xx': number;
  total: number;
}

export interface MetricsSnapshot {
  cpuSecondsTotal: number;
  residentMemoryBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  uptimeSeconds: number;
  websocketConnectionsActive: number;
  databaseOperationsTotal: number;
  databaseOperationsDurationSeconds: number;
  dbOperations: DbOperationMetrics;
  httpStatus: HttpStatusDistribution;
  rateLimitHitsTotal: number;
}

interface InternalMetricsData {
  httpRequestsTotal: Map<string, number>;
  rateLimitHitsTotal: Map<string, number>;
  websocketConnectionsActive: number;
  databaseOperationsCount: number;
  databaseOperationsDurationTotal: number;
  dbOps: DbOperationMetrics;
  httpStatusCounts: HttpStatusDistribution;
}

export class MetricsService {
  private globalMetrics = this.createEmptyMetricsData();
  private projectMetrics = new Map<string, InternalMetricsData>();

  private createEmptyMetricsData(): InternalMetricsData {
    return {
      httpRequestsTotal: new Map<string, number>(),
      rateLimitHitsTotal: new Map<string, number>(),
      websocketConnectionsActive: 0,
      databaseOperationsCount: 0,
      databaseOperationsDurationTotal: 0,
      dbOps: {
        select: { count: 0, totalMs: 0 },
        insert: { count: 0, totalMs: 0 },
        update: { count: 0, totalMs: 0 },
        delete: { count: 0, totalMs: 0 },
        search: { count: 0, totalMs: 0 },
      },
      httpStatusCounts: { '2xx': 0, '4xx': 0, '5xx': 0, total: 0 }
    };
  }

  private getMetricsData(projectId?: string): InternalMetricsData[] {
    const dataSources = [this.globalMetrics];
    if (projectId) {
      if (!this.projectMetrics.has(projectId)) {
        this.projectMetrics.set(projectId, this.createEmptyMetricsData());
      }
      dataSources.push(this.projectMetrics.get(projectId)!);
    }
    return dataSources;
  }

  recordHttpRequest(method: string, path: string, status: number, projectId?: string): void {
    const cleanPath = path.split('?')[0].replace(/[0-9a-fA-F-]{36}/g, ':id');
    const key = `method="${method.toUpperCase()}",path="${cleanPath}",status="${status}"`;
    
    for (const data of this.getMetricsData(projectId)) {
      const count = data.httpRequestsTotal.get(key) || 0;
      data.httpRequestsTotal.set(key, count + 1);
      
      data.httpStatusCounts.total++;
      if (status >= 200 && status < 300) data.httpStatusCounts['2xx']++;
      else if (status >= 400 && status < 500) data.httpStatusCounts['4xx']++;
      else if (status >= 500) data.httpStatusCounts['5xx']++;
    }
  }

  recordRateLimitHit(type: string = 'api', projectId?: string): void {
    for (const data of this.getMetricsData(projectId)) {
      const count = data.rateLimitHitsTotal.get(type) || 0;
      data.rateLimitHitsTotal.set(type, count + 1);
    }
  }

  incWsConnections(projectId?: string): void {
    for (const data of this.getMetricsData(projectId)) {
      data.websocketConnectionsActive++;
    }
  }

  decWsConnections(projectId?: string): void {
    for (const data of this.getMetricsData(projectId)) {
      data.websocketConnectionsActive = Math.max(0, data.websocketConnectionsActive - 1);
    }
  }

  recordDbOperation(durationMs: number, operation?: string, projectId?: string): void {
    for (const data of this.getMetricsData(projectId)) {
      data.databaseOperationsCount++;
      data.databaseOperationsDurationTotal += durationMs / 1000;
      
      const op = (operation || 'select').toLowerCase() as keyof DbOperationMetrics;
      if (data.dbOps[op]) {
        data.dbOps[op].count++;
        data.dbOps[op].totalMs += durationMs;
      }
    }
  }

  getJsonSnapshot(projectId?: string): MetricsSnapshot {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    let data = this.globalMetrics;
    if (projectId && this.projectMetrics.has(projectId)) {
      data = this.projectMetrics.get(projectId)!;
    } else if (projectId) {
       data = this.createEmptyMetricsData(); // Return empty if not tracked yet
    }

    let totalRateLimitHits = 0;
    for (const count of data.rateLimitHitsTotal.values()) {
      totalRateLimitHits += count;
    }

    return {
      cpuSecondsTotal: (cpu.user + cpu.system) / 1000000,
      residentMemoryBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      uptimeSeconds: process.uptime(),
      websocketConnectionsActive: data.websocketConnectionsActive,
      databaseOperationsTotal: data.databaseOperationsCount,
      databaseOperationsDurationSeconds: data.databaseOperationsDurationTotal,
      dbOperations: JSON.parse(JSON.stringify(data.dbOps)),
      httpStatus: { ...data.httpStatusCounts },
      rateLimitHitsTotal: totalRateLimitHits,
    };
  }

  generatePrometheusMetrics(): string {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptimeSec = process.uptime();
    
    // Prometheus gets the global rolled up metrics
    const data = this.globalMetrics;

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
      `websocket_connections_active ${data.websocketConnectionsActive}`,
      '',
      '# HELP database_operations_total Total database queries executed.',
      '# TYPE database_operations_total counter',
      `database_operations_total ${data.databaseOperationsCount}`,
      '',
      '# HELP database_operations_duration_seconds Total time spent in database operations.',
      '# TYPE database_operations_duration_seconds counter',
      `database_operations_duration_seconds ${data.databaseOperationsDurationTotal.toFixed(6)}`,
      '',
      '# HELP rate_limit_hits_total Total rate limit 429 rejections.',
      '# TYPE rate_limit_hits_total counter'
    ];

    for (const [type, count] of data.rateLimitHitsTotal.entries()) {
      lines.push(`rate_limit_hits_total{type="${type}"} ${count}`);
    }

    lines.push('');
    lines.push('# HELP http_requests_total Total HTTP requests processed.');
    lines.push('# TYPE http_requests_total counter');

    for (const [key, count] of data.httpRequestsTotal.entries()) {
      lines.push(`http_requests_total{${key}} ${count}`);
    }

    return lines.join('\n') + '\n';
  }
}

export const metricsService = new MetricsService();
