# MDLens

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
bun install -g mdlens
```

## Usage

Navigate to any directory with markdown files and run:

```bash
md
```

Or use with bunx:

```bash
bunx mdlens
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
cd mdlens
bun install
cd src/client
bun install
cd ../..
```

### Link for Local Development

After building, link the package globally so you can use it anywhere:

```bash
# Build the project
bun run build

# Link globally (similar to npm link)
bun link

# Add bun bin to PATH (if not already added)
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Now you can use it anywhere:
cd ~/some-directory-with-markdown
md
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
