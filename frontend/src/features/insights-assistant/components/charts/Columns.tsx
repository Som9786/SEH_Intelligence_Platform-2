import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { scaledFont } from '../../../../shared/utils/fontScale';
import { formatCell, formatCompact, humanize } from '../../utils/formatCell';
import { measureColors, tint } from '../../utils/chartColors';
import { type Visual } from '../../utils/visualOf';
import {
  useChartColors,
  shortLabel,
  OTHERS,
  leaderOf,
  tooltipStyle,
} from './chartKit';

/** A number by weekday or hour: columns in time order. */
export function Columns({ visual }: { visual: Visual }) {
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
            tickFormatter={(v: number) => formatCompact(v, measure)}
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
