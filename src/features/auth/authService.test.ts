import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService, DEMO_PASSWORD, DEMO_USERNAME } from './authService';

function fakeSessionStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

let storage: ReturnType<typeof fakeSessionStorage>;

beforeEach(() => {
  storage = fakeSessionStorage();
  vi.stubGlobal('sessionStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('authService (demo implementation)', () => {
  it('starts signed out', () => {
    expect(authService.getSession()).toBeNull();
  });

  it('signs in with the demo credentials and keeps the session for this tab', async () => {
    const user = await authService.signIn(DEMO_USERNAME, DEMO_PASSWORD);
    expect(user).toEqual({ username: DEMO_USERNAME });
    expect(authService.getSession()).toEqual({ username: DEMO_USERNAME });
  });

  it('never stores the password', async () => {
    await authService.signIn(DEMO_USERNAME, DEMO_PASSWORD);
    expect([...storage.data.values()].join(' ')).not.toContain(DEMO_PASSWORD);
  });

  it('ignores case and surrounding spaces in the username, but not in the password', async () => {
    await expect(
      authService.signIn(`  ${DEMO_USERNAME.toUpperCase()} `, DEMO_PASSWORD),
    ).resolves.toBeDefined();
    await expect(
      authService.signIn(DEMO_USERNAME, DEMO_PASSWORD.toLowerCase()),
    ).rejects.toThrow(/incorrect/i);
  });

  it('rejects wrong credentials without creating a session', async () => {
    await expect(authService.signIn(DEMO_USERNAME, 'nope')).rejects.toThrow(
      'Incorrect username or password.',
    );
    await expect(authService.signIn('someone', DEMO_PASSWORD)).rejects.toThrow(
      'Incorrect username or password.',
    );
    await expect(authService.signIn('', '')).rejects.toThrow(
      'Incorrect username or password.',
    );
    expect(authService.getSession()).toBeNull();
  });

  it('signs out', async () => {
    await authService.signIn(DEMO_USERNAME, DEMO_PASSWORD);
    authService.signOut();
    expect(authService.getSession()).toBeNull();
  });

  it('treats a corrupt or empty stored session as signed out', () => {
    storage.setItem('seh-demo-session', '{not json');
    expect(authService.getSession()).toBeNull();
    storage.setItem('seh-demo-session', JSON.stringify({ username: '' }));
    expect(authService.getSession()).toBeNull();
    storage.setItem('seh-demo-session', JSON.stringify({ other: true }));
    expect(authService.getSession()).toBeNull();
  });

  it('still works when storage is blocked', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(authService.getSession()).toBeNull();
    await expect(
      authService.signIn(DEMO_USERNAME, DEMO_PASSWORD),
    ).resolves.toEqual({ username: DEMO_USERNAME });
    expect(() => authService.signOut()).not.toThrow();
  });
});
