import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Mail,
  Share2,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  formatWhen,
  shareUrl,
  shareWidget,
  type Widget,
} from '../../../platform/api/workspaceService';
import { shareSummary } from '../utils/insight';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shares a widget: makes a copy of it as it is now (answer, chart, every row, how it was reached,
 * without the query) and gives its link, to copy, email or send with the system share sheet. It
 * opens as a report for anyone signed in until it expires; refreshing or removing the widget later
 * doesn't change what it shows.
 */
export function ShareDialog({
  widget,
  onClose,
}: {
  widget: Widget;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  // One copy each time the dialog opens; a query, not a mutation, so a re-render never shares twice.
  const [opened] = useState(() => Date.now());
  const share = useQuery({
    queryKey: ['workspace', 'share', widget.id, opened],
    queryFn: () => shareWidget(widget),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const [copied, setCopied] = useState<'link' | 'summary' | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const url = share.data ? shareUrl(share.data) : '';
  const summary = share.data ? shareSummary(share.data, url) : '';
  const rows = widget.result?.rows.length ?? 0;

  // Keep the page behind still, and hand focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('.rv-close')?.focus();
    return () => {
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (what: 'link' | 'summary') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? url : summary);
      setCopyError(null);
      setCopied(what);
    } catch {
      setCopyError("Couldn't copy here; select the link and copy it instead.");
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
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
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="rv-modal sh-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className="rv-head">
          <div>
            <h2 id={titleId}>Share insight</h2>
            <p className="rv-table">{widget.title}</p>
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
          {share.isPending && (
            <p className="ia-thinking" role="status">
              <span className="spinner" aria-hidden="true" />
              Making a link…
            </p>
          )}
          {share.isError && (
            <div className="ia-error" role="alert">
              <p>Couldn't share it: {share.error.message}</p>
              <button
                type="button"
                className="td-action"
                onClick={() => void share.refetch()}
              >
                Try again
              </button>
            </div>
          )}
          {share.data && (
            <>
              <div className="sh-link">
                <label className="rv-field">
                  <span>Link</span>
                  <input
                    readOnly
                    value={url}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <button
                  type="button"
                  className="td-action td-action-primary"
                  onClick={() => void copy('link')}
                >
                  {copied === 'link' ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  {copied === 'link' ? 'Copied' : 'Copy link'}
                </button>
              </div>

              <div>
                <p className="ia-label">What's shared</p>
                <ul className="sh-included">
                  <li>The answer{widget.answer ? '' : ' (none was kept)'}</li>
                  {widget.result && (
                    <li>
                      The chart and all {rows} {rows === 1 ? 'row' : 'rows'},
                      with a CSV download
                    </li>
                  )}
                  <li>
                    {widget.details
                      ? 'How it was reached and the data behind it (not the query or table names)'
                      : 'How it was reached: not kept for this widget yet (refresh it to record it)'}
                  </li>
                  <li>
                    Data synced{' '}
                    {formatWhen(share.data.fetchedAt ?? widget.createdAt)}
                  </li>
                </ul>
              </div>

              <div className="sh-actions">
                <button
                  type="button"
                  className="td-action"
                  onClick={() => void copy('summary')}
                >
                  {copied === 'summary' ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <FileText size={16} aria-hidden="true" />
                  )}
                  {copied === 'summary' ? 'Copied' : 'Copy summary'}
                </button>
                <a
                  className="td-action"
                  href={`mailto:?subject=${encodeURIComponent(widget.title)}&body=${encodeURIComponent(summary)}`}
                >
                  <Mail size={16} aria-hidden="true" />
                  Email
                </a>
                {'share' in navigator && (
                  <button
                    type="button"
                    className="td-action"
                    onClick={() =>
                      void navigator
                        .share({ title: widget.title, text: summary, url })
                        .catch(() => undefined)
                    }
                  >
                    <Share2 size={16} aria-hidden="true" />
                    Share…
                  </button>
                )}
                <a
                  className="td-action"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  Open
                </a>
              </div>
              {copyError && (
                <p className="rv-error" role="alert">
                  {copyError}
                </p>
              )}
              <p className="rv-note">
                Anyone signed in to the platform can open this link
                {share.data.expiresAt &&
                  ` until ${formatWhen(share.data.expiresAt)}`}
                . It shows the insight as it is now; refreshing or removing the
                widget later doesn't change it.
              </p>
            </>
          )}
        </div>

        <div className="rv-foot">
          <span className="rv-problem" />
          <button type="button" className="td-action" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
