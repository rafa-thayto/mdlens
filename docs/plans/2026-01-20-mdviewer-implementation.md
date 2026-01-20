# MDViewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI tool that launches a web-based markdown file browser with real-time updates, fuzzy search, and enhanced rendering (images, Mermaid, syntax highlighting).

**Architecture:** Monorepo with Bun backend (file discovery, watching, REST API, WebSocket) and React frontend (sidebar navigation, markdown rendering). Three parallel development tracks for efficient implementation.

**Tech Stack:** Bun, TypeScript, React, Vite, react-markdown, Mermaid, chokidar, fuse.js, WebSocket

---

## Parallel Track 1: Backend & CLI

### Task 1.1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bun.lockb` (generated)

**Step 1: Initialize package.json**

```bash
bun init -y
```

**Step 2: Update package.json with project details**

```json
{
  "name": "mdviewer",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "mdviewer": "./dist/cli.js"
  },
  "scripts": {
    "dev": "bun run --watch src/cli.ts",
    "build": "bun build src/cli.ts --outdir dist --target node && bun run build:client",
    "build:client": "cd src/client && bun run build",
    "test": "bun test"
  },
  "dependencies": {
    "chokidar": "^3.5.3",
    "glob": "^10.3.10",
    "ws": "^8.16.0",
    "open": "^10.0.3"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/ws": "^8.5.10",
    "typescript": "^5.3.3"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/client"]
}
```

**Step 4: Install dependencies**

```bash
bun install
```

Expected: Dependencies installed successfully

**Step 5: Commit**

```bash
git add package.json tsconfig.json bun.lockb
git commit -m "chore: initialize project with dependencies"
```

---

### Task 1.2: Shared Types

**Files:**
- Create: `src/types.ts`

**Step 1: Create shared TypeScript types**

```typescript
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface WebSocketMessage {
  type: 'file-added' | 'file-removed' | 'file-changed';
  path: string;
  node?: FileNode;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 1.3: File Discovery Service

**Files:**
- Create: `src/server/files.ts`
- Create: `src/server/__tests__/files.test.ts`

**Step 1: Write test for finding markdown files**

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { findMarkdownFiles } from '../files';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('findMarkdownFiles', () => {
  const testDir = join(process.cwd(), 'test-temp');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test('finds markdown files recursively', async () => {
    writeFileSync(join(testDir, 'test.md'), '# Test');
    mkdirSync(join(testDir, 'subdir'));
    writeFileSync(join(testDir, 'subdir', 'nested.md'), '# Nested');
    writeFileSync(join(testDir, 'readme.txt'), 'Not markdown');

    const result = await findMarkdownFiles(testDir);

    expect(result.type).toBe('directory');
    expect(result.children).toHaveLength(2);
    expect(result.children?.some(n => n.name === 'test.md')).toBe(true);
    expect(result.children?.some(n => n.name === 'subdir')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test src/server/__tests__/files.test.ts
```

Expected: FAIL with "findMarkdownFiles is not defined"

**Step 3: Implement file discovery**

```typescript
import { glob } from 'glob';
import { relative, dirname, basename, join } from 'path';
import type { FileNode } from '../types';

export async function findMarkdownFiles(rootPath: string): Promise<FileNode> {
  const files = await glob('**/*.{md,markdown}', {
    cwd: rootPath,
    nodir: true,
    dot: false
  });

  const root: FileNode = {
    name: basename(rootPath),
    path: '',
    type: 'directory',
    children: []
  };

  for (const file of files) {
    insertIntoTree(root, file);
  }

  return root;
}

function insertIntoTree(root: FileNode, filePath: string): void {
  const parts = filePath.split('/');
  let current = root;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isFile = i === parts.length - 1;
    const path = parts.slice(0, i + 1).join('/');

    if (!current.children) {
      current.children = [];
    }

    let child = current.children.find(c => c.name === part);

    if (!child) {
      child = {
        name: part,
        path,
        type: isFile ? 'file' : 'directory',
        children: isFile ? undefined : []
      };
      current.children.push(child);
    }

    if (!isFile) {
      current = child;
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
bun test src/server/__tests__/files.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/server/files.ts src/server/__tests__/files.test.ts
git commit -m "feat: implement markdown file discovery"
```

