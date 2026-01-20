# MDViewer Design Document

**Date:** 2026-01-20
**Status:** Approved

## Overview

MDViewer is a CLI tool that provides a web-based markdown file browser. When run with `bunx mdviewer` in any directory, it launches a local web server that displays all markdown files in a navigable sidebar interface with rich rendering capabilities.

## Goals

- Create a globally runnable CLI tool (`bunx mdviewer`) that works in any directory
- Display all markdown files in the current working directory (recursive)
- Provide an intuitive sidebar for easy navigation between files
- Render markdown with full support for images, links, code blocks, Mermaid diagrams, and syntax highlighting
- Auto-refresh when files are added, removed, or modified
- Enable fuzzy search to quickly find files

## Architecture

### High-Level Design

**Monorepo with Separate Frontend/Backend:**
- Backend handles file system operations (discovery, watching, serving content)
- Frontend provides the user interface (sidebar, markdown rendering)
- WebSocket connection for real-time file system updates
- Shared TypeScript types between frontend and backend

### Project Structure

```
mdviewer/
├── package.json          # Main package with bin entry
├── src/
│   ├── cli.ts           # CLI entry point
│   ├── server/          # Backend server code
│   │   ├── index.ts     # Bun HTTP server
│   │   ├── files.ts     # File discovery & watching
│   │   └── api.ts       # REST API endpoints
│   └── client/          # React frontend
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── FileTree.tsx
│       │   │   ├── SearchBar.tsx
│       │   │   └── MarkdownViewer.tsx
│       │   └── main.tsx
│       ├── index.html
│       └── vite.config.ts
├── dist/                # Built output
└── tsconfig.json
```

## Backend Architecture

### Server Technology
- Use Bun's native HTTP server for performance and simplicity
- Serve built React app as static files
- Provide REST API for file operations
- Handle WebSocket connections for real-time updates

### File Discovery & Watching
- Use `glob` package to recursively find `.md` and `.markdown` files
- Use `chokidar` for file system watching (detect add/remove/change events)
- Build hierarchical file tree structure with paths relative to CWD
- Cache file tree and update incrementally on changes

### API Endpoints

```typescript
GET  /api/files          // Returns the file tree structure
GET  /api/file/:path     // Returns markdown content for a specific file
GET  /api/asset/:path    // Serves images and other assets
GET  /api/health         // Health check
WS   /ws                 // WebSocket for real-time updates
```

### Data Structures

```typescript
interface FileNode {
  name: string;
  path: string;           // Relative to CWD
  type: 'file' | 'directory';
  children?: FileNode[];  // For directories
}
```

### Security
- Validate that requested file paths are within the CWD (prevent directory traversal)
- Only allow reading `.md` and `.markdown` files
- Return 403 for attempts to access files outside working directory
- Sanitize file paths to prevent injection attacks

## Frontend Architecture

### Component Structure

```
App.tsx
├── Sidebar (collapsible)
│   ├── SearchBar (fuzzy search input)
│   └── FileTree (recursive tree component)
│       └── FileNode (clickable file/folder)
└── MarkdownViewer
    └── MarkdownContent (rendered markdown)
```

### Key Technologies
- **React + Vite**: Fast dev experience with modern React and TypeScript
- **react-markdown**: Render markdown to HTML
- **remark-gfm**: GitHub-flavored markdown (tables, task lists, strikethrough)
- **rehype-raw**: Allow raw HTML in markdown
- **react-syntax-highlighter**: Code block syntax highlighting
- **mermaid**: Render Mermaid diagrams
- **fuse.js**: Fuzzy search for filtering files
- **WebSocket client**: Listen for file system changes

### State Management
Use React hooks (no Redux needed):
- `useState` for file tree, selected file, search query
- `useEffect` for fetching initial data and WebSocket setup
- `useCallback` for optimized event handlers

### Enhanced Markdown Features

1. **Images**
   - Serve images relative to markdown file location
   - Backend endpoint: `GET /api/asset/:path`
   - Frontend transforms relative paths to API calls
   - Support: PNG, JPG, GIF, SVG, WebP

2. **Links**
   - External links open in new tab
   - Internal markdown links navigate within app
   - Anchor links work within same document

3. **Mermaid Diagrams**
   - Detect code blocks with `mermaid` language
   - Render using mermaid library
   - Support all Mermaid diagram types

