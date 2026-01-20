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
