import type { AssistantReply } from './assistantService';

export type Exchange =
  | { question: string; status: 'pending' }
  | { question: string; status: 'done'; reply: AssistantReply }
  | { question: string; status: 'error'; error: string };

/**
 * The Insights Assistant conversation, kept in the browser tab's session storage so it's still
 * there after leaving the page or reloading. One per user; signing out forgets it, and so does
 * closing the tab. Storage can be unavailable or full: then the thread simply isn't kept.
 */
const PREFIX = 'seh.assistant.thread.';

const keyOf = (user: string) => PREFIX + user.toLowerCase();

const INTERRUPTED =
  'This question was interrupted when you left the page. Try again to ask it.';

export function loadThread(user: string): Exchange[] {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(keyOf(user)) ?? '[]',
    ) as unknown;
    if (!Array.isArray(saved)) return [];
    // A question that was still being answered won't be answered now.
    return (saved as Exchange[]).map((exchange) =>
      exchange.status === 'pending'
        ? { question: exchange.question, status: 'error', error: INTERRUPTED }
        : exchange,
    );
  } catch {
    return [];
  }
}

export function saveThread(user: string, exchanges: Exchange[]) {
  try {
    if (exchanges.length === 0) sessionStorage.removeItem(keyOf(user));
    else sessionStorage.setItem(keyOf(user), JSON.stringify(exchanges));
  } catch {
    // Not kept: storage is unavailable or full.
  }
}

/** Forgets every user's thread in this tab (on sign-out). */
export function clearThreads() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch {
    // Nothing to forget.
  }
}
