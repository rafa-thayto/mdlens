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
