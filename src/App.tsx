import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './app/layouts/AppShell';
import { QueryProvider } from './app/providers/QueryProvider';
import { routes } from './app/router/routes';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './features/auth/components/RequireAuth';
import { LoginPage } from './features/auth/pages/LoginPage';

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                {routes.map(({ path, element: Page }) => (
                  <Route key={path} path={path} element={<Page />} />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryProvider>
  );
}
