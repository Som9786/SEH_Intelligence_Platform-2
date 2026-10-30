import { describe, expect, it } from 'vitest';
import { formatCell, isAmount } from './formatCell';

describe('formatCell', () => {
  it('formats amounts but not identifiers', () => {
    expect(formatCell(265122.03, 'net_sales')).toBe('265,122.03');
    expect(formatCell(54297, 'store')).toBe('54297');
    expect(isAmount(54297, 'store')).toBe(false);
    expect(isAmount(1.5, 'lift')).toBe(true);
  });

  it('shows a database date-time as a date', () => {
    const midnight = new Date(2026, 7, 1).toISOString();
    expect(formatCell(midnight, 'business_month')).toBe('1 Aug 2026');
    const afternoon = new Date(2026, 7, 16, 14, 5).toISOString();
    expect(formatCell(afternoon, 'checkout')).toMatch(/16 Aug 2026.*14:05/);
  });

  it('leaves plain dates and text alone', () => {
    expect(formatCell('2026-08-16', 'business_date')).toBe('2026-08-16');
    expect(formatCell('Thursday', 'day')).toBe('Thursday');
    expect(formatCell(null, 'x')).toBe('—');
  });
});
