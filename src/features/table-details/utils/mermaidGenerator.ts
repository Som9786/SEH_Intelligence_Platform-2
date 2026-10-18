import {
  cardinalityShort,
  type GraphEdge,
  type Neighbourhood,
} from './relationshipGraph';

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
  },
  dark: {
    selected: { fill: '#15a668', color: '#06130f', stroke: '#15a668' },
    related: { fill: '#1b2f29', color: '#e3efe9', stroke: '#3f6b5b' },
    confirmed: '#34c38a',
    inferred: '#f0a04b',
    label: '#10221d',
    labelText: '#e3efe9',
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

function edgeLabel(edge: GraphEdge): string {
  const pairs = `${edge.fromColumns.join(', ')} → ${edge.toColumns.join(', ')}`;
  const short = cardinalityShort(edge.cardinality);
  return short ? `${pairs} · ${short}` : pairs;
}

/** Mermaid flowchart (left to right): referencing tables point at the tables they reference. */
export function generateRelationshipMermaid(
  graph: Neighbourhood,
  theme: DiagramTheme,
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
      padding: 14,
    },
    // Edge labels ignore textColor, so their colours are set directly to stay readable in both themes.
    themeCSS: `.edgeLabel, .edgeLabel p, .edgeLabel span { color: ${colors.labelText} !important; background-color: ${colors.label} !important; } .labelBkg { background-color: ${colors.label} !important; }`,
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
    const label = [
      `<b>${escapeLabel(table.id)}</b>`,
      table.primaryKey.length
        ? `PK: ${escapeLabel(table.primaryKey.join(', '))}`
        : null,
      fks.length ? `FK: ${escapeLabel(fks.join(', '))}` : null,
    ]
      .filter(Boolean)
      .join('<br/>');
    lines.push(`    ${keys.get(table.id)}["${label}"]`);
  }

  const edges = new Map<string, GraphEdge>();
  const styles: string[] = [];
  graph.edges.forEach((edge, i) => {
    const id = `e${i}`;
    edges.set(id, edge);
    const arrow = edge.confirmed ? '-->' : '-.->';
    lines.push(
      `    ${keys.get(edge.from)} ${id}@${arrow}|"${escapeLabel(edgeLabel(edge))}"| ${keys.get(edge.to)}`,
    );
    styles.push(
      edge.confirmed
        ? `    linkStyle ${i} stroke:${colors.confirmed},stroke-width:2px`
        : `    linkStyle ${i} stroke:${colors.inferred},stroke-width:2px,stroke-dasharray:6 4`,
    );
  });

  const style = (c: { fill: string; color: string; stroke: string }) =>
    `fill:${c.fill},color:${c.color},stroke:${c.stroke},stroke-width:1.5px`;
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
