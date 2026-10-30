import type { AnalyticsResult } from '../../ai-assistant/services/assistantService';
import {
  formatWhen,
  plainText,
  type Widget,
} from '../../workspace/workspaceService';

/** What an insight's page shows: a board widget, or a shared copy of one. */
export type Insight = Pick<
  Widget,
  | 'board'
  | 'title'
  | 'question'
  | 'answer'
  | 'result'
  | 'details'
  | 'fetchedAt'
  | 'chart'
>;

/**
 * The insight as the Analytics reply it came from, so the assistant's own steps, confidence and
 * "Data behind this" can show it. What a widget didn't keep (cost) is left out.
 */
export const asAnalyticsResult = (insight: Insight): AnalyticsResult => ({
  question: insight.question,
  answerable: true,
  sql: insight.details?.sql ?? '',
  explanation: insight.details?.explanation ?? '',
  result: insight.result,
  answer: insight.answer,
  costUsd: null,
  corrected: insight.details?.corrected ?? false,
  knowledgeModel: insight.details?.knowledgeModel ?? null,
  fetchedAt: insight.fetchedAt,
});

const csvCell = (value: unknown) => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The rows as CSV: a header of the columns, then one line per row. */
export function toCsv(result: NonNullable<AnalyticsResult['result']>): string {
  return [
    result.columns,
    ...result.rows.map((row) => result.columns.map((column) => row[column])),
  ]
    .map((line) => line.map(csvCell).join(','))
    .join('\r\n');
}

/** Saves the insight's rows as a CSV file named after its title. */
export function downloadCsv(insight: Insight) {
  if (!insight.result) return;
  const url = URL.createObjectURL(
    new Blob([toCsv(insight.result)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = csvFileName(insight.title);
  link.click();
  URL.revokeObjectURL(url);
}

/** "baskets-by-day-of-week.csv" from the insight's title. */
export function csvFileName(title: string): string {
  const name = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${name || 'insight'}.csv`;
}

/** Text to paste or send: the question, the answer, how fresh the data is, and the link. */
export function shareSummary(insight: Insight, url: string): string {
  const rows = insight.result?.rows.length ?? 0;
  return [
    insight.title,
    insight.answer ? plainText(insight.answer) : null,
    [
      insight.fetchedAt && `Data synced ${formatWhen(insight.fetchedAt)}`,
      insight.result &&
        `${rows} ${rows === 1 ? 'row' : 'rows'}${insight.result.truncated ? ' (more were cut off)' : ''}`,
    ]
      .filter(Boolean)
      .join(' · '),
    `Open the full insight, with its data and how it was reached: ${url}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
