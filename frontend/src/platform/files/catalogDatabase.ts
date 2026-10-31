import { useSyncExternalStore } from 'react';
import { apiJson } from '../api/apiClient';

/**
 * Which database the DB Catalog pages show. DB Catalog keeps one catalog export per database
 * (GET /api/db-catalog/databases), and every catalog file and table review is read for the selected
 * one. The choice is remembered in this browser. Null until one is chosen: the files are then read
 * from DB Catalog's default database.
 */
export interface CatalogDatabase {
  /** The database's folder name in DB Catalog, used in its routes. */
  name: string;
  /** The name its db-catalog.json gives the page. */
  title: string;
  default: boolean;
  lastLoad?: { succeeded: boolean; error?: string | null } | null;
}

const STORAGE_KEY = 'seh.catalog-database';

/** The address's database parameter on the DB Catalog pages: ?db=SEH_Validation_Retail. */
export const DATABASE_PARAM = 'db';

/** On load, the database a link names, else the one chosen last in this browser. */
function readInitial(): string | null {
  const fromUrl =
    typeof location === 'undefined'
      ? null
      : new URLSearchParams(location.search).get(DATABASE_PARAM);
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let selected: string | null = readInitial();
const listeners = new Set<() => void>();

export function getCatalogDatabase(): string | null {
  return selected;
}

export function setCatalogDatabase(name: string | null) {
  if (name === selected) return;
  selected = name;
  try {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered (private window or blocked storage); the choice still holds for this page.
  }
  listeners.forEach((listener) => listener());
}

/** The selected database; components using it re-render, and their queries re-key, when it changes. */
export function useCatalogDatabase(): string | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getCatalogDatabase);
}

export async function listCatalogDatabases(): Promise<CatalogDatabase[]> {
  const value = await apiJson<unknown>('db-catalog/databases');
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    const d = entry as Partial<CatalogDatabase> | null;
    return d && typeof d.name === 'string' && d.name
      ? [
          {
            name: d.name,
            title: typeof d.title === 'string' && d.title ? d.title : d.name,
            default: d.default === true,
            lastLoad: d.lastLoad ?? null,
          },
        ]
      : [];
  });
}

/**
 * The database a list says to show: the selected one while the list still has it, otherwise the
 * default one (or the first).
 */
export function pickCatalogDatabase(
  databases: CatalogDatabase[],
  current: string | null,
): string | null {
  return (
    databases.find((d) => d.name === current)?.name ??
    databases.find((d) => d.default)?.name ??
    databases[0]?.name ??
    null
  );
}
