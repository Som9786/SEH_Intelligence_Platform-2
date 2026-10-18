import { Boxes } from 'lucide-react';
import type { BusinessAreaSummary } from '../types/overview';
import { EmptyState } from '../../../shared/components/EmptyState';

export function BusinessAreaCards({ areas }: { areas: BusinessAreaSummary[] }) {
  return (
    <section className="panel areas-panel" aria-labelledby="areas-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Explore the catalog</p>
          <h2 id="areas-heading">Modules / Business Areas</h2>
        </div>
        <span className="tag">{areas.length} areas</span>
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
