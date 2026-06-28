import { describe, expect, it } from 'vitest';
import { getBreakevens } from '../payoffBreakevens';

describe('getBreakevens', () => {
  it('keeps interpolation for normal sign changes', () => {
    expect(getBreakevens([
      { price: 1.4, pnl: -10 },
      { price: 1.5, pnl: 10 },
    ])).toEqual([1.45]);
  });

  it('compresses a right-edge zero plateau into one point', () => {
    expect(getBreakevens([
      { price: 1.489, pnl: 12 },
      { price: 1.5, pnl: 0 },
      { price: 1.511, pnl: 0 },
      { price: 1.522, pnl: 0 },
      { price: 1.532, pnl: 0 },
      { price: 1.543, pnl: 0 },
      { price: 1.554, pnl: 0 },
      { price: 1.56, pnl: 0 },
    ])).toEqual([1.5]);
  });

  it('compresses a left-edge zero plateau into one point', () => {
    expect(getBreakevens([
      { price: 1.4, pnl: 0 },
      { price: 1.45, pnl: 0 },
      { price: 1.5, pnl: 0 },
      { price: 1.55, pnl: -5 },
      { price: 1.6, pnl: -8 },
    ])).toEqual([1.5]);
  });

  it('keeps both boundaries for an interior zero plateau', () => {
    expect(getBreakevens([
      { price: 1.4, pnl: -8 },
      { price: 1.45, pnl: 0 },
      { price: 1.5, pnl: 0 },
      { price: 1.55, pnl: 12 },
    ])).toEqual([1.45, 1.5]);
  });
});
