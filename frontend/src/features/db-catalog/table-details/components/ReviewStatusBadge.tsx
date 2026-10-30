import type { TableReview } from '../types/review';
import { reviewStatusLabel } from '../utils/reviewStatus';

/** Verified / Needs Attention / Not Reviewed, shown next to the table title. */
export function ReviewStatusBadge({ review }: { review: TableReview | null }) {
  const kind = review ? review.status : 'none';
  return (
    <span
      className={`rv-badge rv-badge-${kind}`}
      title={
        review
          ? `Review status: ${reviewStatusLabel(review.status)}`
          : 'This table has no review yet'
      }
    >
      <span className="rv-badge-dot" aria-hidden="true" />
      {reviewStatusLabel(review?.status ?? null)}
    </span>
  );
}
