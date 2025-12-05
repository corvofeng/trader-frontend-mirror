import type { CurrencyConfig } from '../types';

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
