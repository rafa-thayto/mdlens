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
