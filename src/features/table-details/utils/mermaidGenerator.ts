import {
  cardinalityShort,
  type GraphEdge,
  type Neighbourhood,
} from './relationshipGraph';
import { KEY_KINDS, keyIconSvg } from './keyKinds';

export type DiagramTheme = 'light' | 'dark';

export interface RelationshipDiagramSource {
  source: string;
  /** Mermaid node key ("n0") -> table id. */
  nodes: Map<string, string>;
  /** Mermaid edge id ("e0") -> edge. */
  edges: Map<string, GraphEdge>;
}

const PALETTE = {
  light: {
    selected: { fill: '#10382f', color: '#ffffff', stroke: '#10382f' },
    related: { fill: '#f2f8f5', color: '#173b32', stroke: '#9dc7b5' },
    confirmed: '#08784e',
    inferred: '#c06a1a',
    label: '#ffffff',
    labelText: '#173b32',
    pk: { bg: '#dcf3e5', text: '#0f6a3c' },
    fk: { bg: '#dbe9fb', text: '#1d4f91' },
    pill: {
      border: '#c9e6d4',
      inferredBorder: '#f0c99c',
      inferredBg: '#fff1e2',
    },
    card: {
      bg: '#ffffff',
      border: '#d8e2dc',
      head: '#f1f6f3',
      rule: '#edf1ed',
      text: '#173b32',
      muted: '#5a6f64',
      accent: '#08784e',
      glow: 'rgba(8, 120, 78, 0.22)',
    },
  },
  dark: {
    selected: { fill: '#15a668', color: '#06130f', stroke: '#15a668' },
    related: { fill: '#23282d', color: '#e3e6e9', stroke: '#4f5961' },
    confirmed: '#34c38a',
    inferred: '#f0a04b',
    label: '#181b1f',
    labelText: '#e3e6e9',
    pk: { bg: '#1c3a2a', text: '#7fd8a6' },
    fk: { bg: '#1b2c47', text: '#9cc2f2' },
    pill: {
      border: '#2e4935',
      inferredBorder: '#6b4a24',
      inferredBg: '#3e2510',
    },
    card: {
      bg: '#181b1f',
      border: '#343b42',
      head: '#1e2227',
      rule: '#272c31',
      text: '#e3e6e9',
      muted: '#9aa1a8',
      accent: '#34c38a',
      glow: 'rgba(52, 195, 138, 0.28)',
    },
  },
} as const;

/**
 * Text inside a quoted Mermaid label. Entity codes keep quotes, angle brackets and other
 * characters from breaking the syntax; Mermaid decodes them when it draws the label.
 */
