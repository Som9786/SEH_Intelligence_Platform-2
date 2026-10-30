import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from './authService';

const ADMIN = {
  username: 'Admin',
  roles: ['Admin'],
  features: ['overview', 'db-catalog'],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('authService (gateway sign-in)', () => {
  it('reads the session from the gateway', async () => {
    fetchMock.mockResolvedValue(json(200, ADMIN));
    await expect(authService.getSession()).resolves.toEqual(ADMIN);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('is signed out when the gateway answers 401', async () => {
    fetchMock.mockResolvedValue(json(401, { detail: 'Not signed in.' }));
    await expect(authService.getSession()).resolves.toBeNull();
  });

  it('signs in with a trimmed user name and the password as typed', async () => {
    fetchMock.mockResolvedValue(json(200, ADMIN));
    await expect(authService.signIn('  Admin ', ' Pa ss ')).resolves.toEqual(
      ADMIN,
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/sign-in');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'Admin',
      password: ' Pa ss ',
    });
  });

  it('explains wrong credentials, too many attempts and an unreachable gateway', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: 'x' }));
    await expect(authService.signIn('Admin', 'nope')).rejects.toThrow(
      'Incorrect username or password.',
    );
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(authService.signIn('Admin', 'nope')).rejects.toThrow(
      /too many sign-in attempts/i,
    );
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(authService.signIn('Admin', 'nope')).rejects.toThrow(
      /not available/i,
    );
  });

  it('rejects an unexpected sign-in answer', async () => {
    fetchMock.mockResolvedValue(json(200, { username: 'Admin' }));
    await expect(authService.signIn('Admin', 'x')).rejects.toThrow(
      /not available/i,
    );
  });

  it('signs out, even when the gateway is down', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(authService.signOut()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/sign-out');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(authService.signOut()).resolves.toBeUndefined();
  });
});
