import { describe, expect, it } from 'vitest';
import {
  asAnalyticsResult,
  csvFileName,
  shareSummary,
  toCsv,
  type Insight,
} from './insight';

const insight: Insight = {
  board: 'basket-intelligence',
  title: 'Which items sell with SPAM Musubi?',
  question: 'Which items sell with SPAM Musubi?',
  answer: '**Bag Fee** leads, with a lift of 2.14.',
  result: {
    columns: ['item', 'baskets'],
    rows: [
      { item: 'Bag Fee', baskets: 6413 },
      { item: 'Tea, "green"', baskets: 2839 },
    ],
    truncated: false,
  },
  details: {
    sql: 'select 1',
    explanation: 'Counts baskets',
    knowledgeModel: ['Basket'],
    corrected: null,
  },
  fetchedAt: '2026-10-30T08:46:00Z',
};

describe('toCsv', () => {
  it('writes a header and one line per row, quoting commas and quotes', () => {
    expect(toCsv(insight.result!)).toBe(
      'item,baskets\r\nBag Fee,6413\r\n"Tea, ""green""",2839',
    );
  });
});

describe('csvFileName', () => {
  it('makes a file name from the title', () => {
    expect(csvFileName(insight.title)).toBe(
      'which-items-sell-with-spam-musubi.csv',
    );
    expect(csvFileName('???')).toBe('insight.csv');
  });
});

describe('shareSummary', () => {
  it('has the title, the answer as plain text, the rows and the link', () => {
    const text = shareSummary(insight, 'https://seh/share/abc');
    expect(text).toContain('Which items sell with SPAM Musubi?');
    expect(text).toContain('Bag Fee leads, with a lift of 2.14.');
    expect(text).toContain('2 rows');
    expect(text).toContain('https://seh/share/abc');
  });
});

describe('asAnalyticsResult', () => {
  it('carries the kept details, and treats missing ones as not recorded', () => {
    expect(asAnalyticsResult(insight)).toMatchObject({
      sql: 'select 1',
      knowledgeModel: ['Basket'],
      corrected: false,
    });
    expect(asAnalyticsResult({ ...insight, details: null })).toMatchObject({
      sql: '',
      explanation: '',
      knowledgeModel: null,
    });
  });
});