---

### Task 1.4: File Watcher Service

**Files:**
- Modify: `src/server/files.ts`

**Step 1: Add file watcher function**

```typescript
import chokidar from 'chokidar';
import type { WebSocketMessage } from '../types';

export function watchMarkdownFiles(
  rootPath: string,
  onChange: (message: WebSocketMessage) => void
): () => void {
  const watcher = chokidar.watch('**/*.{md,markdown}', {
    cwd: rootPath,
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('add', (filePath) => {
    onChange({
      type: 'file-added',
      path: filePath
    });
  });

  watcher.on('change', (filePath) => {
    onChange({
      type: 'file-changed',
      path: filePath
    });
  });

  watcher.on('unlink', (filePath) => {
    onChange({
      type: 'file-removed',
      path: filePath
    });
  });

  return () => watcher.close();
}
```

**Step 2: Commit**

```bash
git add src/server/files.ts
git commit -m "feat: add file watcher for markdown files"
```

---

### Task 1.5: REST API Server

**Files:**
- Create: `src/server/api.ts`

**Step 1: Implement REST API endpoints**

```typescript
import { join, normalize } from 'path';
import { readFile, stat } from 'fs/promises';
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

      const content = await readFile(fullPath, 'utf-8');
      return {
        path: filePath,
        content
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
```

**Step 2: Commit**

```bash
git add src/server/api.ts
git commit -m "feat: implement REST API server"
```

---

### Task 1.6: WebSocket Server

**Files:**
- Create: `src/server/websocket.ts`

**Step 1: Implement WebSocket server**

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'bun';
import type { WebSocketMessage } from '../types';

export class WSServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  broadcast(message: WebSocketMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  close(): void {
    this.clients.forEach(client => client.close());
    this.wss.close();
  }
}
```

**Step 2: Commit**

```bash
git add src/server/websocket.ts
git commit -m "feat: implement WebSocket server for real-time updates"
```

---

### Task 1.7: HTTP Server

**Files:**
- Create: `src/server/index.ts`

**Step 1: Implement Bun HTTP server**

```typescript
import { serve, file } from 'bun';
import { join } from 'path';
import { ApiServer } from './api';
import { WSServer } from './websocket';
import { watchMarkdownFiles } from './files';

export interface ServerOptions {
  rootPath: string;
  port?: number;
  clientDistPath: string;
}

export async function startServer(options: ServerOptions) {
  const { rootPath, port = 3456, clientDistPath } = options;
  const api = new ApiServer(rootPath);

  const server = serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // API Routes
      if (url.pathname === '/api/files') {
        const result = await api.handleGetFiles();
        return Response.json(result);
      }

      if (url.pathname.startsWith('/api/file/')) {
        const filePath = url.pathname.slice('/api/file/'.length);
        const result = await api.handleGetFile(decodeURIComponent(filePath));

        if ('error' in result) {
          return Response.json(result, { status: 'FORBIDDEN' in result ? 403 : 404 });
        }

        return Response.json(result);
      }

      if (url.pathname.startsWith('/api/asset/')) {
        const assetPath = url.pathname.slice('/api/asset/'.length);
        const result = await api.handleGetAsset(decodeURIComponent(assetPath));

        if ('error' in result) {
          return Response.json(result, { status: 'FORBIDDEN' in result ? 403 : 404 });
        }

        return new Response(result);
      }

      if (url.pathname === '/api/health') {
        return Response.json({ status: 'ok' });
      }

      // Serve static client files
      const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const clientFile = file(join(clientDistPath, filePath));

      if (await clientFile.exists()) {
        return new Response(clientFile);
      }

      // SPA fallback
      return new Response(file(join(clientDistPath, 'index.html')));
    }
  });

  // Setup WebSocket
  const wsServer = new WSServer(server);

  // Setup file watcher
  const stopWatching = watchMarkdownFiles(rootPath, (message) => {
    wsServer.broadcast(message);
  });

  console.log(`🚀 MDViewer running at http://localhost:${port}`);
  console.log(`📁 Watching: ${rootPath}`);

  return {
    server,
    close: () => {
      stopWatching();
      wsServer.close();
      server.stop();
    }
  };
}
```

**Step 2: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: implement Bun HTTP server with API routes"
```

