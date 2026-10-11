import { describe, it, expect } from 'vitest';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  calculateMA,
  formatMAPrice,
  formatVolume,
  MA_CONFIGS,
} from '../technicalIndicators';

describe('technicalIndicators', () => {
  describe('calculateMA', () => {
    it('returns empty array if data length is less than period', () => {
      const data = [
        { time: 100 as UTCTimestamp, close: 10 },
        { time: 200 as UTCTimestamp, close: 12 },
      ];
      expect(calculateMA(data, 5)).toEqual([]);
    });

    it('calculates 3-period MA correctly', () => {
      const data = [
        { time: 100 as UTCTimestamp, close: 10 },
        { time: 200 as UTCTimestamp, close: 20 },
        { time: 300 as UTCTimestamp, close: 30 },
        { time: 400 as UTCTimestamp, close: 40 },
      ];
      const result = calculateMA(data, 3);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ time: 300, value: 20 }); // (10+20+30)/3 = 20
      expect(result[1]).toEqual({ time: 400, value: 30 }); // (20+30+40)/3 = 30
    });

    it('handles decimal prices and periods gracefully', () => {
      const data = [
        { time: 1 as UTCTimestamp, close: 1.05 },
        { time: 2 as UTCTimestamp, close: 1.10 },
        { time: 3 as UTCTimestamp, close: 1.15 },
        { time: 4 as UTCTimestamp, close: 1.20 },
        { time: 5 as UTCTimestamp, close: 1.25 },
      ];
      const result = calculateMA(data, 5);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ time: 5, value: 1.15 });
    });
  });

  describe('formatMAPrice', () => {
    it('formats numbers less than 10 with 3 decimal places', () => {
      expect(formatMAPrice(1.2345)).toBe('1.235');
      expect(formatMAPrice(9.9)).toBe('9.900');
    });

    it('formats numbers greater than or equal to 10 with 2 decimal places', () => {
      expect(formatMAPrice(15.678)).toBe('15.68');
      expect(formatMAPrice(100)).toBe('100.00');
    });

    it('returns -- for null/undefined/NaN', () => {
      expect(formatMAPrice(null)).toBe('--');
      expect(formatMAPrice(undefined)).toBe('--');
      expect(formatMAPrice(NaN)).toBe('--');
    });
  });

  describe('formatVolume', () => {
    it('formats large numbers into 亿 and 万', () => {
      expect(formatVolume(123456789)).toBe('1.23亿');
      expect(formatVolume(543210)).toBe('54.32万');
      expect(formatVolume(9999)).toBe('9,999');
    });

    it('returns -- for invalid values', () => {
      expect(formatVolume(null)).toBe('--');
      expect(formatVolume(undefined)).toBe('--');
      expect(formatVolume(NaN)).toBe('--');
    });
  });

  describe('MA_CONFIGS', () => {
    it('contains standard periods 5, 10, 20, 60', () => {
      const periods = MA_CONFIGS.map(c => c.period);
      expect(periods).toEqual([5, 10, 20, 60]);
    });
  });
});
