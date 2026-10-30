import type { AnalyticsResult } from '../services/assistantService';
import { visualOf, type Visual, type VisualSize } from './visualOf';

type Result = NonNullable<AnalyticsResult['result']>;
type Row = Record<string, unknown>;

/**
 * The ways a result can be drawn, which the user can pick between or ask for in the question
 * ("as a pie chart"). The same names are kept on a board widget (Charts.All in the workspace).
 */
export type ChartKind =
  | 'kpi'
  | 'line'
  | 'area'
  | 'columns'
  | 'bars'
  | 'grouped'
  | 'stacked'
  | 'pie'
  | 'share'
  | 'scatter'
  | 'heatmap'
  | 'table';

/** On the picker. */
export const CHART_LABEL: Record<ChartKind, string> = {
  kpi: 'Figures',
  line: 'Line',
  area: 'Area',
  columns: 'Columns',
  bars: 'Bars',
  grouped: 'Grouped',
  stacked: 'Stacked',
  pie: 'Pie',
  share: 'Share',
  scatter: 'Scatter',
  heatmap: 'Heatmap',
  table: 'Table',
};

/** In a sentence: "I can't draw a pie chart…", "Show it as a line chart instead?" */
export const CHART_NAME: Record<ChartKind, string> = {
  kpi: 'figures',
  line: 'a line chart',
  area: 'an area chart',
  columns: 'a column chart',
  bars: 'a bar chart',
  grouped: 'grouped bars',
  stacked: 'stacked bars',
  pie: 'a pie chart',
  share: 'a share bar',
  scatter: 'a scatter plot',
  heatmap: 'a heatmap',
  table: 'a table',
};

const KINDS = Object.keys(CHART_LABEL) as ChartKind[];

/** A saved value as a chart, or null when it isn't one (widgets saved before charts were kept). */
export const asChart = (value: unknown): ChartKind | null =>
  KINDS.includes(value as ChartKind) ? (value as ChartKind) : null;

const MAX_BARS = 15;
const MAX_COLUMNS = 31;
const MAX_LINES = 3;
/** Pie slices, shares and series each take a colour of their own, and the palette has six. */
const MAX_PARTS = 6;

/** What visualOf picked, as a chart. */
function autoChart(visual: Visual): ChartKind {
  switch (visual.kind) {
    case 'kpi':
    case 'kpis':
      return 'kpi';
    case 'bars2':
      return 'bars';
    default:
      return visual.kind;
  }
}

/** Dates, weekdays or hours: a sequence, which lines and areas suit and pies don't. */
const isOrdered = (visual: Visual) =>
  visual.kind === 'line' || visual.kind === 'columns';

const nonNegative = (rows: Row[], columns: string[]) =>
  rows.every((row) => columns.every((c) => (Number(row[c]) || 0) >= 0));

const distinct = (rows: Row[], column: string) =>
  new Set(rows.map((row) => String(row[column]))).size;

/**
 * Two categories and a number, drawn as bars: along the category with more values, one bar (or
 * segment) per value of the other.
 */
export function pivotDims(visual: Visual): { x: string; series: string } {
  const [a, b] = visual.dims;
  return distinct(visual.rows, a) >= distinct(visual.rows, b)
    ? { x: a, series: b }
    : { x: b, series: a };
}

