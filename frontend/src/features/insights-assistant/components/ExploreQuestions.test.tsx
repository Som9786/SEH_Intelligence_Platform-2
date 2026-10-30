// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExploreQuestions } from './ExploreQuestions';

afterEach(cleanup);

const QUESTIONS = {
  data: ['Which 5 stores had the highest net sales?', 'Busiest hour?'],
  structure: ['How do I join order items to products?'],
};

describe('ExploreQuestions', () => {
  it('lists the questions by service, filters them, and asks the one picked', () => {
    const onAsk = vi.fn();
    const onClose = vi.fn();
    render(
      <ExploreQuestions
        questions={QUESTIONS}
        disabled={false}
        onAsk={onAsk}
        onClose={onClose}
      />,
    );
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText(/Basket Analysis/)).toBeInTheDocument();
    expect(within(panel).getByText(/DB Copilot/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter questions'), {
      target: { value: 'join' },
    });
    expect(screen.queryByText('Busiest hour?')).not.toBeInTheDocument();
    expect(screen.queryByText(/Basket Analysis/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'How do I join order items to products?',
      }),
    );
    expect(onAsk).toHaveBeenCalledWith(
      'How do I join order items to products?',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('says when nothing matches', () => {
    render(
      <ExploreQuestions
        questions={QUESTIONS}
        disabled={false}
        onAsk={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Filter questions'), {
      target: { value: 'weather' },
    });
    expect(screen.getByText(/No question matches/)).toBeInTheDocument();
  });
});
