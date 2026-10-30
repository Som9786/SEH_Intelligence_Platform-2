// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableFlyout } from './TableFlyout';
import { tableFilterActions, useTableFilter } from '../state/tableFilterStore';

vi.mock('../hooks/useTableList', () => ({
  useTableList: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    total: 2,
    hasNextPage: false,
    tables: [
      {
        id: 'sales.Orders',
        schemaName: 'sales',
        name: 'Orders',
        columnCount: 5,
        areas: [],
      },
      {
        id: 'hr.Employees',
        schemaName: 'hr',
        name: 'Employees',
        columnCount: 4,
        areas: [],
      },
    ],
  }),
}));
vi.mock('./ReviewDot', () => ({ ReviewDot: () => null }));

function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname + location.search}
    </output>
  );
}
function Query() {
  return <output data-testid="query">{useTableFilter().query}</output>;
}

function renderFlyout(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <button type="button">Opener</button>
      <TableFlyout onClose={onClose} />
      <Location />
      <Query />
    </MemoryRouter>,
  );
  return onClose;
}

afterEach(() => {
  cleanup();
  tableFilterActions.reset();
});

describe('TableFlyout', () => {
  it('opens with the search box focused', () => {
    renderFlyout();
    expect(
      screen.getByRole('searchbox', { name: 'Filter database tables' }),
    ).toHaveFocus();
  });

  it('stores what is typed as the shared table filter', () => {
    renderFlyout();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ord' },
    });
    expect(screen.getByTestId('query')).toHaveTextContent('ord');
  });

  it('closes on Escape and on the close button', () => {
    const onClose = renderFlyout();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close table filter' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside the panel', () => {
    renderFlyout();
    const dialog = screen.getByRole('dialog', { name: 'Database Tables' });
    const close = screen.getByRole('button', { name: 'Close table filter' });
    const buttons = within(dialog).getAllByRole('button');
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('opens the chosen table and closes', () => {
    const onClose = renderFlyout();
    fireEvent.click(screen.getByRole('button', { name: /sales\.Orders/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/db-catalog/tables?table=sales.Orders',
    );
    expect(onClose).toHaveBeenCalled();
  });
});
