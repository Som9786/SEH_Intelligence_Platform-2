// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultVisual } from './ResultVisual';

afterEach(cleanup);

const daily = {
  columns: ['business_date', 'net_sales'],
  rows: Array.from({ length: 10 }, (_, i) => ({
    business_date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    net_sales: 100 + i,
  })),
  truncated: false,
};

describe('ResultVisual', () => {
  it('suggests a chart that suits the rows, and draws it when accepted', () => {
    const onChart = vi.fn();
    render(
      <ResultVisual
        result={daily}
        question="Daily net sales as a pie chart"
        onChart={onChart}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "I can't draw a pie chart for this answer: its values follow a sequence over time. Show it as a line chart instead?",
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, show line' }));
    expect(onChart).toHaveBeenCalledWith('line');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('figure')).toHaveTextContent(
      'Net sales by business date',
    );
  });

  it('draws only the chart asked for, or the one the rows suit, with no picker', () => {
    render(
      <ResultVisual
        result={daily}
        question="Daily net sales as an area chart"
      />,
    );
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('figure')).toHaveTextContent(
      'Net sales by business date',
    );
    cleanup();
    render(<ResultVisual result={daily} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
