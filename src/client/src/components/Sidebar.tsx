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
