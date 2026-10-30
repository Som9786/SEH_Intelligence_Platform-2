import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../../shared/hooks/useTheme';
import { scaledFont } from '../../../shared/utils/fontScale';
import type { AnalyticsResult } from '../services/assistantService';
import { formatCell, formatCompact, humanize } from '../utils/formatCell';
import { measureColors, RAMP, SERIES, tint } from '../utils/chartColors';
import { orderLabels, visualOf, type Visual } from '../utils/visualOf';
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
 * A query result shown the way its shape suits best (see visualOf), with a Chart / Table switch.
 * Board widgets and Insights Assistant answers both use it, so a widget looks as it did in chat.
 */
export function ResultVisual({ result }: { result: Result }) {
  const visual = useMemo(() => visualOf(result), [result]);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const { theme } = useTheme();
  const colors = measureColors(visual.measures, theme);
  const barColor = (column: string) =>
    colors[visual.measures.indexOf(column)] ?? SERIES[theme][0];
  if (visual.kind === 'table')
    return <ResultTable result={result} dataBars barColor={barColor} />;
  return (
    <div className="viz">
      <div className="viz-switch" role="group" aria-label="Show as">
        {(['chart', 'table'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setView(option)}
          >
            {option === 'chart' ? 'Chart' : 'Table'}
          </button>
        ))}
      </div>
      {view === 'chart' ? (
        <VisualBody visual={visual} />
      ) : (
        <ResultTable result={result} dataBars barColor={barColor} />
      )}
    </div>
  );
}

/** The chart alone, or nothing when the rows only suit a table. */
export function ResultChart({ result }: { result: Result }) {
  const visual = useMemo(() => visualOf(result), [result]);
  return visual.kind === 'table' ? null : <VisualBody visual={visual} />;
}

function VisualBody({ visual }: { visual: Visual }) {
  switch (visual.kind) {
    case 'kpi':
    case 'kpis':
      return <Kpis visual={visual} />;
    case 'line':
      return <TrendLine visual={visual} />;
    case 'columns':
      return <Columns visual={visual} />;
    case 'bars':
    case 'bars2':
      return <Bars visual={visual} />;
    case 'share':
      return <Share visual={visual} />;
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

/** Up to three numbers over dates: lines, with a crosshair tooltip. */
function TrendLine({ visual }: { visual: Visual }) {
  const colors = useChartColors();
  const lineColors = measureColors(visual.measures, colors.theme);
  const [dim] = visual.dims;
  return (
    <figure className="panel viz-figure">
      <figcaption className="ia-label">
        {visual.measures.map(humanize).join(', ')} by{' '}
        {humanize(dim).toLowerCase()}
      </figcaption>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
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
          {visual.measures.map((measure, i) => (
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
          ))}
        </LineChart>
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

/** Parts of a whole: one bar split into segments, with a legend of names, values and shares. */
function Share({ visual }: { visual: Visual }) {
  const colors = useChartColors();
  const [dim] = visual.dims;
  const [measure] = visual.measures;
  const total = visual.rows.reduce(
    (sum, r) => sum + (Number(r[measure]) || 0),
    0,
  );
  const parts = visual.rows.map((row, i) => {
    const value = Number(row[measure]) || 0;
    return {
      label: formatCell(row[dim], dim),
      value,
      share: total ? value / total : 0,
      color: colors.series[i],
    };
  });
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
