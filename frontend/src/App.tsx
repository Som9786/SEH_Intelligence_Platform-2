import type { ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router';
import { AppShell } from './app/layouts/AppShell';
import { QueryProvider } from './app/providers/QueryProvider';
import { homePath, routes } from './app/router/routes';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './features/auth/components/RequireAuth';
import { RequireFeature } from './features/auth/components/RequireFeature';
import { LoginPage } from './features/auth/pages/LoginPage';
import { SharedInsightPage } from './features/shared-insights/pages/InsightPages';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import { useAuth } from './features/auth/useAuth';

/** Unknown paths go to the user's own landing page. */
function GoHome() {
  const { can } = useAuth();
  return <Navigate to={homePath(can)} replace />;
}

/** A page that moved: same query (?table=…) and hash at its new path. */
function MovedTo({ path }: { path: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${path}${search}${hash}`} replace />;
}

/** An old "?id=<id>" link, sent to "<base>/<id>". */
function IdToPath({ base }: { base: string }) {
  const id = useSearchParams()[0].get('id');
  return id ? (
    <Navigate to={`${base}/${encodeURIComponent(id)}`} replace />
  ) : (
    <GoHome />
  );
}

/**
 * The page when the user's roles give it, otherwise their own landing page; a user with no page
 * at all is told so here rather than sent round in a loop.
 */
function HomeOr({
  feature,
  children,
}: {
  feature: string;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (can(feature) || homePath(can) === '/')
    return <RequireFeature feature={feature}>{children}</RequireFeature>;
  return <GoHome />;
}

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              {/* A shared link opens as a report: signed in, but without the sidebar and top bar. */}
              <Route
                path="/share/:id"
                element={
                  <ErrorBoundary>
                    <SharedInsightPage />
                  </ErrorBoundary>
                }
              />
              {/* Links made before the id moved into the path. */}
              <Route
                path="/shared-insight"
                element={<IdToPath base="/share" />}
              />
              <Route element={<AppShell />}>
                {routes.map(({ path, feature, element: Page }) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      // The app's address is Overview; without it, land on the user's own home page.
                      path === '/' ? (
                        <HomeOr feature={feature}>
                          <Page />
                        </HomeOr>
                      ) : (
                        <RequireFeature feature={feature}>
                          <Page />
                        </RequireFeature>
                      )
                    }
                  />
                ))}
                {/* The AI Assistant was renamed and Overview moved to "/"; keep old links working. */}
                <Route
                  path="/ai-assistant"
                  element={<Navigate to="/insights-assistant" replace />}
                />
                <Route path="/overview" element={<Navigate to="/" replace />} />
                {/* DB Catalog's pages moved under /db-catalog, and a widget's id into its path. */}
                {[
                  ['/table-details', '/db-catalog/tables'],
                  ['/documentation', '/db-catalog/documentation'],
                  ['/relationships', '/db-catalog/relationships'],
                ].map(([from, to]) => (
                  <Route
                    key={from}
                    path={from}
                    element={<MovedTo path={to} />}
                  />
                ))}
                <Route
                  path="/basket-intelligence/insight"
                  element={<IdToPath base="/basket-intelligence/insight" />}
                />
                <Route path="*" element={<GoHome />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryProvider>
  );
}
