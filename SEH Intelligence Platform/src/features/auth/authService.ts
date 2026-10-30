import { ApiError, apiJson } from '../../platform/api/apiClient';

export interface AuthUser {
  username: string;
  roles: string[];
  /** The functionalities (route `feature` keys, such as 'db-catalog') the user's roles give. */
  features: string[];
}

/**
 * The only thing the UI knows about signing in. To use another sign-in later (for example
 * Microsoft Entra ID), implement this interface and change the single `authService` export at the
 * bottom of the file.
 */
export interface AuthService {
  /** The signed-in user, or null. */
  getSession(): Promise<AuthUser | null>;
  /** Rejects with an Error whose message is safe to show when sign-in fails. */
  signIn(username: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
}

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseUser(value: unknown): AuthUser {
  const user = value as Partial<AuthUser> | null;
  if (
    !user ||
    typeof user.username !== 'string' ||
    !user.username ||
    !strings(user.roles) ||
    !strings(user.features)
  )
    throw new Error('Sign-in answered with an unexpected response.');
  return {
    username: user.username,
    roles: user.roles,
    features: user.features,
  };
}

/**
 * Signs in with Insights.Gateway (POST /api/auth/sign-in), which checks the user against its
 * settings and keeps the session in an HttpOnly cookie. The page never stores the password or the
 * session; the gateway checks the cookie, and the user's roles, on every API call.
 */
function createGatewayAuthService(): AuthService {
  return {
    async getSession() {
      try {
        return parseUser(await apiJson('auth/me'));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },

    async signIn(username, password) {
      try {
        return parseUser(
          await apiJson('auth/sign-in', {
            body: { username: username.trim(), password },
          }),
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          throw new Error('Incorrect username or password.');
        if (error instanceof ApiError && error.status === 429)
          throw new Error(
            'Too many sign-in attempts. Wait a minute and try again.',
          );
        throw new Error(
          'Sign-in is not available right now. Check that the platform API is running.',
        );
      }
    },

    async signOut() {
      try {
        await apiJson('auth/sign-out', { method: 'POST' });
      } catch {
        /* already signed out, or the gateway is down; the UI signs out either way */
      }
    },
  };
}

export const authService: AuthService = createGatewayAuthService();
