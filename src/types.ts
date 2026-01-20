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
