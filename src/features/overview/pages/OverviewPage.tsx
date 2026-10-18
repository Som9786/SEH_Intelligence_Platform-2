import { BookOpen, Eye, Network } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';
import { LoadingState } from '../../../shared/components/LoadingState';
import { ErrorState } from '../../../shared/components/ErrorState';
import { DatabaseHeaderCard } from '../components/DatabaseHeaderCard';
import { SummaryCards } from '../components/SummaryCards';
import { BusinessAreaCards } from '../components/BusinessAreaCards';
import { useOverviewSummary } from '../hooks/useOverviewSummary';

export function OverviewPage() {
  const query = useOverviewSummary();
  return (
    <div className="page-content">
      <PageHeading
        title="Explore your database"
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
          <SummaryCards summary={query.data} />
          <div className="overview-grid">
            <BusinessAreaCards areas={query.data.businessAreas} />
            <aside
              className="panel glance-panel"
              aria-labelledby="glance-heading"
            >
              <div className="panel-header">
                <div>
                  <p className="eyebrow">About this view</p>
                  <h2 id="glance-heading">Database at a glance</h2>
                </div>
              </div>
              <div className="insight">
                <BookOpen aria-hidden="true" />
                <div>
                  <h3>Knowledge, organized</h3>
                  <p>
                    The catalog groups tables under the database name. Read the
                    business-area document for the existing AI interpretation.
                  </p>
                </div>
              </div>
              <div className="insight">
                <Network aria-hidden="true" />
                <div>
                  <h3>Declared relationships</h3>
                  <p>
                    Relationships come from the exported foreign-key metadata.
                    The relationship analysis explains evidence and uncertainty.
                  </p>
                </div>
              </div>
              <div className="insight">
                <Eye aria-hidden="true" />
                <div>
                  <h3>Read-only access</h3>
                  <p>
                    This workspace reads existing JSON and Markdown files. It
                    has no database connection and makes no AI calls.
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
