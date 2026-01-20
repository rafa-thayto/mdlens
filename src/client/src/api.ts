import type { FileNode, FileContent } from './types';

export class ApiClient {
  private baseUrl = '/api';

  async getFiles(): Promise<FileNode> {
    const response = await fetch(`${this.baseUrl}/files`);
    if (!response.ok) throw new Error('Failed to fetch files');
    return response.json();
  }

  async getFile(path: string): Promise<FileContent> {
    const response = await fetch(`${this.baseUrl}/file/${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('Failed to fetch file');
    return response.json();
  }

  getAssetUrl(path: string): string {
    return `${this.baseUrl}/asset/${encodeURIComponent(path)}`;
  }
}

export const apiClient = new ApiClient();