---

### Task 1.8: CLI Entry Point

**Files:**
- Create: `src/cli.ts`

**Step 1: Implement CLI**

```typescript
#!/usr/bin/env bun

import { startServer } from './server/index';
import { join } from 'path';
import open from 'open';

async function main() {
  const rootPath = process.cwd();
  const clientDistPath = join(import.meta.dir, 'client', 'dist');

  console.log('🔍 Starting MDViewer...');

  const { server } = await startServer({
    rootPath,
    port: 3456,
    clientDistPath
  });

  // Open browser using the open package (cross-platform and secure)
  const url = 'http://localhost:3456';

  try {
    await open(url);
    console.log(`\n✨ Browser opened at ${url}`);
  } catch (error) {
    console.log(`\n✨ Server running at ${url}`);
    console.log('   (Unable to open browser automatically)');
  }

  console.log('Press Ctrl+C to stop\n');

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    server.stop();
    process.exit(0);
  });
}

main().catch(console.error);
```

**Step 2: Make CLI executable**

```bash
chmod +x src/cli.ts
```

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: implement CLI entry point"
```

---

## Parallel Track 2: Frontend Core

### Task 2.1: React + Vite Setup

**Files:**
- Create: `src/client/package.json`
- Create: `src/client/vite.config.ts`
- Create: `src/client/tsconfig.json`
- Create: `src/client/index.html`

**Step 1: Create client package.json**

```bash
mkdir -p src/client
cd src/client
bun init -y
```

**Step 2: Update client/package.json**

```json
{
  "name": "mdviewer-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "fuse.js": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.47",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.10"
  }
}
```

**Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3456',
      '/ws': {
        target: 'ws://localhost:3456',
        ws: true
      }
    }
  }
});
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MDViewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Install dependencies**

```bash
cd src/client
bun install
```

**Step 7: Commit**

```bash
git add src/client/package.json src/client/vite.config.ts src/client/tsconfig.json src/client/index.html src/client/bun.lockb
git commit -m "chore: setup React + Vite for frontend"
```

---

### Task 2.2: Copy Shared Types

**Files:**
- Create: `src/client/src/types.ts`

**Step 1: Copy types from backend**

```typescript
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface WebSocketMessage {
  type: 'file-added' | 'file-removed' | 'file-changed';
  path: string;
  node?: FileNode;
}

export interface FileContent {
  path: string;
  content: string;
}
```

**Step 2: Commit**

```bash
git add src/client/src/types.ts
git commit -m "feat: add shared types to frontend"
```

---

### Task 2.3: API Client

**Files:**
- Create: `src/client/src/api.ts`

**Step 1: Implement API client**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/client/src/api.ts
git commit -m "feat: implement API client"
```

---

### Task 2.4: WebSocket Hook

**Files:**
- Create: `src/client/src/hooks/useWebSocket.ts`

**Step 1: Implement WebSocket hook**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import type { WebSocketMessage } from '../types';

export function useWebSocket(onMessage: (message: WebSocketMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        onMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [onMessage]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);
}
```

**Step 2: Commit**

```bash
git add src/client/src/hooks/useWebSocket.ts
git commit -m "feat: implement WebSocket hook for real-time updates"
```

---

### Task 2.5: FileTree Component

**Files:**
- Create: `src/client/src/components/FileTree.tsx`
- Create: `src/client/src/components/FileTree.css`

**Step 1: Implement FileTree component**

```typescript
import { useState } from 'react';
import type { FileNode } from '../types';
import './FileTree.css';

