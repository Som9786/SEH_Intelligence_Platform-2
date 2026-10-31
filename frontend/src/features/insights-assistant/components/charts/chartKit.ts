import { useMemo } from 'react';
import { useTheme } from '../../../../shared/hooks/useTheme';
import { scaledFont } from '../../../../shared/utils/fontScale';
import type { AnalyticsResult } from '../../services/assistantService';
import { formatCell, formatCompact } from '../../utils/formatCell';
import { RAMP, SERIES } from '../../utils/chartColors';

export type Result = NonNullable<AnalyticsResult['result']>;

/** The app's own tokens, read from the page so charts match it in either theme. */
export const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function useChartColors() {
  const { theme } = useTheme();
  return useMemo(
    () => ({
      theme,
      series: SERIES[theme],
      ramp: RAMP[theme],
      grid: cssVar('--line') || '#e3eae5',
      text: cssVar('--t-5f7268') || '#5f7268',
      surface: cssVar('--b-ffffff') || '#ffffff',
      ink: cssVar('--t-172a24') || '#172a24',
    }),
    [theme],
  );
}

/** "2026-08-16" → "16 Aug"; "Thursday" → "Thu"; other labels as they are. */
export function shortLabel(value: unknown, column: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    if (!Number.isNaN(date.getTime()))
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      });
  }
  if (
    typeof value === 'string' &&
    /^(mon|tues|wednes|thurs|fri|satur|sun)day$/i.test(value.trim())
  )
    return value.trim().slice(0, 3);
  // A weekday as the database numbers it (ISO: 1 = Monday … 7 = Sunday).
  if (/(^|_)(day_of_week|dow|weekday)$/i.test(column)) {
    const day = Number(value);
    if (Number.isInteger(day) && day >= 1 && day <= 7)
      return ISO_WEEKDAYS[day - 1];
  }
  return formatCell(value, column);
}

export const ISO_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** How strongly the bars that aren't the leader show their colour. */
export const OTHERS = 0.45;

/** The index of the row with the largest value: drawn in full colour, the rest tinted. */
export function leaderOf(
  rows: Record<string, unknown>[],
  measure: string,
): number {
  let best = -1;
  let top = -Infinity;
  rows.forEach((row, i) => {
    const value = Number(row[measure]);
    if (!Number.isNaN(value) && value > top) {
      top = value;
      best = i;
    }
  });
  return best;
}

/** A KPI figure: in full when one stands alone; large ones short ("8.2M") when tiles share a row. */
export function kpiValue(
  value: unknown,
  column: string,
  single: boolean,
): string {
  return !single && typeof value === 'number' && Math.abs(value) >= 100_000
    ? formatCompact(value, column)
    : formatCell(value, column);
}

export const tooltipStyle = (colors: ReturnType<typeof useChartColors>) => ({
  contentStyle: {
    background: colors.surface,
    border: `1px solid ${colors.grid}`,
    borderRadius: 8,
    color: colors.ink,
    fontSize: scaledFont(12),
  },
  labelStyle: { color: colors.ink, fontWeight: 600 },
});

/**
 * A label broken into lines of at most maxChars, at spaces where it can, over at most maxLines;
 * what still doesn't fit is cut short with "…".
 */
export function fitLabel(
  label: string,
  maxChars: number,
  maxLines = 2,
): string[] {
  const width = Math.max(3, Math.floor(maxChars));
  const lines: string[] = [];
  let rest = label.trim();
  while (rest && lines.length < maxLines) {
    if (rest.length <= width) {
      lines.push(rest);
      rest = '';
      break;
    }
    const space = rest.lastIndexOf(' ', width);
    const end = space > 0 ? space : width;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end).trim();
  }
  if (rest) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, width - 1).trimEnd()}…`;
  }
  return lines;
}
