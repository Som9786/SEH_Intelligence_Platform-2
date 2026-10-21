import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { BrandLogo } from '../../../shared/components/BrandLogo';
import { DEMO_PASSWORD, DEMO_USERNAME } from '../authService';
import { useAuth } from '../useAuth';

/** Where to go after signing in: the page the visitor was sent away from, else the home page. */
function destinationOf(state: unknown): string {
  const from = (
    state as {
      from?: { pathname?: string; search?: string; hash?: string };
    } | null
  )?.from;
  if (!from?.pathname || from.pathname === '/login') return '/';
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState(DEMO_USERNAME);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={destinationOf(location.state)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      void navigate(destinationOf(location.state), { replace: true });
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
            <p>Explore your database catalog</p>
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
              placeholder="Enter demo password"
              autoComplete="current-password"
              autoFocus
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
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? (
              'Signing in…'
            ) : (
              <>
                Sign in
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </button>
          <div className="auth-hint">
            {/* Not shown on screen; visible with the browser's Inspect element. */}
            <p hidden data-demo-credentials>
              Demo credentials: {DEMO_USERNAME} / {DEMO_PASSWORD}
            </p>
            <p>Demo sign-in only. It does not protect the data files.</p>
          </div>
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
