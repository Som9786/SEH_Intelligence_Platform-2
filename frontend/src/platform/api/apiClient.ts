/**
 * Every call to the platform's APIs goes through here. Paths are relative to /api on the app's own
 * address, which the host forwards to Insights.Gateway (vite.config.ts, serve.mjs, web.config), so
 * the gateway's sign-in cookie goes with each call. The gateway passes /api/db-catalog, /api/analytics
 * and /api/ai on to DB Catalog, Analytics and AI Hub; /api/auth is its own sign-in.
 */
export const API_ROOT = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}api/`;

/** A failed API call. `message` is safe to show: the gateway's or service's own explanation when it gave one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

/** Called when an API call answers 401 (the sign-in expired or was removed). Returns a function that unregisters it. */
export function setUnauthorizedHandler(handler: () => void): () => void {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = null;
  };
}

/** fetch for /api/<path>. Resolves with any response; rejects only when the gateway can't be reached. */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(API_ROOT + path, {
    credentials: 'same-origin',
    ...init,
  });
  if (response.status === 401 && !path.startsWith('auth/')) onUnauthorized?.();
  return response;
}

/** The explanation in an error response (a problem details `detail` or `title`), or a general one. */
export async function errorMessage(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as {
      detail?: unknown;
      title?: unknown;
    };
    if (typeof problem.detail === 'string' && problem.detail)
      return problem.detail;
    if (typeof problem.title === 'string' && problem.title)
      return problem.title;
  } catch {
    /* not JSON */
  }
  return `The request failed (HTTP ${response.status}).`;
}

/**
 * Calls /api/<path> and returns its JSON. `body`, when given, is sent as JSON (POST unless `method`
 * says otherwise). Rejects with an ApiError for any non-2xx answer or an unreachable gateway.
 */
export async function apiJson<T>(
  path: string,
  { body, ...init }: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path, {
      ...init,
      ...(body === undefined
        ? {}
        : {
            method: init.method ?? 'POST',
            body: JSON.stringify(body),
          }),
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'The platform API is not reachable right now.');
  }
  if (!response.ok)
    throw new ApiError(response.status, await errorMessage(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
