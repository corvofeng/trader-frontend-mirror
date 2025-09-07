import type { CurrencyConfig } from '../types';

export function formatPercentage(value: number | undefined): string {
  if (typeof value !== 'number' || !isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}