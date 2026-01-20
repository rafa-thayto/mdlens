import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';
import type { FileContent } from '../types';
import './MarkdownViewer.css';

interface MarkdownViewerProps {
  file: FileContent | null;
  loading: boolean;
  error: string | null;
}

export function MarkdownViewer({ file, loading, error }: MarkdownViewerProps) {
  const transformImageUri = useMemo(() => {
    if (!file) return undefined;

    return (src: string) => {
      if (src.startsWith('http://') || src.startsWith('https://')) {
        return src;
      }

      const fileDir = file.path.split('/').slice(0, -1).join('/');
      const imagePath = fileDir ? `${fileDir}/${src}` : src;
      return `/api/asset/${encodeURIComponent(imagePath)}`;
    };
  }, [file]);

  if (loading) {
    return (
      <div className="markdown-viewer">
        <div className="viewer-loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="markdown-viewer">
        <div className="viewer-error">{error}</div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="markdown-viewer">
        <div className="viewer-empty">
          <h2>Welcome to MDViewer</h2>
          <p>Select a markdown file from the sidebar to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="markdown-viewer">
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          transformImageUri={transformImageUri}
          components={{
            code({ inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';
              const value = String(children).replace(/\n$/, '');

              if (!inline && language === 'mermaid') {
                return <MermaidDiagram chart={value} />;
              }

              if (!inline && language) {
                return <CodeBlock language={language} value={value} />;
              }

              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            a({ href, children, ...props }) {
              const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
              return (
                <a
                  href={href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  {...props}
                >
                  {children}
                </a>
              );
            }
          }}
        >
          {file.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
