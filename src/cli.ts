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
