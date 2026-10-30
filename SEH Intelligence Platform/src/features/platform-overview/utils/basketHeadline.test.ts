import { describe, expect, it } from 'vitest';
import type { Widget } from '../../workspace/workspaceService';
import { headlineOf } from './basketHeadline';

const widget = (
  columns: string[],
  rows: Record<string, unknown>[],
  answer = 'Store 54297 leads. More text.',
): Widget => ({
  id: 'w',
  board: 'basket-intelligence',
  title: 'q',
  question: 'q',
  answer,
  result: { columns, rows, truncated: false },
  createdAt: '2026-10-30T08:00:00Z',
  fetchedAt: null,
});

describe('headlineOf', () => {
  it('shows what tops the result, with the answer’s first sentence', () => {
    expect(
      headlineOf(
        widget(
          ['store', 'net_sales'],
          [
            { store: 54280, net_sales: 261513.95 },
            { store: 54297, net_sales: 265122.03 },
          ],
        ),
      ),
    ).toEqual({
      value: '54297',
      valueLabel: 'highest net sales · 265.1K',
      detail: 'Store 54297 leads.',
    });
  });

  it('names weekdays and hours the way people say them', () => {
    expect(
      headlineOf(
        widget(
          ['day_of_week', 'hour_of_day', 'baskets'],
          [
            { day_of_week: 4, hour_of_day: 7, baskets: 5478 },
            { day_of_week: 1, hour_of_day: 3, baskets: 900 },
            { day_of_week: 2, hour_of_day: 9, baskets: 950 },
            { day_of_week: 3, hour_of_day: 8, baskets: 990 },
          ],
        ),
      ).value,
    ).toBe('Thu · 07:00');
  });

  it('shows a KPI’s own number', () => {
    expect(
      headlineOf(widget(['net_sales'], [{ net_sales: 8144077.28 }])),
    ).toMatchObject({ value: '8.1M', valueLabel: 'net sales' });
  });

  it('shows the latest point of a trend', () => {
    expect(
      headlineOf(
        widget(
          ['business_date', 'baskets'],
          [
            { business_date: '2026-08-21', baskets: 900 },
            { business_date: '2026-08-22', baskets: 500 },
          ],
        ),
      ),
    ).toMatchObject({ value: '500', valueLabel: 'baskets, 2026-08-22' });
  });
});
