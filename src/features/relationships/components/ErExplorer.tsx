import {
  Scan,
  Search,
  Table2,
  TableProperties,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  DiagramLegend,
  KeyMark,
} from '../../table-details/components/DiagramLegend';
import { DownloadMenu } from '../../../shared/components/DownloadMenu';
import { downloadBlob } from '../../../shared/utils/download';
import { svgMarkupToPngBlob } from '../../../shared/utils/exportSvg';
import { ResourceState } from '../../table-details/components/ResourceState';
import {
  cardinalityShort,
  type GraphEdge,
  type RelationshipIndex,
} from '../../table-details/utils/relationshipGraph';
import { useErTables } from '../hooks/useErTables';
import { erSvg } from '../utils/erExport';
import { layoutEr, type ErTable, type PlacedCard } from '../utils/erLayout';

const ALL_AREAS = '';
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.4;
const ZOOM_STEP = 0.1;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
const matches = (table: ErTable, needle: string) =>
  table.id.toLocaleLowerCase().includes(needle);

/**
 * The interactive ER diagram: a card per table with its key columns, a connector per relationship,
 * filters, zoom, and an inspector for the selected table or relationship. Everything is drawn from
 * the catalog (tables, columns, row counts, relationships), nothing is hard-coded.
 */
export function ErExplorer({
  index,
  onOpenTable,
}: {
  index: RelationshipIndex;
  onOpenTable: (id: string) => void;
}) {
  const ids = useMemo(() => [...index.tables.keys()].sort(), [index]);
  const { tables, isPending, failed } = useErTables(ids);

  const [area, setArea] = useState(ALL_AREAS);
  const [query, setQuery] = useState('');
  const [keysOnly, setKeysOnly] = useState(true);
  const [showInferred, setShowInferred] = useState(true);
  const [zoom, setZoom] = useState(0.8);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const plot = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLocaleLowerCase();
  const areas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tables) for (const a of t.areas) seen.set(a.id, a.name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [tables]);

  // A business area shows its own tables and the tables they connect to, so cross-area links stay.
  const shown = useMemo(() => {
    if (area === ALL_AREAS) return tables;
    const own = new Set(
      tables.filter((t) => t.areas.some((a) => a.id === area)).map((t) => t.id),
    );
    const near = new Set(own);
    for (const e of index.edges) {
      if (own.has(e.from)) near.add(e.to);
      if (own.has(e.to)) near.add(e.from);
    }
    return tables.filter((t) => near.has(t.id));
  }, [tables, area, index]);
  const ownIds = useMemo(
    () =>
      new Set(
        area === ALL_AREAS
          ? tables.map((t) => t.id)
          : tables
              .filter((t) => t.areas.some((a) => a.id === area))
              .map((t) => t.id),
      ),
    [tables, area],
  );

  const edges = useMemo(() => {
    const inView = new Set(shown.map((t) => t.id));
    return index.edges.filter(
      (e) =>
        inView.has(e.from) && inView.has(e.to) && (showInferred || e.confirmed),
    );
  }, [index, shown, showInferred]);

  const layout = useMemo(
    () => layoutEr(shown, edges, keysOnly),
    [shown, edges, keysOnly],
  );
  const cardById = useMemo(
    () => new Map(layout.cards.map((c) => [c.table.id, c] as const)),
    [layout],
  );

  // The table with the most relationships is the most useful starting point.
  const selected =
    (selectedId && cardById.get(selectedId)?.table) ||
    [...layout.cards].sort(
      (a, b) =>
        edges.filter((e) => e.from === b.table.id || e.to === b.table.id)
          .length -
        edges.filter((e) => e.from === a.table.id || e.to === a.table.id)
          .length,
    )[0]?.table ||
    null;
  const focusId = hoveredId ?? selected?.id ?? null;
  const touches = (edge: GraphEdge, id: string) =>
    edge.from === id || edge.to === id;
  const related = useMemo(() => {
    const set = new Set<string>();
    if (focusId)
      for (const e of edges)
        if (touches(e, focusId)) set.add(e.from === focusId ? e.to : e.from);
    return set;
  }, [edges, focusId]);

  const fit = useCallback(() => {
    const box = plot.current;
    if (!box || !layout.width) return;
    const next = Math.min(
      1,
      (box.clientWidth - 24) / layout.width,
      (box.clientHeight - 24) / layout.height,
    );
    setZoom(Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
  }, [layout.width, layout.height]);
  useLayoutEffect(() => {
    fit();
  }, [fit]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const reveal = (card: PlacedCard) =>
    plot.current?.scrollTo?.({
      left: Math.max(0, card.x * zoom - 40),
      top: Math.max(0, card.y * zoom - 40),
      behavior: 'smooth',
    });
  const select = (id: string) => {
    setSelectedId(id);
    setSelectedEdgeId(null);
  };
  const search = (value: string) => {
    setQuery(value);
    const text = value.trim().toLocaleLowerCase();
    const found = text ? shown.find((t) => matches(t, text)) : undefined;
    if (found) {
      select(found.id);
      const card = cardById.get(found.id);
      if (card) reveal(card);
    }
  };

  const onCardKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(id);
    }
  };

  if (isPending)
    return <ResourceState kind="loading" title="Loading the tables…" />;
  if (ids.length === 0)
    return (
      <ResourceState
        kind="empty"
        title="No tables are recorded in this snapshot."
      />
    );

  return (
    <div className="er-explorer">
      <section className="td-card er-workspace" aria-labelledby="er-heading">
        <div className="td-card-head">
          <div className="td-card-title td-card-title-stack">
            <div className="td-card-title-row">
              <h2 id="er-heading">Entity relationship diagram</h2>
              <span className="td-count">
                {plural(shown.length, 'table', 'tables')} ·{' '}
                {plural(edges.length, 'relationship', 'relationships')}
              </span>
            </div>
            <p>
              Arrows point from the referencing table to the table it
              references. Double-click a table to open it.
            </p>
          </div>
          <DownloadMenu
            options={[
              {
                label: 'PNG image',
                hint: 'Best for slides and documents',
                onSelect: async () => {
                  downloadBlob(
                    await svgMarkupToPngBlob(
                      erSvg(layout),
                      layout.width,
                      layout.height,
                      '#f7faf8',
                    ),
                    'er-diagram.png',
                  );
                },
              },
              {
                label: 'SVG vector',
                hint: 'Sharp at any size, editable',
                onSelect: () => {
                  downloadBlob(
                    new Blob([erSvg(layout)], {
                      type: 'image/svg+xml;charset=utf-8',
                    }),
                    'er-diagram.svg',
                  );
                },
              },
            ]}
          />
        </div>
        <div className="er-toolbar">
          <div className="er-toolbar-group">
            <label className="rel-focus">
              <span>Area</span>
              <select
                value={area}
                onChange={(event) => setArea(event.target.value)}
              >
                <option value={ALL_AREAS}>All business areas</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="td-search">
              <Search size={14} aria-hidden="true" />
              <span className="td-sr-only">Find a table</span>
              <input
                type="search"
                placeholder="Find a table"
                value={query}
                onChange={(event) => search(event.target.value)}
              />
            </label>
          </div>
          <div className="er-toolbar-group">
            <div
              className="td-segments"
              role="group"
              aria-label="Columns shown"
            >
              <button
                type="button"
                className="td-segment"
                aria-pressed={keysOnly}
                onClick={() => setKeysOnly(true)}
              >
                Keys only
              </button>
              <button
                type="button"
                className="td-segment"
                aria-pressed={!keysOnly}
                onClick={() => setKeysOnly(false)}
              >
                All columns
              </button>
            </div>
            <label className="er-switch">
              <input
                type="checkbox"
                checked={showInferred}
                onChange={(event) => setShowInferred(event.target.checked)}
              />
              <span className="er-track" aria-hidden="true" />
              Show inferred
            </label>
          </div>
        </div>

        <div className="er-content">
          <div className="er-stage">
            <DiagramLegend>
              <div className="er-tools">
                <button
                  type="button"
                  className="er-open-details"
                  disabled={!selected}
                  title={
                    selected
                      ? `Open ${selected.id} in Table Details`
                      : 'Select a table first'
                  }
                  onClick={() => selected && onOpenTable(selected.id)}
                >
                  <TableProperties size={16} aria-hidden="true" />
                  Table details
                </button>
                <div className="er-zoom" role="group" aria-label="Diagram zoom">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Zoom out"
                    title="Zoom out"
                    disabled={zoom <= MIN_ZOOM}
                    onClick={() =>
                      setZoom((z) =>
                        Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)),
                      )
                    }
                  >
                    <ZoomOut size={16} aria-hidden="true" />
                  </button>
                  <span className="er-zoom-value" aria-live="polite">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Zoom in"
                    title="Zoom in"
                    disabled={zoom >= MAX_ZOOM}
                    onClick={() =>
                      setZoom((z) =>
                        Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)),
                      )
                    }
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
                </div>
              </div>
            </DiagramLegend>

            <div className="er-plot-wrap">
              <div className="er-plot" ref={plot}>
                <div
                  className="er-shell"
                  style={{
                    width: Math.max(layout.width * zoom, 1),
                    height: Math.max(layout.height * zoom, 1),
                  }}
                >
                  <div
                    className="er-board"
                    style={{
                      width: layout.width,
                      height: layout.height,
                      transform: `scale(${zoom})`,
                    }}
                  >
                    <svg
                      className="er-edges"
                      width={layout.width}
                      height={layout.height}
                      aria-hidden="true"
                    >
                      <defs>
                        <marker
                          id="er-head-confirmed"
                          viewBox="0 0 10 10"
                          refX="9.5"
                          markerUnits="userSpaceOnUse"
                          refY="5"
                          markerWidth="8"
                          markerHeight="8"
                          orient="auto-start-reverse"
                        >
                          <path d="M0 0 L10 5 L0 10 z" className="er-head" />
                        </marker>
                        <marker
                          id="er-head-inferred"
                          viewBox="0 0 10 10"
                          refX="9.5"
                          markerUnits="userSpaceOnUse"
                          refY="5"
                          markerWidth="8"
                          markerHeight="8"
                          orient="auto-start-reverse"
                        >
                          <path
                            d="M0 0 L10 5 L0 10 z"
                            className="er-head er-head-inferred"
                          />
                        </marker>
                      </defs>
                      {layout.edges.map(({ edge, path }) => {
                        const live = focusId ? touches(edge, focusId) : false;
                        const dim = focusId !== null && !live;
                        return (
                          <g key={edge.id}>
                            <path
                              d={path}
                              className={
                                'er-edge' +
                                (edge.confirmed ? '' : ' er-edge-inferred') +
                                (dim ? ' is-dim' : '') +
                                (live || edge.id === selectedEdgeId
                                  ? ' is-live'
                                  : '')
                              }
                              markerEnd={`url(#er-head-${edge.confirmed ? 'confirmed' : 'inferred'})`}
                            />
                            <path
                              d={path}
                              className="er-edge-hit"
                              onClick={() => setSelectedEdgeId(edge.id)}
                            />
                          </g>
                        );
                      })}
                    </svg>
                    {layout.cards.map((card) => {
                      const { table } = card;
                      const isSelected = selected?.id === table.id;
                      const dim =
                        (needle !== '' &&
                          !matches(table, needle) &&
                          !isSelected) ||
                        (focusId !== null &&
                          table.id !== focusId &&
                          !related.has(table.id));
                      return (
                        <div
                          key={table.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          aria-label={`${table.id}, ${plural(table.columnCount, 'column', 'columns')}`}
                          className={
                            'er-card' +
                            (isSelected ? ' is-selected' : '') +
                            (dim ? ' is-dim' : '') +
                            (ownIds.has(table.id) ? '' : ' is-outside')
                          }
                          style={{
                            left: card.x,
                            top: card.y,
                            width: card.width,
                            height: card.height,
                          }}
                          onClick={() => select(table.id)}
                          onDoubleClick={() => onOpenTable(table.id)}
                          onKeyDown={(event) => onCardKey(event, table.id)}
                          onMouseEnter={() => setHoveredId(table.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onFocus={() => setHoveredId(table.id)}
                          onBlur={() => setHoveredId(null)}
                        >
                          <div className="er-card-head">
                            <Table2 size={16} aria-hidden="true" />
                            <span>
                              <strong>{table.id}</strong>
                            </span>
                            <em>{plural(table.columnCount, 'col', 'cols')}</em>
                          </div>
                          <ul className="er-rows">
                            {card.columns.shown.map((c) => (
                              <li key={c.name}>
                                <span className="er-row-key">
                                  {c.pk && <KeyMark kind="pk" />}
                                  {c.fk && <KeyMark kind="fk" />}
                                </span>
                                <span className="er-row-name">{c.name}</span>
                                <span className="er-row-type">
                                  {c.dataType}
                                </span>
                              </li>
                            ))}
                            {card.columns.shown.length === 0 && (
                              <li className="er-row-empty">
                                {keysOnly
                                  ? 'No key columns'
                                  : 'No columns recorded'}
                              </li>
                            )}
                            {card.columns.hidden > 0 && (
                              <li className="er-row-more">
                                +
                                {plural(
                                  card.columns.hidden,
                                  'more column',
                                  'more columns',
                                )}
                              </li>
                            )}
                          </ul>
                        </div>
                      );
                    })}
                    {layout.edges.map(({ edge, lx, ly }) => {
                      const dim = focusId !== null && !touches(edge, focusId);
                      const short = cardinalityShort(edge.cardinality);
                      return (
                        <button
                          key={edge.id}
                          type="button"
                          className={
                            'er-edge-label' +
                            (edge.confirmed ? '' : ' er-edge-label-inferred') +
                            (dim ? ' is-dim' : '') +
                            (edge.id === selectedEdgeId ? ' is-selected' : '')
                          }
                          style={{ left: lx, top: ly }}
                          onClick={() => setSelectedEdgeId(edge.id)}
                        >
                          {edge.fromColumns.join(', ')}
                          {short && ` · ${short}`}
                          {!edge.confirmed && ' ✧'}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {shown.length === 0 && (
                  <p className="td-note">No tables match this filter.</p>
                )}
              </div>
              <p className="diagram-tip">
                <strong>Tip:</strong> Select a table to inspect its connections.
                Use search or zoom for larger schemas.
              </p>
            </div>
            {failed > 0 && (
              <p className="td-note">
                {plural(failed, 'table file', 'table files')} could not be read,
                so {failed === 1 ? 'its card shows' : 'their cards show'} no
                columns.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
