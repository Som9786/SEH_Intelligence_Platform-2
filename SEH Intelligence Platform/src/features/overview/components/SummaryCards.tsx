import { Boxes, Database, GitFork, Table2 } from 'lucide-react';
import type { OverviewSummary } from '../types/overview';

/** The database's headline numbers, shown as compact tiles inside the database card. */
export function SummaryCards({ summary }: { summary: OverviewSummary }) {
  const stats = [
    {
      title: 'Database engine',
      value: summary.database.provider ?? 'Unknown',
      note: summary.database.version
        ? `Version ${summary.database.version}`
        : 'Version not recorded',
      icon: Database,
    },
    {
      title: 'Tables',
      value: summary.counts.tables,
      note: 'In this catalog',
      icon: Table2,
    },
    {
      title: 'Business areas',
      value: summary.counts.businessAreas,
      note: 'Groups of related tables',
      icon: Boxes,
    },
    {
      title: 'Relationships',
      value: summary.counts.relationships,
      note: 'Links between tables',
      icon: GitFork,
    },
  ];
  return (
    <ul className="db-stats" aria-label="Database summary">
      {stats.map(({ title, value, note, icon: Icon }) => (
        <li className="db-stat" key={title}>
          <span className="db-stat-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
          <div className="db-stat-text">
            <strong className="db-stat-value">{value}</strong>
            <span className="db-stat-title">{title}</span>
            <span className="db-stat-note">{note}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
