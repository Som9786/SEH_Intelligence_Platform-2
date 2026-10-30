import { BookOpen, Eye, Network, TableProperties } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeading } from '../../../../shared/components/PageHeading';
import { LoadingState } from '../../../../shared/components/LoadingState';
import { ErrorState } from '../../../../shared/components/ErrorState';
import { DatabaseHeaderCard } from '../components/DatabaseHeaderCard';
import { BusinessAreaCards } from '../components/BusinessAreaCards';
import { ReviewProgressCard } from '../components/ReviewProgressCard';
import { KeyBadge } from '../../table-details/components/KeyBadge';
import { useOverviewSummary } from '../hooks/useOverviewSummary';

export function DataCatalogPage() {
  const query = useOverviewSummary();
  return (
    <div className="page-content">
      <PageHeading
        title="DB Catalog"
        description="Explore your database catalog and its documentation."
        badge={
          <div className="td-actions">
            <Link to="/db-catalog/tables" className="td-action">
              <TableProperties size={16} aria-hidden="true" />
              DB Tables
            </Link>
            <Link to="/db-catalog/relationships" className="td-action">
              <Network size={16} aria-hidden="true" />
              Relationships
            </Link>
            <Link to="/db-catalog/documentation" className="td-action">
              <BookOpen size={16} aria-hidden="true" />
              DB details
            </Link>
          </div>
        }
      />
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          title="Overview could not be loaded"
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <>
          <DatabaseHeaderCard summary={query.data} />
          <ReviewProgressCard />
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
                  <h3>What's in the catalog</h3>
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
                  <h3>Confirmed vs inferred</h3>
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
                  <h3>Read-only, file-based</h3>
                  <p>
                    Uses exported JSON and Markdown files only. No live database
                    connection, database changes or AI requests.
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
