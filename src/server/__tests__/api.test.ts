import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ApiServer } from '../api';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('ApiServer', () => {
  const testDir = join(process.cwd(), 'test-temp-api');
  let api: ApiServer;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    api = new ApiServer(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('handleGetFile', () => {
    test('parses YAML frontmatter from markdown files', async () => {
      const content = `---
title: 'Test Article'
author: testuser
date: 2025-01-21
---

# Hello World

This is the content.`;

      writeFileSync(join(testDir, 'test.md'), content);

      const result = await api.handleGetFile('test.md');

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.frontmatter).toBeDefined();
        expect(result.frontmatter?.title).toBe('Test Article');
        expect(result.frontmatter?.author).toBe('testuser');
        expect(result.content.trim()).toBe('# Hello World\n\nThis is the content.');
      }
    });

    test('handles files without frontmatter', async () => {
      const content = `# No Frontmatter

Just regular markdown content.`;

      writeFileSync(join(testDir, 'no-frontmatter.md'), content);

      const result = await api.handleGetFile('no-frontmatter.md');

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.frontmatter).toBeUndefined();
        expect(result.content).toBe(content);
      }
    });

    test('handles complex frontmatter with nested values', async () => {
      const content = `---
title: 'Complex Article'
author: username
author_url: https://example.com/user
tags:
  - javascript
  - typescript
url: https://example.com/article/123
---

# Content`;

      writeFileSync(join(testDir, 'complex.md'), content);

      const result = await api.handleGetFile('complex.md');

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.frontmatter).toBeDefined();
        expect(result.frontmatter?.title).toBe('Complex Article');
        expect(result.frontmatter?.author_url).toBe('https://example.com/user');
        expect(result.frontmatter?.tags).toEqual(['javascript', 'typescript']);
        expect(result.frontmatter?.url).toBe('https://example.com/article/123');
      }
    });

    test('returns error for non-existent files', async () => {
      const result = await api.handleGetFile('nonexistent.md');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('NOT_FOUND');
      }
    });

    test('returns error for path traversal attempts', async () => {
      const result = await api.handleGetFile('../../../etc/passwd');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('FORBIDDEN');
      }
    });

    test('handles malformed frontmatter (starts with --- but no closing ---)', async () => {
      const content = `---
# This looks like frontmatter but has no closing delimiter

Regular content here.`;

      writeFileSync(join(testDir, 'malformed.md'), content);

      const result = await api.handleGetFile('malformed.md');

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        // Should fall back to raw content when frontmatter parsing fails
        expect(result.frontmatter).toBeUndefined();
        expect(result.content).toBe(content);
      }
    });

    test('handles horizontal rules that are not frontmatter', async () => {
      const content = `# Title

Some intro text.

---

Content after horizontal rule.`;

      writeFileSync(join(testDir, 'horizontal-rule.md'), content);

      const result = await api.handleGetFile('horizontal-rule.md');

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.frontmatter).toBeUndefined();
        expect(result.content).toBe(content);
      }
    });
  });
});
