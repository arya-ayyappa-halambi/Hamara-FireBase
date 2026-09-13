// ─────────────────────────────────────────────────────────────────────────────
//  sdk/src/hoster.client.ts
//  Hoster Project Deployment client module for @flarebase/sdk.
// ─────────────────────────────────────────────────────────────────────────────

import { AuthClient } from './auth.client.js';
import { Deployment, ApiResponse } from './types.js';

export interface DeployOptions {
  name: string;
  startCommand?: string;
  image?: string;
  envVars?: Record<string, string>;
  description?: string;
  memoryLimitMb?: number;
}

export class HosterClient {
  private readonly baseUrl: string;
  private readonly auth: AuthClient;

  constructor(baseUrl: string, auth: AuthClient) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.auth = auth;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.auth.getAccessToken();
    if (!token) {
      throw new Error('Authentication required for hoster operations.');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    };

    let res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    if (res.status === 401 && this.auth.getRefreshToken()) {
      try {
        await this.auth.refresh();
        const newToken = this.auth.getAccessToken();
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
      } catch {
        // Refresh failed
      }
    }

    const json = (await res.json()) as ApiResponse<T>;
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Hoster request failed (${res.status}).`);
    }

    return json.data;
  }

  /**
   * Deploy a project ZIP file.
   */
  async deploy(zipFile: Blob | File, options: DeployOptions): Promise<Deployment> {
    const formData = new FormData();
    formData.append('project', zipFile, (zipFile as File).name ?? 'project.zip');
    formData.append('name', options.name);

    if (options.startCommand) formData.append('startCommand', options.startCommand);
    if (options.image)        formData.append('image', options.image);
    if (options.description)  formData.append('description', options.description);
    if (options.memoryLimitMb) formData.append('memoryLimitMb', String(options.memoryLimitMb));
    if (options.envVars)      formData.append('envVars', JSON.stringify(options.envVars));

    return this.request<Deployment>('/api/v1/hoster/deploy', {
      method: 'POST',
      body: formData,
    });
  }

  async listDeployments(): Promise<Deployment[]> {
    return this.request<Deployment[]>('/api/v1/hoster/deployments', { method: 'GET' });
  }

  async getDeployment(id: string): Promise<Deployment> {
    return this.request<Deployment>(`/api/v1/hoster/deployments/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async start(id: string): Promise<Deployment> {
    return this.request<Deployment>(`/api/v1/hoster/deployments/${encodeURIComponent(id)}/start`, { method: 'POST' });
  }

  async stop(id: string): Promise<Deployment> {
    return this.request<Deployment>(`/api/v1/hoster/deployments/${encodeURIComponent(id)}/stop`, { method: 'POST' });
  }

  async restart(id: string): Promise<Deployment> {
    return this.request<Deployment>(`/api/v1/hoster/deployments/${encodeURIComponent(id)}/restart`, { method: 'POST' });
  }

  async getLogs(id: string, lines = 100): Promise<{ deploymentId: string; requestedLines: number; logs: string }> {
    return this.request<{ deploymentId: string; requestedLines: number; logs: string }>(
      `/api/v1/hoster/deployments/${encodeURIComponent(id)}/logs?lines=${lines}`,
      { method: 'GET' },
    );
  }

  async remove(id: string): Promise<Deployment> {
    return this.request<Deployment>(`/api/v1/hoster/deployments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
