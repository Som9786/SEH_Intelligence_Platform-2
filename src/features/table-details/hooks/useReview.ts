import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewService } from '../services/reviewService';
import type { ReviewDraft, TableReview } from '../types/review';

const reviewKey = (tableId: string) => ['review', tableId] as const;

/**
 * The latest review for a table. After a save the result is written straight into the query
 * cache, so every component showing it updates at once, with no refetch and no storage.
 */
export function useReview(tableId: string) {
  return useQuery({
    queryKey: reviewKey(tableId),
    queryFn: () => reviewService.getReview(tableId),
    enabled: Boolean(tableId),
    staleTime: Infinity,
    retry: false,
  });
}

export function useSaveReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: ReviewDraft) => reviewService.saveReview(draft),
    onSuccess: (saved: TableReview) => {
      client.setQueryData(reviewKey(saved.tableId), saved);
    },
  });
}
