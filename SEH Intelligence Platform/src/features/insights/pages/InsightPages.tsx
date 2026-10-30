import { useQuery } from '@tanstack/react-query';
import { Check, Copy, SearchX, Share2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  formatWhen,
  getShare,
  getWidget,
} from '../../workspace/workspaceService';
import { InsightView } from '../components/InsightView';
import { ShareDialog } from '../components/ShareDialog';

/** Loading, failed and not-found states for an insight read by the id in the link. */
function Pending({
  query,
  missing,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => unknown;
  };
  missing: ReactNode;
}) {
  if (query.isPending)
    return (
      <div className="page-content">
        <div className="state-panel" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>Loading the insight…</p>
        </div>
      </div>
    );
  return (
    <div className="page-content">
      <div className="state-panel" role="alert">
        <SearchX size={28} aria-hidden="true" />
        <h2>This insight can't be shown</h2>
        {/* No id in the link, or the service has none with it ("No widget with that id."). */}
        <p>
          {!query.error || /^No /.test(query.error.message)
            ? missing
            : query.error.message}
        </p>
        {query.isError && (
          <button
            type="button"
            className="td-action"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/** A board widget on a page of its own, opened in a new tab from the board (?id=<widget id>). */
export function WidgetInsightPage() {
  const id = useSearchParams()[0].get('id') ?? '';
  const widget = useQuery({
    queryKey: ['workspace', 'widget', id],
    queryFn: () => getWidget(id),
    enabled: Boolean(id),
    retry: false,
  });
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    if (widget.data) document.title = `${widget.data.title} · SEH Intelligence`;
  }, [widget.data]);

  if (!widget.data)
    return (
      <Pending
        query={{ ...widget, isPending: widget.isPending && Boolean(id) }}
        missing="It may have been removed from its board."
      />
    );
  const data = widget.data;
  return (
    <>
      <InsightView
        insight={data}
        actions={
          <button
            type="button"
            className="td-action td-action-primary"
            aria-haspopup="dialog"
            onClick={() => setSharing(true)}
          >
            <Share2 size={16} aria-hidden="true" />
            Share
          </button>
        }
      />
      {sharing && (
        <ShareDialog widget={data} onClose={() => setSharing(false)} />
      )}
    </>
  );
}

/** An insight someone shared (?id=<share id>): the copy made when they shared it. */
export function SharedInsightPage() {
  const id = useSearchParams()[0].get('id') ?? '';
  const share = useQuery({
    queryKey: ['workspace', 'shared', id],
    queryFn: () => getShare(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: Infinity,
  });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (share.data) document.title = `${share.data.title} · SEH Intelligence`;
  }, [share.data]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!share.data)
    return (
      <Pending
        query={{ ...share, isPending: share.isPending && Boolean(id) }}
        missing="Check the link; it may be incomplete."
      />
    );
  const data = share.data;
  return (
    <InsightView
      insight={data}
      notice={
        <p className="ins-notice">
          <Share2 size={14} aria-hidden="true" />
          <span>
            Shared by <strong>{data.sharedBy}</strong> on{' '}
            {formatWhen(data.sharedAt)}. This is the insight as it was then.
          </span>
        </p>
      }
      actions={
        <button
          type="button"
          className="td-action td-action-primary"
          onClick={() =>
            void navigator.clipboard
              .writeText(window.location.href)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      }
    />
  );
}
