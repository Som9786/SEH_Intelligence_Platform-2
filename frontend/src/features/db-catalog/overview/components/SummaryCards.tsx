import { Boxes, Database, GitFork, Table2 } from 'lucide-react';
import type { OverviewSummary } from '../types/overview';

/** Engine names as the vendors write them; the export uses identifiers such as "SqlServer". */
const ENGINES: Record<string, string> = {
  sqlserver: 'SQL Server',
  mssql: 'SQL Server',
  postgresql: 'PostgreSQL',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  oracle: 'Oracle',
  sqlite: 'SQLite',
};

const engineName = (provider: string | null | undefined) =>
  provider
    ? (ENGINES[provider.replace(/[\s_-]/g, '').toLowerCase()] ?? provider)
    : 'Unknown';

/** The database's headline numbers, shown as compact tiles inside the database card. */
export function SummaryCards({ summary }: { summary: OverviewSummary }) {
  const stats = [
    {
      title: 'Database engine',
      value: engineName(summary.database.provider),
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