export function escapeLabel(value: string): string {
  return value
    .replace(/&/g, '#amp;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/[|[\]{}]/g, (c) => `#${c.charCodeAt(0)};`)
    .replace(/[\r\n]+/g, ' ');
}

/** What the card of a table shows beyond its name: the columns, counts and row count from the catalog. */
export interface NodeDetail {
  columnCount: number;
  rowCount: number | null;
  columns: { name: string; dataType: string; pk: boolean; fk: boolean }[];
}

// Lucide Table2, as SVG text (Mermaid labels cannot hold React components).
const TABLE_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18'/></svg>";

function badge(kind: 'pk' | 'fk'): string {
  const info = KEY_KINDS[kind];
  const tip = `${info.title} - ${info.definition.replace(/.$/, '')}`;
  return `<span class='mm-key mm-key-${kind}' title='${tip}'>${keyIconSvg(kind)} ${info.abbreviation}</span>`;
}

interface CardRow {
  name: string;
  dataType: string;
  pk: boolean;
  fk: boolean;
}

/**
 * One table as a card, like the ER explorer: a header (icon, name, column count) and a row per key
 * column with PK/FK badges and its type. Without catalog details
 * the key columns come from the relationships being drawn.
 */
function cardLabel(
  id: string,
  primaryKey: string[],
  foreignKeys: string[],
  detail: NodeDetail | undefined,
): string {
  const rows: CardRow[] = detail
    ? detail.columns.filter((c) => c.pk || c.fk)
    : [
        ...primaryKey.map((name) => ({
          name,
          dataType: '',
          pk: true,
          fk: foreignKeys.includes(name),
        })),
        ...foreignKeys
          .filter((name) => !primaryKey.includes(name))
          .map((name) => ({ name, dataType: '', pk: false, fk: true })),
      ];
  const cols = detail
    ? `${detail.columnCount} ${detail.columnCount === 1 ? 'col' : 'cols'}`
    : '';
  const body = rows.length
    ? rows
        .map(
          (r) =>
            `<div class='mm-row'><span class='mm-rowkey'>${r.pk ? badge('pk') : ''}${r.fk ? badge('fk') : ''}</span><span class='mm-name'>${escapeLabel(r.name)}</span><span class='mm-type'>${escapeLabel(r.dataType)}</span></div>`,
        )
        .join('')
    : "<div class='mm-row mm-empty'>No key columns</div>";
  return (
    `<div class='mm-card'><div class='mm-head'>${TABLE_ICON}<span class='mm-title'>${escapeLabel(id)}</span><span class='mm-cols'>${cols}</span></div>` +
    `${body}</div>`
  );
}

/** "CustomerId · N:1" in a box (orange with a sparkle when inferred), the same label the ER explorer shows. */
function edgeLabel(edge: GraphEdge): string {
  const short = cardinalityShort(edge.cardinality);
  const text = `${edge.fromColumns.join(', ')}${short ? ` · ${short}` : ''}${edge.confirmed ? '' : ' ✧'}`;
  return `<span class='mm-pill${edge.confirmed ? '' : ' mm-pill-inferred'}'>${escapeLabel(text)}</span>`;
}

/** The card, drawn in the diagram's own stylesheet because Mermaid mangles inline styles. */
function cardCss(c: {
  bg: string;
  border: string;
  head: string;
  rule: string;
  text: string;
  muted: string;
  accent: string;
  glow: string;
}): string {
  return [
    `.mm-card { box-sizing: border-box; width: 274px; overflow: hidden; border: 1px solid ${c.border}; border-radius: 12px; background: ${c.bg}; color: ${c.text}; text-align: left; font-size: 12px; line-height: 1.4; }`,
    `.node.selected .mm-card { border-color: ${c.accent}; box-shadow: 0 0 0 3px ${c.glow}; }`,
    `.mm-card * { text-align: left; }`,
    `.mm-head { display: flex; align-items: center; gap: 8px; height: 52px; padding: 0 14px; border-bottom: 1px solid ${c.border}; background: ${c.head}; box-sizing: border-box; }`,
    `.mm-head svg { flex: none; color: ${c.accent}; }`,
    `.mm-title { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; font-weight: 700; }`,
    `.mm-cols { flex: none; color: ${c.muted}; font-size: 11px; font-weight: 600; }`,
    `.mm-row { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 14px; border-bottom: 1px solid ${c.rule}; box-sizing: border-box; }`,
    `.mm-rowkey { flex: none; display: inline-flex; gap: 3px; min-width: 28px; }`,
    `.mm-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 700; }`,
    `.mm-type { flex: none; color: ${c.muted}; font-size: 11px; }`,
    `.mm-empty { color: ${c.muted}; font-size: 11px; }`,
    `.mm-card .mm-row:last-child { border-bottom: 0; }`,
    // Mermaid colours the text of a selected node and gives every svg shape the node fill and stroke,
    // so the card sets its own colours with more weight.
    `.node .mm-card, .node .mm-title, .node .mm-name { color: ${c.text} !important; }`,
    `.node .mm-cols, .node .mm-type, .node .mm-empty { color: ${c.muted} !important; }`,
    `.node .mm-head svg { color: ${c.accent} !important; }`,
    `.node .mm-head svg path { fill: none !important; stroke: currentColor !important; stroke-width: 2px !important; }`,
  ].join(' ');
}

/** Mermaid flowchart (left to right): referencing tables point at the tables they reference. */
export function generateRelationshipMermaid(
  graph: Neighbourhood,
  theme: DiagramTheme,
  details: ReadonlyMap<string, NodeDetail> = new Map(),
): RelationshipDiagramSource {
  const colors = PALETTE[theme];
  const keys = new Map<string, string>();
  const nodes = new Map<string, string>();
  graph.tables.forEach((table, i) => {
    keys.set(table.id, `n${i}`);
    nodes.set(`n${i}`, table.id);
  });

  const config = {
    theme: 'base',
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
      curve: 'basis',
      nodeSpacing: 36,
      rankSpacing: 110,
      padding: 0,
      wrappingWidth: 340,
    },
    // Edge labels ignore textColor, so their colours are set directly to stay readable in both themes.
    // The .mm-key rules style the PK/FK badges inside node labels. Mermaid keeps classes but mangles
    // inline style attributes, so the colours live here, in the diagram's own stylesheet (which also
    // travels with a downloaded image).
    themeCSS: `.edgeLabel, .edgeLabel p, .edgeLabel span { color: ${colors.labelText} !important; background-color: ${colors.label} !important; } .labelBkg { background-color: transparent !important; } .edgeLabel p { margin: 0 !important; } span.mm-pill { display: inline-block; padding: 3px 8px; border: 1px solid ${colors.pill.border}; border-radius: 7px; background-color: ${colors.label} !important; color: ${colors.confirmed} !important; font-size: 11px; font-weight: 700; line-height: 1.4; white-space: nowrap; } span.mm-pill.mm-pill-inferred { border-color: ${colors.pill.inferredBorder}; background-color: ${colors.pill.inferredBg} !important; color: ${colors.inferred} !important; } .mm-key { display: inline-flex; align-items: center; gap: 3px; margin-right: 4px; padding: 0 6px 0 4px; border-radius: 999px; font-size: 11px; font-weight: 700; line-height: 1.5; vertical-align: middle; } .mm-key svg { flex: none; } span.mm-key svg path, span.mm-key svg line { fill: none !important; stroke: currentColor !important; stroke-width: 2.4px !important; } span.mm-key svg circle { fill: currentColor !important; stroke: currentColor !important; stroke-width: 2.4px !important; } span.mm-key.mm-key-pk { background: ${colors.pk.bg} !important; color: ${colors.pk.text} !important; } span.mm-key.mm-key-fk { background: ${colors.fk.bg} !important; color: ${colors.fk.text} !important; } ${cardCss(colors.card)}`,
    themeVariables: {
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: '13px',
      edgeLabelBackground: colors.label,
      lineColor: colors.confirmed,
      textColor: colors.labelText,
    },
  };
  const lines = [`%%{init: ${JSON.stringify(config)}}%%`, 'flowchart LR'];

  for (const table of graph.tables) {
    // Foreign keys worth showing on a node are the ones it uses in the drawn relationships.
    const fks = [
      ...new Set(
        graph.edges
          .filter((e) => e.from === table.id)
          .flatMap((e) => e.fromColumns),
      ),
    ];
    const label = cardLabel(
      table.id,
      table.primaryKey,
      fks,
      details.get(table.id),
    );
    lines.push(`    ${keys.get(table.id)}["${label}"]`);
  }

  const edges = new Map<string, GraphEdge>();
  const styles: string[] = [];
  graph.edges.forEach((edge, i) => {
    const id = `e${i}`;
    edges.set(id, edge);
    const arrow = edge.confirmed ? '-->' : '-.->';
    lines.push(
      `    ${keys.get(edge.from)} ${id}@${arrow}|"${edgeLabel(edge)}"| ${keys.get(edge.to)}`,
    );
    styles.push(
      edge.confirmed
        ? `    linkStyle ${i} stroke:${colors.confirmed},stroke-width:2px`
        : `    linkStyle ${i} stroke:${colors.inferred},stroke-width:2px,stroke-dasharray:6 4`,
    );
  });

  // The HTML card draws the border and fill; the node shape behind it stays invisible.
  const style = (c: { color: string }) =>
    `fill:none,color:${c.color},stroke:none,stroke-width:0px`;
  lines.push(...styles);
  lines.push(`    classDef selected ${style(colors.selected)}`);
  lines.push(`    classDef related ${style(colors.related)}`);
  if (graph.tableId !== null)
    lines.push(`    class ${keys.get(graph.tableId)} selected`);
  const related = graph.tables
    .filter((t) => t.id !== graph.tableId)
    .map((t) => keys.get(t.id));
  if (related.length) lines.push(`    class ${related.join(',')} related`);

  return { source: lines.join('\n') + '\n', nodes, edges };
}
