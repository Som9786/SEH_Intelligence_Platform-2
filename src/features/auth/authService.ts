export interface AuthUser {
  username: string;
}

/**
 * The only thing the UI knows about signing in. To use real authentication later (for example
 * Microsoft Entra ID), implement this interface and change the single `authService` export at the
 * bottom of the file.
 */
export interface AuthService {
  /** The signed-in user for this browser tab, or null. */
  getSession(): AuthUser | null;
  /** Rejects with an Error whose message is safe to show when the credentials are wrong. */
  signIn(username: string, password: string): Promise<AuthUser>;
  signOut(): void;
}

// DEMO ONLY. These credentials ship in the page source (and in a hidden note on the sign-in
// screen), so this gate keeps casual visitors out of the UI but protects nothing: the catalog JSON
// files are still publicly reachable. Replace with real authentication before holding sensitive data.
export const DEMO_USERNAME = 'Admin';
export const DEMO_PASSWORD = 'Demo@123';

const SESSION_KEY = 'seh-demo-session';

function readSession(): AuthUser | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(SESSION_KEY) ?? 'null',
    ) as Partial<AuthUser> | null;
    return value && typeof value.username === 'string' && value.username
      ? { username: value.username }
      : null;
  } catch {
    return null; // storage blocked or the entry is corrupt: treat as signed out
  }
}

function createDemoAuthService(): AuthService {
  return {
    getSession: readSession,

    async signIn(username, password) {
      if (
        username.trim().toLowerCase() !== DEMO_USERNAME.toLowerCase() ||
        password !== DEMO_PASSWORD
      )
        throw new Error('Incorrect username or password.');
      const user: AuthUser = { username: DEMO_USERNAME };
      try {
        // Per tab: closing the tab signs out. Only the user name is stored, never the password.
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      } catch {
        /* the session still works until the page is refreshed */
      }
      return user;
    },

    signOut() {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* nothing stored, nothing to clear */
      }
    },
  };
}

export const authService: AuthService = createDemoAuthService();
