import { useQuery } from '@tanstack/react-query';
import { fileOverviewService } from '../../../../platform/files/adapters/FileOverviewService';

export const overviewQueryKey = ['overview', 'summary'] as const;

export function useOverviewSummary() {
  return useQuery({
    queryKey: overviewQueryKey,
    queryFn: () => fileOverviewService.getSummary(),
    retry: false,
  });
}
