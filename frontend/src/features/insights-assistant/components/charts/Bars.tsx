import { useTheme } from '../../../../shared/hooks/useTheme';
import { formatCell, humanize } from '../../utils/formatCell';
import { measureColors } from '../../utils/chartColors';
import { type Visual } from '../../utils/visualOf';
import { leaderOf } from './chartKit';

/** Names and a number as horizontal bars; a second number (bars2) is shown beside each bar. */
export function Bars({ visual }: { visual: Visual }) {
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
