import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewService } from '../services/reviewService';
import type { ReviewDraft, TableReview } from '../types/review';

/**
 * Every table's review comes from one call (GET /workspace/reviews), shared by all the hooks below,
 * instead of one call per table: a table without a review is simply not in the list, so nothing
 * answers 404. After a save the result is written straight into that list, so every component
 * showing it updates at once, with no refetch.
 */
const allReviewsKey = ['reviews'] as const;

const sameTable = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function useAllReviews<T>(
  select: (reviews: TableReview[]) => T,
  enabled = true,
) {
  return useQuery({
    queryKey: allReviewsKey,
    queryFn: () => reviewService.listReviews(),
    select,
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

/** The latest review for a table, or null when it has not been reviewed. */
export function useReview(tableId: string) {
  return useAllReviews(
    (reviews) => reviews.find((r) => sameTable(r.tableId, tableId)) ?? null,
    Boolean(tableId),
  );
}

/** Reviews for many tables at once (e.g. review progress): one entry per table id, in order. */
export function useReviews(tableIds: string[]) {
  const all = useAllReviews((reviews) => reviews);
  return tableIds.map((tableId) => ({
    isPending: all.isPending,
    isError: all.isError,
    data: all.data?.find((r) => sameTable(r.tableId, tableId)) ?? null,
  }));
}

export function useSaveReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: ReviewDraft) => reviewService.saveReview(draft),
    onSuccess: (saved: TableReview) => {
      client.setQueryData<TableReview[]>(allReviewsKey, (list = []) => [
        ...list.filter((r) => !sameTable(r.tableId, saved.tableId)),
        saved,
      ]);
    },
  });
}
