const wholeFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});
/** Fractions always show two decimals, so a column reads 11.40 above 19.22, not 11.4. */
const decimalFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percentFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
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

/** Columns that count things, never money, even when they mention sales: the last word says so ("sales_count"). */
const COUNT_COLUMN =
  /(^|_)(count|qty|quantity|units?|items?|baskets?|lines?|days?|rows|transactions?|customers?|stores?)$/i;
/** Columns holding US dollars: sales, revenue, amounts, prices, spend. */
const MONEY_COLUMN =
  /(sales|revenue|amount|price|spend|cost|takings|value|discount|tax)/i;
/** Columns already in percent (19.22 means 19.22%). */
const PERCENT_COLUMN = /(^|_)(pct|percent|percentage)(_|$)/i;
/** Columns holding a fraction (0.19 means 19%). */
const RATIO_COLUMN = /(^|_)(share|ratio|rate)(_|$)/i;

export type Unit = 'money' | 'percent' | 'ratio' | 'none';

/** What a column's numbers measure, from its name. */
export function unitOf(column?: string): Unit {
  if (!column || ID_COLUMN.test(column)) return 'none';
  if (PERCENT_COLUMN.test(column)) return 'percent';
  if (RATIO_COLUMN.test(column)) return 'ratio';
  // "net_sales_per_basket" is money per basket: what comes after "per" doesn't change the unit.
  const measured = column.split(/_per_/i)[0];
  if (MONEY_COLUMN.test(measured) && !COUNT_COLUMN.test(measured))
    return 'money';
  return 'none';
}

/** A number in its column's unit: $265,122.03, 19.2%, 3,673, 1.50. */
function formatNumber(value: number, column?: string): string {
  switch (unitOf(column)) {
    case 'money':
      return moneyFormat.format(value);
    case 'percent':
      return `${percentFormat.format(value)}%`;
    case 'ratio':
      // A share from 0 to 1; anything larger is already in percent.
      return `${percentFormat.format(Math.abs(value) <= 1 ? value * 100 : value)}%`;
    default:
      return Number.isInteger(value)
        ? wholeFormat.format(value)
        : decimalFormat.format(value);
  }
}

/** An amount to right-align, unlike an identifier such as a store number. */
export const isAmount = (value: unknown, column: string) =>
  typeof value === 'number' && !ID_COLUMN.test(column);

/** Words shown in capitals in a column name. */
const ACRONYMS = new Set([
  'ebt',
  'sku',
  'upc',
  'pos',
  'id',
  'snap',
  'wic',
  'yoy',
  'mom',
  'kpi',
]);

/** "net_sales" → "Net sales", "EBT_SHARE_PCT" → "EBT share %", "avg_basket_value" → "Average basket value". */
export const humanize = (column: string) => {
  const words = column
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (lower === 'pct' || lower === 'percent') return '%';
      if (lower === 'avg') return 'average';
      if (lower === 'qty') return 'quantity';
      return lower;
    });
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const compactFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 265122.03 → "$265.1K" for a money column, "265.1K" otherwise: for chart axes and tight spaces. */
export function formatCompact(value: number, column?: string): string {
  const unit = unitOf(column);
  if (unit === 'percent' || unit === 'ratio')
    return formatNumber(value, column);
  const text = compactFormat.format(value);
  return unit === 'money'
    ? `${value < 0 ? '-' : ''}$${text.replace('-', '')}`
    : text;
}

/** A result cell as text: numbers in their column's unit (but IDs as they are), nothing as a dash. */
export function formatCell(value: unknown, column?: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number')
    return column && ID_COLUMN.test(column)
      ? String(value)
      : formatNumber(value, column);
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
