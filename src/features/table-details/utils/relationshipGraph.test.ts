import { describe, expect, it } from 'vitest';
import { escapeLabel, generateRelationshipMermaid } from './mermaidGenerator';
import {
  buildRelationshipIndex,
  neighbourhood,
  type TableInput,
} from './relationshipGraph';

const link = (
  direction: 'incoming' | 'outgoing',
  relatedTable: string,
  columns: string[],
  relatedColumns: string[],
  evidence = 'confirmed',
  cardinality = direction === 'outgoing' ? 'many-to-one' : 'one-to-many',
) => ({
  direction,
  relatedTable,
  columns,
  relatedColumns,
  cardinality,
  evidence,
  meaning: null,
});

// Customers <- Orders -> Employees (twice: SalesRep and Approver), Orders -> Regions (inferred),
// Notes stands alone. Customers' own file does NOT list the incoming link from Orders.
const tables: TableInput[] = [
  { id: 'dbo.Customers', primaryKey: ['CustomerId'], relationships: [] },
  {
    id: 'dbo.Orders',
    primaryKey: ['OrderId'],
    relationships: [
      link('outgoing', 'dbo.Customers', ['CustomerId'], ['CustomerId']),
      link('outgoing', 'dbo.Employees', ['SalesRepId'], ['EmployeeId']),
      link('outgoing', 'dbo.Employees', ['ApproverId'], ['EmployeeId']),
      link('outgoing', 'dbo.Regions', ['RegionCode'], ['Code'], 'inferred'),
    ],
  },
  {
    id: 'dbo.Employees',
    primaryKey: ['EmployeeId'],
    // The same two links, seen from the referenced side: must not be counted twice.
    relationships: [
      link('incoming', 'dbo.Orders', ['EmployeeId'], ['SalesRepId']),
      link('incoming', 'dbo.Orders', ['EmployeeId'], ['ApproverId']),
    ],
  },
  { id: 'dbo.Regions', primaryKey: ['Code'], relationships: [] },
  { id: 'dbo.Notes', primaryKey: ['NoteId'], relationships: [] },
];

const global = [
  {
    name: 'FK_Orders_Customers',
    from: { table: 'dbo.Orders', columns: ['CustomerId'] },
    to: { table: 'dbo.Customers', columns: ['CustomerId'] },
    cardinality: 'many-to-one',
    evidence: 'confirmed',
    meaning: 'Each order belongs to one customer.',
  },
];

const index = buildRelationshipIndex(tables, global);

describe('relationship graph', () => {
  it('finds incoming links by scanning other tables (only incoming)', () => {
    const graph = neighbourhood(index, 'dbo.Customers', 'all');
    expect(graph.counts).toEqual({ all: 1, incoming: 1, outgoing: 0 });
    expect(graph.edges[0]).toMatchObject({
      from: 'dbo.Orders',
      to: 'dbo.Customers',
      name: 'FK_Orders_Customers',
      cardinality: 'many-to-one',
      meaning: 'Each order belongs to one customer.',
    });
  });

  it('handles a table with only outgoing links', () => {
    const graph = neighbourhood(index, 'dbo.Orders', 'all');
    expect(graph.counts).toEqual({ all: 4, incoming: 0, outgoing: 4 });
  });

  it('handles a table with both directions', () => {
    const both = buildRelationshipIndex([
      ...tables,
      {
        id: 'dbo.Lines',
        primaryKey: ['LineId'],
        relationships: [
          link('outgoing', 'dbo.Orders', ['OrderId'], ['OrderId']),
        ],
      },
    ]);
    const graph = neighbourhood(both, 'dbo.Orders', 'all');
    expect(graph.counts).toEqual({ all: 5, incoming: 1, outgoing: 4 });
    expect(
      neighbourhood(both, 'dbo.Orders', 'incoming')
        .tables.map((t) => t.id)
        .sort(),
    ).toEqual(['dbo.Lines', 'dbo.Orders']);
  });

  it('handles a table with no relationships', () => {
    const graph = neighbourhood(index, 'dbo.Notes', 'all');
    expect(graph.edges).toEqual([]);
    expect(graph.tables.map((t) => t.id)).toEqual(['dbo.Notes']);
  });

  it('keeps multiple links between the same two tables and removes duplicates', () => {
    const graph = neighbourhood(index, 'dbo.Employees', 'all');
    expect(graph.edges.map((e) => e.fromColumns[0]).sort()).toEqual([
      'ApproverId',
      'SalesRepId',
    ]);
    expect(graph.edges.every((e) => e.cardinality === 'many-to-one')).toBe(
      true,
    );
  });

  it('separates confirmed and inferred links', () => {
    const edges = neighbourhood(index, 'dbo.Orders', 'all').edges;
    expect(edges.filter((e) => !e.confirmed).map((e) => e.to)).toEqual([
      'dbo.Regions',
    ]);
  });

  it('filters by direction', () => {
    expect(neighbourhood(index, 'dbo.Customers', 'outgoing').edges).toEqual([]);
    expect(
      neighbourhood(index, 'dbo.Customers', 'incoming').edges,
    ).toHaveLength(1);
  });
});

