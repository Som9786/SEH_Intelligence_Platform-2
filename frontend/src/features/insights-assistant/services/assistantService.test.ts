import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askAssistant,
  canRecommend,
  interleave,
  loadRecommendations,
  loadSuggestedQuestions,
  turnOf,
  type AssistantReply,
} from './assistantService';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('assistantService', () => {
  it('asks AI Hub through the gateway with the question and history', async () => {
    fetchMock.mockResolvedValue(
      json(200, { question: 'q', intent: 'unclear', service: null }),
    );
    await askAssistant('and by store?', [
      { question: 'Net sales each day?', intent: 'analytics', sql: 'SELECT 1' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ai/ask');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      question: 'and by store?',
      history: [
        {
          question: 'Net sales each day?',
          intent: 'analytics',
          sql: 'SELECT 1',
        },
      ],
    });
  });

  it("passes on the service's own error message", async () => {
    fetchMock.mockResolvedValue(
      json(503, { title: 'Neo4j is not reachable', detail: 'Start Neo4j.' }),
    );
    await expect(askAssistant('q', [])).rejects.toThrow('Start Neo4j.');
  });

  it('keeps what each service needs for its follow-ups', () => {
    const base = { question: 'q', reason: 'r', message: null };
    expect(
      turnOf({
        ...base,
        intent: 'analytics',
        service: 'analytics',
        result: { sql: 'SELECT 1' },
      } as AssistantReply),
    ).toEqual({ question: 'q', intent: 'analytics', sql: 'SELECT 1' });
    expect(
      turnOf({
        ...base,
        intent: 'db-catalog',
        service: 'db-catalog',
        result: { answer: 'Use `sales.Orders`.' },
      } as AssistantReply),
    ).toEqual({
      question: 'q',
      intent: 'db-catalog',
      answer: 'Use `sales.Orders`.',
    });
  });

  it('asks for recommendations with the rows, only for answers with rows', async () => {
    const rows = {
      columns: ['store'],
      rows: [{ store: 12 }, { store: 31 }],
      truncated: false,
    };
    const reply = (result: typeof rows) =>
      ({
        question: 'q',
        reason: 'r',
        message: null,
        board: 'none',
        intent: 'analytics',
        service: 'analytics',
        result: {
          sql: 'SELECT 1',
          answer: 'Store 12 leads.',
          explanation: 'e',
          result,
        },
      }) as unknown as AssistantReply;
    fetchMock.mockResolvedValue(
      json(200, {
        recommendations: [
          { action: 'a', why: 'w', owner: 'Merchandising', priority: 'high' },
        ],
        dataNote: 'Aug 22 is a partial day.',
      }),
    );
    expect(await loadRecommendations(reply(rows))).toEqual({
      recommendations: [
        { action: 'a', why: 'w', owner: 'Merchandising', priority: 'high' },
      ],
      dataNote: 'Aug 22 is a partial day.',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/analytics/recommend');
    expect(JSON.parse(init.body as string)).toEqual({
      question: 'q',
      sql: 'SELECT 1',
      answer: 'Store 12 leads.',
      result: rows,
    });
    // A single row (a total) has nothing to compare, so nothing is asked.
    const single = reply({ ...rows, rows: [{ store: 12 }] });
    expect(canRecommend(single)).toBe(false);
    expect(await loadRecommendations(single)).toEqual({
      recommendations: [],
      dataNote: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads both services’ suggestions, and copes with one being down', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('analytics/dataset')
          ? json(200, { name: 'POS baskets', suggestions: ['a1', 'a2'] })
          : json(503, { detail: 'down' }),
      ),
    );
    await expect(loadSuggestedQuestions()).resolves.toEqual({
      data: ['a1', 'a2'],
      structure: [],
    });
  });

  it('mixes both kinds of question', () => {
    expect(
      interleave({ data: ['a1', 'a2', 'a3'], structure: ['s1'] }, 4),
    ).toEqual(['a1', 's1', 'a2', 'a3']);
    expect(interleave({ data: ['a1'], structure: ['s1', 's2'] }, 2)).toEqual([
      'a1',
      's1',
    ]);
  });
});
