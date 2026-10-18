import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import type { KeysResponse } from '../types/tableDetails';
import { KeyBadge } from './KeyBadge';

type Kind = 'pk' | 'fk' | 'index';

interface Entry {
  id: string;
  kind: Kind;
  name: string;
  summary: string;
  columns: string[];
  /** Referenced columns for a foreign key, included columns for an index. */
  related: string[];
  relatedTableId: string | null;
  properties: string[];
  details: [label: string, value: string][];
}

const PAGE_SIZE = 20;
const TYPE_LABEL: Record<Kind, string> = {
  pk: 'Primary key',
  fk: 'Foreign key',
  index: 'Index',
};
function buildEntries(data: KeysResponse): Entry[] {
  const column = (id: string) => id.substring(data.tableId.length + 1);
  const indexByName = new Map(data.indexes.map((ix) => [ix.name, ix]));
  const pkNames = new Set(data.primaryKeys.map((key) => key.constraintName));

  const primary = data.primaryKeys.map((key): Entry => {
    const backing = indexByName.get(key.constraintName);
    const columns = key.columnIds.map(column);
    return {
      id: key.id,
      kind: 'pk',
      name: key.constraintName,
      summary: 'Uniquely identifies each row',
      columns,
      related: [],
      relatedTableId: null,
      properties: [
        'Unique',
        ...(backing
          ? [backing.isClustered ? 'Clustered' : 'Nonclustered']
          : []),
      ],
      details: [
        ['Constraint', key.constraintName],
        ['Columns', columns.join(' → ')],
        ['Composite key', columns.length > 1 ? 'Yes' : 'No'],
      ],
    };
  });

  const foreign = data.foreignKeys.map((key): Entry => {
    const target = `${key.targetSchemaName}.${key.targetTableName}`;
    return {
      id: key.id,
      kind: 'fk',
      name: key.constraintName,
      summary: `References ${target}`,
      columns: key.columnPairs.map((pair) => column(pair.sourceColumnId)),
      related: key.columnPairs.map(
        (pair) => `${key.targetTableName}.${pair.targetColumnName}`,
      ),
      relatedTableId: key.targetTableId,
      properties: key.columnPairs.length > 1 ? ['Composite'] : [],
      details: [
        ['Constraint', key.constraintName],
        [
          'Mapping',
          key.columnPairs
            .map(
              (pair) =>
                `${column(pair.sourceColumnId)} → ${target}.${pair.targetColumnName}`,
            )
            .join(', '),
        ],
      ],
    };
  });

  // The index that backs the primary key is already listed as the primary key.
  const indexes = data.indexes
    .filter((ix) => !pkNames.has(ix.name))
    .map((ix): Entry => {
      const columns = ix.columnIds.map(column);
      const included = ix.includedColumnIds.map(column);
      return {
        id: ix.id,
        kind: 'index',
        name: ix.name,
        summary: ix.isUniqueConstraint
          ? 'Unique constraint'
          : ix.isClustered
            ? 'Clustered index'
            : ix.isUnique
              ? 'Unique index'
              : 'Nonclustered index',
        columns,
        related: included,
        relatedTableId: null,
        properties: [
          ix.isUnique ? 'Unique' : 'Non-unique',
          ix.isClustered ? 'Clustered' : 'Nonclustered',
        ],
        details: [
          ['Index', ix.name],
          ['Key columns', columns.join(', ')],
          ['Included columns', included.length ? included.join(', ') : 'None'],
          ['Unique constraint', ix.isUniqueConstraint ? 'Yes' : 'No'],
          ...(ix.filter ? ([['Filter', ix.filter]] as [string, string][]) : []),
        ],
      };
    });

  return [...primary, ...foreign, ...indexes];
}

const Chips = ({ values }: { values: string[] }) =>
  values.length ? (
    <span className="td-dir-chips">
      {values.map((value) => (
        <code className="td-col-code" key={value}>
          {value}
        </code>
      ))}
    </span>
  ) : (
    <span className="td-col-empty" aria-label="None">
      —
    </span>
  );

