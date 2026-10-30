import { useQuery } from '@tanstack/react-query';
import { SearchX, Share2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { getShare, getWidget } from '../../workspace/workspaceService';
import { InsightView } from '../components/InsightView';
import { ReportFrame, SharedReport } from '../components/SharedReport';
import { ShareDialog } from '../components/ShareDialog';

function InAppFrame({ children }: { children: ReactNode }) {
  return <div className="page-content">{children}</div>;
}

/**
 * Loading, failed, expired and not-found states for an insight read by the id in the link: in the
 * app's page, or framed as a report (framed) for a shared link.
 */
function Pending({
  query,
  missing,
  framed = false,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => unknown;
  };
  missing: ReactNode;
  framed?: boolean;
}) {
  const Frame = framed ? ReportFrame : InAppFrame;
  if (query.isPending)
    return (
      <Frame>
        <div className="state-panel" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>Loading the insight…</p>
        </div>
      </Frame>
    );
  return (
    <Frame>
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
    </Frame>
  );
}

/**
 * A board widget on a page of its own, opened in a new tab from the board
 * (/basket-intelligence/insight/<widget id>).
 */
export function WidgetInsightPage() {
  const id = useParams().id ?? '';
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

/**
 * An insight someone shared (/share/<share id>): the copy made when they shared it, as a report on a
 * page of its own (no sidebar or top bar). Signing in is still needed; the link expires.
 */
export function SharedInsightPage() {
  const id = useParams().id ?? '';
  const share = useQuery({
    queryKey: ['workspace', 'shared', id],
    queryFn: () => getShare(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (share.data) document.title = `${share.data.title} · SEH Intelligence`;
  }, [share.data]);

  if (!share.data)
    return (
      <Pending
        framed
        query={{ ...share, isPending: share.isPending && Boolean(id) }}
        missing="Check the link; it may be incomplete."
      />
    );
  return <SharedReport share={share.data} />;
}
