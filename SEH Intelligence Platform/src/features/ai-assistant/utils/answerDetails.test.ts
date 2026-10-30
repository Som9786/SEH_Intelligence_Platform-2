import { describe, expect, it } from 'vitest';
import type {
  AnalyticsResult,
  DbGuideResult,
} from '../services/assistantService';
import {
  analyticsDetails,
  coverageOf,
  dbGuideDetails,
  listOf,
} from './answerDetails';

const analytics = (over: Partial<AnalyticsResult> = {}): AnalyticsResult => ({
  question: 'Top stores?',
  answerable: true,
  sql: 'SELECT 1',
  explanation: 'Returns the top stores by net sales',
  result: { columns: ['store'], rows: [{ store: 1 }], truncated: false },
  answer: 'Store 1.',
  costUsd: 0,
  knowledgeModel: ['Store', 'Net sales'],
  ...over,
});

const dbGuide = (over: Partial<DbGuideResult> = {}): DbGuideResult => ({
  question: 'Prices?',
  answer: 'In inventory.Products.',
  tables: ['inventory.Products'],
  sql: 'SELECT 1',
  cached: false,
  ...over,
});

const join = (enforced: boolean, evidence: string) => ({
  from: 'sales.OrderItems',
  to: 'inventory.Products',
  on: 'a = b',
  meaning: 'm',
  cardinality: 'many-to-one',
  enforced,
  evidence,
});

describe('analyticsDetails', () => {
  it('lists the steps and trusts a query that ran first time', () => {
    const details = analyticsDetails(analytics())!;
    expect(details.steps).toEqual([
      'Matched the question to Store and Net sales in the knowledge model.',
      'Returns the top stores by net sales.',
      'Ran it on the POS basket data: 1 row.',
      'Summarised the rows in plain English.',
    ]);
    expect(details.confidence.level).toBe('High');
    expect(details.dataUsed).toEqual(['Store', 'Net sales']);
  });

  it('is less sure of a corrected or cut-off query, and unsure of no rows', () => {
    expect(
      analyticsDetails(analytics({ corrected: true }))!.confidence.level,
    ).toBe('Medium');
    expect(
      analyticsDetails(
        analytics({
          result: { columns: ['a'], rows: [{ a: 1 }], truncated: true },
        }),
      )!.confidence.level,
    ).toBe('Medium');
    expect(
      analyticsDetails(
        analytics({ result: { columns: ['a'], rows: [], truncated: false } }),
      )!.confidence.level,
    ).toBe('Low');
  });

  it('has none when the data cannot answer', () => {
    expect(
      analyticsDetails(analytics({ answerable: false, result: null })),
    ).toBeNull();
  });
});

describe('dbGuideDetails', () => {
  it('explains the matched tables and joins', () => {
    const details = dbGuideDetails(
      dbGuide({
        matched: [
          { table: 'inventory.Products', why: '"price" names UnitPrice' },
        ],
        joinPaths: [
          {
            from: 'inventory.Products',
            to: 'sales.OrderItems',
            steps: [join(true, 'confirmed')],
          },
        ],
      }),
    );
    expect(details.steps).toEqual([
      'Matched inventory.Products: "price" names UnitPrice.',
      'Found how inventory.Products joins sales.OrderItems.',
      'Wrote an example query (not run).',
    ]);
    expect(details.confidence.level).toBe('High');
  });

  it('is less sure of an inferred join, and unsure with no table', () => {
    expect(
      dbGuideDetails(
        dbGuide({
          joinPaths: [{ from: 'a', to: 'b', steps: [join(false, 'inferred')] }],
        }),
      ).confidence.level,
    ).toBe('Medium');
    expect(dbGuideDetails(dbGuide({ tables: [] })).confidence.level).toBe(
      'Low',
    );
  });
});

describe('helpers', () => {
  it('joins a list in English', () => {
    expect(listOf(['A'])).toBe('A');
    expect(listOf(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('describes a date range', () => {
    expect(coverageOf({ from: '2026-08-16', to: '2026-08-22' })).toEqual({
      label: '16 Aug – 22 Aug 2026',
      days: 7,
    });
  });
});