interface FileTreeProps {
  node: FileNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

export function FileTree({ node, selectedPath, onSelectFile }: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: FileNode, depth = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = node.path === selectedPath;

    if (node.type === 'directory') {
      return (
        <div key={node.path} className="tree-directory">
          <div
            className="tree-node tree-directory-name"
            style={{ paddingLeft: `${depth * 16}px` }}
            onClick={() => toggleDir(node.path)}
          >
            <span className="tree-icon">{isExpanded ? '📂' : '📁'}</span>
            <span>{node.name}</span>
          </div>
          {isExpanded && node.children && (
            <div className="tree-children">
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className={`tree-node tree-file ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 20}px` }}
        onClick={() => onSelectFile(node.path)}
      >
        <span className="tree-icon">📄</span>
        <span>{node.name}</span>
      </div>
    );
  };

  return (
    <div className="file-tree">
      {node.children?.map(child => renderNode(child))}
    </div>
  );
}
```

**Step 2: Create basic CSS**

```css
.file-tree {
  overflow-y: auto;
  height: 100%;
  user-select: none;
}

.tree-node {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.15s;
}

.tree-node:hover {
  background-color: #f0f0f0;
}

.tree-node.selected {
  background-color: #e3f2fd;
  font-weight: 500;
}

.tree-icon {
  margin-right: 6px;
  font-size: 16px;
}

.tree-directory-name {
  font-weight: 500;
}

.tree-children {
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Step 3: Commit**

```bash
git add src/client/src/components/FileTree.tsx src/client/src/components/FileTree.css
git commit -m "feat: implement FileTree component"
```

---

### Task 2.6: SearchBar Component

**Files:**
- Create: `src/client/src/components/SearchBar.tsx`
- Create: `src/client/src/components/SearchBar.css`

**Step 1: Implement SearchBar component**

```typescript
import { useState, useEffect } from 'react';
import Fuse from 'fuse.js';
import type { FileNode } from '../types';
import './SearchBar.css';

interface SearchBarProps {
  files: FileNode;
  onSelectFile: (path: string) => void;
}

export function SearchBar({ files, onSelectFile }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileNode[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const flatFiles = flattenFiles(files);
    const fuse = new Fuse(flatFiles, {
      keys: ['name', 'path'],
      threshold: 0.4
    });

    const searchResults = fuse.search(query).map(r => r.item);
    setResults(searchResults);
    setShowResults(true);
  }, [query, files]);

  const handleSelect = (path: string) => {
    onSelectFile(path);
    setQuery('');
    setShowResults(false);
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search files..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
        onFocus={() => query && setShowResults(true)}
      />
      {showResults && results.length > 0 && (
        <div className="search-results">
          {results.map(file => (
            <div
              key={file.path}
              className="search-result-item"
              onClick={() => handleSelect(file.path)}
            >
              <span className="search-icon">📄</span>
              <span className="search-path">{file.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function flattenFiles(node: FileNode): FileNode[] {
  const result: FileNode[] = [];

  if (node.type === 'file') {
    result.push(node);
  }

  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenFiles(child));
    }
  }

  return result;
}
```

**Step 2: Create CSS**

```css
.search-bar {
  position: relative;
  padding: 12px;
  border-bottom: 1px solid #e0e0e0;
}

.search-bar input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}

.search-bar input:focus {
  border-color: #2196f3;
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
}

.search-results {
  position: absolute;
  top: 100%;
  left: 12px;
  right: 12px;
  max-height: 300px;
  overflow-y: auto;
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.search-result-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}

.search-result-item:hover {
  background-color: #f5f5f5;
}

.search-icon {
  margin-right: 8px;
}

.search-path {
  color: #666;
}
```

**Step 3: Commit**

```bash
git add src/client/src/components/SearchBar.tsx src/client/src/components/SearchBar.css
git commit -m "feat: implement SearchBar with fuzzy search"
```

---

### Task 2.7: Sidebar Component

**Files:**
- Create: `src/client/src/components/Sidebar.tsx`
- Create: `src/client/src/components/Sidebar.css`

**Step 1: Implement Sidebar component**

```typescript
import { FileTree } from './FileTree';
import { SearchBar } from './SearchBar';
import type { FileNode } from '../types';
import './Sidebar.css';

interface SidebarProps {
  files: FileNode | null;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

export function Sidebar({ files, selectedPath, onSelectFile }: SidebarProps) {
  if (!files) {
    return (
      <div className="sidebar">
        <div className="sidebar-loading">Loading files...</div>
      </div>
    );
  }

  const fileCount = countFiles(files);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>MDViewer</h2>
        <span className="file-count">{fileCount} files</span>
      </div>
      <SearchBar files={files} onSelectFile={onSelectFile} />
      <FileTree
        node={files}
        selectedPath={selectedPath}
        onSelectFile={onSelectFile}
      />
    </div>
  );
}

function countFiles(node: FileNode): number {
  let count = node.type === 'file' ? 1 : 0;

  if (node.children) {
    for (const child of node.children) {
      count += countFiles(child);
    }
  }

  return count;
}
```

**Step 2: Create CSS**

```css
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 300px;
  border-right: 1px solid #e0e0e0;
  background-color: #fafafa;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  background-color: white;
}

.sidebar-header h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
}

.file-count {
  font-size: 12px;
  color: #666;
}

.sidebar-loading {
  padding: 16px;
  text-align: center;
  color: #666;
}
```

**Step 3: Commit**

```bash
git add src/client/src/components/Sidebar.tsx src/client/src/components/Sidebar.css
git commit -m "feat: implement Sidebar component"
```

---

## Parallel Track 3: Markdown Rendering

### Task 3.1: Install Markdown Dependencies

**Files:**
- Modify: `src/client/package.json`

**Step 1: Install markdown packages**

```bash
cd src/client
bun add react-markdown remark-gfm rehype-raw rehype-sanitize react-syntax-highlighter mermaid
bun add -d @types/react-syntax-highlighter
```

**Step 2: Commit**

```bash
git add src/client/package.json src/client/bun.lockb
git commit -m "chore: add markdown rendering dependencies"
```

---

### Task 3.2: CodeBlock Component with Copy Button

**Files:**
- Create: `src/client/src/components/CodeBlock.tsx`
- Create: `src/client/src/components/CodeBlock.css`

**Step 1: Implement CodeBlock with copy button**

```typescript
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './CodeBlock.css';

interface CodeBlockProps {
  language: string;
  value: string;
}

export function CodeBlock({ language, value }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-language">{language}</span>
        <button className="copy-button" onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: '0 0 6px 6px'
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}
```

**Step 2: Create CSS**

```css
.code-block {
  position: relative;
  margin: 16px 0;
  border-radius: 6px;
  overflow: hidden;
  background: #282c34;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #21252b;
  border-bottom: 1px solid #181a1f;
}

.code-language {
  font-size: 12px;
  font-weight: 500;
  color: #abb2bf;
  text-transform: uppercase;
}

.copy-button {
  padding: 4px 8px;
  font-size: 12px;
  background: #3e4451;
  color: #abb2bf;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.copy-button:hover {
  background: #4e5561;
}

.copy-button:active {
  background: #2c313a;
}
```

**Step 3: Commit**

```bash
git add src/client/src/components/CodeBlock.tsx src/client/src/components/CodeBlock.css
git commit -m "feat: implement CodeBlock with copy button"
```

---

### Task 3.3: Mermaid Diagram Component

**Files:**
- Create: `src/client/src/components/MermaidDiagram.tsx`

**Step 1: Implement Mermaid component**

```typescript
import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

let mermaidInitialized = false;

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose'
      });
      mermaidInitialized = true;
    }

    const renderDiagram = async () => {
      if (!containerRef.current) return;

      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        containerRef.current.innerHTML = svg;
      } catch (error) {
        console.error('Mermaid render error:', error);
        containerRef.current.innerHTML = `<pre>Error rendering diagram</pre>`;
      }
    };

    renderDiagram();
  }, [chart]);

  return <div ref={containerRef} className="mermaid-diagram" />;
}
```

**Step 2: Commit**

```bash
git add src/client/src/components/MermaidDiagram.tsx
git commit -m "feat: implement Mermaid diagram component"
```

---

### Task 3.4: MarkdownViewer Component

**Files:**
- Create: `src/client/src/components/MarkdownViewer.tsx`
- Create: `src/client/src/components/MarkdownViewer.css`

**Step 1: Implement MarkdownViewer**

```typescript
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';
import type { FileContent } from '../types';
import './MarkdownViewer.css';

interface MarkdownViewerProps {
  file: FileContent | null;
  loading: boolean;
  error: string | null;
}

export function MarkdownViewer({ file, loading, error }: MarkdownViewerProps) {
  const transformImageUri = useMemo(() => {
    if (!file) return undefined;

    return (src: string) => {
      if (src.startsWith('http://') || src.startsWith('https://')) {
        return src;
      }

      const fileDir = file.path.split('/').slice(0, -1).join('/');
      const imagePath = fileDir ? `${fileDir}/${src}` : src;
      return `/api/asset/${encodeURIComponent(imagePath)}`;
    };
  }, [file]);

  if (loading) {
    return (
      <div className="markdown-viewer">
        <div className="viewer-loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="markdown-viewer">
        <div className="viewer-error">{error}</div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="markdown-viewer">
        <div className="viewer-empty">
          <h2>Welcome to MDViewer</h2>
          <p>Select a markdown file from the sidebar to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="markdown-viewer">
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          transformImageUri={transformImageUri}
          components={{
            code({ inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';
              const value = String(children).replace(/\n$/, '');

              if (!inline && language === 'mermaid') {
                return <MermaidDiagram chart={value} />;
              }

              if (!inline && language) {
                return <CodeBlock language={language} value={value} />;
              }

              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            a({ href, children, ...props }) {
              const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
              return (
                <a
                  href={href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  {...props}
                >
                  {children}
                </a>
              );
            }
          }}
        >
          {file.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
```

**Step 2: Create CSS**

```css
.markdown-viewer {
  flex: 1;
  height: 100vh;
  overflow-y: auto;
  background: white;
}

.viewer-loading,
.viewer-error,
.viewer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  text-align: center;
}

.viewer-error {
  color: #d32f2f;
}

.viewer-empty h2 {
  margin-bottom: 8px;
  color: #333;
}

.viewer-empty p {
  color: #666;
}

.markdown-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
  line-height: 1.7;
  color: #333;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-content h1 {
  font-size: 2em;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 8px;
}

.markdown-content h2 {
  font-size: 1.5em;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 8px;
}

.markdown-content p {
  margin-bottom: 16px;
}

.markdown-content a {
  color: #2196f3;
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}

.markdown-content img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 16px 0;
}

.markdown-content pre {
  margin: 16px 0;
}

.markdown-content code {
  padding: 2px 6px;
  background: #f5f5f5;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-content blockquote {
  margin: 16px 0;
  padding-left: 16px;
  border-left: 4px solid #e0e0e0;
  color: #666;
}

.markdown-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.markdown-content th,
.markdown-content td {
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  text-align: left;
}

.markdown-content th {
  background: #f5f5f5;
  font-weight: 600;
}

.markdown-content ul,
.markdown-content ol {
  margin: 16px 0;
  padding-left: 32px;
}

.markdown-content li {
  margin: 4px 0;
}
```

**Step 3: Commit**

```bash
git add src/client/src/components/MarkdownViewer.tsx src/client/src/components/MarkdownViewer.css
git commit -m "feat: implement MarkdownViewer with enhanced rendering"
```

---

## Final Integration

### Task 4.1: Main App Component

**Files:**
- Create: `src/client/src/App.tsx`
- Create: `src/client/src/App.css`

**Step 1: Implement App component**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { MarkdownViewer } from './components/MarkdownViewer';
import { useWebSocket } from './hooks/useWebSocket';
import { apiClient } from './api';
import type { FileNode, FileContent, WebSocketMessage } from './types';
import './App.css';

export function App() {
  const [files, setFiles] = useState<FileNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const fileTree = await apiClient.getFiles();
      setFiles(fileTree);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError('Failed to load file tree');
    }
  };

  const loadFile = async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedPath(path);

    try {
      const file = await apiClient.getFile(path);
      setSelectedFile(file);
    } catch (err) {
      console.error('Failed to load file:', err);
      setError('Failed to load file');
      setSelectedFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    console.log('WebSocket message:', message);

    if (message.type === 'file-added' || message.type === 'file-removed') {
      loadFiles();
    }

    if (message.type === 'file-changed' && message.path === selectedPath) {
      loadFile(message.path);
    }

    if (message.type === 'file-removed' && message.path === selectedPath) {
      setSelectedFile(null);
      setSelectedPath(null);
      setError('File was deleted');
    }
  }, [selectedPath]);

