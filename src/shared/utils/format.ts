import type { CurrencyConfig } from '../types';

export function getCurrencySymbol(stockCode?: string): string {
  if (!stockCode) return '$';
  const upper = stockCode.toUpperCase().trim();
  if (
    upper.endsWith('.SH') ||
    upper.endsWith('.SZ') ||
    upper.endsWith('.SS') ||
    upper.endsWith('.SZSE') ||
    upper.endsWith('.SSE') ||
    upper.endsWith('.BJ') ||
    /^\d{6}$/.test(upper)
  ) {
    return '¥';
  }
  if (upper.endsWith('.HK') || /^\d{5}$/.test(upper)) {
    return 'HK$';
  }
  return '$';
}

export function formatCurrency(amount: number, config: CurrencyConfig, precision: number = 2): string {
  const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping: true
  });

  return config.position === 'before'
    ? `${config.symbol}${formattedNumber}`
    : `${formattedNumber}${config.symbol}`;
}

export function formatPercentage(value: number | undefined): string {
  if (typeof value !== 'number' || !isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

