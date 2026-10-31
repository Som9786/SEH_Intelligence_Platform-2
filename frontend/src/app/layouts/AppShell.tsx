import { Suspense, useEffect, useState } from 'react';
import {
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../../features/auth/useAuth';
import { BrandLogo } from '../../shared/components/BrandLogo';
import { ErrorBoundary } from '../../shared/components/ErrorBoundary';
import { useTheme } from '../../shared/hooks/useTheme';
import { matchPath, NavLink, Outlet, useLocation } from 'react-router';
import { PageLoading } from '../../shared/components/PageLoading';
import { navSections, routes } from '../router/routes';
import { TableFlyout } from '../../features/db-catalog/table-details/components/TableFlyout';
import {
  tableFilterActions,
  useTableFilter,
} from '../../features/db-catalog/table-details/state/tableFilterStore';
import { useQueryClient } from '@tanstack/react-query';
import { useCatalog } from '../../shared/hooks/useCatalog';
import { CatalogMissingState } from '../../features/db-catalog/components/CatalogMissingState';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function AppShell() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, signOut, can } = useAuth();
  const queryClient = useQueryClient();
  // The table search ("/" and the flyout) belongs to DB Catalog.
  const hasCatalog = can('db-catalog');
  // With no catalog published, every page would fail on its own; show one message instead.
  const { missing: catalogMissing } = useCatalog({ enabled: hasCatalog });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { flyoutOpen } = useTableFilter();
  const closeTables = () => tableFilterActions.setFlyoutOpen(false);
  const location = useLocation();
  useEffect(() => {
    setMobileOpen(false);
    tableFilterActions.setFlyoutOpen(false);
  }, [location.pathname]);
  // Press "/" anywhere to open the table flyout with its search ready.
  useEffect(() => {
    if (catalogMissing || !hasCatalog) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      )
        return;
      event.preventDefault();
      tableFilterActions.setFlyoutOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [catalogMissing, hasCatalog]);
  // Paths with an id (/basket-intelligence/insight/:id) match by pattern.
  const currentRoute = routes.find((route) =>
    matchPath(route.path, location.pathname),
  );
  const current = currentRoute?.label ?? 'Overview';
  // A page opened from DB Catalog keeps DB Catalog selected and shows it in the breadcrumb.
  const parentPath =
    currentRoute && 'parent' in currentRoute ? currentRoute.parent : null;
  const parent = routes.find((route) => route.path === parentPath);

  return (
    <div className={'app-shell' + (collapsed ? ' is-collapsed' : '')}>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={'sidebar' + (mobileOpen ? ' mobile-open' : '')}
        aria-label="Primary navigation"
      >
        <div className="sidebar-head">
          <BrandLogo size={40} />
          <div className="brand-copy">
            <strong>SEH Intelligence Platform</strong>
          </div>
          <button
            className="mobile-close icon-button"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="brand-stripe">
          <span />
          <span />
          <span />
        </div>
        <nav className="nav-list" aria-label="Main">
          {navSections
            // A section none of whose pages the user has isn't shown at all.
            .filter((section) =>
              routes.some(
                (route) => route.section === section.key && can(route.feature),
              ),
            )
            .map((section) => (
              <div
                className="nav-section"
                key={section.key}
                role="group"
                aria-labelledby={`nav-section-${section.key}`}
              >
                <p
                  className="nav-section-label"
                  id={`nav-section-${section.key}`}
                >
                  {section.label}
                </p>
                {routes
                  .filter(
                    (route) =>
                      route.section === section.key && can(route.feature),
                  )
                  .map((route) => {
                    const { path, label, icon: Icon } = route;
                    return (
                      <NavLink
                        key={path}
                        to={path}
                        end
                        title={collapsed ? label : undefined}
                        className={({ isActive }) =>
                          'nav-link' +
                          ('badge' in route ? ' is-soon' : '') +
                          (isActive || path === parentPath ? ' active' : '')
                        }
                      >
                        {'number' in route ? (
                          <span className="nav-number" aria-hidden="true">
                            {route.number}
                          </span>
                        ) : (
                          <Icon size={20} aria-hidden="true" />
                        )}
                        <span className="nav-text">{label}</span>
                        {'badge' in route && (
                          <span className="nav-soon">{route.badge}</span>
                        )}
                      </NavLink>
                    );
                  })}
              </div>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="collapse-button"
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
            <span className="nav-text">
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </span>
          </button>
        </div>
      </aside>
      {flyoutOpen && hasCatalog && !catalogMissing && (
        <TableFlyout onClose={closeTables} />
      )}
      <div className="main-column">
        <header className="topbar">
          <button
            className="menu-button icon-button"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className="breadcrumb" aria-label="Breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            {parent && (
              <>
                <NavLink to={parent.path}>{parent.label}</NavLink>
                <span aria-hidden="true">/</span>
              </>
            )}
            <strong>{current}</strong>
          </div>

          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            title={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
          >
            {theme === 'dark' ? (
              <Sun size={18} aria-hidden="true" />
            ) : (
              <Moon size={18} aria-hidden="true" />
            )}
          </button>
          {user && (
            <div className="user-box">
              <span
                className="user-chip"
                title={`Signed in as ${user.username}`}
              >
                <span className="user-avatar" aria-hidden="true">
                  {user.username.slice(0, 2).toUpperCase()}
                </span>
                <span className="user-name">{user.username}</span>
              </span>
              <button
                className="theme-toggle"
                type="button"
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </header>
        <main id="main-content">
          {catalogMissing ? (
            <div className="page-content">
              <CatalogMissingState
                onRetry={() => {
                  // Reset every query so all pages reload from the new files.
                  void queryClient.resetQueries();
                }}
              />
            </div>
          ) : (
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<PageLoading />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}
