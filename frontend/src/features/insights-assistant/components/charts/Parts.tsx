import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCell, humanize } from '../../utils/formatCell';
import { type Visual } from '../../utils/visualOf';
import { useChartColors, tooltipStyle } from './chartKit';

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
export function Share({ visual }: { visual: Visual }) {
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
export function Donut({ visual }: { visual: Visual }) {
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
