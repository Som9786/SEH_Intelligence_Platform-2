import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { scaledFont } from '../../../../shared/utils/fontScale';
import { formatCell, formatCompact, humanize } from '../../utils/formatCell';
import { measureColors } from '../../utils/chartColors';
import { type Visual } from '../../utils/visualOf';
import { useChartColors, tooltipStyle } from './chartKit';

/** Two numbers against each other: a dot per row, named in its tooltip. */
export function Spread({ visual }: { visual: Visual }) {
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
            tickFormatter={(v: number) => formatCompact(v, x)}
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
            tickFormatter={(v: number) => formatCompact(v, y)}
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
