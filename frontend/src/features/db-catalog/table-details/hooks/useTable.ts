import { useQuery } from '@tanstack/react-query';
import { fileTableDetailsService } from '../../../../platform/files/adapters/FileTableDetailsService';
import { useCatalogDatabase } from '../../../../platform/files/catalogDatabase';

export function useTable(id: string) {
  const database = useCatalogDatabase();
  return useQuery({
    queryKey: ['table', database, id],
    queryFn: () => fileTableDetailsService.getTable(id),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
