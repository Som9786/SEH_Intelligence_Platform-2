import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

const FOCUSABLE =
  'button:not(:disabled), [href], summary, [tabindex]:not([tabindex="-1"])';

/**
 * A panel on the right of the screen over a dimmed page. Tab stays inside it; Escape, the close
 * button or a click outside closes it, and focus goes back to whatever opened it.
 */
export function SideFlyout({
  kicker,
  title,
  onClose,
  children,
}: {
  kicker: string;
  title: string;
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
    panel.current?.querySelector<HTMLElement>('button')?.focus();
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
    const items = [
      ...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
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
    <>
      <button
        type="button"
        className="dbt-scrim"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        ref={panel}
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
          </div>
          <button
            type="button"
            className="rv-close"
            aria-label="Close"
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
