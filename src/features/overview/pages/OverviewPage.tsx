import { BookOpen, Eye, Network } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';
import { LoadingState } from '../../../shared/components/LoadingState';
import { ErrorState } from '../../../shared/components/ErrorState';
import { DatabaseHeaderCard } from '../components/DatabaseHeaderCard';
import { BusinessAreaCards } from '../components/BusinessAreaCards';
import { KeyBadge } from '../../table-details/components/KeyBadge';
import { useOverviewSummary } from '../hooks/useOverviewSummary';

export function OverviewPage() {
  const query = useOverviewSummary();
  return (
    <div className="page-content">
      <PageHeading
        title="Overview"
        description="Explore your saved database snapshot and its documentation."
        badge={
          <div className="td-actions">
            <Link to="/documentation" className="td-action td-action-primary">
              <BookOpen size={16} aria-hidden="true" />
              View Details
            </Link>
          </div>
        }
      />
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <>
          <DatabaseHeaderCard summary={query.data} />
          <div className="overview-grid">
            <BusinessAreaCards areas={query.data.businessAreas} />
            <aside
              className="panel glance-panel"
              aria-labelledby="glance-heading"
            >
              <div className="td-card-head">
                <div className="td-card-title td-card-title-stack">
                  <div className="td-card-title-row">
                    <h2 id="glance-heading">Database at a glance</h2>
                  </div>
                  <p>
                    How to read this catalog and where its information comes
                    from.
                  </p>
                </div>
              </div>
              <div className="insight">
                <BookOpen aria-hidden="true" />
                <div>
                  <h3>DB Catalog: Knowledge, organized</h3>
                  <p>
                    Explore tables and business areas in one place, with
                    documentation that makes database metadata easier to
                    understand.
                  </p>
                </div>
              </div>
              <div className="insight">
                <Network aria-hidden="true" />
                <div>
                  <h3>DB Relationships: Evidence and confidence</h3>
                  <ul className="insight-legend-list">
                    <li>
                      <div className="legend-head">
                        <span className="td-chip td-chip-confirmed">
                          Confirmed
                        </span>
                        <KeyBadge kind="pk" />
                        <KeyBadge kind="fk" />
                      </div>
                      <p>Defined in the database metadata.</p>
                    </li>
                    <li>
                      <div className="legend-head">
                        <span className="td-chip td-chip-inferred inferred">
                          Inferred
                        </span>
                        <KeyBadge kind="pk" inferred />
                        <KeyBadge kind="fk" inferred />
                      </div>
                      <p>
                        Suggested from names or data patterns, not enforced by
                        the database. Shown in orange.
                      </p>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="insight">
                <Eye aria-hidden="true" />
                <div>
                  <h3>DB access: File-based, read-only</h3>
                  <p>
                    Uses exported JSON and Markdown files only. No live database
                    connection, database changes, or AI requests.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
