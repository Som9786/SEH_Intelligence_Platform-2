import { useState } from 'react';
import { Search } from 'lucide-react';
import type { Column, KeysResponse } from '../types/tableDetails';
import { buildColumnRows } from '../utils/columnBadges';
import { ColumnKeys } from './KeyBadge';

export function ColumnsCard({
  columns,
  keys,
}: {
  columns: Column[];
  keys?: KeysResponse;
}) {
  const [query, setQuery] = useState('');
  const [descending, setDescending] = useState(false);
  const rows = buildColumnRows(columns, keys);
  const needle = query.trim().toLocaleLowerCase();
  const visible = rows
    .filter((row) => row.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name));
  let body;
  if (!rows.length)
    body = <p className="td-note">No columns available for this table.</p>;
  else if (!visible.length)
    body = <p className="td-note">No columns match your search.</p>;
  else
    body = (
      <div className="td-table-scroll">
        <table className="td-table td-col-table">
          <thead>
            <tr>
              <th scope="col">Column name</th>
              <th scope="col">Data type</th>
              <th scope="col">Key</th>
              <th scope="col">Nullable</th>
              <th scope="col">Default value</th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span className="td-col-name" title={row.name}>
                    {row.name}
                  </span>
                </th>
                <td>
                  <code className="td-col-code">{row.typeLabel}</code>
                </td>
                <td>
                  <ColumnKeys row={row} />
                </td>
                <td>
                  <span
                    className={
                      'td-col-pill ' +
                      (row.nullableLabel === 'Yes' ? 'td-col-yes' : 'td-col-no')
                    }
                  >
                    {row.nullableLabel.toUpperCase()}
                  </span>
                </td>
                <td>
                  {row.defaultValue !== null ? (
                    <code className="td-col-code">{row.defaultValue}</code>
                  ) : (
                    <span className="td-col-empty" aria-label="None">
                      —
                    </span>
                  )}
                </td>
                <td
                  className={
                    'td-col-description' +
                    (row.descriptionInferred ? ' inferred' : '')
                  }
                >
                  {row.description ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <section
      id="columns"
      className="td-card td-columns"
      aria-labelledby="columns-heading"
    >
      <div className="td-card-head">
        <div className="td-card-title td-card-title-stack">
          <div className="td-card-title-row">
            <h2 id="columns-heading" tabIndex={-1}>
              Columns
            </h2>
            {rows.length > 0 && (
              <span className="td-count">
                {visible.length} of {rows.length}
              </span>
            )}
          </div>
          <p>Column names, data types, nullability, keys and default values.</p>
        </div>
        {rows.length > 0 && (
          <div className="td-tools">
            <label className="td-search">
              <Search size={14} aria-hidden="true" />
              <span className="td-sr-only">Search columns</span>
              <input
                type="search"
                placeholder="Search columns"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
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
    </section>
  );
}
