import { describe, expect, it } from 'vitest';
import type { Holding, StockConfig, Trade, TrendData } from '../../../../lib/services/types';
import {
  calculatePortfolioSummary,
  DEFAULT_ASSET_KLINE_DAYS,
  resolvePortfolioKlineRequestDates,
  sortPortfolioHoldings,
  sortPortfolioTrades,
} from '../portfolioUtils';
import {
  formatPercentage,
  getColorByPercentage,
  loadCachedStockConfigs,
  PORTFOLIO_STOCK_CONFIG_CACHE_TTL_MS,
} from '../portfolioHeatmapUtils';

const makeHolding = (overrides: Partial<Holding> = {}): Holding => ({
  stock_code: 'AAPL',
  stock_name: 'Apple',
  quantity: 10,
  average_price: 100,
  current_price: 110,
  total_value: 1100,
  profit_loss: 100,
  profit_loss_percentage: 10,
  daily_profit_loss: 20,
  daily_profit_loss_percentage: 1.5,
  last_updated: '2026-06-19T00:00:00Z',
  ...overrides,
});

const makeTrade = (overrides: Partial<Trade> = {}): Trade => ({
  id: 1,
  user_id: 'user-1',
  stock_code: 'AAPL',
  stock_name: 'Apple',
  operation: 'buy',
  target_price: 100,
  quantity: 10,
  notes: '',
  status: 'completed',
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
});

describe('portfolioUtils', () => {
  describe('calculatePortfolioSummary', () => {
    it('computes totals and uses the latest trend value for position ratio', () => {
      const holdings = [
        makeHolding({ stock_code: 'AAPL', total_value: 1200, profit_loss: 200 }),
        makeHolding({ stock_code: 'TSLA', total_value: 800, profit_loss: -50 }),
      ];
      const trendData: TrendData[] = [
        { date: '2026-06-18', value: 1500 },
        { date: '2026-06-19', value: 2500 },
      ];

      expect(calculatePortfolioSummary(holdings, trendData)).toEqual({
        totalHoldingsValue: 2000,
        totalProfitLoss: 150,
        latestTrendValue: 2500,
        positionRatio: 80,
        remainingCash: 500,
      });
    });

    it('falls back to holdings value when there is no trend data', () => {
      const holdings = [makeHolding({ total_value: 900, profit_loss: 30 })];

      expect(calculatePortfolioSummary(holdings, [])).toEqual({
        totalHoldingsValue: 900,
        totalProfitLoss: 30,
        latestTrendValue: 900,
        positionRatio: 100,
        remainingCash: 0,
      });
    });

    it('returns zero position ratio when latest trend value is zero', () => {
      const holdings = [makeHolding({ total_value: 900 })];
      const trendData: TrendData[] = [{ date: '2026-06-19', value: 0 }];

      expect(calculatePortfolioSummary(holdings, trendData).positionRatio).toBe(0);
    });
  });

  describe('resolvePortfolioKlineRequestDates', () => {
    const dateRange = { startDate: '2026-01-01', endDate: '2026-02-01' };
    const fixedNow = new Date('2026-06-19T00:00:00.000Z');

    it('uses the default asset kline window when params are absent', () => {
      const result = resolvePortfolioKlineRequestDates(dateRange, '', fixedNow);

      expect(result).toEqual({
        shouldUseAssetKlineDefaultRange: true,
        klineStartDate: '2025-12-21',
        klineEndDate: '2026-06-19',
        metricsEndDate: '2026-02-01',
      });
    });

    it('keeps the selected date range for non-kline views', () => {
      const result = resolvePortfolioKlineRequestDates(
        dateRange,
        '?trendView=return&trendSource=asset',
        fixedNow,
      );

      expect(result).toEqual({
        shouldUseAssetKlineDefaultRange: false,
        klineStartDate: '2026-01-01',
        klineEndDate: '2026-02-01',
        metricsEndDate: '2026-02-01',
      });
    });

    it('keeps the selected date range for position kline source', () => {
      const result = resolvePortfolioKlineRequestDates(
        dateRange,
        '?trendView=kline&trendSource=position',
        fixedNow,
      );

      expect(result.shouldUseAssetKlineDefaultRange).toBe(false);
      expect(result.klineStartDate).toBe(dateRange.startDate);
      expect(result.klineEndDate).toBe(dateRange.endDate);
    });

    it('exports the expected default kline lookback constant', () => {
      expect(DEFAULT_ASSET_KLINE_DAYS).toBe(180);
    });
  });

  describe('sortPortfolioHoldings', () => {
    const holdings = [
      makeHolding({ stock_code: 'BABA', total_value: 300, profit_loss_percentage: 3 }),
      makeHolding({ stock_code: 'AAPL', total_value: 100, profit_loss_percentage: 8 }),
      makeHolding({ stock_code: 'TSLA', total_value: 200, profit_loss_percentage: -2 }),
    ];

    it('sorts by stock code ascending', () => {
      const sorted = sortPortfolioHoldings(holdings, { field: 'stock_code', direction: 'asc' });

      expect(sorted.map((item) => item.stock_code)).toEqual(['AAPL', 'BABA', 'TSLA']);
    });

    it('sorts by total value descending', () => {
      const sorted = sortPortfolioHoldings(holdings, { field: 'total_value', direction: 'desc' });

      expect(sorted.map((item) => item.total_value)).toEqual([300, 200, 100]);
    });

    it('sorts by profit loss percentage ascending', () => {
      const sorted = sortPortfolioHoldings(holdings, {
        field: 'profit_loss_percentage',
        direction: 'asc',
      });

      expect(sorted.map((item) => item.profit_loss_percentage)).toEqual([-2, 3, 8]);
    });
  });

  describe('sortPortfolioTrades', () => {
    const trades = [
      makeTrade({ id: 1, created_at: '2026-06-18T00:00:00Z' }),
      makeTrade({ id: 2, created_at: '2026-06-20T00:00:00Z' }),
      makeTrade({ id: 3, created_at: '2026-06-19T00:00:00Z' }),
    ];

    it('sorts trades by created time descending', () => {
      const sorted = sortPortfolioTrades(trades, { field: 'created_at', direction: 'desc' });

      expect(sorted.map((item) => item.id)).toEqual([2, 3, 1]);
    });

    it('sorts trades by created time ascending', () => {
      const sorted = sortPortfolioTrades(trades, { field: 'created_at', direction: 'asc' });

      expect(sorted.map((item) => item.id)).toEqual([1, 3, 2]);
    });
  });
});

