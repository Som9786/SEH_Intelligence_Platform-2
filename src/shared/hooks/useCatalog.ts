import { useQuery } from '@tanstack/react-query';
import { FileDataError } from '../../platform/files/fileDataService';
import { DATABASE_PATH, loadCatalog } from '../../platform/files/snapshot';

/** The published catalog index (database.json). `missing` is true when no catalog is published. */
export function useCatalog() {
  const query = useQuery({ queryKey: ['catalog'], queryFn: loadCatalog });
  const { error } = query;
  const missing =
    error instanceof FileDataError &&
    error.code === 'NOT_FOUND' &&
    error.path === DATABASE_PATH;
  return { ...query, missing };
}
