import { ApiError, apiJson } from '../../../../platform/api/apiClient';
import type { ReviewDraft, ReviewStatus, TableReview } from '../types/review';

/**
 * The only thing the UI knows about reviews. Reviews are kept by the workspace in Insights.Gateway (at
 * /api/workspace/reviews) in one file shared by everyone, so they survive a refresh and
 * every user sees the same review. The reviewer is the signed-in user, set by the server.
 */
export interface ReviewService {
  /** The latest review for a table, or null when it has not been reviewed. */
  getReview(tableId: string): Promise<TableReview | null>;
  /** Stores a review and returns it with the reviewer and `updatedAt` the server assigned. */
  saveReview(review: ReviewDraft): Promise<TableReview>;
}

const STATUSES: ReviewStatus[] = ['verified', 'needs-attention'];

const pathOf = (tableId: string) =>
  `workspace/reviews/${encodeURIComponent(tableId)}`;

export function parseReview(value: unknown, tableId: string): TableReview {
  const review = value as Partial<TableReview> | null;
  if (
    !review ||
    typeof review !== 'object' ||
    review.tableId?.toLowerCase() !== tableId.toLowerCase() ||
    !STATUSES.includes(review.status as ReviewStatus) ||
    typeof review.reviewedBy !== 'string' ||
    typeof review.updatedAt !== 'string'
  )
    throw new Error(`The review for ${tableId} is not valid.`);
  return {
    tableId,
    status: review.status as ReviewStatus,
    comment: typeof review.comment === 'string' ? review.comment : '',
    reviewedBy: review.reviewedBy,
    updatedAt: review.updatedAt,
  };
}

export const reviewService: ReviewService = {
  async getReview(tableId) {
    try {
      return parseReview(await apiJson<unknown>(pathOf(tableId)), tableId);
    } catch (error) {
      // No review saved for this table yet.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async saveReview({ tableId, status, comment }) {
    const saved = await apiJson<unknown>(pathOf(tableId), {
      method: 'PUT',
      body: { status, comment },
    });
    return parseReview(saved, tableId);
  },
};
