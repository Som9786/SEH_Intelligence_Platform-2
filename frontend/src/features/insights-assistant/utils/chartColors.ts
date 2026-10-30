import type { Theme } from '../../../shared/hooks/useTheme';

/**
 * Chart colours: blue, the logo's orange, violet, amber, magenta and a blue-teal. No green (the
 * app's own colour, and "success") and no red (danger), so charts never read as a status. The
 * order is validated for colour-blind separation between neighbours in both themes.
 */
export const SERIES: Record<Theme, string[]> = {
  light: ['#2a78d6', '#e8742a', '#7a5ad6', '#c98a00', '#d55181', '#0e8fa8'],
  dark: ['#3987e5', '#d95926', '#9085e9', '#c98500', '#d55181', '#1aa0b8'],
};

/** Heatmaps: one blue ramp, low (light) to high (dark); on dark, low recedes into the surface. */
export const RAMP: Record<Theme, { low: string; high: string }> = {
  light: { low: '#e3eefb', high: '#0d366b' },
  dark: { low: '#1b2533', high: '#86b6ef' },
};

/**
 * Each kind of metric keeps one colour across every chart and widget, so a board reads at a
 * glance: money blue, baskets orange, units violet, discounts amber, ratios magenta.
 */
const METRIC_SLOTS: { slot: number; pattern: RegExp }[] = [
  { slot: 3, pattern: /discount|promo|coupon|reward/i },
  { slot: 4, pattern: /lift|ratio|share|pct|percent|rate|avg_|average/i },
  { slot: 0, pattern: /sales|revenue|amount|value|spend|price|total/i },
  { slot: 1, pattern: /basket|transaction|checkout|count|visits?/i },
  { slot: 2, pattern: /unit|qty|quantity|items?$/i },
];

function slotOf(measure: string): number | null {
  return (
    METRIC_SLOTS.find(({ pattern }) => pattern.test(measure))?.slot ?? null
  );
}

/**
 * A colour per measure: its metric's colour when it has one, otherwise the next unused slot.
 * Two measures never share a colour.
 */
export function measureColors(measures: string[], theme: Theme): string[] {
  const palette = SERIES[theme];
  const used = new Set<number>();
  const slots = measures.map((measure) => {
    const slot = slotOf(measure);
    if (slot === null || used.has(slot)) return null;
    used.add(slot);
    return slot;
  });
  return slots.map((slot) => {
    if (slot !== null) return palette[slot];
    const free = palette.findIndex((_, i) => !used.has(i));
    const next = free === -1 ? 0 : free;
    used.add(next);
    return palette[next];
  });
}

/** `color` mixed toward `base` (0 = base, 1 = color): the lighter tint for bars that aren't the leader. */
export function tint(color: string, base: string, amount: number): string {
  const rgb = (hex: string) => {
    const h = hex.replace('#', '');
    const full =
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const [a, b] = [rgb(color), rgb(base)];
  if ([...a, ...b].some(Number.isNaN)) return color;
  return `#${a
    .map((channel, i) =>
      Math.round(b[i] + (channel - b[i]) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
