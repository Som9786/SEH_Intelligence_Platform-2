import { useTheme } from '../../../../shared/hooks/useTheme';
import { formatCell, humanize } from '../../utils/formatCell';
import { measureColors } from '../../utils/chartColors';
import { type Visual } from '../../utils/visualOf';
import { kpiValue } from './chartKit';

/** One number, or a row of them: the figure large, its name small. */
export function Kpis({ visual }: { visual: Visual }) {
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
