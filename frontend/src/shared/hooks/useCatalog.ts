import { useQuery } from '@tanstack/react-query';
import { FileDataError } from '../../platform/files/fileDataService';
import { useCatalogDatabase } from '../../platform/files/catalogDatabase';
import { DATABASE_PATH, loadCatalog } from '../../platform/files/snapshot';

/**
 * The published catalog index (database.json). `missing` is true when no catalog is published.
 * Pass `enabled: false` to skip loading it (for a user without DB Catalog).
 */
export function useCatalog({ enabled = true }: { enabled?: boolean } = {}) {
  const database = useCatalogDatabase();
  const query = useQuery({
    queryKey: ['catalog', database],
    queryFn: loadCatalog,
    enabled,
  });
  const { error } = query;
  const missing =
    error instanceof FileDataError &&
    error.code === 'NOT_FOUND' &&
    error.path === DATABASE_PATH;
  return { ...query, missing };
}
