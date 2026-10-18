/**
 * Builds a database-wide relationship index from every table's metadata, then cuts out the
 * neighbourhood of one table. Edges always point from the referencing (child) table to the
 * referenced (parent) table, so the same link read from either end collapses to one edge.
 */
export type Cardinality =
  'many-to-one' | 'one-to-one' | 'one-to-many' | 'many-to-many' | 'unknown';
export type RelationshipFilter = 'all' | 'incoming' | 'outgoing';

/** One relationship as one table file describes it (direction is relative to that table). */
export interface TableLinkInput {
  direction: 'incoming' | 'outgoing';
  relatedTable: string;
  columns: string[];
  relatedColumns: string[];
  cardinality: string;
  evidence: string;
  meaning: string | null;
}

export interface TableInput {
  id: string;
  primaryKey: string[];
  relationships: TableLinkInput[];
}

/** A database-wide relationship entry (relationships.json), from child to parent. */
export interface GlobalLinkInput {
  name: string;
  from: { table: string; columns: string[] };
  to: { table: string; columns: string[] };
  cardinality: string;
  evidence: string;
  meaning: string | null;
}

export interface GraphEdge {
  id: string;
  name: string | null;
  from: string;
  fromColumns: string[];
  to: string;
  toColumns: string[];
  /** Read from `from` to `to`, e.g. many-to-one = many children per parent. */
  cardinality: Cardinality;
  confirmed: boolean;
  meaning: string | null;
}

export interface GraphTable {
  id: string;
  primaryKey: string[];
}

export interface RelationshipIndex {
  tables: Map<string, GraphTable>;
  edges: GraphEdge[];
  /** Edge positions per table id, so a neighbourhood lookup never scans the whole database. */
  byTable: Map<string, number[]>;
}

export interface Neighbourhood {
  /** The highlighted table; null for the whole-database view, where no table is selected. */
  tableId: string | null;
  tables: GraphTable[];
  edges: GraphEdge[];
  counts: { all: number; incoming: number; outgoing: number };
}

const CARDINALITIES: Cardinality[] = [
  'many-to-one',
  'one-to-one',
  'one-to-many',
  'many-to-many',
];

function toCardinality(value: string): Cardinality {
  const normalized = value.trim().toLowerCase() as Cardinality;
  return CARDINALITIES.includes(normalized) ? normalized : 'unknown';
}

function flip(value: Cardinality): Cardinality {
  return value === 'many-to-one'
    ? 'one-to-many'
    : value === 'one-to-many'
      ? 'many-to-one'
      : value;
}

const edgeKey = (
  from: string,
  fromColumns: string[],
  to: string,
  toColumns: string[],
) => `${from}|${fromColumns.join(',')}|${to}|${toColumns.join(',')}`;

