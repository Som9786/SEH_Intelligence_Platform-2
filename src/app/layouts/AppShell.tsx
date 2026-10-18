import { useEffect, useState } from 'react';
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
import { useTheme } from '../../shared/hooks/useTheme';
import { TopbarTableSearch } from '../../features/table-details/components/TopbarTableSearch';
import { NavLink, Outlet, useLocation } from 'react-router';
import { routes } from '../router/routes';
import { SidebarTableNav } from '../../features/table-details/components/SidebarTableNav';

export function AppShell() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  const current =
    routes.find((route) => route.path === location.pathname)?.label ??
    'Overview';

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
            <small>Database workspace</small>
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
          {routes
            .filter((route) => route.inSidebar)
            .map((route) => {
              const { path, label, icon: Icon } = route;
              return (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/'}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    'nav-link' + (isActive ? ' active' : '')
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="nav-text">{label}</span>
                  {'badge' in route && (
                    <span className="nav-soon">{route.badge}</span>
                  )}
                </NavLink>
              );
            })}
        </nav>
        <SidebarTableNav onSelect={() => setMobileOpen(false)} />
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
            <strong>{current}</strong>
          </div>
          {location.pathname === '/table-details' && <TopbarTableSearch />}
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
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </header>
        <main id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
