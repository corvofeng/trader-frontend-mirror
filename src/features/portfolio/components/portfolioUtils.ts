import type { Holding, Trade, TrendData } from '../../../lib/services/types';

export const DEFAULT_ASSET_KLINE_DAYS = 180;

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PortfolioSummary {
  totalHoldingsValue: number;
  totalProfitLoss: number;
  latestTrendValue: number;
  positionRatio: number;
  remainingCash: number;
}

export interface PortfolioKlineRequestDates {
  shouldUseAssetKlineDefaultRange: boolean;
  klineStartDate: string;
  klineEndDate: string;
  metricsEndDate: string;
}

const toIsoDate = (value: Date) => value.toISOString().split('T')[0];

export function calculatePortfolioSummary(holdings: Holding[], trendData: TrendData[]): PortfolioSummary {
  const totalHoldingsValue = holdings.reduce((sum, holding) => sum + holding.total_value, 0);
  const totalProfitLoss = holdings.reduce((sum, holding) => sum + holding.profit_loss, 0);
  const latestTrendValue = trendData.length > 0 ? trendData[trendData.length - 1].value : totalHoldingsValue;
  const positionRatio = latestTrendValue > 0 ? (totalHoldingsValue / latestTrendValue) * 100 : 0;
  const remainingCash = latestTrendValue - totalHoldingsValue;

  return {
    totalHoldingsValue,
    totalProfitLoss,
    latestTrendValue,
    positionRatio,
    remainingCash,
  };
}

export function resolvePortfolioKlineRequestDates(
  dateRange: DateRange,
  locationSearch: string,
  now: Date = new Date(),
): PortfolioKlineRequestDates {
  const searchParams = new URLSearchParams(locationSearch);
  const trendView = searchParams.get('trendView');
  const trendSource = searchParams.get('trendSource');
  const shouldUseAssetKlineDefaultRange =
    (trendView === null || trendView === 'kline') &&
    (trendSource === null || trendSource === 'asset');

  return {
    shouldUseAssetKlineDefaultRange,
    klineStartDate: shouldUseAssetKlineDefaultRange
      ? '2026-01-01'
      : dateRange.startDate,
    klineEndDate: shouldUseAssetKlineDefaultRange ? toIsoDate(now) : dateRange.endDate,
    metricsEndDate: dateRange.endDate,
  };
}

export function sortPortfolioHoldings(holdings: Holding[], holdingsSort: SortState): Holding[] {
  return [...holdings].sort((a, b) => {
    const multiplier = holdingsSort.direction === 'asc' ? 1 : -1;
    switch (holdingsSort.field) {
      case 'stock_code':
        return multiplier * a.stock_code.localeCompare(b.stock_code);
      case 'total_value':
        return multiplier * (a.total_value - b.total_value);
      case 'profit_loss_percentage':
        return multiplier * (a.profit_loss_percentage - b.profit_loss_percentage);
      default:
        return 0;
    }
  });
}

export function sortPortfolioTrades(trades: Trade[], tradesSort: SortState): Trade[] {
  return [...trades].sort((a, b) => {
    const multiplier = tradesSort.direction === 'asc' ? 1 : -1;
    switch (tradesSort.field) {
      case 'created_at':
      default:
        return multiplier * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
  });
}

export interface BenchmarkMetrics {
  totalReturn: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  positiveDayRatio: number;
}

export function calculateBenchmarkMetrics(
  points: Array<{ date: string; close: number }>,
): BenchmarkMetrics | null {
  const sorted = [...points]
    .filter((point) => !!point?.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const series = sorted
    .map((point) => ({ date: point.date.slice(0, 10), value: point.close }))
    .filter(
      (item): item is { date: string; value: number } =>
        !!item.date &&
        typeof item.value === 'number' &&
        Number.isFinite(item.value) &&
        item.value > 0,
    );

  if (series.length < 2) return null;

  const startDate = series[0].date;
  const endDate = series[series.length - 1].date;
  const days = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000),
  );

  const dailyReturns: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1].value;
    const curr = series[i].value;
    dailyReturns.push(prev > 0 ? (curr - prev) / prev : 0);
  }

  const riskFreeRate = 0;
  const totalReturn = series[series.length - 1].value / series[0].value - 1;

  const annualizedMethod = days >= 365 ? 'cagr' : 'period_return';
  const annualizedReturn =
    annualizedMethod === 'period_return'
      ? totalReturn
      : days > 0
        ? Math.pow(series[series.length - 1].value / series[0].value, 365 / days) - 1
        : 0;

  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance =
    dailyReturns.length > 1
      ? dailyReturns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
        (dailyReturns.length - 1)
      : 0;
  const tradingDaysPerYear = 252;
  const annualizedVolatility = Math.sqrt(variance) * Math.sqrt(tradingDaysPerYear);

  const sharpeRatio =
    annualizedVolatility > 0 ? (annualizedReturn - riskFreeRate) / annualizedVolatility : 0;

  let peak = series[0].value;
  let maxDrawdown = 0;
  for (const item of series) {
    if (item.value > peak) peak = item.value;
    const drawdown = peak > 0 ? item.value / peak - 1 : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  const calmarRatio = maxDrawdown < 0 ? annualizedReturn / Math.abs(maxDrawdown) : 0;
  const positiveDayRatio =
    dailyReturns.length > 0
      ? dailyReturns.filter((value) => value > 0).length / dailyReturns.length
      : 0;

  return {
    totalReturn,
    annualizedReturn,
    annualizedVolatility,
    sharpeRatio,
    maxDrawdown,
    calmarRatio,
    positiveDayRatio,
  };
}

export function calculateSMA(
  data: Array<number | null>,
  period: number = 20,
): Array<number | null> {
  const result: Array<number | null> = [];
  for (let i = 0; i < data.length; i++) {
    if (i + 1 < period) {
      result.push(null);
      continue;
    }
    const slice = data.slice(i + 1 - period, i + 1);
    const validValues = slice.filter((v): v is number => v !== null && Number.isFinite(v));
    if (validValues.length < period) {
      result.push(null);
    } else {
      const sum = validValues.reduce((acc, val) => acc + val, 0);
      result.push(sum / period);
    }
  }
  return result;
}


