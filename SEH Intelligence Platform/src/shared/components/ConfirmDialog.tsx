import { TriangleAlert, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

const FOCUSABLE = 'button:not([disabled]), a[href]';

/**
 * Asks before something that can't be undone, such as removing a widget or deleting a schedule,
 * in the app's own dialog rather than the browser's. Focus starts on Cancel, so Enter or Escape
 * never removes anything by accident; Tab stays inside and focus returns to the opener on close.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** What will happen, in a sentence or two. */
  children: ReactNode;
  /** The action, such as "Remove" or "Delete". */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  // Keep the page behind still, start on Cancel, and hand focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancel.current?.focus();
    return () => {
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
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

  return (
    <div
      className="rv-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialog}
        className="rv-modal cf-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        onKeyDown={onKeyDown}
      >
        <div className="rv-head">
          <div className="cf-title">
            <span className="cf-icon" aria-hidden="true">
              <TriangleAlert size={18} />
            </span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="rv-close"
            aria-label="Close"
            onClick={onCancel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="rv-body">
          <p id={textId} className="cf-text">
            {children}
          </p>
        </div>
        <div className="rv-foot">
          <button
            ref={cancel}
            type="button"
            className="td-action"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="td-action td-action-danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
