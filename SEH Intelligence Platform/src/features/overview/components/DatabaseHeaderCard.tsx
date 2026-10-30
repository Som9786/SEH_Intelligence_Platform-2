import type { OverviewSummary } from '../types/overview';
import { SummaryCards } from './SummaryCards';

/** The database's name and description on the left, its headline numbers on the right. */
export function DatabaseHeaderCard({ summary }: { summary: OverviewSummary }) {
  const { database } = summary;
  return (
    <header
      className="td-card td-header overview-db"
      aria-labelledby="database-title"
    >
      <div className="td-header-main">
        <p className="eyebrow">Database</p>
        <div className="td-title-row">
          <h2 id="database-title">{database.name}</h2>
        </div>
        <p
          className={
            'td-description' + (database.summaryInferred ? ' inferred' : '')
          }
        >
          {database.summary ?? 'No database description available.'}
        </p>
      </div>
      <SummaryCards summary={summary} />
    </header>
  );
}