  useWebSocket(handleWebSocketMessage);

  return (
    <div className="app">
      <Sidebar
        files={files}
        selectedPath={selectedPath}
        onSelectFile={loadFile}
      />
      <MarkdownViewer
        file={selectedFile}
        loading={loading}
        error={error}
      />
    </div>
  );
}
```

**Step 2: Create App CSS**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
```

**Step 3: Commit**

```bash
git add src/client/src/App.tsx src/client/src/App.css
git commit -m "feat: implement main App component"
```

---

### Task 4.2: Entry Point

**Files:**
- Create: `src/client/src/main.tsx`

**Step 1: Create main entry point**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Step 2: Commit**

```bash
git add src/client/src/main.tsx
git commit -m "feat: add React entry point"
```

---

### Task 4.3: Build Scripts

**Files:**
- Modify: `package.json` (root)

**Step 1: Update root package.json scripts**

```json
{
  "scripts": {
    "dev": "bun run dev:client & bun run dev:server",
    "dev:client": "cd src/client && bun run dev",
    "dev:server": "bun run --watch src/cli.ts",
    "build": "bun run build:client && bun run build:server",
    "build:client": "cd src/client && bun run build",
    "build:server": "bun build src/cli.ts --outdir dist --target node --minify",
    "test": "bun test"
  }
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add build and dev scripts"
```

