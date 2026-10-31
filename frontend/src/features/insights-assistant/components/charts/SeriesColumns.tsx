import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { scaledFont } from '../../../../shared/utils/fontScale';
import { formatCell, formatCompact, humanize } from '../../utils/formatCell';
import { measureColors } from '../../utils/chartColors';
import { pivotDims } from '../../utils/chartChoice';
import { orderLabels, type Visual } from '../../utils/visualOf';
import { useChartColors, shortLabel, tooltipStyle } from './chartKit';
import { fittedTick, needsTwoLines } from './FittedTick';

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
export function SeriesColumns({
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
  const label = (value: unknown) => shortLabel(value, x);
  const twoLines = needsTwoLines(data.map((row) => label(row[x])));
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
            tick={fittedTick(label, colors.text, scaledFont(11))}
            height={twoLines ? 40 : 30}
            stroke={colors.grid}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v, visual.measures[0])}
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
