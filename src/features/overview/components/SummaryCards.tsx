import { Boxes, Database, FileJson, Table2 } from 'lucide-react';
import type { OverviewSummary } from '../types/overview';

const freshnessCopy = {
  live: {
    value: 'Live',
    note: 'Read directly from the database',
    tone: 'green',
  },
  cached: {
    value: 'File snapshot',
    note: 'Showing the last generated snapshot',
    tone: 'orange',
  },
  unavailable: {
    value: 'Unavailable',
    note: 'No snapshot could be read',
    tone: 'red',
  },
} as const;

export function SummaryCards({ summary }: { summary: OverviewSummary }) {
  const status = freshnessCopy[summary.freshness.status];
  const cards = [
    {
      title: 'Business areas',
      value: summary.counts.businessAreas,
      note: 'Organized modules',
      icon: Boxes,
      tone: 'green',
    },
    {
      title: 'Tables',
      value: summary.counts.tables,
      note: 'Unique catalog tables',
      icon: Table2,
      tone: 'orange',
    },
    {
      title: 'Database engine',
      value: summary.database.provider ?? 'Unknown',
      note: summary.database.version
        ? `Version ${summary.database.version}`
        : 'Version not recorded',
      icon: Database,
      tone: 'orange',
    },
    {
      title: 'Database status',
      value: status.value,
      note: status.note,
      icon: FileJson,
      tone: status.tone,
    },
  ];
  return (
    <>
      <section className="kpi-grid" aria-label="Database summary">
        {cards.map(({ title, value, note, icon: Icon, tone }) => (
          <article className="kpi-card" key={title}>
            <div className={'kpi-icon ' + tone}>
              <Icon size={20} aria-hidden="true" />
            </div>
            <p className="kpi-title">{title}</p>
            <strong className="kpi-value">{value}</strong>
            <p className="kpi-note">{note}</p>
          </article>
        ))}
      </section>
    </>
  );
}
