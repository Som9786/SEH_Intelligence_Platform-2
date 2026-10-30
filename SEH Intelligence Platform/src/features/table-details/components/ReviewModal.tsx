import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useAuth } from '../../auth/useAuth';
import type { ReviewDraft, ReviewStatus, TableReview } from '../types/review';
import { REVIEW_STATUS_OPTIONS, formatReviewDate } from '../utils/reviewStatus';

const MAX_COMMENT = 1000;
const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Review dialog for one table. It is mounted fresh each time it opens, so its fields always start
 * from the latest saved review. It only collects input: saving is the caller's job.
 */
export function ReviewModal({
  tableId,
  review,
  saving,
  error,
  onSave,
  onCancel,
}: {
  tableId: string;
  review: TableReview | null;
  saving: boolean;
  error: string | null;
  onSave: (draft: ReviewDraft) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  // The reviewer is whoever is signed in; the server records the same name.
  const reviewer = useAuth().user?.username ?? '';
  const [status, setStatus] = useState<ReviewStatus | null>(
    review?.status ?? null,
  );
  const [comment, setComment] = useState(review?.comment ?? '');

  const needsComment = status === 'needs-attention' && !comment.trim();
  const problem = !status
    ? 'Choose a review status.'
    : needsComment
      ? 'Add a comment explaining what needs attention.'
      : null;

  // Focus the dialog on open, keep the page behind it still, and hand focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('textarea')?.focus();
    return () => {
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!saving) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep Tab inside the dialog.
    const items = [
      ...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ];
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem || saving || !status) return;
    onSave({
      tableId,
      status,
      comment: comment.trim(),
      reviewedBy: reviewer.trim(),
    });
  };

  return (
    <div
      className="rv-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
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
        <form onSubmit={submit} noValidate>
          <div className="rv-head">
            <div>
              <h2 id={titleId}>{review ? 'Edit review' : 'Review table'}</h2>
              <p className="rv-table">{tableId}</p>
            </div>
            <button
              type="button"
              className="rv-close"
              aria-label="Close"
              disabled={saving}
              onClick={onCancel}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="rv-body">
            <label className="rv-field">
              <span>Reviewer</span>
              <input type="text" value={reviewer} disabled readOnly />
            </label>

            <fieldset className="rv-field rv-status">
              <legend>Status</legend>
              <div className="rv-options">
                {REVIEW_STATUS_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={
                      `rv-option rv-option-${option.value}` +
                      (status === option.value ? ' is-selected' : '')
                    }
                  >
                    <input
                      type="radio"
                      name="review-status"
                      value={option.value}
                      checked={status === option.value}
                      onChange={() => setStatus(option.value)}
                    />
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="rv-field">
              <span>
                Comments
                <small>
                  {comment.length}/{MAX_COMMENT}
                </small>
              </span>
              <textarea
                rows={5}
                value={comment}
                maxLength={MAX_COMMENT}
                placeholder="What did you check, and what should change?"
                onChange={(event) => setComment(event.target.value)}
              />
            </label>

            {review && (
              <p className="rv-note">
                Last saved by {review.reviewedBy} on{' '}
                {formatReviewDate(review.updatedAt)}.
              </p>
            )}
            <p className="rv-note">
              Demo only: reviews are kept in memory and reset when you refresh
              the page.
            </p>
            {error && (
              <p className="rv-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="rv-foot">
            <span className="rv-problem" aria-live="polite">
              {problem}
            </span>
            <button
              type="button"
              className="td-action"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="td-action td-action-primary"
              disabled={Boolean(problem) || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
