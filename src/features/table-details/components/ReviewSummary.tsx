import type { TableReview } from '../types/review';
import { formatReviewDate } from '../utils/reviewStatus';

/** Compact reviewer / comment / date strip shown in the table header once a review exists. */
export function ReviewSummary({ review }: { review: TableReview }) {
  return (
    <div className="rv-summary" aria-label="Latest review">
      <p className="rv-summary-meta">
        <span>
          Reviewed by <strong>{review.reviewedBy}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <time dateTime={review.updatedAt}>
          {formatReviewDate(review.updatedAt)}
        </time>
      </p>
      <p className="rv-summary-comment" title={review.comment || undefined}>
        {review.comment || 'No comments were added.'}
      </p>
    </div>
  );
}
