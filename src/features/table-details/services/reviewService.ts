import type { ReviewDraft, ReviewStatus, TableReview } from '../types/review';

/**
 * The only thing the UI knows about reviews. To use a real API later, implement this interface
 * (GET and PUT/POST calls) and change the single `reviewService` export at the bottom of the
 * file; no component or hook needs to change.
 */
export interface ReviewService {
  /** The latest review for a table, or null when it has not been reviewed. */
  getReview(tableId: string): Promise<TableReview | null>;
  /** Stores a review and returns it with the server-assigned `updatedAt`. */
  saveReview(review: ReviewDraft): Promise<TableReview>;
}

const REVIEW_ROOT = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}data/reviews/`;
const STATUSES: ReviewStatus[] = ['verified', 'needs-attention'];

function parseReview(value: unknown, tableId: string): TableReview {
  const review = value as Partial<TableReview> | null;
  if (
    !review ||
    typeof review !== 'object' ||
    review.tableId !== tableId ||
    !STATUSES.includes(review.status as ReviewStatus) ||
    typeof review.reviewedBy !== 'string' ||
    typeof review.updatedAt !== 'string'
  )
    throw new Error(`The review file for ${tableId} is not valid.`);
  return {
    tableId,
    status: review.status as ReviewStatus,
    comment: typeof review.comment === 'string' ? review.comment : '',
    reviewedBy: review.reviewedBy,
    updatedAt: review.updatedAt,
  };
}

/**
 * Demo implementation: reads the static sample files under public/data/reviews and keeps saved
 * reviews in memory. Nothing is written anywhere, so every save is lost on page refresh.
 */
function createDemoReviewService(): ReviewService {
  const saved = new Map<string, TableReview>();
  return {
    async getReview(tableId) {
      const inMemory = saved.get(tableId);
      if (inMemory) return inMemory;

      const response = await fetch(
        `${REVIEW_ROOT}${encodeURIComponent(tableId)}.json`,
        { headers: { Accept: 'application/json' } },
      );
      // Dev servers and SPA hosts answer unknown paths with index.html: that means "no review file".
      if (
        response.status === 404 ||
        response.headers.get('content-type')?.includes('text/html')
      )
        return null;
      if (!response.ok)
        throw new Error(
          `Review could not be loaded (HTTP ${response.status}).`,
        );
      return parseReview(await response.json(), tableId);
    },

    async saveReview(draft) {
      const review: TableReview = {
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      saved.set(review.tableId, review);
      return review;
    },
  };
}

export const reviewService: ReviewService = createDemoReviewService();