describe('portfolioHeatmapUtils', () => {
  const regionalColors = { upColor: '#ff0000', downColor: '#00ff00' };
  const stockConfigs: StockConfig[] = [{ stock_code: 'AAPL', category: 'Tech', tags: ['AI'] }];

  it('returns a light neutral color for near-zero daily change', () => {
    expect(getColorByPercentage(0.1, false, regionalColors)).toBe('#f3f4f6');
  });

  it('returns a dark neutral color for near-zero daily change in dark mode', () => {
    expect(getColorByPercentage(-0.1, true, regionalColors)).toBe('#374151');
  });

  it('converts strong six-digit colors to rgba output', () => {
    expect(getColorByPercentage(6, false, regionalColors)).toBe('rgba(255, 0, 0, 1)');
  });

  it('formats invalid percentages as zero', () => {
    expect(formatPercentage(undefined)).toBe('0.00');
    expect(formatPercentage(Number.NaN)).toBe('0.00');
  });

  it('loads legacy cached stock config arrays', () => {
    expect(loadCachedStockConfigs(JSON.stringify(stockConfigs))).toEqual(stockConfigs);
  });

  it('loads wrapped cached stock configs before ttl expiry', () => {
    const now = Date.now();
    const cached = JSON.stringify({ ts: now - PORTFOLIO_STOCK_CONFIG_CACHE_TTL_MS + 1, data: stockConfigs });

    expect(loadCachedStockConfigs(cached, now)).toEqual(stockConfigs);
  });

  it('rejects expired cached stock configs', () => {
    const now = Date.now();
    const cached = JSON.stringify({ ts: now - PORTFOLIO_STOCK_CONFIG_CACHE_TTL_MS - 1, data: stockConfigs });

    expect(loadCachedStockConfigs(cached, now)).toEqual([]);
  });

  it('rejects malformed cached stock configs', () => {
    expect(loadCachedStockConfigs('not-json')).toEqual([]);
  });
});
