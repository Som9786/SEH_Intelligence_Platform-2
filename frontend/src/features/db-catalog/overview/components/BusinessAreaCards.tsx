import { Boxes } from 'lucide-react';
import type { BusinessAreaSummary } from '../types/overview';
import { EmptyState } from '../../../../shared/components/EmptyState';

export function BusinessAreaCards({ areas }: { areas: BusinessAreaSummary[] }) {
  return (
    <section className="panel areas-panel" aria-labelledby="areas-heading">
      <div className="td-card-head">
        <div className="td-card-title td-card-title-stack">
          <div className="td-card-title-row">
            <h2 id="areas-heading">Business areas</h2>
            <span className="td-count">{areas.length}</span>
          </div>
          <p>Modules that group the tables by what they are used for.</p>
        </div>
      </div>
      {areas.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="area-grid">
          {areas.map((area) => (
            <article className="area-card" key={area.id}>
              <div className="area-icon">
                <Boxes size={20} aria-hidden="true" />
              </div>
              <div>
                <h3>{area.name}</h3>
                <p className={area.inferred ? 'inferred' : undefined}>
                  {area.description}
                </p>
                <span>
                  {area.tableCount} {area.tableCount === 1 ? 'table' : 'tables'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="area-note">
        A table can appear in multiple areas. Unassigned tables remain in the
        total table count.
      </p>
    </section>
  );
}