/** The charts that suit the rows' shape, in picker order; always ending with the table. */
export function chartOptions(visual: Visual): ChartKind[] {
  const { kind, dims, measures, rows } = visual;
  if (kind === 'kpi' || kind === 'kpis') return ['kpi', 'table'];
  const n = rows.length;
  const m = measures.length;
  const options: ChartKind[] = [];
  const add = (chart: ChartKind, fits: boolean) => {
    if (fits) options.push(chart);
  };
  if (n >= 2 && dims.length === 1 && m >= 1) {
    const ordered = isOrdered(visual);
    add('line', m <= MAX_LINES && (ordered || n <= MAX_COLUMNS));
    add('area', ordered && m <= MAX_LINES);
    add('columns', m === 1 && n <= MAX_COLUMNS);
    add('bars', m <= 2 && n <= MAX_BARS);
    add('grouped', m >= 2 && m <= MAX_LINES && n <= MAX_BARS);
    add(
      'stacked',
      m >= 2 &&
        m <= MAX_LINES &&
        n <= MAX_COLUMNS &&
        nonNegative(rows, measures),
    );
    add(
      'pie',
      !ordered && m === 1 && n <= MAX_PARTS && nonNegative(rows, measures),
    );
    add('share', kind === 'share');
    add('scatter', m >= 2 && n >= 3);
  }
  if (dims.length === 2 && m === 1 && n >= 4) {
    const { x, series } = pivotDims(visual);
    const across = distinct(rows, x);
    const parts = distinct(rows, series);
    add('grouped', parts <= MAX_PARTS && across <= MAX_BARS);
    add(
      'stacked',
      parts <= MAX_PARTS &&
        across <= MAX_COLUMNS &&
        nonNegative(rows, measures),
    );
    add('heatmap', kind === 'heatmap');
  }
  options.push('table');
  return options;
}

/** A chart named in the question, or 'chart' for one asked for without naming the kind. */
export type Requested = ChartKind | 'chart';

/** "chart", "graph" or "plot", also misspelt ("chrat", "grpah") or run into the word before it. */
const CHART = String.raw`(?:chart|chrat|cahrt|graph|grpah|graf|plot)s?`;
const named = (words: string) =>
  new RegExp(String.raw`\b(?:${words})[\s-]?${CHART}\b`);

/**
 * Phrases that name a chart, allowing for common typos ("pia chart", "barchart"). Words that are
 * also business terms ("area", "line", "bar", "table") only count beside "chart", "graph" or
 * "as a…", so "sales by area" or "product line" don't.
 */
const ASKED: [ChartKind, RegExp[]][] = [
  ['pie', [/\b(pie|pia|donut|doughnut)\b/, named('pie|pia|pi|py')]],
  ['heatmap', [/\bheat[\s-]?maps?\b/]],
  ['scatter', [/\bscat+er/]],
  ['stacked', [/\bstack(ed)?\b/]],
  ['grouped', [/\b(grouped|clustered|side[\s-]by[\s-]side)\b/]],
  ['area', [named('area')]],
  ['line', [named('line|lin'), /\b(trend ?lines?|as an? line)\b/]],
  ['columns', [named('column|colum|col'), /\b(vertical bars?|as columns)\b/]],
  ['bars', [named('bar|bars'), /\b(horizontal bars?|as bars)\b/]],
  [
    'table',
    [/\b((as|in) (an? )?table|in table form|tabular|just the table)\b/],
  ],
];
const ANY_CHART = new RegExp(
  String.raw`\b(${CHART}|visuali[sz]e|visual|diagram|draw)\b`,
);

/** The chart AI Hub read from the question (its intent's chart), or null for "none" or an unknown value. */
export const askedOf = (value: unknown): Requested | null =>
  value === 'chart' ? 'chart' : asChart(value);

