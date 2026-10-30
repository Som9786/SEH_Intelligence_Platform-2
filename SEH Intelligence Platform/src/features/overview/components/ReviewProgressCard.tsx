import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { useTableList } from '../../table-details/hooks/useTableList';
import { useReviews } from '../../table-details/hooks/useReview';

const tableLink = (id: string) =>
  `/table-details?table=${encodeURIComponent(id)}`;

/** How many tables have been reviewed, with a link to the next one that needs a look. */
export function ReviewProgressCard() {
  const list = useTableList('');
  const ids = list.tables.map((table) => table.id);
  const reviews = useReviews(ids);
  const loading = list.isPending || reviews.some((review) => review.isPending);

  const statusOf = (i: number) => reviews[i]?.data?.status ?? null;
  const verified = ids.filter((_, i) => statusOf(i) === 'verified').length;
  const attention = ids.filter(
    (_, i) => statusOf(i) === 'needs-attention',
  ).length;
  const notReviewed = ids.length - verified - attention;
  // Tables flagged for attention come first, then ones nobody has reviewed yet.
  const nextId =
    ids.find((_, i) => statusOf(i) === 'needs-attention') ??
    ids.find((_, i) => statusOf(i) === null && !reviews[i]?.isError);

  const segments = [
    { key: 'verified', label: 'Verified', count: verified },
    { key: 'needs-attention', label: 'Needs attention', count: attention },
    { key: 'none', label: 'Not reviewed', count: notReviewed },
  ];

  return (
    <section className="panel po-card" aria-labelledby="po-reviews">
      <div className="po-card-head">
        <h3 id="po-reviews">Review progress</h3>
        <span className="po-card-note">
          {loading
            ? ''
            : `${verified} of ${ids.length} verified${list.hasNextPage ? ' (first page)' : ''}`}
        </span>
      </div>
      {list.isError ? (
        <p className="po-card-note" role="alert">
          Tables could not be loaded.
        </p>
      ) : loading ? (
        <p className="po-card-note">Loading reviews…</p>
      ) : (
        <>
          <div className="po-review-bar" aria-hidden="true">
            {segments
              .filter((segment) => segment.count > 0)
              .map((segment) => (
                <span
                  key={segment.key}
                  className={`po-review-${segment.key}`}
                  style={{ flexGrow: segment.count }}
                  title={`${segment.label}: ${segment.count}`}
                />
              ))}
          </div>
          <ul className="po-review-legend">
            {segments.map((segment) => (
              <li key={segment.key}>
                <span
                  className={`rv-dot rv-dot-${segment.key}`}
                  aria-hidden="true"
                />
                <strong>{segment.count}</strong> {segment.label}
              </li>
            ))}
          </ul>
          <p className="po-card-foot">
            {nextId ? (
              <Link to={tableLink(nextId)}>
                {attention > 0
                  ? 'Open a table needing attention'
                  : 'Review the next table'}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : (
              'Every table has been reviewed.'
            )}
          </p>
        </>
      )}
    </section>
  );
}
