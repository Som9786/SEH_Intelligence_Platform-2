import { createContext } from 'react';
import type { AuthUser } from './authService';

export interface AuthContextValue {
  user: AuthUser | null;
  /** Rejects with a displayable message when the credentials are wrong. */
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