---

### Task 4.4: README Documentation

**Files:**
- Create: `README.md`

**Step 1: Write README**

```markdown
# MDViewer

A CLI tool for browsing markdown files in a beautiful web interface with real-time updates.

## Features

- 📁 Recursive markdown file discovery
- 🔍 Fuzzy search to quickly find files
- 🎨 Beautiful markdown rendering with GitHub-flavored markdown
- 📊 Mermaid diagram support
- 💻 Syntax highlighting for code blocks
- 📋 Copy buttons for code blocks
- 🔄 Real-time file watching and updates
- 🖼️ Image and asset support

## Installation

```bash
bun install -g mdviewer
```

## Usage

Navigate to any directory with markdown files and run:

```bash
mdviewer
```

Or use with bunx:

```bash
bunx mdviewer
```

The app will:
1. Start a local web server
2. Scan for all markdown files
3. Open your browser automatically
4. Watch for file changes in real-time

## Development

### Prerequisites

- Bun 1.0+

### Setup

```bash
git clone <repository>
cd mdviewer
bun install
cd src/client
bun install
cd ../..
```

### Run Development Server

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Test

```bash
bun test
```

## Architecture

- **Backend**: Bun HTTP server with REST API and WebSocket
- **Frontend**: React + Vite with TypeScript
- **File Watching**: Chokidar for real-time updates
- **Markdown**: react-markdown with remark-gfm
- **Search**: Fuse.js for fuzzy search
- **Diagrams**: Mermaid for flowcharts and diagrams

## License

MIT
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage instructions"
```

---

## Execution Strategy

This plan is designed for parallel execution using 3 agents:

**Agent 1** focuses on:
- Tasks 1.1 through 1.8 (Backend & CLI)
- Setting up the server infrastructure

**Agent 2** focuses on:
- Tasks 2.1 through 2.7 (Frontend Core)
- Building the navigation and UI components

**Agent 3** focuses on:
- Tasks 3.1 through 3.4 (Markdown Rendering)
- Implementing enhanced markdown features

**Final Integration** (Task 4):
- One agent completes after all three tracks finish
- Integrates everything and verifies the complete system

All three agents can work simultaneously until Task 4, which requires all previous tasks to be complete.
