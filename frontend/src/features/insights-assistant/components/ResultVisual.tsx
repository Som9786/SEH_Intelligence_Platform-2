import { useMemo, useState } from 'react';
import { useTheme } from '../../../shared/hooks/useTheme';
import { measureColors, SERIES } from '../utils/chartColors';
import {
  CHART_LABEL,
  CHART_NAME,
  chooseChart,
  type ChartKind,
  type ChartSuggestion,
  type Requested,
} from '../utils/chartChoice';
import { type Visual } from '../utils/visualOf';
import { ResultTable } from './ResultTable';
import { type Result } from './charts/chartKit';
import { Kpis } from './charts/Kpis';
import { Trend } from './charts/Trend';
import { Columns } from './charts/Columns';
import { Bars } from './charts/Bars';
import { Share, Donut } from './charts/Parts';
import { SeriesColumns } from './charts/SeriesColumns';
import { Spread } from './charts/Spread';
import { Heatmap } from './charts/Heatmap';

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
