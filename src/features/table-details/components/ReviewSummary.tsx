import { useState } from 'react';
import type { TableReview } from '../types/review';
import { formatReviewDate } from '../utils/reviewStatus';
import { ReviewDetailsModal } from './ReviewDetailsModal';

/**
 * Compact reviewer / date / comment card shown in the table header once a review exists. The
 * comment is cut to two lines so the header keeps the same height; the full review opens in a popup.
 */
export function ReviewSummary({
  review,
  tableId,
}: {
  review: TableReview;
  tableId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rv-summary" aria-label="Latest review">
      <p className="rv-summary-meta">
        <span>
          Reviewed by <strong>{review.reviewedBy}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <time dateTime={review.updatedAt}>
          {formatReviewDate(review.updatedAt)}
        </time>
      </p>
      <div className="rv-summary-body">
        <p className="rv-summary-comment">
          {review.comment || 'No comments were added.'}
        </p>
        <button
          type="button"
          className="rv-summary-more"
          aria-label="View full review"
          onClick={() => setOpen(true)}
        >
          More
        </button>
      </div>
      {open && (
        <ReviewDetailsModal
          review={review}
          tableId={tableId}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
