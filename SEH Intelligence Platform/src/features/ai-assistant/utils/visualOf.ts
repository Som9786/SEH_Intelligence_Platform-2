import type { AnalyticsResult } from '../services/assistantService';
import { isIdColumn } from './formatCell';

type Result = NonNullable<AnalyticsResult['result']>;
type Row = Record<string, unknown>;

/**
 * How an answer's rows are shown, picked from their shape:
 * - kpi: one number; kpis: one row of a few numbers
 * - line: a number (up to 3) over dates; columns: a number by weekday or hour, in order
 * - bars: names and one number; bars2: names and two numbers (the second shown beside the bar)
 * - share: names and a share or percentage, few rows
 * - heatmap: two categories and one number; table: anything else
 */
export type VisualKind =
  | 'kpi'
  | 'kpis'
  | 'line'
  | 'columns'
  | 'bars'
  | 'bars2'
  | 'share'
  | 'heatmap'
  | 'table';

/** How much room a board widget takes: a third, half, or the whole row. */
export type VisualSize = 'small' | 'medium' | 'wide';

export interface Visual {
  kind: VisualKind;
  size: VisualSize;
  /** Category or time columns, in display order (heatmap: rows, then columns). */
  dims: string[];
  /** Number columns plotted, in order. */
  measures: string[];
  /** The rows in display order (dates ascending, Monday→Sunday, hour 0→23). */
  rows: Row[];
}

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** Columns that hold a time unit even when their values are numbers (hour 13, month 8). */
const TIME_UNIT =
  /(^|_)(hour|hour_of_day|dow|weekday|day_of_week|week|month|year|quarter)$/i;
const DATE_NAME = /(^|_)(date|day|month|week|time|period)$/i;
const DATE_VALUE = /^\d{4}-\d{2}(-\d{2})?([T ]|$)/;
const SHARE_NAME = /(share|pct|percent|ratio|proportion)/i;

const MAX_BARS = 15;
const MAX_SHARE = 6;
const MAX_LINES = 3;

const values = (rows: Row[], column: string) =>
  rows.map((row) => row[column]).filter((v) => v !== null && v !== undefined);

function isMeasure(rows: Row[], column: string) {
  if (isIdColumn(column) || TIME_UNIT.test(column)) return false;
  const present = values(rows, column);
  return present.length > 0 && present.every((v) => typeof v === 'number');
}

/** Weekday names, or the database's weekday numbers (ISO: 1 = Monday … 7 = Sunday). */
function isWeekday(rows: Row[], column: string) {
  const present = values(rows, column);
  return (
    present.length > 0 &&
    (present.every(
      (v) => typeof v === 'string' && WEEKDAYS.includes(v.trim().toLowerCase()),
    ) ||
      (/(^|_)(day_of_week|dow|weekday)$/i.test(column) &&
        present.every(
          (v) =>
            typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 7,
        )))
  );
}

/** A weekday's place in the week, from its name or ISO number. */
const weekdayIndex = (value: unknown) =>
  typeof value === 'number'
    ? value - 1
    : WEEKDAYS.indexOf(String(value).trim().toLowerCase());

function isHour(rows: Row[], column: string) {
  const present = values(rows, column);
  return (
    /hour/i.test(column) &&
    present.every((v) => typeof v === 'number' && v >= 0 && v <= 23)
  );
}

function isDate(rows: Row[], column: string) {
  const present = values(rows, column);
  return (
    present.length > 0 &&
    (present.every((v) => typeof v === 'string' && DATE_VALUE.test(v)) ||
      (DATE_NAME.test(column) && !present.some((v) => typeof v === 'number')))
  );
}

const distinct = (rows: Row[], column: string) =>
  new Set(rows.map((row) => String(row[column]))).size;

export function visualOf(result: Result): Visual {
  const { columns } = result;
  const rows = result.rows;
  const measures = columns.filter((c) => isMeasure(rows, c));
  const dims = columns.filter((c) => !measures.includes(c));
  const table: Visual = {
    kind: 'table',
    size: 'wide',
    dims,
    measures,
    rows,
  };
  if (rows.length === 0 || measures.length === 0) return table;

  // A single row: the numbers themselves are the answer.
  if (rows.length === 1) {
    if (measures.length === 1)
      return { kind: 'kpi', size: 'small', dims, measures, rows };
    if (measures.length <= 6)
      return {
        kind: 'kpis',
        size: measures.length > 3 ? 'wide' : 'medium',
        dims,
        measures,
        rows,
      };
    return table;
  }

  if (dims.length === 1 && measures.length <= MAX_LINES) {
    const [dim] = dims;
    if (isWeekday(rows, dim))
      return {
        kind: 'columns',
        size: 'medium',
        dims,
        measures: measures.slice(0, 1),
        rows: [...rows].sort(
          (a, b) => weekdayIndex(a[dim]) - weekdayIndex(b[dim]),
        ),
      };
    if (isHour(rows, dim))
      return {
        kind: 'columns',
        size: rows.length > 12 ? 'wide' : 'medium',
        dims,
        measures: measures.slice(0, 1),
        rows: [...rows].sort((a, b) => Number(a[dim]) - Number(b[dim])),
      };
    if (isDate(rows, dim))
      return {
        kind: 'line',
        size: 'wide',
        dims,
        measures,
        rows: [...rows].sort((a, b) =>
          String(a[dim]).localeCompare(String(b[dim])),
        ),
      };
    if (
      measures.length === 1 &&
      SHARE_NAME.test(measures[0]) &&
      rows.length <= MAX_SHARE &&
      rows.every((row) => Number(row[measures[0]]) >= 0)
    )
      return { kind: 'share', size: 'medium', dims, measures, rows };
    if (rows.length <= MAX_BARS && measures.length === 1)
      return { kind: 'bars', size: 'medium', dims, measures, rows };
    if (rows.length <= MAX_BARS && measures.length === 2)
      return { kind: 'bars2', size: 'medium', dims, measures, rows };
    return table;
  }

  // Two categories and one number: a grid, the category with more values across.
  if (dims.length === 2 && measures.length === 1 && rows.length >= 4) {
    const [a, b] = dims;
    const across = distinct(rows, a) >= distinct(rows, b) ? a : b;
    const down = across === a ? b : a;
    if (distinct(rows, across) <= 31 && distinct(rows, down) <= 24)
      return {
        kind: 'heatmap',
        size: 'wide',
        dims: [down, across],
        measures,
        rows,
      };
  }
  return table;
}

/** Weekday order for a heatmap's labels, when they are weekdays. */
export function orderLabels(labels: string[]): string[] {
  const weekdays = labels.every((l) =>
    WEEKDAYS.includes(l.trim().toLowerCase()),
  );
  if (weekdays)
    return [...labels].sort(
      (a, b) =>
        WEEKDAYS.indexOf(a.trim().toLowerCase()) -
        WEEKDAYS.indexOf(b.trim().toLowerCase()),
    );
  const numeric = labels.every((l) => l !== '' && !Number.isNaN(Number(l)));
  return [...labels].sort((a, b) =>
    numeric ? Number(a) - Number(b) : a.localeCompare(b),
  );
}
