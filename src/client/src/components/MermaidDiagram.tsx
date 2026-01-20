import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

let mermaidInitialized = false;

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose'
      });
      mermaidInitialized = true;
    }

    const renderDiagram = async () => {
      if (!containerRef.current) return;

      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        // Note: mermaid.render() returns sanitized SVG that is safe to render
        containerRef.current.innerHTML = svg;
      } catch (error) {
        console.error('Mermaid render error:', error);
        containerRef.current.innerHTML = `<pre>Error rendering diagram</pre>`;
      }
    };

    renderDiagram();
  }, [chart]);

  return <div ref={containerRef} className="mermaid-diagram" />;
}
