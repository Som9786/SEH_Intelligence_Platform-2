import { createContext } from 'react';
import type { AuthUser } from './authService';

export interface AuthContextValue {
  user: AuthUser | null;
  /** True while the existing session is being checked when the app opens. */
  checking: boolean;
  /** True after the user signed out themselves (not when the session expired): the next sign-in starts at home. */
  signedOut: boolean;
  /** Rejects with a displayable message when sign-in fails. */
  signIn: (username: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  /** True when the user's roles give this functionality (a route's `feature`). */
  can: (feature: string) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
