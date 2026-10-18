import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthContext } from './authContext';
import { authService, type AuthUser } from './authService';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    authService.getSession(),
  );

  const signIn = useCallback(async (username: string, password: string) => {
    setUser(await authService.signIn(username, password));
  }, []);

  const signOut = useCallback(() => {
    authService.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, signIn, signOut }),
    [user, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
