import { useReview } from '../hooks/useReview';
import { reviewStatusLabel } from '../utils/reviewStatus';

/**
 * Small status dot for a table in the table flyout: green = Verified, red = Needs Attention,
 * hollow ring = Not Reviewed. It reads the same cached review as the Table Details page, so a
 * review saved there shows up here immediately.
 */
export function ReviewDot({ tableId }: { tableId: string }) {
  const review = useReview(tableId);
  // While loading, keep the space so rows do not shift; if the review cannot be read, show nothing.
  if (review.isPending)
    return <i className="rv-dot rv-dot-loading" aria-hidden="true" />;
  if (review.isError) return null;
  const status = review.data?.status ?? null;
  const label = reviewStatusLabel(status);
  return (
    <i
      className={`rv-dot rv-dot-${status ?? 'none'}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