4. **Code Blocks**
   - Syntax highlighting for 150+ languages
   - Floating copy button on hover
   - "Copied!" feedback for 2 seconds
   - Preserve syntax highlighting when copying

### UI/UX Features
- Resizable sidebar with drag handle
- Folder collapse/expand in tree view
- Highlight currently selected file
- Loading states while fetching content
- Empty state when no markdown files found
- Keyboard navigation (arrow keys, Enter to open)
- Clean, minimal design focused on readability

### Styling
- Use Tailwind CSS for utility-first styling
- Monospace font for code blocks
- Comfortable line height and padding for markdown content
- Responsive design for different screen sizes

## Data Flow & Real-Time Updates

### Initial Load Flow
1. User runs `bunx mdviewer` in a directory
2. CLI starts server, scans for markdown files, opens browser at `http://localhost:3456`
3. React app loads and fetches `GET /api/files` (file tree)
4. Renders sidebar with file tree
5. User clicks a file → `GET /api/file/:path` → renders markdown

### WebSocket Messages

```typescript
// Server → Client messages
{
  type: 'file-added' | 'file-removed' | 'file-changed',
  path: string,
  node?: FileNode  // For added files
}
```

### File Change Handling
- **File added**: Insert into tree, update sidebar automatically
- **File removed**: Remove from tree; if viewing it, show "File deleted" message
- **File changed**: If currently viewing, auto-reload content (with 500ms debounce)

### Image/Asset Serving
Backend resolves relative paths:
```typescript
// In markdown: ![diagram](./assets/diagram.png)
// Frontend transforms to: /api/asset/assets/diagram.png
// Backend resolves relative to markdown file's directory
```

### Error Handling
- Network errors: Show retry button
- File not found: Show friendly message with suggestions
- Invalid markdown: Attempt to render, show errors gracefully
- WebSocket disconnection: Auto-reconnect with exponential backoff

## CLI Behavior

### Package Configuration
```json
{
  "name": "mdviewer",
  "bin": {
    "mdviewer": "./dist/cli.js"
  }
}
```

### CLI Entry Point (`cli.ts`)
1. Read `process.cwd()` to get current working directory
2. Start Bun HTTP server on port 3456 (or next available)
3. Scan CWD for markdown files
4. Build file tree structure
5. Start file watcher (chokidar)
6. Automatically open browser to `http://localhost:3456`
7. Log server URL and file count to console

### Command Options (future enhancement)
```bash
bunx mdviewer              # Run in current directory
bunx mdviewer --port 8080  # Custom port
bunx mdviewer --no-open    # Don't auto-open browser
```

## Implementation Plan

The implementation will be divided into 3 parallel development tracks using separate agents:

### Agent 1: Backend & CLI
- Set up project structure and package.json
- Implement CLI entry point
- Build Bun HTTP server
- File discovery and watching with glob + chokidar
- REST API endpoints
- WebSocket server for real-time updates
- Asset serving with security validation

### Agent 2: Frontend Core
- Set up Vite + React + TypeScript
- Create component structure
- Implement Sidebar, FileTree, SearchBar components
- WebSocket client integration
- State management with React hooks
- Basic routing and navigation
- Fuzzy search with fuse.js

### Agent 3: Markdown Rendering
- Set up react-markdown with plugins
- Implement MarkdownViewer component
- Code block syntax highlighting
- Copy button for code blocks
- Mermaid diagram support
- Image and link handling
- Custom renderers for enhanced features

## Build & Distribution

### Development
```bash
bun install
bun run dev        # Starts both backend and frontend dev servers
```

### Production Build
```bash
bun run build      # Builds frontend and backend
```

### Publishing
```bash
npm publish        # Publish to npm registry
```

### Usage
```bash
bunx mdviewer      # Run from any directory
```

## Success Criteria

- ✅ Works with `bunx mdviewer` command from any directory
- ✅ Displays all markdown files in collapsible tree structure
- ✅ Renders markdown with images, links, code blocks, and Mermaid diagrams
- ✅ Auto-refreshes when files change
- ✅ Fuzzy search filters files by name
- ✅ Code blocks have copy buttons
- ✅ Syntax highlighting for code
- ✅ Responsive and performant UI
- ✅ Secure file access (no directory traversal)

## Future Enhancements (Out of Scope)

- Dark/light mode toggle
- Full-text search within file contents
- Markdown editing capabilities
- Export to PDF/HTML
- Custom themes
- Bookmarks and favorites
- Table of contents navigation
- Multi-language support
