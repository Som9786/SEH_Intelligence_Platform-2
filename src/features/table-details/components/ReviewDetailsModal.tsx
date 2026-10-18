import { X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import type { TableReview } from '../types/review';
import { formatReviewDate } from '../utils/reviewStatus';
import { ReviewStatusBadge } from './ReviewStatusBadge';

/** Read-only popup with the whole review, so a long comment never stretches the table header. */
export function ReviewDetailsModal({
  review,
  tableId,
  onClose,
}: {
  review: TableReview;
  tableId: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  // Focus the dialog on open, keep the page behind it still, and hand focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep Tab inside the dialog.
    const items = [...(dialog.current?.querySelectorAll('button') ?? [])];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="rv-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="rv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className="rv-head">
          <div>
            <h2 id={titleId}>Review details</h2>
            <p className="rv-table">{tableId}</p>
          </div>
          <button
            type="button"
            className="rv-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="rv-body">
          <dl className="rv-details">
            <div>
              <dt>Status</dt>
              <dd>
                <ReviewStatusBadge review={review} />
              </dd>
            </div>
            <div>
              <dt>Reviewer</dt>
              <dd>{review.reviewedBy}</dd>
            </div>
            <div>
              <dt>Reviewed on</dt>
              <dd>
                <time dateTime={review.updatedAt}>
                  {formatReviewDate(review.updatedAt)}
                </time>
              </dd>
            </div>
          </dl>
          <div className="rv-field">
            <span>Comments</span>
            <p className="rv-details-comment">
              {review.comment || 'No comments were added.'}
            </p>
          </div>
        </div>
        <div className="rv-foot">
          <button type="button" className="td-action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
