import { ImageDown, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { downloadBlob } from '../../../shared/utils/download';
import { svgToBlob, svgToPngBlob } from '../../../shared/utils/exportSvg';
import { renderMermaid } from '../../../shared/utils/renderMermaid';
import { RelationshipColumns } from './RelationshipColumns';
import { useTheme } from '../../../shared/hooks/useTheme';
import { generateRelationshipMermaid } from '../utils/mermaidGenerator';
import {
  cardinalityText,
  type GraphEdge,
  type Neighbourhood,
} from '../utils/relationshipGraph';

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
const STEP = 1.25;
const NODE_ID = /-flowchart-(n\d+)-\d+$/;

let renderCount = 0;

function EdgeDetails({
  edge,
  tableId,
  primaryKeys,
  onNavigate,
}: {
  edge: GraphEdge;
  tableId: string | null;
  primaryKeys: ReadonlyMap<string, readonly string[]>;
  onNavigate: (id: string) => void;
}) {
  const others = [...new Set([edge.from, edge.to])].filter(
    (id) => id !== tableId,
  );
  return (
    <div className="td-rel-details" aria-live="polite">
      <div className="td-rel-details-head">
        <strong>
          {edge.from} → {edge.to}
        </strong>
        <span
          className={
            'td-badge ' + (edge.confirmed ? 'td-badge-fk' : 'td-badge-inferred')
          }
        >
          {edge.confirmed ? 'Confirmed FK' : 'Inferred'}
        </span>
      </div>
      <dl>
        <dt>Columns</dt>
        <dd>
          <RelationshipColumns edge={edge} primaryKeys={primaryKeys} />
        </dd>
        <dt>Constraint</dt>
        <dd className="td-mono">
          {edge.name ??
            (edge.confirmed ? 'Name not recorded' : 'None (not enforced)')}
        </dd>
        <dt>Cardinality</dt>
        <dd>{cardinalityText(edge)}</dd>
        {edge.meaning && (
          <>
            <dt>Meaning</dt>
            <dd className={edge.confirmed ? undefined : 'inferred'}>
              {edge.meaning}
            </dd>
          </>
        )}
      </dl>
      {others.map((id) => (
        <button
          key={id}
          type="button"
          className="td-link-button"
          onClick={() => onNavigate(id)}
        >
          Open {id}
        </button>
      ))}
    </div>
  );
}

export function RelationshipDiagram({
  graph,
  onNavigate,
}: {
  graph: Neighbourhood;
  onNavigate: (id: string) => void;
}) {
  const { theme } = useTheme();
  const diagram = useMemo(
    () => generateRelationshipMermaid(graph, theme),
    [graph, theme],
  );
  const primaryKeys = useMemo(
    () => new Map(graph.tables.map((t) => [t.id, t.primaryKey] as const)),
    [graph],
  );
  const baseId = 'rel' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [rendered, setRendered] = useState<{
    source: string;
    svg: string;
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    source: string;
    edgeId: string;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const natural = useRef({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;
    renderMermaid(`${baseId}x${++renderCount}`, diagram.source).then(
      (svg) => !cancelled && setRendered({ source: diagram.source, svg }),
      () => !cancelled && setFailed(diagram.source),
    );
    return () => {
      cancelled = true;
    };
  }, [baseId, diagram.source]);

  const current = rendered?.source === diagram.source ? rendered.svg : null;
  const selectedEdgeId =
    selection?.source === diagram.source ? selection.edgeId : null;
  const selectedEdge = selectedEdgeId
    ? (diagram.edges.get(selectedEdgeId) ?? null)
    : null;

  const fit = useCallback(() => {
    const width = viewport.current?.clientWidth ?? 0;
    if (!natural.current.width || !width) return;
    setScale(
      Math.max(MIN_SCALE, Math.min(1, (width - 24) / natural.current.width)),
    );
  }, []);

  // Make related tables and lines reachable by mouse and keyboard, then fit the new drawing.
  useLayoutEffect(() => {
    const svg = viewport.current?.querySelector('svg');
    if (!current || !svg) return;
    const box = svg.viewBox.baseVal;
    natural.current = {
      width: box?.width || svg.getBoundingClientRect().width,
      height: box?.height || 0,
    };
    svg.removeAttribute('style');
    for (const node of svg.querySelectorAll<SVGGElement>('g.node')) {
      const tableId = diagram.nodes.get(NODE_ID.exec(node.id)?.[1] ?? '');
      if (!tableId || tableId === graph.tableId) continue;
      node.classList.add('td-rel-clickable');
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'link');
      node.setAttribute('aria-label', `Open ${tableId}`);
    }
    for (const label of svg.querySelectorAll<SVGGElement>(
      'g.edgeLabel g.label[data-id]',
    )) {
      const edge = diagram.edges.get(label.dataset.id ?? '');
      if (!edge) continue;
      label.setAttribute('tabindex', '0');
      label.setAttribute('role', 'button');
      label.setAttribute(
        'aria-label',
        `Show details: ${edge.from} to ${edge.to}`,
      );
    }
    fit();
  }, [current, diagram, graph.tableId, fit]);

  useLayoutEffect(() => {
    const svg = viewport.current?.querySelector('svg');
    if (!svg || !natural.current.width) return;
    svg.style.width = `${natural.current.width * scale}px`;
    svg.style.height = natural.current.height
      ? `${natural.current.height * scale}px`
      : 'auto';
  }, [scale, current]);

  useLayoutEffect(() => {
    for (const el of viewport.current?.querySelectorAll('[data-id]') ?? [])
      el.classList.toggle(
        'td-rel-selected',
        el.getAttribute('data-id') === selectedEdgeId,
      );
  }, [selectedEdgeId, current]);

  // PNG with the theme's background; if the browser refuses to rasterise it, the SVG is saved instead.
  const download = async () => {
    const svg = viewport.current?.querySelector('svg');
    if (!svg || exporting) return;
    const name = graph.tableId
      ? `${graph.tableId}-relationships`
      : 'er-diagram';
    setExporting(true);
    try {
      downloadBlob(
        await svgToPngBlob(svg, theme === 'dark' ? '#0f1d19' : '#ffffff'),
        `${name}.png`,
      );
    } catch {
      downloadBlob(svgToBlob(svg), `${name}.svg`);
    } finally {
      setExporting(false);
    }
  };

  const activate = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null;
    const node = element?.closest('g.node');
    if (node) {
      const tableId = diagram.nodes.get(NODE_ID.exec(node.id)?.[1] ?? '');
      if (tableId && tableId !== graph.tableId) onNavigate(tableId);
      return true;
    }
    const edgeId = element?.closest('[data-id]')?.getAttribute('data-id');
    if (edgeId && diagram.edges.has(edgeId)) {
      setSelection(
        edgeId === selectedEdgeId ? null : { source: diagram.source, edgeId },
      );
      return true;
    }
    return false;
  };
  const onClick = (event: MouseEvent) => {
    activate(event.target);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && activate(event.target))
      event.preventDefault();
  };

  if (failed === diagram.source)
    return (
      <p className="td-rel-message" role="alert">
        The relationship diagram could not be drawn.
      </p>
    );

  return (
    <div className="td-rel">
      <div className="td-rel-toolbar" role="group" aria-label="Diagram zoom">
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={scale <= MIN_SCALE}
          onClick={() => setScale((s) => Math.max(MIN_SCALE, s / STEP))}
        >
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <span className="td-rel-scale" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={scale >= MAX_SCALE}
          onClick={() => setScale((s) => Math.min(MAX_SCALE, s * STEP))}
        >
          <ZoomIn size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Fit to view"
          title="Fit to view"
          onClick={fit}
        >
          <Scan size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="td-rel-download"
          disabled={!current || exporting}
          title="Download the diagram as an image"
          onClick={() => {
            void download();
          }}
        >
          <ImageDown size={16} aria-hidden="true" />
          Download
        </button>
      </div>
      {/* Clicks and keys are delegated: the SVG content is generated by Mermaid. */}
      <div
        ref={viewport}
        className="td-rel-viewport"
        aria-label={
          graph.tableId
            ? `Relationship diagram for ${graph.tableId}`
            : 'Relationship diagram for the whole database'
        }
        role="figure"
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {current ? (
          <div
            className="td-rel-svg"
            dangerouslySetInnerHTML={{ __html: current }}
          />
        ) : (
          <p className="td-rel-message" role="status">
            Drawing diagram…
          </p>
        )}
      </div>
      {selectedEdge ? (
        <EdgeDetails
          edge={selectedEdge}
          tableId={graph.tableId}
          primaryKeys={primaryKeys}
          onNavigate={onNavigate}
        />
      ) : (
        <p className="td-rel-hint">
          Select a line to see the relationship details, or a table to open it.
        </p>
      )}
    </div>
  );
}
