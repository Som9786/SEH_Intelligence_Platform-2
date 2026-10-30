import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './app/layouts/AppShell';
import { QueryProvider } from './app/providers/QueryProvider';
import { homePath, routes } from './app/router/routes';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './features/auth/components/RequireAuth';
import { RequireFeature } from './features/auth/components/RequireFeature';
import { LoginPage } from './features/auth/pages/LoginPage';
import { useAuth } from './features/auth/useAuth';

/** Unknown paths go to the user's own landing page. */
function GoHome() {
  const { can } = useAuth();
  return <Navigate to={homePath(can)} replace />;
}

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                {routes.map(({ path, feature, element: Page }) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <RequireFeature feature={feature}>
                        <Page />
                      </RequireFeature>
                    }
                  />
                ))}
                {/* The AI Assistant was renamed; keep old links working. */}
                <Route
                  path="/ai-assistant"
                  element={<Navigate to="/insights-assistant" replace />}
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
