import type { XAxisTickContentProps } from 'recharts';
import { fitLabel } from './chartKit';

/** An average character's width as a share of the font size, a little generous so labels don't touch. */
const CHAR_WIDTH = 0.6;

/** Whether some label is long enough to need two lines, so the axis makes room for them. */
export const needsTwoLines = (labels: string[]) =>
  labels.some((label) => label.length > 8);

/**
 * An x-axis tick that fits its column: the label wrapped onto up to two lines and cut short with
 * "…" past that, with the whole label on hover. Short labels (weekdays, hours) stay on one line.
 * Pass it as the axis's tick, with the axis's interval at 0 so every label shows.
 */
export function fittedTick(
  format: (value: unknown) => string,
  fill: string,
  fontSize: number,
) {
  return function renderTick({
    x,
    y,
    payload,
    width,
    visibleTicksCount,
  }: XAxisTickContentProps) {
    const label = format(payload.value);
    // The axis's width is shared by the labels that show.
    const band = Number(width ?? 0) / Math.max(1, visibleTicksCount);
    const lines = fitLabel(label, (band - 6) / (fontSize * CHAR_WIDTH));
    return (
      <text x={x} y={y} textAnchor="middle" fill={fill} fontSize={fontSize}>
        <title>{label}</title>
        {lines.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? '0.9em' : '1.2em'}>
            {line}
          </tspan>
        ))}
      </text>
    );
  };
}
