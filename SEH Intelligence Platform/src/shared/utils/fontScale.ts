/**
 * Text drawn outside the stylesheet (charts, diagrams) follows the page's type scale: the same
 * multiplier as --fs-scale in index.css, so an 11px chart label matches --fs-xs.
 */
export const FS_SCALE = 0.9;

/** A design size in pixels, scaled like the page's text and rounded to a tenth. */
export const scaledFont = (size: number) =>
  Math.round(size * FS_SCALE * 10) / 10;