describe('mermaid generator', () => {
  it('draws confirmed lines solid and inferred lines dashed, and highlights the selected table', () => {
    const { source, edges, nodes } = generateRelationshipMermaid(
      neighbourhood(index, 'dbo.Orders', 'all'),
      'light',
    );
    expect(source).toContain('flowchart LR');
    expect(edges.size).toBe(4);
    expect(nodes.size).toBe(4);
    const regionEdge = [...edges].find(([, e]) => e.to === 'dbo.Regions')![0];
    expect(source).toMatch(new RegExp(`n\\d+ ${regionEdge}@-\\.->`));
    expect(source).toContain('stroke-dasharray:6 4');
    expect(source).toMatch(/class n0 selected/);
    expect(source).toContain('· N:1');
  });

  it('escapes characters that would break Mermaid syntax', () => {
    expect(escapeLabel('a"b<c>d|e[f]&')).toBe(
      'a#quot;b#lt;c#gt;d#124;e#91;f#93;#amp;',
    );
    const odd = buildRelationshipIndex([
      {
        id: 'sales.Order "Lines"',
        primaryKey: ['Id'],
        relationships: [link('outgoing', 'sales.[Items]', ['Item|Id'], ['Id'])],
      },
    ]);
    const { source } = generateRelationshipMermaid(
      neighbourhood(odd, 'sales.Order "Lines"', 'all'),
      'dark',
    );
    expect(source).not.toMatch(/Order "Lines"/);
    expect(source).toContain('sales.Order #quot;Lines#quot;');
  });
});

describe('key badges in diagram node labels', () => {
  const nodeLines = (theme: 'light' | 'dark') =>
    generateRelationshipMermaid(
      neighbourhood(index, 'dbo.Orders', 'all'),
      theme,
    )
      .source.split('\n')
      .filter((line) => /^\s+n\d+\["/.test(line));

  it('shows a PK badge and an FK badge, each with the Lucide icon and hover text', () => {
    const lines = nodeLines('light');
    const orders = lines.find((l) => l.includes('dbo.Orders'))!;
    expect(orders).toContain('mm-key mm-key-pk');
    expect(orders).toContain('mm-key mm-key-fk');
    expect(orders.match(/<svg/g)).toHaveLength(2);
    expect(orders).toContain(
      "title='Primary key - Uniquely identifies each row in this table'",
    );
    expect(orders).toContain(
      "title='Foreign key - Links this column to a key in another table'",
    );
    // Customers is only referenced, so it has a PK line but no FK line
    const customers = lines.find((l) => l.includes('dbo.Customers'))!;
    expect(customers).toContain('mm-key-pk');
    expect(customers).not.toContain('mm-key-fk');
  });

  it('keeps labels free of characters that break Mermaid (a semicolon ends a statement)', () => {
    for (const line of nodeLines('light')) {
      const withoutEntityCodes = line.replace(/#(?:\d+|[a-z]+);/g, '');
      expect(withoutEntityCodes).not.toContain(';');
      expect(withoutEntityCodes).not.toMatch(/="[^"]*"[^"]*"/); // no stray double quotes inside the label
    }
  });

  it('colours the badges per theme in the diagram stylesheet', () => {
    const css = (theme: 'light' | 'dark') =>
      generateRelationshipMermaid(
        neighbourhood(index, 'dbo.Orders', 'all'),
        theme,
      ).source;
    expect(css('light')).toContain('#dcf3e5');
    expect(css('light')).toContain('#dbe9fb');
    expect(css('dark')).toContain('#1c3a2a');
    expect(css('dark')).toContain('#1b2c47');
    // icons must take the badge colour, not the node fill/stroke Mermaid applies to every shape
    expect(css('light')).toContain('span.mm-key svg path');
  });
});
