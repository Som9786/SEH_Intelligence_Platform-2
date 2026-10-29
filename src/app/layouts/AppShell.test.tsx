// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { tableFilterActions } from '../../features/table-details/state/tableFilterStore';

vi.mock('../../features/auth/useAuth', () => ({
  useAuth: () => ({ user: { username: 'Admin' }, signOut: vi.fn() }),
}));
vi.mock('../../shared/hooks/useCatalog', () => ({
  useCatalog: () => ({ missing: false }),
}));
vi.mock('../../features/table-details/components/TableFlyout', () => ({
  TableFlyout: () => <div data-testid="table-flyout" />,
}));

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  tableFilterActions.reset();
});

describe('AppShell sidebar', () => {
  it('groups the links into Platform and Capabilities', () => {
    renderAt('/');
    const links = (section: string) =>
      within(screen.getByRole('group', { name: section }))
        .getAllByRole('link')
        .map((link) => link.querySelector('.nav-text')?.textContent);
    expect(links('Platform')).toEqual([
      'Overview',
      'Insights Assistant',
      'DB Catalog',
      'Scheduled insights',
    ]);
    expect(links('Capabilities')).toEqual([
      'Basket Intelligence',
      'Fresh Food Forecasting',
      'Revenue Opportunities',
    ]);
  });

  it('marks the pages that are not built yet as coming soon', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const soon = within(nav)
      .getAllByRole('link')
      .filter((link) => link.classList.contains('is-soon'))
      .map((link) => link.querySelector('.nav-text')?.textContent);
    expect(soon).toEqual([
      'Scheduled insights',
      'Fresh Food Forecasting',
      'Revenue Opportunities',
    ]);
  });

  it('keeps DB Catalog selected on the pages opened from it', () => {
    renderAt('/table-details');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'DB Catalog' })).toHaveClass(
      'active',
    );
    const breadcrumb = screen.getByLabelText('Breadcrumb');
    expect(
      within(breadcrumb).getByRole('link', { name: 'DB Catalog' }),
    ).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByText('DB Tables')).toBeInTheDocument();
  });

  it('opens the table flyout when "/" is pressed outside a text field', () => {
    renderAt('/');
    expect(screen.queryByTestId('table-flyout')).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByTestId('table-flyout')).toBeInTheDocument();
  });
});
