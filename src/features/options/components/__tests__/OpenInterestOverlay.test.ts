import { describe, it, expect } from 'vitest';
import {
  formatOINumber,
  buildSmoothSplinePath,
} from '../OpenInterestOverlay';

describe('OpenInterestOverlay helpers', () => {
  describe('formatOINumber', () => {
    it('returns empty string for 0, negative or invalid numbers', () => {
      expect(formatOINumber(0)).toBe('');
      expect(formatOINumber(-100)).toBe('');
      expect(formatOINumber(NaN)).toBe('');
    });

    it('formats numbers below 10,000 as localized integer', () => {
      expect(formatOINumber(8500)).toBe('8,500');
      expect(formatOINumber(420)).toBe('420');
    });

    it('formats numbers >= 10,000 in 万', () => {
      expect(formatOINumber(10000)).toBe('1万');
      expect(formatOINumber(45000)).toBe('4.5万');
      expect(formatOINumber(125000)).toBe('12.5万');
    });

    it('formats numbers >= 100,000,000 in 亿', () => {
      expect(formatOINumber(150000000)).toBe('1.5亿');
      expect(formatOINumber(320000000)).toBe('3.2亿');
    });
  });

  describe('buildSmoothSplinePath', () => {
    it('handles empty or single point lists', () => {
      expect(buildSmoothSplinePath([])).toBe('');
      expect(buildSmoothSplinePath([{ x: 100, y: 50 }])).toBe('M 100 50');
    });

    it('generates a continuous single spline path connecting all points', () => {
      const points = [
        { x: 200, y: 30 },
        { x: 180, y: 60 },
        { x: 150, y: 90 },
        { x: 190, y: 120 },
        { x: 200, y: 150 },
      ];

      const path = buildSmoothSplinePath(points);

      // Must start at first point
      expect(path.startsWith('M 200 30')).toBe(true);

      // Must have exactly 4 cubic segments for 5 points
      const cubicSegments = path.split(' C ');
      expect(cubicSegments.length).toBe(5);

      // Must end at last point
      expect(path.endsWith('200.0 150.0')).toBe(true);
    });
  });
});
