import type { UTCTimestamp } from 'lightweight-charts';

export type MovingAveragePeriod = 5 | 10 | 20 | 60;

export interface MAConfig {
  period: MovingAveragePeriod;
  label: string;
  color: string;
}

export const MA_CONFIGS: MAConfig[] = [
  { period: 5, label: 'MA5', color: '#f59e0b' },
  { period: 10, label: 'MA10', color: '#a855f7' },
  { period: 20, label: 'MA20', color: '#3b82f6' },
  { period: 60, label: 'MA60', color: '#10b981' },
];

export interface MAPoint {
  time: UTCTimestamp;
  value: number;
}

export interface CandlestickClosePoint {
  time: UTCTimestamp;
  close: number;
}

/**
 * Calculates Simple Moving Average (SMA) for a given series of prices and period.
 */
export function calculateMA(
  data: CandlestickClosePoint[],
  period: number
): MAPoint[] {
  if (data.length < period || period <= 0) {
    return [];
  }

  const result: MAPoint[] = [];
  let sum = 0;

  for (let i = 0; i < data.length; i += 1) {
    sum += data[i].close;

    if (i >= period) {
      sum -= data[i - period].close;
    }

    if (i >= period - 1) {
      const avg = sum / period;
      result.push({
        time: data[i].time,
        value: Number(avg.toFixed(3)),
      });
    }
  }

  return result;
}

/**
 * Formats a moving average value with standard precision.
 */
export function formatMAPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  const digits = value < 10 ? 3 : 2;
  const factor = 10 ** digits;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(digits);
}

/**
 * Formats trading volume for display (e.g. 1.25万, 3.40亿).
 */
export function formatVolume(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return value.toLocaleString('zh-CN');
}

