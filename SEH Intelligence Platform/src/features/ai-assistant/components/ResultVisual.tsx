import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../../shared/hooks/useTheme';
import { scaledFont } from '../../../shared/utils/fontScale';
import type { AnalyticsResult } from '../services/assistantService';
import { formatCell, formatCompact, humanize } from '../utils/formatCell';
import { measureColors, RAMP, SERIES, tint } from '../utils/chartColors';
import {
  CHART_LABEL,
  CHART_NAME,
  chooseChart,
  pivotDims,
  type ChartKind,
  type ChartSuggestion,
  type Requested,
} from '../utils/chartChoice';
import { orderLabels, type Visual } from '../utils/visualOf';
import { ResultTable } from './ResultTable';

type Result = NonNullable<AnalyticsResult['result']>;

/** The app's own tokens, read from the page so charts match it in either theme. */
const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function useChartColors() {
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
function shortLabel(value: unknown, column: string): string {
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

const ISO_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** How strongly the bars that aren't the leader show their colour. */
const OTHERS = 0.45;

/** The index of the row with the largest value: drawn in full colour, the rest tinted. */
function leaderOf(rows: Record<string, unknown>[], measure: string): number {
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
function kpiValue(value: unknown, column: string, single: boolean): string {
  return !single && typeof value === 'number' && Math.abs(value) >= 100_000
    ? formatCompact(value)
    : formatCell(value, column);
}

/**
 * A query result drawn the way the question asked for, or as kept with it, or as its shape suits
 * best (see chooseChart). When the question asked for a chart that doesn't suit the rows, they show
 * as a table with a suggestion of one that does; the answer to it is reported with onChart (the
 * thread keeps it, and passes it back as chart). Board widgets and Insights Assistant answers both
 * use it, so a widget looks as it did in chat.
 */
export function ResultVisual({
  result,
  question,
  asked,
  chart,
  onChart,
}: {
  result: Result;
  question?: string;
  /** The chart AI Hub read from the question, when it read one. */
  asked?: Requested | null;
  chart?: ChartKind | null;
  onChart?: (chart: ChartKind) => void;
}) {
  // Shown at once; the thread or widget keeping it catches up through chart.
  const [picked, setPicked] = useState<ChartKind | null>(null);
  const choice = useMemo(
    () => chooseChart(result, { question, asked, chosen: picked ?? chart }),
    [result, question, asked, picked, chart],
  );
  const { theme } = useTheme();
  const { visual, suggestion } = choice;
  const colors = measureColors(visual.measures, theme);
  const barColor = (column: string) =>
    colors[visual.measures.indexOf(column)] ?? SERIES[theme][0];
  const pick = (next: ChartKind) => {
    setPicked(next);
    onChart?.(next);
  };
  const table = <ResultTable result={result} dataBars barColor={barColor} />;
  return (
    <div className="viz">
      {suggestion && <Suggestion suggestion={suggestion} onPick={pick} />}
      {choice.chart === 'table' ? (
        table
      ) : (
        <VisualBody visual={visual} chart={choice.chart} />
      )}
    </div>
  );
}

/** The question asked for a chart the rows don't suit: why, and what would, to show on a click. */
function Suggestion({
  suggestion: { requested, reason, instead },
  onPick,
}: {
  suggestion: ChartSuggestion;
  onPick: (chart: ChartKind) => void;
}) {
  const asked = requested === 'chart' ? 'a chart' : CHART_NAME[requested];
  return (
    <div className="viz-suggest" role="status">
      <p>
        I can't draw {asked} for this answer: {reason}.{' '}
        {instead
          ? `Show it as ${CHART_NAME[instead]} instead?`
          : "It's shown as a table."}
      </p>
      {instead && (
        <div className="viz-suggest-actions">
          <button
            type="button"
            className="td-action"
            onClick={() => onPick(instead)}
          >
            Yes, show {CHART_LABEL[instead].toLowerCase()}
          </button>
          <button
            type="button"
            className="td-action"
            onClick={() => onPick('table')}
          >
            Keep table
          </button>
        </div>
      )}
    </div>
  );
}

/** The chart alone, as kept with the widget (or as its shape suits), or nothing for a table. */
export function ResultChart({
  result,
  chart,
}: {
  result: Result;
  chart?: ChartKind | null;
}) {
  const choice = useMemo(
    () => chooseChart(result, { chosen: chart }),
    [result, chart],
  );
  return choice.chart === 'table' ? null : (
    <VisualBody visual={choice.visual} chart={choice.chart} />
  );
}

function VisualBody({ visual, chart }: { visual: Visual; chart: ChartKind }) {
  const first = (count: number) => ({
    ...visual,
    measures: visual.measures.slice(0, count),
  });
  switch (chart) {
    case 'kpi':
      return <Kpis visual={visual} />;
    case 'line':
      return <Trend visual={first(3)} />;
    case 'area':
      return <Trend visual={first(3)} area />;
    case 'columns':
      return <Columns visual={first(1)} />;
    case 'bars':
      return <Bars visual={first(2)} />;
    case 'grouped':
      return <SeriesColumns visual={first(3)} />;
    case 'stacked':
      return <SeriesColumns visual={first(3)} stacked />;
    case 'pie':
      return <Donut visual={first(1)} />;
    case 'share':
      return <Share visual={first(1)} />;
    case 'scatter':
      return <Spread visual={visual} />;
    case 'heatmap':
      return <Heatmap visual={visual} />;
    default:
      return null;
  }
}

/** One number, or a row of them: the figure large, its name small. */
function Kpis({ visual }: { visual: Visual }) {
  const [row] = visual.rows;
  const { theme } = useTheme();
  const accents = measureColors(visual.measures, theme);
  const context = visual.dims.map((d) => formatCell(row[d], d)).join(' · ');
  return (
    <div className={`viz-kpis${visual.kind === 'kpi' ? ' is-single' : ''}`}>
      {visual.measures.map((measure, i) => (
        <div
          className="viz-kpi"
          key={measure}
          style={{ ['--ia-bar' as string]: accents[i] }}
        >
          <span
            className="viz-kpi-value"
            title={formatCell(row[measure], measure)}
          >
            {kpiValue(row[measure], measure, visual.kind === 'kpi')}
          </span>
          <span className="viz-kpi-label">
            {humanize(measure)}
            {context && ` · ${context}`}
          </span>
        </div>
      ))}
    </div>
  );
}

const tooltipStyle = (colors: ReturnType<typeof useChartColors>) => ({
  contentStyle: {
    background: colors.surface,
    border: `1px solid ${colors.grid}`,
    borderRadius: 8,
    color: colors.ink,
    fontSize: scaledFont(12),
  },
  labelStyle: { color: colors.ink, fontWeight: 600 },
});

/** Up to three numbers over dates: lines (or filled areas), with a crosshair tooltip. */
function Trend({ visual, area = false }: { visual: Visual; area?: boolean }) {
  const colors = useChartColors();
  const lineColors = measureColors(visual.measures, colors.theme);
  const [dim] = visual.dims;
  const Chart = area ? AreaChart : LineChart;
  return (
    <figure className="panel viz-figure">
      <figcaption className="ia-label">
        {visual.measures.map(humanize).join(', ')} by{' '}
        {humanize(dim).toLowerCase()}
      </figcaption>
      <ResponsiveContainer width="100%" height={240}>
        <Chart
          data={visual.rows}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey={dim}
            tickFormatter={(v) => shortLabel(v, dim)}
            tick={{ fill: colors.text, fontSize: scaledFont(11) }}
            stroke={colors.grid}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: colors.text, fontSize: scaledFont(11) }}
            stroke={colors.grid}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            {...tooltipStyle(colors)}
            labelFormatter={(v) => formatCell(v, dim)}
            formatter={(v, name) => [
              formatCell(v, String(name)),
              humanize(String(name)),
            ]}
            cursor={{ stroke: colors.text, strokeDasharray: '3 3' }}
          />
          {visual.measures.length > 1 && (
            <Legend
              formatter={(name) => (
                <span style={{ color: colors.ink }}>
                  {humanize(String(name))}
                </span>
              )}
              iconType="plainline"
            />
          )}
          {visual.measures.map((measure, i) =>
            area ? (
              <Area
                key={measure}
                type="monotone"
                dataKey={measure}
                stroke={lineColors[i]}
                strokeWidth={2}
                fill={lineColors[i]}
                fillOpacity={0.15}
                activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={measure}
                type="monotone"
                dataKey={measure}
                stroke={lineColors[i]}
                strokeWidth={2}
                dot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: colors.surface,
                  fill: lineColors[i],
                }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }}
                isAnimationActive={false}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </figure>
  );
}

/** A number by weekday or hour: columns in time order. */
function Columns({ visual }: { visual: Visual }) {
  const colors = useChartColors();
  const [dim] = visual.dims;
  const [measure] = visual.measures;
  const [color] = measureColors([measure], colors.theme);
  const leader = leaderOf(visual.rows, measure);
  const others = tint(color, colors.surface, OTHERS);
  return (
    <figure className="panel viz-figure">
      <figcaption className="ia-label">
        {humanize(measure)} by {humanize(dim).toLowerCase()}
      </figcaption>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={visual.rows}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          barCategoryGap={2}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey={dim}
            tickFormatter={(v) => shortLabel(v, dim)}
            tick={{ fill: colors.text, fontSize: scaledFont(11) }}
            stroke={colors.grid}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: colors.text, fontSize: scaledFont(11) }}
            stroke={colors.grid}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            {...tooltipStyle(colors)}
            labelFormatter={(v) => formatCell(v, dim)}
            formatter={(v) => [formatCell(v, measure), humanize(measure)]}
            cursor={{ fill: colors.grid, opacity: 0.5 }}
          />
          <Bar
            dataKey={measure}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          >
            {visual.rows.map((_, i) => (
              <Cell key={i} fill={i === leader ? color : others} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Names and a number as horizontal bars; a second number (bars2) is shown beside each bar. */
function Bars({ visual }: { visual: Visual }) {
  const { theme } = useTheme();
  const [dim] = visual.dims;
  const [measure, second] = visual.measures;
  const [color] = measureColors([measure], theme);
  const leader = leaderOf(visual.rows, measure);
  const max = Math.max(
    ...visual.rows.map((r) => Math.abs(Number(r[measure]) || 0)),
    0,
  );
  return (
    <figure
      className={`panel ia-chart has-leader${second ? ' has-second' : ''}`}
      style={{ ['--ia-bar' as string]: color }}
    >
      <figcaption className="ia-label">
        {humanize(measure)} by {humanize(dim).toLowerCase()}
        {second && <span className="viz-second-head">{humanize(second)}</span>}
      </figcaption>
      <ul>
        {visual.rows.map((row, i) => {
          const value = Number(row[measure]) || 0;
          const label = formatCell(row[dim], dim);
          return (
            <li
              key={i}
              className={i === leader ? 'is-top' : undefined}
              title={`${label}: ${formatCell(value, measure)}${second ? ` · ${humanize(second)} ${formatCell(row[second], second)}` : ''}`}
            >
              <span className="ia-chart-label">{label}</span>
              <span className="ia-chart-track" aria-hidden="true">
                <span
                  className="ia-chart-bar"
                  style={{
                    width: max ? `${(Math.abs(value) / max) * 100}%` : 0,
                  }}
                />
              </span>
              <strong className="ia-chart-value">
                {formatCell(value, measure)}
              </strong>
              {second && (
                <span className="viz-second">
                  {formatCell(row[second], second)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

interface Part {
  label: string;
  value: number;
  share: number;
  color: string;
}

/** Each row as a part of the whole, in a colour of its own. */
function partsOf(visual: Visual, series: string[]): Part[] {
  const [dim] = visual.dims;
  const [measure] = visual.measures;
  const total = visual.rows.reduce(
    (sum, r) => sum + (Number(r[measure]) || 0),
    0,
  );
  return visual.rows.map((row, i) => {
    const value = Number(row[measure]) || 0;
    return {
      label: formatCell(row[dim], dim),
      value,
      share: total ? value / total : 0,
      color: series[i % series.length],
    };
  });
}

/** Names, values and shares, beside a pie or under a share bar. */
function PartsLegend({ parts, measure }: { parts: Part[]; measure: string }) {
  return (
    <ul className="viz-legend">
      {parts.map((part) => (
        <li key={part.label}>
          <i style={{ background: part.color }} aria-hidden="true" />
          <span>{part.label}</span>
          <strong>{formatCell(part.value, measure)}</strong>
          <small>{Math.round(part.share * 100)}%</small>
        </li>
      ))}
    </ul>
  );
}

/** Parts of a whole: one bar split into segments, with a legend of names, values and shares. */
function Share({ visual }: { visual: Visual }) {
  const colors = useChartColors();
  const [dim] = visual.dims;
  const [measure] = visual.measures;
  const parts = partsOf(visual, colors.series);
  return (
    <figure className="panel viz-figure">
      <figcaption className="ia-label">
        {humanize(measure)} by {humanize(dim).toLowerCase()}
      </figcaption>
      <div className="viz-share" aria-hidden="true">
        {parts.map((part) => (
          <span
            key={part.label}
            style={{ flexGrow: part.share, background: part.color }}
            title={`${part.label}: ${formatCell(part.value, measure)} (${Math.round(part.share * 100)}%)`}
          />
        ))}
      </div>
      <PartsLegend parts={parts} measure={measure} />
    </figure>
  );
}

/** Parts of a whole as a ring, with the same legend. */
function Donut({ visual }: { visual: Visual }) {
  const colors = useChartColors();
  const [dim] = visual.dims;
  const [measure] = visual.measures;
  const parts = partsOf(visual, colors.series);
  return (
    <figure className="panel viz-figure">
      <figcaption className="ia-label">
        {humanize(measure)} by {humanize(dim).toLowerCase()}
      </figcaption>
      <div className="viz-pie">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={parts}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="95%"
              paddingAngle={1}
              stroke={colors.surface}
              isAnimationActive={false}
            >
              {parts.map((part) => (
                <Cell key={part.label} fill={part.color} />
              ))}
            </Pie>
            <Tooltip
              {...tooltipStyle(colors)}
              formatter={(v, name) => [formatCell(v, measure), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <PartsLegend parts={parts} measure={measure} />
      </div>
    </figure>
  );
}

interface Series {
  key: string;
  name: string;
  /** The column its values come from, to format them. */
  measure: string;
  color: string;
}

/**
 * Columns for more than one series: one per number, or for two categories and a number, one per
 * value of the category with fewer values. Pivoted series are keyed s0, s1… since their names can
 * hold dots, which Recharts reads as a path.
 */
function seriesOf(
  visual: Visual,
  palette: string[],
  measureColor: string[],
): { x: string; data: Record<string, unknown>[]; series: Series[] } {
  if (visual.dims.length === 1)
    return {
      x: visual.dims[0],
      data: visual.rows,
      series: visual.measures.map((measure, i) => ({
        key: measure,
        name: humanize(measure),
        measure,
        color: measureColor[i],
      })),
    };
  const { x, series } = pivotDims(visual);
  const [measure] = visual.measures;
  const names = orderLabels([
    ...new Set(visual.rows.map((r) => String(r[series]))),
  ]);
  const xs = orderLabels([...new Set(visual.rows.map((r) => String(r[x])))]);
  const data = xs.map((value) => {
    const point: Record<string, unknown> = { [x]: value };
    for (const row of visual.rows)
      if (String(row[x]) === value)
        point[`s${names.indexOf(String(row[series]))}`] =
          Number(row[measure]) || 0;
    return point;
  });
  return {
    x,
    data,
    series: names.map((name, i) => ({
      key: `s${i}`,
      name: shortLabel(name, series),
      measure,
      color: palette[i % palette.length],
    })),
  };
}

/** Several series side by side, or stacked into one column each. */
function SeriesColumns({
  visual,
  stacked = false,
}: {
  visual: Visual;
  stacked?: boolean;
}) {
  const colors = useChartColors();
  const { x, data, series } = seriesOf(
    visual,
    colors.series,
    measureColors(visual.measures, colors.theme),
  );
  const caption =
    visual.dims.length === 1
      ? `${visual.measures.map(humanize).join(', ')} by ${humanize(x).toLowerCase()}`
      : `${humanize(visual.measures[0])} by ${visual.dims.map((d) => humanize(d).toLowerCase()).join(' and ')}`;
  return (
    <figure className="panel viz-figure">
      <figcaption className="ia-label">{caption}</figcaption>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          barCategoryGap={stacked ? 2 : '16%'}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey={x}
            tickFormatter={(v) => shortLabel(v, x)}
            tick={{ fill: colors.text, fontSize: scaledFont(11) }}
            stroke={colors.grid}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: colors.text, fontSize: scaledFont(11) }}
            stroke={colors.grid}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            {...tooltipStyle(colors)}
            labelFormatter={(v) => formatCell(v, x)}
            formatter={(v, name) => [
              formatCell(v, series.find((s) => s.name === name)?.measure ?? ''),
              String(name),
            ]}
            cursor={{ fill: colors.grid, opacity: 0.5 }}
          />
          <Legend
            formatter={(name) => (
              <span style={{ color: colors.ink }}>{String(name)}</span>
            )}
            iconType="square"
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              stackId={stacked ? 'all' : undefined}
              radius={
                !stacked || i === series.length - 1 ? [4, 4, 0, 0] : undefined
              }
              maxBarSize={40}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Two numbers against each other: a dot per row, named in its tooltip. */
function Spread({ visual }: { visual: Visual }) {
  const colors = useChartColors();
  const [x, y] = visual.measures;
  const [color] = measureColors([y], colors.theme);
  const label = (row: Record<string, unknown>) =>
    visual.dims.map((d) => formatCell(row[d], d)).join(' · ');
  const axis = {
    tick: { fill: colors.text, fontSize: scaledFont(11) },
    stroke: colors.grid,
    tickLine: false,
  };
  return (
    <figure className="panel viz-figure">
      <figcaption className="ia-label">
        {humanize(y)} against {humanize(x).toLowerCase()}
      </figcaption>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke={colors.grid} />
          <XAxis
            type="number"
            dataKey={x}
            name={humanize(x)}
            tickFormatter={(v: number) => formatCompact(v)}
            label={{
              value: humanize(x),
              position: 'insideBottom',
              offset: -10,
              fill: colors.text,
              fontSize: scaledFont(11),
            }}
            {...axis}
          />
          <YAxis
            type="number"
            dataKey={y}
            name={humanize(y)}
            tickFormatter={(v: number) => formatCompact(v)}
            width={48}
            axisLine={false}
            {...axis}
          />
          <Tooltip
            cursor={{ stroke: colors.text, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as
                Record<string, unknown> | undefined;
              if (!active || !row) return null;
              const { contentStyle, labelStyle } = tooltipStyle(colors);
              return (
                <div style={{ ...contentStyle, padding: '6px 10px' }}>
                  {visual.dims.length > 0 && (
                    <div style={labelStyle}>{label(row)}</div>
                  )}
                  <div>
                    {humanize(x)}: {formatCell(row[x], x)}
                  </div>
                  <div>
                    {humanize(y)}: {formatCell(row[y], y)}
                  </div>
                </div>
              );
            }}
          />
          <Scatter
            data={visual.rows}
            fill={color}
            fillOpacity={0.8}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Two categories and a number: a grid shaded light to dark by value. */
function Heatmap({ visual }: { visual: Visual }) {
  const { theme } = useTheme();
  const ramp = RAMP[theme];
  const [down, across] = visual.dims;
  const [measure] = visual.measures;
  const rowsOf = orderLabels([
    ...new Set(visual.rows.map((r) => String(r[down]))),
  ]);
  const colsOf = orderLabels([
    ...new Set(visual.rows.map((r) => String(r[across]))),
  ]);
  const cell = new Map(
    visual.rows.map((r) => [
      `${r[down]}\u001f${r[across]}`,
      Number(r[measure]) || 0,
    ]),
  );
  const all = [...cell.values()];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const showValues = colsOf.length <= 12;
  return (
    <figure
      className="panel viz-figure"
      style={{
        ['--viz-low' as string]: ramp.low,
        ['--viz-high' as string]: ramp.high,
      }}
    >
      <figcaption className="ia-label">
        {humanize(measure)} by {humanize(down).toLowerCase()} and{' '}
        {humanize(across).toLowerCase()}
      </figcaption>
      <div className="viz-heat-scroll">
        <table className="viz-heat">
          <thead>
            <tr>
              <th scope="col" />
              {colsOf.map((c) => (
                <th scope="col" key={c}>
                  {shortLabel(c, across)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsOf.map((r) => (
              <tr key={r}>
                <th scope="row">{shortLabel(r, down)}</th>
                {colsOf.map((c) => {
                  const value = cell.get(`${r}\u001f${c}`);
                  const level =
                    value === undefined || max === min
                      ? 0
                      : (value - min) / (max - min);
                  return (
                    <td
                      key={c}
                      className={level > 0.55 ? 'is-strong' : undefined}
                      style={{
                        ['--level' as string]: `${Math.round(8 + level * 92)}%`,
                      }}
                      title={`${shortLabel(r, down)} · ${shortLabel(c, across)}: ${value === undefined ? 'no data' : formatCell(value, measure)}`}
                    >
                      {showValues && value !== undefined
                        ? formatCompact(value)
                        : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="viz-scale" aria-hidden="true">
        <span>{formatCompact(min)}</span>
        <i />
        <span>{formatCompact(max)}</span>
      </p>
    </figure>
  );
}
