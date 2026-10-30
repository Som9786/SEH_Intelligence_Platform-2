import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), [href], summary, [tabindex]:not([tabindex="-1"])';

/**
 * A panel on the right of the screen over a dimmed page: Data behind this, Explore questions and
 * the table search all use it. Tab stays inside it; Escape, the close button or a click outside
 * closes it, the page behind doesn't scroll, and focus goes back to whatever opened it.
 */
export function SideFlyout({
  id,
  kicker,
  title,
  subtitle,
  closeLabel = 'Close',
  initialFocus,
  onClose,
  children,
}: {
  id?: string;
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  closeLabel?: string;
  /** Focused on open; the first button (Close) otherwise. */
  initialFocus?: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);

  // Focus the panel on open, keep the page behind it still, and hand focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (
      initialFocus?.current ??
      panel.current?.querySelector<HTMLElement>('button')
    )?.focus();
    return () => {
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on open only
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // In page order (some DOM implementations return a selector list's matches grouped by selector).
    const items = [
      ...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
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
    <>
      {/* Clicking outside closes; keyboard and screen reader users have the close button. */}
      <button
        type="button"
        className="dbt-scrim"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        ref={panel}
        id={id}
        className="dbt-flyout"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <header className="dbt-head">
          <div>
            <p className="ia-label">{kicker}</p>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="dbt-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="rv-close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="dbt-body">{children}</div>
      </aside>
    </>
  );
}
