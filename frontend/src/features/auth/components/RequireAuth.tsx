import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../useAuth';

/**
 * Renders the nested routes only for a signed-in user; otherwise sends them to /login and remembers
 * where they were going, so sign-in returns there. Not after signing out: the next sign-in starts at home.
 */
export function RequireAuth() {
  const { user, checking, signedOut } = useAuth();
  const location = useLocation();
  if (checking)
    return (
      <div
        className="state-panel auth-checking"
        role="status"
        aria-live="polite"
      >
        <span className="spinner" aria-hidden="true" />
        <p>Checking your sign-in…</p>
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/login"
        replace
        state={signedOut ? undefined : { from: location }}
      />
    );
  return <Outlet />;
}
