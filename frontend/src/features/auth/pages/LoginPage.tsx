import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { BrandLogo } from '../../../shared/components/BrandLogo';
import { homePath } from '../../../app/router/routes';
import { useAuth } from '../useAuth';

// Filled in for local development only (npm run dev): import.meta.env.DEV is false in a build, so
// these never reach the built app. Keep them in step with Gateway:Users in Insights.Gateway.
const PREFILL = import.meta.env.DEV
  ? { username: 'Admin', password: 'Demo@123' }
  : { username: '', password: '' };

/** Where to go after signing in: the page the visitor was sent away from, else their home page. */
function destinationOf(state: unknown, home: string): string {
  const from = (
    state as {
      from?: { pathname?: string; search?: string; hash?: string };
    } | null
  )?.from;
  // Opening the app's address ("/") isn't asking for a page: land on the home page.
  if (!from?.pathname || from.pathname === '/login' || from.pathname === '/')
    return home;
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

export function LoginPage() {
  const { user, checking, signIn, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState(PREFILL.username);
  const [password, setPassword] = useState(PREFILL.password);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user)
    return (
      <Navigate to={destinationOf(location.state, homePath(can))} replace />
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await signIn(username, password);
      const home = homePath((feature) => signedIn.features.includes(feature));
      void navigate(destinationOf(location.state, home), { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign in failed.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-head">
          <BrandLogo size={58} />
          <div>
            <h1 id="auth-title">SEH Intelligence Platform</h1>
            <p>Sign in to continue</p>
          </div>
        </header>

        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label className="auth-field">
            <span>Username</span>
            <input
              type="text"
              name="username"
              value={username}
              autoComplete="username"
              autoFocus
              required
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              value={password}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              aria-describedby={error ? 'auth-error' : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p id="auth-error" className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="auth-submit"
            disabled={busy || checking}
          >
            {busy ? (
              'Signing in…'
            ) : (
              <>
                Sign in
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <div className="auth-stripe" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
