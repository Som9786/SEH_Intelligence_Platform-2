import { describe, expect, it } from 'vitest';
import { measureColors, SERIES, tint } from './chartColors';

const [blue, orange, violet, amber, magenta] = SERIES.light;

describe('measureColors', () => {
  it('gives each kind of metric its own colour, the same in every chart', () => {
    expect(
      measureColors(
        ['net_sales', 'baskets', 'units_sold', 'lift', 'discounts'],
        'light',
      ),
    ).toEqual([blue, orange, violet, magenta, amber]);
    expect(measureColors(['baskets'], 'light')).toEqual([orange]);
  });

  it('never gives two measures the same colour', () => {
    const colors = measureColors(
      ['gross_sales', 'net_sales', 'mystery'],
      'light',
    );
    expect(colors[0]).toBe(blue);
    expect(new Set(colors).size).toBe(3);
  });

  it('uses the dark steps in dark mode', () => {
    expect(measureColors(['net_sales'], 'dark')).toEqual([SERIES.dark[0]]);
  });
});

describe('tint', () => {
  it('mixes a colour toward the surface', () => {
    expect(tint('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(tint('#2a78d6', '#ffffff', 1)).toBe('#2a78d6');
    expect(tint('#2a78d6', '#ffffff', 0)).toBe('#ffffff');
  });
});
