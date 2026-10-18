import { useEffect, useId, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { renderMermaid } from '../utils/renderMermaid';

export function MermaidDiagram({ source }: { source: string }) {
  const { theme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [rendered, setRendered] = useState<{
    source: string;
    svg: string;
  } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        // The theme is part of the diagram's own init directive, so it never leaks between diagrams.
        const init =
          theme === 'dark'
            ? {
                theme: 'dark',
                themeVariables: {
                  mainBkg: '#16221e',
                  attributeBackgroundColorOdd: '#16221e',
                  attributeBackgroundColorEven: '#1d2c27',
                  nodeBorder: '#3f6b5b',
                  lineColor: '#34c38a',
                },
              }
            : { theme: 'default' };
        const themed = `%%{init: ${JSON.stringify(init)}}%%\n${source}`;
        const svg = await renderMermaid(`diagram${id}${theme}`, themed);
        if (!cancelled) setRendered({ source, svg });
      } catch {
        if (!cancelled) setFailedSource(source);
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [id, source, theme]);

  return (
    <div className="file-diagram">
      {failedSource === source ? (
        <p role="alert">
          This diagram could not be rendered. Its source is available below.
        </p>
      ) : rendered?.source === source ? (
        <div
          className="file-diagram-svg"
          role="img"
          aria-label="Entity relationship diagram"
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />
      ) : (
        <p role="status">Rendering diagram...</p>
      )}
      <details>
        <summary>Mermaid source</summary>
        <pre>
          <code>{source}</code>
        </pre>
      </details>
    </div>
  );
}
