import {
  formatCell,
  formatCompact,
  humanize,
} from '../../insights-assistant/utils/formatCell';
import { visualOf } from '../../insights-assistant/utils/visualOf';
import { plainText, type Widget } from '../../../platform/api/workspaceService';

export interface Headline {
  value: string;
  valueLabel: string;
  detail: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Net sales" → "net sales" inside a sentence, but "EBT share %" keeps its capitals. */
const lowerFirst = (label: string) =>
  /^[A-Z]{2,}(\s|$)/.test(label)
    ? label
    : label.charAt(0).toLowerCase() + label.slice(1);

/** A category as people say it: weekday numbers (ISO, 1 = Monday) as names, hours as 07:00. */
function dimensionLabel(value: unknown, column: string): string {
  const n = Number(value);
  if (/(^|_)(day_of_week|dow|weekday)$/i.test(column) && n >= 1 && n <= 7)
    return WEEKDAYS[n - 1];
  if (/hour/i.test(column) && Number.isInteger(n) && n >= 0 && n <= 23)
    return `${String(n).padStart(2, '0')}:00`;
  return formatCell(value, column);
}

const short = (value: unknown, column: string) =>
  typeof value === 'number' && Math.abs(value) >= 100_000
    ? formatCompact(value, column)
    : formatCell(value, column);

/** The answer's first sentence, short enough for a card. */
function firstSentence(markdown: string | null): string {
  const text = plainText(markdown ?? '');
  const sentence = text.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? text;
  return sentence.length > 140 ? `${sentence.slice(0, 139)}…` : sentence;
}

/**
 * A board widget in one figure, for its capability's card on Overview: the number itself for a
 * KPI, the latest point of a trend, otherwise what tops the result.
 */
export function headlineOf(widget: Widget): Headline {
  const detail = firstSentence(widget.answer);
  const result = widget.result;
  if (!result || result.rows.length === 0)
    return { value: 'No rows', valueLabel: 'in the latest answer', detail };
  const visual = visualOf(result);
  const [measure] = visual.measures;
  if (!measure)
    return {
      value: `${result.rows.length} rows`,
      valueLabel: 'in the latest answer',
      detail,
    };
  const label = lowerFirst(humanize(measure));
  if (visual.kind === 'kpi' || visual.kind === 'kpis')
    return {
      value: short(visual.rows[0][measure], measure),
      valueLabel: label,
      detail,
    };
  if (visual.kind === 'line') {
    const last = visual.rows[visual.rows.length - 1];
    const [dim] = visual.dims;
    return {
      value: short(last[measure], measure),
      valueLabel: `${label}, ${formatCell(last[dim], dim)}`,
      detail,
    };
  }
  // A ranking: the figure is the top value of the measure the answer is ordered by (the one the
  // question asked about, such as EBT share), and what it belongs to goes in the label. A store
  // number is never the headline figure.
  const ranked = rankedMeasure(visual.rows, visual.measures) ?? measure;
  const top = [...visual.rows].sort(
    (a, b) => (Number(b[ranked]) || 0) - (Number(a[ranked]) || 0),
  )[0];
  const where = result.columns
    // In the answer's own column order (a heatmap reorders its dimensions for layout).
    .filter((c) => visual.dims.includes(c))
    .map((d) => `${lowerFirst(humanize(d))} ${dimensionLabel(top[d], d)}`)
    .join(' · ');
  return {
    value: short(top[ranked], ranked),
    valueLabel: `highest ${lowerFirst(humanize(ranked))} · ${where}`,
    detail,
  };
}

/** The measure the rows are sorted by, high to low (the query's ORDER BY), or undefined when none is. */
function rankedMeasure(
  rows: Record<string, unknown>[],
  measures: string[],
): string | undefined {
  if (rows.length < 2) return undefined;
  return measures.find((m) =>
    rows.every(
      (row, i) =>
        i === 0 || (Number(rows[i - 1][m]) || 0) >= (Number(row[m]) || 0),
    ),
  );
}
