import { describe, expect, it } from 'vitest';
import { fitLabel } from './chartKit';

describe('fitLabel', () => {
  it('keeps a label that fits on one line', () => {
    expect(fitLabel('Mon', 10)).toEqual(['Mon']);
  });

  it('wraps at spaces onto two lines', () => {
    expect(fitLabel('Steamed Pork Hash', 12)).toEqual(['Steamed Pork', 'Hash']);
  });

  it('cuts what still does not fit short with an ellipsis', () => {
    expect(fitLabel('AriZona Green Tea Can 23oz', 10)).toEqual([
      'AriZona',
      'Green Tea…',
    ]);
  });

  it('breaks a word longer than a line', () => {
    expect(fitLabel('Supercalifragilistic', 8, 1)).toEqual(['Superca…']);
  });
});
