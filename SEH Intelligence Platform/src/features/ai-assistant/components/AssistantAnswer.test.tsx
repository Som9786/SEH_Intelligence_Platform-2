// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantAnswer } from './AssistantAnswer';
import type { AssistantReply } from '../services/assistantService';

afterEach(cleanup);

describe('AssistantAnswer', () => {
  it('shows where an Analytics answer came from, the answer, how it was reached and the confidence', () => {
    render(
      <AssistantAnswer
        reply={{
          question: 'Top stores?',
          intent: 'analytics',
          service: 'analytics',
          board: 'basket-intelligence',
          reason: 'Asks for sales figures by store.',
          message: null,
          result: {
            question: 'Top stores?',
            answerable: true,
            sql: 'SELECT store, net_sales FROM ...',
            explanation: 'Returns the stores by net sales',
            result: {
              columns: ['store', 'net_sales'],
              rows: [
                { store: 12, net_sales: 1520.5 },
                { store: 7, net_sales: 980 },
              ],
              truncated: false,
            },
            answer: '**Store 12** sold the most.',
            costUsd: 0.0123,
            knowledgeModel: ['Store', 'Net sales'],
          },
        }}
      />,
    );
    expect(screen.getByText('Routed to · Basket Analysis')).toBeInTheDocument();
    expect(
      screen.getByText('Store 12', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(screen.getByText('How I reached this')).toBeInTheDocument();
    expect(
      screen.getByText('Returns the stores by net sales.'),
    ).toBeInTheDocument();
    expect(screen.getByText('High confidence')).toBeInTheDocument();
    expect(screen.getByRole('figure')).toHaveTextContent('Net sales by store');
    // With bars, the rows table and the reason are in Data behind this.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Asks for sales figures by store.'),
    ).not.toBeInTheDocument();
  });

  it('shows the rows as a table when they suit no chart', () => {
    render(
      <AssistantAnswer
        reply={{
          question: 'Bought with SPAM Musubi?',
          intent: 'analytics',
          service: 'analytics',
          board: 'basket-intelligence',
          reason: 'r',
          message: null,
          result: {
            question: 'Bought with SPAM Musubi?',
            answerable: true,
            sql: 'SELECT ...',
            explanation: '',
            result: {
              columns: ['item', 'lift', 'baskets', 'units'],
              rows: [
                {
                  item: 'SPAM Katsu Musubi',
                  lift: 2.5,
                  baskets: 1320,
                  units: 1800,
                },
                {
                  item: 'Spicy Ahi Nori Roll',
                  lift: 2.15,
                  baskets: 410,
                  units: 520,
                },
              ],
              truncated: false,
            },
            answer: 'SPAM Katsu Musubi pairs most often.',
            costUsd: 0,
          },
        }}
      />,
    );
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Spicy Ahi Nori Roll');
  });

  it('says why when the data cannot answer', () => {
    render(
      <AssistantAnswer
        reply={{
          question: 'Weather?',
          intent: 'analytics',
          service: 'analytics',
          board: 'basket-intelligence',
          reason: 'r',
          message: null,
          result: {
            question: 'Weather?',
            answerable: false,
            sql: '',
            explanation: 'The data has no weather.',
            result: null,
            answer: null,
            costUsd: 0,
          },
        }}
      />,
    );
    expect(screen.getByText('The data has no weather.')).toBeInTheDocument();
    expect(screen.queryByText(/confidence/)).not.toBeInTheDocument();
  });

  it('shows how a DB Guide answer found its tables', () => {
    render(
      <AssistantAnswer
        reply={{
          question: 'Where are prices?',
          intent: 'db-guide',
          service: 'db-guide',
          board: 'none',
          reason: 'About where data is stored.',
          message: null,
          result: {
            question: 'Where are prices?',
            answer: 'Prices are in `inventory.Products`.',
            tables: ['inventory.Products'],
            sql: 'SELECT TOP 10 * FROM inventory.Products',
            cached: false,
            matched: [
              {
                table: 'inventory.Products',
                why: '"price" names column UnitPrice',
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText('Routed to · DB Copilot')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Matched inventory.Products: "price" names column UnitPrice.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('High confidence')).toBeInTheDocument();
  });

  it('shows what to ask instead for an unclear question', () => {
    const reply: AssistantReply = {
      question: 'hello',
      intent: 'unclear',
      service: null,
      board: 'none',
      result: null,
      reason: 'A greeting.',
      message: 'A greeting. I can answer questions about the sales data.',
    };
    render(<AssistantAnswer reply={reply} />);
    expect(
      screen.getByText(
        'A greeting. I can answer questions about the sales data.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Routed to/)).not.toBeInTheDocument();
  });
});