export function requestedChart(question: string): Requested | null {
  const text = question.toLowerCase();
  const asked = ASKED.find(([, patterns]) =>
    patterns.some((p) => p.test(text)),
  );
  if (asked) return asked[0];
  return ANY_CHART.test(text) ? 'chart' : null;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Why the asked-for chart doesn't suit the rows, to follow "I can't draw a pie chart for this answer:". */
function whyNot(requested: Requested, visual: Visual): string {
  const { dims, measures, rows } = visual;
  const n = rows.length;
  const m = measures.length;
  if (m === 0) return 'it has no numbers to plot';
  if (n === 1) return 'it is a single row of figures';
  const has = `${plural(dims.length, 'category', 'categories')} and ${plural(m, 'number', 'numbers')}`;
  const shape = `it has ${has}`;
  switch (requested) {
    case 'pie':
      if (isOrdered(visual)) return 'its values follow a sequence over time';
      if (dims.length !== 1 || m > 1)
        return `a pie shows one number split by one category, and this answer has ${has}`;
      if (!nonNegative(rows, measures))
        return "a pie can't show negative values";
      return `it would have ${n} slices, more than a pie can show clearly`;
    case 'share':
      return 'a share bar needs a share or percentage for a few categories';
    case 'heatmap':
      return `a heatmap needs two categories and one number, and this answer has ${has}`;
    case 'scatter':
      return 'a scatter plot needs two numbers to plot against each other';
    case 'area':
      return 'an area chart needs values over dates, weekdays or hours';
    case 'grouped':
    case 'stacked':
      if (m < 2 && dims.length < 2) return 'it has only one number to group';
      if (requested === 'stacked' && !nonNegative(rows, measures))
        return "stacked bars can't show negative values";
      if (m > MAX_LINES)
        return `it has ${m} numbers, more than one chart can show clearly`;
      return `with ${n} rows the bars would be too crowded to read`;
    case 'line':
    case 'columns':
    case 'bars':
    case 'chart':
      if (dims.length > 2 || (dims.length === 2 && m > 1)) return shape;
      if (m > MAX_LINES)
        return `it has ${m} numbers, more than one chart can show clearly`;
      return `with ${n} rows it would be too crowded to read`;
    default:
      return shape;
  }
}

/** What to suggest when the rows' own shape is a table: the plainest chart that suits them. */
const INSTEAD: ChartKind[] = [
  'columns',
  'bars',
  'line',
  'grouped',
  'stacked',
  'heatmap',
  'scatter',
];

/** Shown when the question asked for a chart that doesn't suit the rows. */
export interface ChartSuggestion {
  requested: Requested;
  reason: string;
  /** What to draw instead, or null when no chart suits the rows. */
  instead: ChartKind | null;
}

export interface ChartChoice {
  visual: Visual;
  options: ChartKind[];
  /** What is drawn now: the table while a suggestion waits for an answer. */
  chart: ChartKind;
  /** Whether the chart was picked or asked for, rather than picked from the rows' shape. */
  explicit: boolean;
  suggestion: ChartSuggestion | null;
}

/**
 * How to draw a result: the chart the user picked, if it still suits the rows; else the one the
 * question asked for, if it suits them; else the one that suits their shape. When the question
 * asked for one that doesn't suit them, the table, with a suggestion of what would. What the
 * question asked for is AI Hub's reading of it (asked) when it gave one, else its own words.
 */
export function chooseChart(
  result: Result,
  {
    question,
    asked,
    chosen,
  }: {
    question?: string;
    asked?: Requested | null;
    chosen?: ChartKind | null;
  } = {},
): ChartChoice {
  const visual = visualOf(result);
  const options = chartOptions(visual);
  const auto = autoChart(visual);
  const choice = (chart: ChartKind, explicit: boolean): ChartChoice => ({
    visual,
    options,
    chart,
    explicit,
    suggestion: null,
  });
  if (chosen && options.includes(chosen)) return choice(chosen, true);
  const requested = asked ?? (question ? requestedChart(question) : null);
  if (!requested) return choice(auto, false);
  if (requested !== 'chart' && options.includes(requested))
    return choice(requested, true);
  if (requested === 'chart' && auto !== 'table') return choice(auto, false);
  const instead =
    auto !== 'table'
      ? auto
      : (INSTEAD.find((chart) => options.includes(chart)) ?? null);
  return {
    ...choice('table', false),
    suggestion: { requested, reason: whyNot(requested, visual), instead },
  };
}

/** How much room a board widget takes when drawn as `chart`. */
export function chartSize(choice: ChartChoice): VisualSize {
  const { visual, chart } = choice;
  if (chart === autoChart(visual)) return visual.size;
  switch (chart) {
    case 'line':
    case 'area':
    case 'heatmap':
    case 'table':
      return 'wide';
    case 'columns':
    case 'stacked':
      return visual.rows.length > 12 ? 'wide' : 'medium';
    default:
      return 'medium';
  }
}
