import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'seh-theme';

/** The theme lives on <html data-theme> so CSS and non-React code (Mermaid) share one source of truth. */
const read = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

/**
 * The saved choice, else light: the app starts light whatever the operating system prefers, and
 * dark is a choice the user makes with the toggle. Storage can throw (private windows), so it is
 * optional.
 */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* fall through to the default */
  }
  return 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'light' as Theme);
  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies for this visit */
    }
  }, []);
  const toggle = useCallback(
    () => setTheme(read() === 'dark' ? 'light' : 'dark'),
    [setTheme],
  );
  return { theme, setTheme, toggle };
}
