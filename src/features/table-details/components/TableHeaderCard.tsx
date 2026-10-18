import type { ReactNode } from 'react';
import type { TableRecord } from '../types/tableDetails';
import type { TableReview } from '../types/review';
import { KeyBadge } from './KeyBadge';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { ReviewSummary } from './ReviewSummary';

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export function TableHeaderCard({
  detail,
  review,
  nav,
  tabs,
}: {
  detail: TableRecord;
  /** undefined while loading, null when the table has not been reviewed. */
  review: TableReview | null | undefined;
  nav: ReactNode;
  tabs: ReactNode;
}) {
  const incoming = detail.relationships.filter(
    (r) => r.direction === 'incoming',
  ).length;
  const outgoing = detail.relationships.length - incoming;
  return (
    <header className="td-card td-header" aria-labelledby="table-title">
      <div className="td-header-top">
        <div className="td-header-main">
          <p className="td-eyebrow">Schema {detail.schemaName}</p>
          <div className="td-title-row">
            <h2 id="table-title">
              {detail.schemaName}.{detail.name}
            </h2>
            {review !== undefined && <ReviewStatusBadge review={review} />}
          </div>
          <p
            className={
              'td-description' + (detail.descriptionInferred ? ' inferred' : '')
            }
          >
            {detail.description ?? 'No table description available.'}
          </p>
          <ul className="td-badge-row" aria-label="Table summary">
            <li className="td-chip td-chip-columns">
              {plural(detail.columnCount, 'column', 'columns')}
            </li>
            {detail.primaryKey && (
              <li>
                <KeyBadge
                  kind="pk"
                  extra={`Constraint: ${detail.primaryKey.constraintName}.`}
                >
                  <span className="td-mono">
                    {detail.primaryKey.columnNames.join(', ')}
                  </span>
                </KeyBadge>
              </li>
            )}
            <li>
              <KeyBadge
                kind="fk"
                label={plural(
                  detail.foreignKeyCount,
                  'foreign key',
                  'foreign keys',
                )}
              />
            </li>
            <li className="td-chip td-chip-index">
              {plural(detail.indexCount, 'index', 'indexes')}
            </li>
            <li
              className="td-chip td-chip-rels"
              title={`${incoming} incoming · ${outgoing} outgoing`}
            >
              {plural(
                detail.relationships.length,
                'relationship',
                'relationships',
              )}
            </li>
            {detail.areas.map((area) => (
              <li
                key={area.id}
                className="td-chip td-chip-area"
                title="Business area (inferred)"
              >
                {area.name}
              </li>
            ))}
          </ul>
        </div>
        <div className="td-header-side">
          {nav}
          {review && <ReviewSummary review={review} tableId={detail.id} />}
        </div>
      </div>
      {tabs}
    </header>
  );
}
