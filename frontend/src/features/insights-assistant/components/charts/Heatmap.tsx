import { useTheme } from '../../../../shared/hooks/useTheme';
import { formatCell, formatCompact, humanize } from '../../utils/formatCell';
import { RAMP } from '../../utils/chartColors';
import { orderLabels, type Visual } from '../../utils/visualOf';
import { shortLabel } from './chartKit';

/** Two categories and a number: a grid shaded light to dark by value. */
export function Heatmap({ visual }: { visual: Visual }) {
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
                        ? formatCompact(value, measure)
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
        <span>{formatCompact(min, measure)}</span>
        <i />
        <span>{formatCompact(max, measure)}</span>
      </p>
    </figure>
  );
}
