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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Recommendations } from './Recommendations';
import type { AssistantReply } from '../services/assistantService';

const REPLY: AssistantReply = {
  question: 'Which 10 stores have the lowest average basket value?',
  intent: 'analytics',
  service: 'analytics',
  board: 'basket-intelligence',
  reason: 'Baskets by store.',
  message: null,
  result: {
    question: 'Which 10 stores have the lowest average basket value?',
    answerable: true,
    sql: 'SELECT 1',
    explanation: '',
    result: {
      columns: ['store', 'avg_basket'],
      rows: [
        { store: 12, avg_basket: 8.1 },
        { store: 31, avg_basket: 9.4 },
      ],
      truncated: false,
    },
    answer: 'Store 12 is lowest.',
    costUsd: 0.001,
  },
};

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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(reply: AssistantReply = REPLY) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Recommendations reply={reply} />
    </QueryClientProvider>,
  );
}

describe('Recommendations', () => {
  it('shows that it is working, then the actions and the data note', async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (answer = r)));
    show();
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Finding recommended actions',
    );
    expect(screen.getByText('Comparing with the chain average…')).toBeVisible();

    answer(
      json(200, {
        recommendations: [
          {
            action: 'Put SPAM Musubi next to green tea at store 12',
            why: '9% vs 22% chain-wide',
            owner: 'Merchandising',
            priority: 'high',
          },
        ],
        dataNote: 'Aug 22 is a partial day.',
      }),
    );
    expect(
      await screen.findByText('Put SPAM Musubi next to green tea at store 12'),
    ).toBeVisible();
    expect(screen.getByText('Aug 22 is a partial day.')).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so when nothing calls for an action', async () => {
    fetchMock.mockResolvedValue(
      json(200, { recommendations: [], dataNote: null }),
    );
    show();
    expect(await screen.findByText(/No clear actions/)).toBeVisible();
  });

  it('offers to try again when the call fails', async () => {
    fetchMock.mockResolvedValueOnce(json(502, { detail: 'down' }));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('shows nothing for an answer with a single row', () => {
    const single = {
      ...REPLY,
      result: {
        ...REPLY.result,
        result: { columns: ['total'], rows: [{ total: 1 }], truncated: false },
      },
    } as AssistantReply;
    const { container } = show(single);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
