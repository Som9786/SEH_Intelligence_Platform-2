/**
 * Reads the static metadata catalog published under public/catalog. Files are fetched relative to
 * the app's base URL, so the built app works from any static host without a backend.
 */
export type FileDataErrorCode = 'NOT_FOUND' | 'INVALID_JSON' | 'INVALID_DATA' | 'LOAD_FAILED';

export class FileDataError extends Error {
  readonly code: FileDataErrorCode;
  readonly path: string;

  constructor(code: FileDataErrorCode, path: string, message?: string) {
    super(message ?? `${code}: ${path}`);
    this.name = 'FileDataError';
    this.code = code;
    this.path = path;
  }
}

export function isFileNotFound(error: unknown): boolean {
  return error instanceof FileDataError && error.code === 'NOT_FOUND';
}

const DATA_ROOT = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}catalog/`;

/** Rejects absolute URLs, traversal and sample data, which is never part of the published snapshot. */
function assertSafePath(path: string) {
  if (
    !path ||
    /^[a-z][a-z0-9+.-]*:/i.test(path) ||
    path.startsWith('/') ||
    path.split(/[\\/]/).includes('..') ||
    path.toLowerCase().endsWith('.data.json')
  )
    throw new FileDataError('NOT_FOUND', path);
}

export function dataFileUrl(path: string): string {
  assertSafePath(path);
  return DATA_ROOT + path.split('/').map(encodeURIComponent).join('/');
}

async function fetchText(path: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(dataFileUrl(path), { headers: { Accept: 'application/json, text/markdown, text/plain' } });
  } catch (error) {
    if (error instanceof FileDataError) throw error;
    throw new FileDataError('LOAD_FAILED', path);
  }
  if (response.status === 404) throw new FileDataError('NOT_FOUND', path);
  if (!response.ok) throw new FileDataError('LOAD_FAILED', path, `HTTP ${response.status}: ${path}`);
  // Dev servers and SPA hosts answer unknown paths with index.html; that is a missing file.
  if (response.headers.get('content-type')?.includes('text/html')) throw new FileDataError('NOT_FOUND', path);
  return response.text();
}

// Snapshot files are immutable for the page's lifetime, so each is fetched once. Failed reads are
// evicted so a Retry re-requests the file.
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let entry = cache.get(key) as Promise<T> | undefined;
  if (!entry) {
    entry = load();
    cache.set(key, entry);
    entry.catch(() => cache.delete(key));
  }
  return entry;
}

export function fetchJson<T = unknown>(path: string): Promise<T> {
  return cached(`json:${path}`, async () => {
    const text = await fetchText(path);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new FileDataError('INVALID_JSON', path);
    }
  });
}

export function fetchMarkdown(path: string): Promise<string> {
  return cached(`md:${path}`, () => fetchText(path));
}

/** Like fetchMarkdown, but resolves to null when the document does not exist. */
export async function fetchOptionalMarkdown(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const markdown = await fetchMarkdown(path);
    return markdown.trim() ? markdown : null;
  } catch (error) {
    if (isFileNotFound(error)) return null;
    throw error;
  }
}