export function KeysCard({
  data,
  onNavigate,
}: {
  data: KeysResponse;
  onNavigate: (id: string) => void;
}) {
  const entries = useMemo(() => buildEntries(data), [data]);
  const [query, setQuery] = useState('');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const needle = query.trim().toLocaleLowerCase();
  const matching = entries
    .filter(
      (e) =>
        !needle ||
        [e.name, ...e.columns, ...e.related].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        ),
    )
    .sort((a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name));

  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const visible = matching.slice(start, start + PAGE_SIZE);
  const reset = () => setPage(1);
  const toggle = (id: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  let body;
  if (!entries.length)
    body = (
      <p className="td-note">No keys or indexes are defined for this table.</p>
    );
  else if (!visible.length)
    body = <p className="td-note">No keys or indexes match your filters.</p>;
  else
    body = (
      <div className="td-table-scroll">
        <table className="td-table td-dir-table">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Name</th>
              <th scope="col">Key columns</th>
              <th scope="col">References / included columns</th>
              <th scope="col">Properties</th>
              <th scope="col">
                <span className="td-sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => {
              const expanded = open.has(entry.id);
              const panelId = `dir-${entry.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
              return (
                <Fragment key={entry.id}>
                  <tr className={expanded ? 'td-dir-open' : undefined}>
                    <td>
                      {entry.kind === 'index' ? (
                        <span className="td-chip td-dir-type td-chip-index">
                          {TYPE_LABEL.index}
                        </span>
                      ) : (
                        <KeyBadge
                          kind={entry.kind}
                          label={TYPE_LABEL[entry.kind]}
                          extra={
                            entry.kind === 'fk'
                              ? `${entry.summary}.`
                              : undefined
                          }
                        />
                      )}
                    </td>
                    <th scope="row">
                      <span className="td-dir-name" title={entry.name}>
                        {entry.name}
                      </span>
                      <span className="td-dir-sub">{entry.summary}</span>
                    </th>
                    <td>
                      <Chips values={entry.columns} />
                    </td>
                    <td>
                      {entry.relatedTableId ? (
                        <span className="td-dir-chips">
                          {entry.related.map((value) => (
                            <button
                              type="button"
                              className="td-col-code td-dir-link"
                              key={value}
                              title={`Open ${entry.relatedTableId}`}
                              onClick={() => onNavigate(entry.relatedTableId!)}
                            >
                              {value}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <Chips values={entry.related} />
                      )}
                    </td>
                    <td>
                      {entry.properties.length ? (
                        <span className="td-dir-props">
                          {entry.properties.map((property) => (
                            <span className="td-dir-prop" key={property}>
                              {property}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="td-col-empty" aria-label="None">
                          —
                        </span>
                      )}
                    </td>
                    <td className="td-dir-expand">
                      <button
                        type="button"
                        className="td-dir-toggle"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        aria-label={`${expanded ? 'Hide' : 'Show'} details for ${entry.name}`}
                        onClick={() => toggle(entry.id)}
                      >
                        <ChevronDown size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="td-dir-details-row">
                      <td colSpan={6} id={panelId}>
                        <dl className="td-dir-details">
                          {entry.details.map(([label, value]) => (
                            <Fragment key={label}>
                              <dt>{label}</dt>
                              <dd className="td-mono">{value}</dd>
                            </Fragment>
                          ))}
                        </dl>
                        {entry.relatedTableId && (
                          <button
                            type="button"
                            className="td-link-button"
                            onClick={() => onNavigate(entry.relatedTableId!)}
                          >
                            Open {entry.relatedTableId}
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <section
      id="keys"
      className="td-card td-keys"
      aria-labelledby="keys-heading"
    >
      <div className="td-card-head">
        <div className="td-card-title td-card-title-stack">
          <div className="td-card-title-row">
            <h2 id="keys-heading" tabIndex={-1}>
              Keys &amp; indexes
            </h2>
            {entries.length > 0 && (
              <span className="td-count">
                {matching.length} of {entries.length}
              </span>
            )}
          </div>
          <p>Primary key, foreign keys and indexes, with expandable details.</p>
        </div>
        {entries.length > 0 && (
          <div className="td-tools">
            <label className="td-search">
              <Search size={14} aria-hidden="true" />
              <span className="td-sr-only">Search keys and indexes</span>
              <input
                type="search"
                placeholder="Search keys, columns"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  reset();
                }}
              />
            </label>
            <button
              type="button"
              className="td-tool-button"
              onClick={() => setDescending(!descending)}
            >
              {descending ? 'Name Z–A' : 'Name A–Z'}
            </button>
          </div>
        )}
      </div>
      {body}
      {pages > 1 && (
        <div className="td-dir-summary">
          <span className="td-dir-range">
            Showing {start + 1}–{start + visible.length} of {matching.length}
          </span>
          <span className="td-dir-pager">
            <button
              type="button"
              className="td-tool-button"
              aria-label="Previous page"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span>
              Page {current} of {pages}
            </span>
            <button
              type="button"
              className="td-tool-button"
              aria-label="Next page"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
