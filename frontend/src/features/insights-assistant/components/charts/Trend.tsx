import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { scaledFont } from '../../../../shared/utils/fontScale';
import { formatCell, formatCompact, humanize } from '../../utils/formatCell';
import { measureColors } from '../../utils/chartColors';
import { type Visual } from '../../utils/visualOf';
import { useChartColors, shortLabel, tooltipStyle } from './chartKit';

/** Up to three numbers over dates: lines (or filled areas), with a crosshair tooltip. */
export function Trend({
  visual,
  area = false,
}: {
  visual: Visual;
  area?: boolean;
}) {
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
            tickFormatter={(v: number) => formatCompact(v, visual.measures[0])}
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
