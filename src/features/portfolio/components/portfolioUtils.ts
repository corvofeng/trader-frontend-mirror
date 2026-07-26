import { subDays } from 'date-fns';
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
      ? toIsoDate(subDays(now, DEFAULT_ASSET_KLINE_DAYS))
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
