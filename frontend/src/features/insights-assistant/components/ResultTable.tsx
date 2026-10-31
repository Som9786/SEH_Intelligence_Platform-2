import { useState } from 'react';
import type { AnalyticsResult } from '../services/assistantService';
import { formatCell, humanize, isAmount } from '../utils/formatCell';

/** Rows shown in the results table; the rest are counted. */
const MAX_ROWS = 50;

/**
 * A query result's rows, up to maxRows (MAX_ROWS unless a page shows them all). With dataBars,
 * each amount cell gets a thin bar sized against its column's largest value, so the table reads
 * at a glance.
 */
export function ResultTable({
  result,
  dataBars = false,
  barColor,
  maxRows = MAX_ROWS,
}: {
  result: NonNullable<AnalyticsResult['result']>;
  dataBars?: boolean;
  /** A column's bar colour (its metric's); the default bar colour otherwise. */
  barColor?: (column: string) => string;
  maxRows?: number;
}) {
  // "Show all" lifts the limit for this table; the rows a query returned are all in the result.
  const [showAll, setShowAll] = useState(false);
  if (result.rows.length === 0)
    return <p className="ia-table-note">The query returned no rows.</p>;
  const limit = showAll ? Infinity : maxRows;
  const rows = result.rows.slice(0, limit);
  const maxOf = new Map(
    dataBars && rows.length > 1
      ? result.columns
          .filter((column) => isAmount(rows[0][column], column))
          .map((column) => [
            column,
            Math.max(...rows.map((row) => Math.abs(Number(row[column]) || 0))),
          ])
      : [],
  );
  return (
    <div className="ia-table-card">
      <div className="ia-table-scroll">
        <table className="ia-table">
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={
                    isAmount(rows[0][column], column) ? 'is-number' : undefined
                  }
                >
                  {humanize(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {result.columns.map((column) => {
                  const max = maxOf.get(column);
                  const value = row[column];
                  return (
                    <td
                      key={column}
                      className={
                        isAmount(value, column) ? 'is-number' : undefined
                      }
                    >
                      {formatCell(value, column)}
                      {max && typeof value === 'number' ? (
                        <span className="ia-cell-bar" aria-hidden="true">
                          <span
                            style={{
                              background: barColor?.(column),
                              width: `${(Math.abs(value) / max) * 100}%`,
                            }}
                          />
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(result.rows.length > maxRows || result.truncated) && (
        <p className="ia-table-note">
          Showing {rows.length} of {result.rows.length}
          {result.truncated ? '+' : ''} rows.
          {result.rows.length > maxRows && (
            <button
              type="button"
              className="ia-table-more"
              onClick={() => setShowAll((all) => !all)}
            >
              {showAll ? 'Show fewer' : `Show all ${result.rows.length} rows`}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
