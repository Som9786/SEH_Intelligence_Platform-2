import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listCatalogDatabases,
  pickCatalogDatabase,
  setCatalogDatabase,
  useCatalogDatabase,
} from '../../platform/files/catalogDatabase';

/**
 * The databases DB Catalog describes. Keeps the selection on one of them: the remembered one while
 * DB Catalog still has it, otherwise its default. Pass `enabled: false` for a user without DB Catalog.
 */
export function useCatalogDatabases({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const selected = useCatalogDatabase();
  const query = useQuery({
    queryKey: ['catalog-databases'],
    queryFn: listCatalogDatabases,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const { data } = query;
  useEffect(() => {
    if (data) setCatalogDatabase(pickCatalogDatabase(data, selected));
  }, [data, selected]);
  return { ...query, selected };
}
