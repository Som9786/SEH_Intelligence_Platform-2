// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerActions } from './AnswerActions';
import type { AssistantReply } from '../services/assistantService';

let features: string[] = [];
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ can: (feature: string) => features.includes(feature) }),
}));

const REPLY: AssistantReply = {
  question: 'Which 5 stores had the highest net sales?',
  intent: 'analytics',
  service: 'analytics',
  board: 'basket-intelligence',
  reason: 'Sales by store.',
  message: null,
  result: {
    question: 'Which 5 stores had the highest net sales?',
    answerable: true,
    sql: 'SELECT 1',
    explanation: '',
    result: {
      columns: ['store'],
      rows: [{ store: 'Store 12' }],
      truncated: false,
    },
    answer: 'Store 12 led.',
    costUsd: 0.001,
  },
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  features = ['scheduled-insights', 'basket-intelligence'];
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = (reply: AssistantReply) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AnswerActions reply={reply} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('AnswerActions', () => {
  it('offers the data behind the answer, to schedule the question and to add the answer to its board', () => {
    show(REPLY);
    expect(
      screen.getAllByRole('button').map((button) => button.textContent?.trim()),
    ).toEqual([
      'Data behind this',
      'Schedule this',
      'Add to Basket Intelligence',
    ]);
  });

  it('opens Data behind this with the reason, the rows (no chart) and query', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    show({
      ...REPLY,
      result: {
        ...REPLY.result,
        result: {
          columns: ['store', 'net_sales'],
          rows: [
            { store: 12, net_sales: 1520.5 },
            { store: 7, net_sales: 980 },
          ],
          truncated: false,
        },
      },
    } as AssistantReply);
    fireEvent.click(screen.getByRole('button', { name: 'Data behind this' }));
    const flyout = screen.getByRole('dialog');
    expect(flyout).toHaveTextContent('Why it was routed here');
    expect(flyout).toHaveTextContent('Sales by store.');
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(flyout).toHaveTextContent('Data returned');
    expect(screen.getByRole('table')).toHaveTextContent('1,520.5');
    expect(flyout).toHaveTextContent('SELECT 1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analytics/context');
  });

  it("leaves out what the user's roles don't include", () => {
    features = ['basket-intelligence'];
    show(REPLY);
    expect(
      screen.queryByRole('button', { name: 'Schedule this' }),
    ).not.toBeInTheDocument();
  });

  it('offers only the data behind answers about the database', () => {
    show({
      ...REPLY,
      intent: 'db-catalog',
      service: 'db-catalog',
      board: 'none',
      result: {
        question: 'q',
        answer: 'a',
        tables: [],
        sql: '',
        cached: false,
      },
    });
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Data behind this']);
  });

  it('adds the answer as a widget, then links to the board', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'w1', board: 'basket-intelligence' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    show(REPLY);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add to Basket Intelligence' }),
    );
    const link = await screen.findByRole('link', {
      name: /Added to Basket Intelligence/,
    });
    expect(link).toHaveAttribute('href', '/basket-intelligence');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/workspace/widgets');
    expect(JSON.parse(init.body as string)).toMatchObject({
      board: 'basket-intelligence',
      question: REPLY.question,
      answer: 'Store 12 led.',
    });
  });

  it('opens the schedule dialog and saves the schedule', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ schedule: {}, nextRunAt: null }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    show(REPLY);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule this' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Weekly · Mondays · 08:00',
    );
    fireEvent.click(screen.getByLabelText('Daily'));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /Scheduled · View/ }),
    ).toHaveAttribute('href', '/scheduled-insights');
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body).toMatchObject({
      question: REPLY.question,
      frequency: 'daily',
      time: '08:00',
      board: 'basket-intelligence',
      dayOfWeek: null,
    });
  });
});
