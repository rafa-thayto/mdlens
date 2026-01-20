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
