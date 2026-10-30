import { describe, expect, it } from 'vitest';
import {
  askedOf,
  chartOptions,
  chooseChart,
  requestedChart,
} from './chartChoice';
import { visualOf } from './visualOf';

type Row = Record<string, unknown>;
const result = (columns: string[], rows: Row[]) => ({
  columns,
  rows,
  truncated: false,
});

const departments = result(
  ['department', 'net_sales'],
  [
    { department: 'Grocery', net_sales: 300 },
    { department: 'Hot food', net_sales: 200 },
    { department: 'Drinks', net_sales: 100 },
  ],
);
const daily = result(
  ['business_date', 'net_sales'],
  Array.from({ length: 30 }, (_, i) => ({
    business_date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    net_sales: 100 + i,
  })),
);

describe('requestedChart', () => {
  it('reads the chart named in the question', () => {
    expect(requestedChart('Net sales by department as a pie chart')).toBe(
      'pie',
    );
    expect(requestedChart('Show daily sales as a line graph')).toBe('line');
    expect(requestedChart('Draw a stacked bar chart of sales by store')).toBe(
      'stacked',
    );
    expect(requestedChart('Sales by department, as a table')).toBe('table');
    expect(requestedChart('Chart the top stores')).toBe('chart');
  });

  it('reads charts named with a typo or run together', () => {
    expect(
      requestedChart(
        'Which 5 stores had the highest net sales? create a pia chart',
      ),
    ).toBe('pie');
    expect(requestedChart('sales by store as a piechart')).toBe('pie');
    expect(requestedChart('daily sales linegraph')).toBe('line');
    expect(requestedChart('top items in a barchart')).toBe('bars');
    expect(requestedChart('top items, colum chart')).toBe('columns');
    expect(requestedChart('draw a chrat of sales by day')).toBe('chart');
  });

  it("doesn't take business words for a chart", () => {
    expect(requestedChart('Net sales by area')).toBeNull();
    expect(requestedChart('Best product line last week')).toBeNull();
    expect(requestedChart('Top candy bar by units')).toBeNull();
    expect(requestedChart('Which table has the transactions?')).toBeNull();
  });
});

describe('chartOptions', () => {
  it('offers the charts that suit names and a number', () => {
    expect(chartOptions(visualOf(departments))).toEqual([
      'line',
      'columns',
      'bars',
      'pie',
      'table',
    ]);
  });

  it('offers lines and areas, not a pie, for values over dates', () => {
    const options = chartOptions(visualOf(daily));
    expect(options).toEqual(['line', 'area', 'columns', 'table']);
  });

  it('offers only figures or the table for one row', () => {
    expect(
      chartOptions(visualOf(result(['net_sales'], [{ net_sales: 1 }]))),
    ).toEqual(['kpi', 'table']);
  });
});

describe('chooseChart', () => {
  it('draws the chart the question asked for when it suits the rows', () => {
    expect(
      chooseChart(departments, { question: 'Sales by department as a pie' }),
    ).toMatchObject({ chart: 'pie', explicit: true, suggestion: null });
  });

  it('suggests another chart when the one asked for does not suit the rows', () => {
    const choice = chooseChart(daily, {
      question: 'Daily net sales as a pie chart',
    });
    expect(choice.chart).toBe('table');
    expect(choice.explicit).toBe(false);
    expect(choice.suggestion).toEqual({
      requested: 'pie',
      reason: 'its values follow a sequence over time',
      instead: 'line',
    });
  });

  it('says when no chart suits the rows', () => {
    const names = result(
      ['store'],
      [{ store: 'Kapolei' }, { store: 'Kailua' }],
    );
    expect(
      chooseChart(names, { question: 'Draw a chart of stores' }).suggestion,
    ).toMatchObject({ instead: null, reason: 'it has no numbers to plot' });
  });

  it("uses AI Hub's reading of the question over its own", () => {
    expect(
      chooseChart(departments, {
        question: 'Break sales by department into slices',
        asked: askedOf('pie'),
      }),
    ).toMatchObject({ chart: 'pie', explicit: true });
    // "none": no chart asked for, so the words aren't read again.
    expect(
      chooseChart(departments, { question: 'Sales by department', asked: null })
        .chart,
    ).toBe('bars');
    expect(askedOf('none')).toBeNull();
    expect(askedOf('chart')).toBe('chart');
  });

  it('keeps a pick over the question, unless the rows no longer suit it', () => {
    expect(
      chooseChart(departments, { question: 'as a pie', chosen: 'bars' }),
    ).toMatchObject({ chart: 'bars', explicit: true });
    expect(chooseChart(daily, { chosen: 'pie' })).toMatchObject({
      chart: 'line',
      explicit: false,
    });
  });
});
