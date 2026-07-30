// ─────────────────────────────────────────────────────────────────────────────
//  src/hoster/adapters/docker.adapter.ts
//  AegisDB — Docker runtime adapter (uses the Docker Engine API via dockerode).
//
//  Active when Docker daemon is reachable at /var/run/docker.sock.
//  Falls back to ProcessAdapter automatically if Docker is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import Docker from 'dockerode';
import { type Deployment, type RuntimeMode } from '../../types/hoster.types';
import { type RuntimeAdapter, type StartResult, type ContainerStatus } from './runtime.adapter';

/** Inner container port that hosted apps must listen on. */
const CONTAINER_PORT = 3000;

export class DockerAdapter implements RuntimeAdapter {
  readonly mode: RuntimeMode = 'docker';
  private readonly docker: Docker;

  constructor() {
    // Reads socket path from DOCKER_HOST env or defaults to /var/run/docker.sock
    this.docker = new Docker();
  }

  // ── Availability ────────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private containerName(deployment: Deployment): string {
    // Deterministic name — used for stop/remove without needing the container ID
    return `aegisdb-${deployment.id}`;
  }

  /**
   * Pull the image only if it is not already available locally.
   * Follows progress so the promise resolves only when the pull is complete.
   */
  private async pullImageIfAbsent(image: string): Promise<void> {
    const existing = await this.docker.listImages({
      filters: JSON.stringify({ reference: [image] }),
    });
    if (existing.length > 0) return; // already on disk

    console.log(`  🐳 Pulling Docker image: ${image}…`);
    const stream = await this.docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => (err ? reject(err) : resolve()),
      );
    });
    console.log(`  ✅ Image ready: ${image}`);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(deployment: Deployment): Promise<StartResult> {
    const { metadata, allocatedPort, workspaceDir, id, ownerId } = deployment;
    const image = metadata.image || 'node:18-alpine';
    const name = this.containerName(deployment);

    // Pull image (no-op if already local)
    await this.pullImageIfAbsent(image);

    // Env array: user vars + injected PORT so apps can bind correctly
    const env = [
      `PORT=${CONTAINER_PORT}`,
      `HOST=0.0.0.0`,
      ...Object.entries(metadata.envVars ?? {}).map(([k, v]) => `${k}=${v}`),
    ];

    const container = await this.docker.createContainer({
      Image: image,
      name,
      Cmd: ['sh', '-c', metadata.startCommand || 'node index.js'],
      WorkingDir: '/app',
      Env: env,
      ExposedPorts: { [`${CONTAINER_PORT}/tcp`]: {} },
      Labels: {
        'aegisdb.deployment.id': id,
        'aegisdb.deployment.owner': ownerId,
      },
      HostConfig: {
        // Workspace mounted read-only so the container cannot tamper with sources
        Binds: [`${workspaceDir}:/app:ro`],
        PortBindings: {
          [`${CONTAINER_PORT}/tcp`]: [{ HostPort: String(allocatedPort) }],
        },
        Memory: (metadata.memoryLimitMb || 512) * 1024 * 1024,
        NanoCpus: 500_000_000,   // 0.5 CPU
        NetworkMode: 'bridge',
        RestartPolicy: { Name: 'no' as const },
        AutoRemove: false,
      },
    });

    await container.start();
    return { containerId: container.id };
  }

  async stop(deployment: Deployment): Promise<void> {
    if (!deployment.containerId) return;
    const container = this.docker.getContainer(deployment.containerId);
    try {
      await container.stop({ t: 10 }); // 10-second graceful timeout
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      // 304 = already stopped, 404 = already gone — both are acceptable
      if (statusCode !== 304 && statusCode !== 404) throw err;
    }
  }

  async remove(deployment: Deployment): Promise<void> {
    if (!deployment.containerId) return;
    const container = this.docker.getContainer(deployment.containerId);

    // Attempt graceful stop first
    try { await container.stop({ t: 5 }); } catch { /* ignore */ }

    // Force remove (deletes even running containers)
    try {
      await container.remove({ force: true });
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode !== 404) throw err; // 404 = already removed, that's fine
    }
  }

  async getLogs(deployment: Deployment, lines: number): Promise<string> {
    if (!deployment.containerId) {
      return '(Container not yet started or already removed.)';
    }
    const container = this.docker.getContainer(deployment.containerId);
    try {
      const raw = await container.logs({
        stdout: true,
        stderr: true,
        tail: lines,
        follow: false,
        timestamps: true,
      }) as unknown as Buffer;

      return Buffer.isBuffer(raw)
        ? this.demuxDockerLogs(raw)
        : (raw as unknown as { toString(): string }).toString();
    } catch {
      return '(Failed to retrieve container logs.)';
    }
  }

  async getStatus(deployment: Deployment): Promise<ContainerStatus> {
    if (!deployment.containerId) return 'stopped';
    const container = this.docker.getContainer(deployment.containerId);
    try {
      const info = await container.inspect();
      if (info.State.Running) return 'running';
      if (info.State.ExitCode !== 0) return 'error';
      return 'stopped';
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      return statusCode === 404 ? 'stopped' : 'error';
    }
  }

  // ── Docker log demultiplexer ───────────────────────────────────────────────
  //
  //  Docker multiplexes stdout and stderr in a single byte stream.
  //  Each chunk is prefixed with an 8-byte header:
  //    [stream_type(1B), padding(3B), size_big_endian(4B)]
  //  This method strips the headers and returns clean UTF-8 text.

  private demuxDockerLogs(raw: Buffer): string {
    const chunks: string[] = [];
    let offset = 0;

    while (offset + 8 <= raw.length) {
      const size = raw.readUInt32BE(offset + 4);
      offset += 8;
      if (offset + size > raw.length) break;
      chunks.push(raw.slice(offset, offset + size).toString('utf8'));
      offset += size;
    }

    return chunks.join('');
  }
}
