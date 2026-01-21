import { join, normalize } from 'path';
import { readFile, stat } from 'fs/promises';
import matter from 'gray-matter';
import type { FileNode, FileContent, ErrorResponse } from '../types';
import { findMarkdownFiles } from './files';

export class ApiServer {
  constructor(private rootPath: string) {}

  private isPathSafe(requestedPath: string): boolean {
    const normalized = normalize(join(this.rootPath, requestedPath));
    return normalized.startsWith(this.rootPath);
  }

  async handleGetFiles(): Promise<FileNode | ErrorResponse> {
    try {
      return await findMarkdownFiles(this.rootPath);
    } catch (error) {
      return {
        error: 'FILE_DISCOVERY_ERROR',
        message: 'Failed to discover markdown files'
      };
    }
  }

  async handleGetFile(filePath: string): Promise<FileContent | ErrorResponse> {
    if (!this.isPathSafe(filePath)) {
      return {
        error: 'FORBIDDEN',
        message: 'Access to this file is not allowed'
      };
    }

    const fullPath = join(this.rootPath, filePath);

    try {
      const stats = await stat(fullPath);
      if (!stats.isFile()) {
        return {
          error: 'NOT_FOUND',
          message: 'File not found'
        };
      }

      const rawContent = await readFile(fullPath, 'utf-8');
      const parsed = matter(rawContent);

      // Only use frontmatter if it's a valid object (not a string from malformed YAML)
      const isValidFrontmatter =
        parsed.data &&
        typeof parsed.data === 'object' &&
        !Array.isArray(parsed.data) &&
        Object.keys(parsed.data).length > 0;

      return {
        path: filePath,
        // If frontmatter parsing failed (content is empty but we have raw content), use raw content
        content: parsed.content || (!isValidFrontmatter ? rawContent : ''),
        frontmatter: isValidFrontmatter ? parsed.data : undefined
      };
    } catch (error) {
      return {
        error: 'NOT_FOUND',
        message: 'File not found'
      };
    }
  }

  async handleGetAsset(assetPath: string): Promise<Buffer | ErrorResponse> {
    if (!this.isPathSafe(assetPath)) {
      return {
        error: 'FORBIDDEN',
        message: 'Access to this asset is not allowed'
      };
    }

    const fullPath = join(this.rootPath, assetPath);

    try {
      const stats = await stat(fullPath);
      if (!stats.isFile()) {
        return {
          error: 'NOT_FOUND',
          message: 'Asset not found'
        };
      }

      return await readFile(fullPath);
    } catch (error) {
      return {
        error: 'NOT_FOUND',
        message: 'Asset not found'
      };
    }
  }
}
