import { apiJson } from '../../platform/api/apiClient';
import type { AnalyticsResult } from '../ai-assistant/services/assistantService';
import type { ChartKind } from '../ai-assistant/utils/chartChoice';

/**
 * The signed-in user's saved work, kept by the workspace in Insights.Gateway (at
 * /api/workspace): questions scheduled to run again, and answers kept as widgets on a board.
 */

export type Board =
  'basket-intelligence' | 'fresh-food-forecasting' | 'revenue-opportunities';

export const BOARD_LABEL: Record<Board, string> = {
  'basket-intelligence': 'Basket Intelligence',
  'fresh-food-forecasting': 'Fresh Food Forecasting',
  'revenue-opportunities': 'Revenue Opportunities',
};

export const BOARD_PATH: Record<Board, string> = {
  'basket-intelligence': '/basket-intelligence',
  'fresh-food-forecasting': '/fresh-food-forecasting',
  'revenue-opportunities': '/revenue-opportunities',
};

/** Boards whose page shows widgets; the others are still coming soon. */
export const BOARDS_WITH_WIDGETS: Board[] = ['basket-intelligence'];

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

/** What the schedule form sends. Time is "HH:mm" and startsOn "yyyy-MM-dd". */
export interface ScheduleInput {
  name: string;
  question: string;
  frequency: Frequency;
  time: string;
  startsOn: string;
  /** 0 = Sunday; weekly only. */
  dayOfWeek?: number | null;
  /** 1-28; monthly and quarterly only. */
  dayOfMonth?: number | null;
  enabled?: boolean;
  board?: Board | null;
  /** The answer shown when it was scheduled. */
  answer?: string | null;
}

export interface Schedule extends ScheduleInput {
  id: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleView {
  schedule: Schedule;
  /** Null while paused. */
  nextRunAt: string | null;
}

/** How an answer was reached, kept with a widget so its page can show it. */
export interface WidgetDetails {
  sql: string | null;
  explanation: string | null;
  knowledgeModel: string[] | null;
  corrected: boolean | null;
}

export interface Widget {
  id: string;
  board: Board;
  title: string;
  question: string;
  answer: string | null;
  result: AnalyticsResult['result'];
  createdAt: string;
  /** When the rows were read from the database; null for widgets saved before this was recorded. */
  fetchedAt: string | null;
  /** Null for widgets saved before it was kept, until they are refreshed. */
  details?: WidgetDetails | null;
  /** How its rows are drawn, when picked or asked for; otherwise as their shape suits. */
  chart?: ChartKind | null;
}

/** A copy of a widget as it was when shared, which anyone signed in can open by its link. */
export interface SharedInsight {
  id: string;
  board: Board;
  title: string;
  question: string;
  answer: string | null;
  result: AnalyticsResult['result'];
  details: WidgetDetails | null;
  fetchedAt: string | null;
  sharedBy: string;
  sharedAt: string;
  /** After this the link no longer opens (410). */
  expiresAt: string | null;
  chart?: ChartKind | null;
}

/** What a widget keeps of an Analytics reply's working. */
export const detailsOf = (result: AnalyticsResult): WidgetDetails => ({
  sql: result.sql || null,
  explanation: result.explanation || null,
  knowledgeModel: result.knowledgeModel ?? null,
  corrected: result.corrected ?? null,
});

/** The widget's own page, opened in a new tab from its board. */
export const widgetPagePath = (widget: Pick<Widget, 'id'>) =>
  `/basket-intelligence/insight/${encodeURIComponent(widget.id)}`;

/** A shared insight's link, to send to others. */
export const shareUrl = (share: Pick<SharedInsight, 'id'>) =>
  `${window.location.origin}/share/${encodeURIComponent(share.id)}`;

export const listSchedules = () =>
  apiJson<ScheduleView[]>('workspace/schedules');

export const createSchedule = (input: ScheduleInput) =>
  apiJson<ScheduleView>('workspace/schedules', { body: input });

export const updateSchedule = (id: string, input: ScheduleInput) =>
  apiJson<ScheduleView>(`workspace/schedules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: input,
  });

export const deleteSchedule = (id: string) =>
  apiJson<void>(`workspace/schedules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const listWidgets = (board: Board) =>
  apiJson<Widget[]>(`workspace/widgets?board=${encodeURIComponent(board)}`);

export const getWidget = (id: string) =>
  apiJson<Widget>(`workspace/widgets/${encodeURIComponent(id)}`);

export const addWidget = (widget: {
  board: Board;
  question: string;
  answer: string | null;
  result: AnalyticsResult['result'];
  fetchedAt: string | null;
  details: WidgetDetails;
  chart: ChartKind | null;
}) => apiJson<Widget>('workspace/widgets', { body: widget });

/** Shares a copy of the widget as it is now; the link opens it for anyone signed in. */
export const shareWidget = (widget: Pick<Widget, 'id'>) =>
  apiJson<SharedInsight>('workspace/shares', {
    body: { widgetId: widget.id },
  });

export const getShare = (id: string) =>
  apiJson<SharedInsight>(`workspace/shares/${encodeURIComponent(id)}`);

/**
 * Asks the widget's question again on the latest data (Analytics POST /ask) and keeps the new
 * answer and rows on the widget. Fails, leaving the widget as it was, when the data can't answer.
 */
export async function refreshWidget(widget: Widget): Promise<Widget> {
  const fresh = await apiJson<AnalyticsResult>('analytics/ask', {
    body: { question: widget.question },
  });
  if (!fresh.answerable || !fresh.result)
    throw new Error(
      fresh.explanation || 'The question could not be answered this time.',
    );
  return apiJson<Widget>(`workspace/widgets/${encodeURIComponent(widget.id)}`, {
    method: 'PUT',
    body: {
      answer: fresh.answer,
      result: fresh.result,
      fetchedAt: fresh.fetchedAt ?? null,
      details: detailsOf(fresh),
    },
  });
}

/** Keeps the order a board's widgets are shown in, as the user arranged them by drag and drop. */
export const reorderWidgets = (board: Board, ids: string[]) =>
  apiJson<void>('workspace/widgets/order', {
    method: 'PUT',
    body: { board, ids },
  });

export const deleteWidget = (id: string) =>
  apiJson<void>(`workspace/widgets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

const DAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];

/** "Weekly · Mondays · 08:00", "Quarterly · day 1 · 07:30". */
export function describeSchedule(schedule: ScheduleInput): string {
  switch (schedule.frequency) {
    case 'daily':
      return `Daily · ${schedule.time}`;
    case 'weekly':
      return `Weekly · ${DAYS[schedule.dayOfWeek ?? 1]} · ${schedule.time}`;
    case 'monthly':
      return `Monthly · day ${schedule.dayOfMonth} · ${schedule.time}`;
    case 'quarterly':
      return `Every 3 months · day ${schedule.dayOfMonth} · ${schedule.time}`;
  }
}

/** An answer's Markdown as one line of plain text, for short previews. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ageOf(iso: string, now = Date.now()): string {
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(iso).getTime()) / 60_000),
  );
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** "Mon 2 Nov 2026, 08:00". */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