export function buildRelationshipIndex(
  tables: TableInput[],
  globalLinks: GlobalLinkInput[] = [],
): RelationshipIndex {
  const edges = new Map<string, GraphEdge>();
  const add = (candidate: Omit<GraphEdge, 'id'>) => {
    if (!candidate.from || !candidate.to || !candidate.fromColumns.length)
      return;
    const key = edgeKey(
      candidate.from,
      candidate.fromColumns,
      candidate.to,
      candidate.toColumns,
    );
    const existing = edges.get(key);
    if (!existing) {
      edges.set(key, { ...candidate, id: key });
      return;
    }
    // The same link seen again (from the other table, or relationships.json): keep the strongest facts.
    existing.confirmed ||= candidate.confirmed;
    existing.name ??= candidate.name;
    existing.meaning ??= candidate.meaning;
    if (existing.cardinality === 'unknown')
      existing.cardinality = candidate.cardinality;
  };

  // Global entries first: their names and meanings are written from the child-to-parent view.
  for (const link of globalLinks)
    add({
      name: link.name || null,
      from: link.from.table,
      fromColumns: link.from.columns ?? [],
      to: link.to.table,
      toColumns: link.to.columns ?? [],
      cardinality: toCardinality(link.cardinality),
      confirmed: link.evidence === 'confirmed',
      meaning: link.meaning || null,
    });

  for (const table of tables)
    for (const link of table.relationships) {
      const outgoing = link.direction === 'outgoing';
      const cardinality = toCardinality(link.cardinality);
      add({
        name: null,
        from: outgoing ? table.id : link.relatedTable,
        fromColumns: outgoing ? link.columns : link.relatedColumns,
        to: outgoing ? link.relatedTable : table.id,
        toColumns: outgoing ? link.relatedColumns : link.columns,
        cardinality: outgoing ? cardinality : flip(cardinality),
        confirmed: link.evidence === 'confirmed',
        meaning: link.meaning || null,
      });
    }

  const tableMap = new Map(
    tables.map((t) => [t.id, { id: t.id, primaryKey: t.primaryKey }]),
  );
  const list = [...edges.values()];
  const byTable = new Map<string, number[]>();
  list.forEach((edge, index) => {
    for (const id of new Set([edge.from, edge.to]))
      byTable.set(id, [...(byTable.get(id) ?? []), index]);
    for (const id of [edge.from, edge.to])
      if (!tableMap.has(id)) tableMap.set(id, { id, primaryKey: [] });
  });
  return { tables: tableMap, edges: list, byTable };
}

/** The table plus its directly related tables, limited to the chosen direction. */
export function neighbourhood(
  index: RelationshipIndex,
  tableId: string,
  filter: RelationshipFilter,
): Neighbourhood {
  const direct = (index.byTable.get(tableId) ?? []).map((i) => index.edges[i]);
  const incoming = direct.filter((e) => e.to === tableId);
  const outgoing = direct.filter((e) => e.from === tableId);
  const edges =
    filter === 'incoming'
      ? incoming
      : filter === 'outgoing'
        ? outgoing
        : direct;
  const ids = new Set([tableId, ...edges.flatMap((e) => [e.from, e.to])]);
  return {
    tableId,
    tables: [...ids].map(
      (id) => index.tables.get(id) ?? { id, primaryKey: [] },
    ),
    edges,
    counts: {
      all: direct.length,
      incoming: incoming.length,
      outgoing: outgoing.length,
    },
  };
}

/** "N:1" style shorthand, read from the child (left) to the parent (right). */
export function cardinalityShort(value: Cardinality): string {
  return {
    'many-to-one': 'N:1',
    'one-to-one': '1:1',
    'one-to-many': '1:N',
    'many-to-many': 'N:N',
    unknown: '',
  }[value];
}

/** Plain-language cardinality, e.g. "Many dbo.Orders rows to one dbo.Customers row". */
export function cardinalityText(edge: GraphEdge): string {
  const [left, right] = {
    'many-to-one': ['Many', 'one'],
    'one-to-one': ['One', 'one'],
    'one-to-many': ['One', 'many'],
    'many-to-many': ['Many', 'many'],
    unknown: ['', ''],
  }[edge.cardinality];
  if (!left) return 'Cardinality not specified';
  return `${left} ${edge.from} ${left === 'One' ? 'row' : 'rows'} to ${right} ${edge.to} ${right === 'one' ? 'row' : 'rows'}`;
}

/** Every table that takes part in a relationship, with all relationships between them. */
export function databaseGraph(index: RelationshipIndex): Neighbourhood {
  const ids = new Set(index.edges.flatMap((e) => [e.from, e.to]));
  return {
    tableId: null,
    tables: [...ids].map(
      (id) => index.tables.get(id) ?? { id, primaryKey: [] },
    ),
    edges: index.edges,
    counts: { all: index.edges.length, incoming: 0, outgoing: 0 },
  };
}

/** Tables with no relationship in either direction, so they cannot appear in the diagram. */
export function unlinkedTables(index: RelationshipIndex): string[] {
  return [...index.tables.keys()].filter((id) => !index.byTable.has(id)).sort();
}
