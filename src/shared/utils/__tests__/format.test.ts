import { describe, it, expect } from 'vitest';
import { formatCompactNumber, formatCompactCurrency } from '../format';
import type { CurrencyConfig } from '../../types';

describe('formatCompactNumber', () => {
  it('should format Chinese units correctly (CN region)', () => {
    expect(formatCompactNumber(1250000, 'CN')).toBe('125万');
    expect(formatCompactNumber(1254300, 'CN')).toBe('125.43万');
    expect(formatCompactNumber(100000000, 'CN')).toBe('1亿');
    expect(formatCompactNumber(100500000, 'CN')).toBe('1.01亿');
    expect(formatCompactNumber(500, 'CN')).toBe('500');
    expect(formatCompactNumber(500.5, 'CN')).toBe('500.50');
  });

  it('should format International units correctly (non-CN region)', () => {
    expect(formatCompactNumber(1250000, 'US')).toBe('1.25M');
    expect(formatCompactNumber(1250000000, 'US')).toBe('1.25B');
    expect(formatCompactNumber(1500, 'US')).toBe('1.5K');
    expect(formatCompactNumber(500, 'US')).toBe('500');
    expect(formatCompactNumber(500.5, 'US')).toBe('500.50');
  });
});

describe('formatCompactCurrency', () => {
  const usdConfig: CurrencyConfig = { symbol: '$', position: 'before', separator: ',', region: 'US' };
  const cnyConfig: CurrencyConfig = { symbol: '¥', position: 'before', separator: ',', region: 'CN' };

  it('should prefix/suffix currency symbols correctly based on config', () => {
    expect(formatCompactCurrency(1250000, usdConfig)).toBe('$1.25M');
    expect(formatCompactCurrency(1250000, cnyConfig)).toBe('¥125万');
    expect(formatCompactCurrency(500, usdConfig)).toBe('$500');
  });
});
