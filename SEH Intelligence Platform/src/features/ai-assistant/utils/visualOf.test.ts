import { describe, expect, it } from 'vitest';
import { visualOf } from './visualOf';

const of = (columns: string[], rows: Record<string, unknown>[]) =>
  visualOf({ columns, rows, truncated: false });

describe('visualOf', () => {
  it('shows one number as a KPI, and one row of numbers as KPI tiles', () => {
    expect(of(['net_sales'], [{ net_sales: 2100000 }])).toMatchObject({
      kind: 'kpi',
      size: 'small',
    });
    expect(
      of(
        ['gross_sales', 'discounts', 'net_sales'],
        [{ gross_sales: 3, discounts: -1, net_sales: 2 }],
      ),
    ).toMatchObject({ kind: 'kpis', size: 'medium' });
  });

  it('shows numbers over dates as a line, oldest first', () => {
    const visual = of(
      ['business_date', 'net_sales'],
      [
        { business_date: '2026-08-17', net_sales: 2 },
        { business_date: '2026-08-16', net_sales: 1 },
      ],
    );
    expect(visual).toMatchObject({ kind: 'line', size: 'wide' });
    expect(visual.rows[0].business_date).toBe('2026-08-16');
  });

  it('shows weekdays and hours as columns in time order', () => {
    const days = of(
      ['day_of_week', 'baskets'],
      [
        { day_of_week: 'Sunday', baskets: 1 },
        { day_of_week: 'Monday', baskets: 2 },
      ],
    );
    expect(days.kind).toBe('columns');
    expect(days.rows.map((r) => r.day_of_week)).toEqual(['Monday', 'Sunday']);
    const isoDays = of(
      ['day_of_week', 'baskets'],
      [
        { day_of_week: 7, baskets: 1 },
        { day_of_week: 1, baskets: 2 },
      ],
    );
    expect(isoDays.kind).toBe('columns');
    expect(isoDays.rows.map((r) => r.day_of_week)).toEqual([1, 7]);
    const hours = of(
      ['hour', 'baskets'],
      [
        { hour: 13, baskets: 1 },
        { hour: 7, baskets: 2 },
      ],
    );
    expect(hours.kind).toBe('columns');
    expect(hours.dims).toEqual(['hour']);
    expect(hours.rows.map((r) => r.hour)).toEqual([7, 13]);
  });

  it('shows names and numbers as bars, a second number beside them', () => {
    expect(
      of(
        ['store', 'net_sales'],
        [
          { store: 1, net_sales: 5 },
          { store: 2, net_sales: 4 },
        ],
      ),
    ).toMatchObject({ kind: 'bars', dims: ['store'], measures: ['net_sales'] });
    expect(
      of(
        ['item', 'baskets', 'lift'],
        [
          { item: 'A', baskets: 5, lift: 2.1 },
          { item: 'B', baskets: 4, lift: 1.6 },
        ],
      ).kind,
    ).toBe('bars2');
  });

  it('shows a few shares as a share bar', () => {
    expect(
      of(
        ['line_type', 'share_pct'],
        [
          { line_type: 'REGULAR', share_pct: 80 },
          { line_type: 'PROMO', share_pct: 20 },
        ],
      ).kind,
    ).toBe('share');
  });

  it('shows two categories and a number as a heatmap', () => {
    const rows = [];
    for (const day of ['Monday', 'Tuesday'])
      for (const hour of [7, 8, 9]) rows.push({ day, hour, baskets: hour });
    expect(of(['day', 'hour', 'baskets'], rows)).toMatchObject({
      kind: 'heatmap',
      dims: ['day', 'hour'],
    });
  });

  it('falls back to a table', () => {
    expect(of(['a'], []).kind).toBe('table');
    expect(of(['item', 'desc'], [{ item: 'A', desc: 'x' }]).kind).toBe('table');
    const many = Array.from({ length: 20 }, (_, i) => ({
      item: `I${i}`,
      n: i,
    }));
    expect(of(['item', 'n'], many).kind).toBe('table');
  });
});
