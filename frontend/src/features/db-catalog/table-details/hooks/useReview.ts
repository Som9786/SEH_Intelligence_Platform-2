import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCatalogDatabase } from '../../../../platform/files/catalogDatabase';
import { reviewService } from '../services/reviewService';
import type { ReviewDraft, TableReview } from '../types/review';

/**
 * Every table's review in the selected database comes from one call (GET /workspace/reviews), shared by all the hooks below,
 * instead of one call per table: a table without a review is simply not in the list, so nothing
 * answers 404. After a save the result is written straight into that list, so every component
 * showing it updates at once, with no refetch.
 */
const allReviewsKey = (database: string | null) => ['reviews', database];

const sameTable = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function useAllReviews<T>(
  select: (reviews: TableReview[]) => T,
  enabled = true,
) {
  const database = useCatalogDatabase();
  return useQuery({
    queryKey: allReviewsKey(database),
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
  const database = useCatalogDatabase();
  return useMutation({
    mutationFn: (draft: ReviewDraft) => reviewService.saveReview(draft),
    onSuccess: (saved: TableReview) => {
      client.setQueryData<TableReview[]>(
        allReviewsKey(database),
        (list = []) => [
          ...list.filter((r) => !sameTable(r.tableId, saved.tableId)),
          saved,
        ],
      );
    },
  });
}
