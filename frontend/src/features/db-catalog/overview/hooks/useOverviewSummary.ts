import { useQuery } from '@tanstack/react-query';
import { fileOverviewService } from '../../../../platform/files/adapters/FileOverviewService';
import { useCatalogDatabase } from '../../../../platform/files/catalogDatabase';

export function useOverviewSummary() {
  const database = useCatalogDatabase();
  return useQuery({
    queryKey: ['overview', 'summary', database],
    queryFn: () => fileOverviewService.getSummary(),
    retry: false,
  });
}
