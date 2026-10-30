import { useQuery } from '@tanstack/react-query';
import { fileTableDetailsService } from '../../../../platform/files/adapters/FileTableDetailsService';

export function useTable(id: string) {
  return useQuery({
    queryKey: ['table', id],
    queryFn: () => fileTableDetailsService.getTable(id),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
