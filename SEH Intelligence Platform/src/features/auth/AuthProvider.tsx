import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setUnauthorizedHandler } from '../../platform/api/apiClient';
import { clearDataCache } from '../../platform/files/fileDataService';
import { clearThreads } from '../ai-assistant/services/threadStore';
import { AuthContext } from './authContext';
import { authService, type AuthUser } from './authService';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [signedOut, setSignedOut] = useState(false);

  // Drops everything read with the old session, so nothing outlives it or leaks to the next user.
  const forget = useCallback(() => {
    setUser(null);
    clearDataCache();
    clearThreads();
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    authService
      .getSession()
      .catch(() => null) // gateway unreachable: show the sign-in page, which explains on submit
      .then((session) => {
        if (!active) return;
        setUser(session);
        setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // An API call answering 401 means the session expired or the user was removed: back to sign-in.
  useEffect(() => setUnauthorizedHandler(forget), [forget]);

  const signIn = useCallback(async (username: string, password: string) => {
    const signedIn = await authService.signIn(username, password);
    setSignedOut(false);
    setUser(signedIn);
    return signedIn;
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setSignedOut(true);
    forget();
  }, [forget]);

  const can = useCallback(
    // "*": anyone signed in, as in the gateway's rules.
    (feature: string) =>
      (Boolean(user) && feature === '*') ||
      (user?.features.includes(feature) ?? false),
    [user],
  );

  const value = useMemo(
    () => ({ user, checking, signedOut, signIn, signOut, can }),
    [user, checking, signedOut, signIn, signOut, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
