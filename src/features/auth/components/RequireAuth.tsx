import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../useAuth';

/** Renders the nested routes only for a signed-in user; otherwise sends them to /login and remembers where they were going. */
export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
