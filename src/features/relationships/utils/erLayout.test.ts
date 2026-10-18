import { describe, expect, it } from 'vitest';
import type { GraphEdge } from '../../table-details/utils/relationshipGraph';
import { erSvg } from './erExport';
import { cardColumns, layoutEr, MAX_ROWS, type ErTable } from './erLayout';

const table = (id: string, columns: ErTable['columns'] = []): ErTable => ({
  id,
  name: id.split('.')[1],
  schema: 'dbo',
  description: null,
  descriptionInferred: false,
  rowCount: null,
  columnCount: columns.length,
  areas: [],
  columns,
});
const col = (name: string, pk = false, fk = false) => ({
  name,
  dataType: 'int',
  pk,
  fk,
});
const edge = (
  from: string,
  to: string,
  confirmed = true,
  id = `${from}>${to}`,
): GraphEdge => ({
  id,
  name: null,
  from,
  fromColumns: ['CustomerId'],
  to,
  toColumns: ['CustomerId'],
  cardinality: 'many-to-one',
  confirmed,
  meaning: null,
});

const customers = table('dbo.Customers', [col('CustomerId', true)]);
const orders = table('dbo.Orders', [
  col('OrderId', true),
  col('CustomerId', false, true),
  col('Total'),
]);
const items = table('dbo.OrderItems', [col('ItemId', true)]);
const lonely = table('dbo.Lonely', [col('Id', true)]);

describe('ER layout', () => {
  it('puts referencing tables to the left of the tables they reference', () => {
    const layout = layoutEr(
      [orders, customers, items],
      [
        edge('dbo.Orders', 'dbo.Customers'),
        edge('dbo.OrderItems', 'dbo.Orders'),
      ],
      false,
    );
    const x = (id: string) => layout.cards.find((c) => c.table.id === id)!.x;
    expect(x('dbo.OrderItems')).toBeLessThan(x('dbo.Orders'));
    expect(x('dbo.Orders')).toBeLessThan(x('dbo.Customers'));
    expect(layout.edges).toHaveLength(2);
  });

  it('places tables without relationships below the connected ones', () => {
    const layout = layoutEr(
      [orders, customers, lonely],
      [edge('dbo.Orders', 'dbo.Customers')],
      false,
    );
    const card = (id: string) => layout.cards.find((c) => c.table.id === id)!;
    expect(card('dbo.Lonely').y).toBeGreaterThan(
      card('dbo.Orders').y + card('dbo.Orders').height,
    );
  });

  it('survives cycles and self references', () => {
    const layout = layoutEr(
      [orders, customers],
      [
        edge('dbo.Orders', 'dbo.Customers'),
        edge('dbo.Customers', 'dbo.Orders', false),
        edge('dbo.Orders', 'dbo.Orders', true, 'self'),
      ],
      false,
    );
    expect(layout.cards).toHaveLength(2);
    expect(layout.edges).toHaveLength(3);
    expect(layout.width).toBeGreaterThan(0);
  });

  it('shows key columns first and only key columns in keys-only mode', () => {
    const wide = table(
      'dbo.Wide',
      ['A', 'B', 'C', 'D', 'E', 'F', 'G']
        .map((n) => col(n))
        .concat(col('K', false, true)),
    );
    const normal = cardColumns(wide, false);
    expect(normal.shown[0].name).toBe('K');
    expect(normal.shown).toHaveLength(MAX_ROWS);
    expect(normal.hidden).toBe(2);
    expect(cardColumns(wide, true).shown.map((c) => c.name)).toEqual(['K']);
  });
});

describe('ER export', () => {
  it('draws every card and connector into the SVG', () => {
    const svg = erSvg(
      layoutEr(
        [orders, customers],
        [edge('dbo.Orders', 'dbo.Customers')],
        false,
      ),
    );
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('dbo.Orders');
    expect((svg.match(/<path d="M \d/g) ?? []).length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
