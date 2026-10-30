const numberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};
const DATE_TIME: Intl.DateTimeFormatOptions = {
  ...DATE,
  hour: '2-digit',
  minute: '2-digit',
};

/** Columns whose numbers are identifiers (store 54297, not 54,297). */
const ID_COLUMN = /(^|_)(id|num|number|no|code|store|year)$/i;

export const isIdColumn = (column: string) => ID_COLUMN.test(column);

/** An amount to right-align, unlike an identifier such as a store number. */
export const isAmount = (value: unknown, column: string) =>
  typeof value === 'number' && !ID_COLUMN.test(column);

/** "net_sales" → "Net sales". */
export const humanize = (column: string) => {
  const text = column.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const compactFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 265122.03 → "265.1K", for chart axes. */
export const formatCompact = (value: number) => compactFormat.format(value);

/** A result cell as text: numbers with separators (but not IDs), nothing as a dash. */
export function formatCell(value: unknown, column?: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number')
    return column && ID_COLUMN.test(column)
      ? String(value)
      : numberFormat.format(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  // A date-time from the database ("2026-07-31T18:30:00Z"): the local date, with the time when it has one.
  if (typeof value === 'string' && ISO_DATE_TIME.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()))
      return date.getHours() || date.getMinutes()
        ? date.toLocaleString('en-GB', DATE_TIME)
        : date.toLocaleDateString('en-GB', DATE);
  }
  return String(value);
}
