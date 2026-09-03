/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import type { Services, PortfolioKlineMetrics } from '../types';
import * as mockServices from '../mock';

const staticDbBase = import.meta.env.VITE_STATIC_DB_BASE_URL || '';

let dbPromise: Promise<any> | null = null;

const getDb = (): Promise<any> => {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      if (!staticDbBase) {
        console.warn('VITE_STATIC_DB_BASE_URL is not set in cloudflareServices. Falling back to relative path.');
      }
      const base = staticDbBase.replace(/\/$/, '');
      const latestRes = await fetch(`${base}/latest.json`);
      if (!latestRes.ok) throw new Error(`latest.json not found: ${latestRes.status}`);
      const { date } = await latestRes.json();
      const dbRes = await fetch(`${base}/${date}.json`);
      if (!dbRes.ok) throw new Error(`${date}.json not found: ${dbRes.status}`);
      return await dbRes.json();
    } catch (e) {
      console.error('Failed to load static database from R2 in cloudflareServices', e);
      return {};
    }
  })();
  return dbPromise;
};

export const cloudflareServices: Services = {
  ...mockServices,

  authService: {
    getUser: async () => {
      return {
        data: {
          user: {
            id: 'mock-user-id',
            email: 'user@example.com',
            name: 'Demo User',
            avatar_url: ''
          }
        },
        error: null
      };
    },
    signIn: async () => {
      return {
        data: {
          user: {
            id: 'mock-user-id',
            email: 'user@example.com',
            name: 'Demo User',
            avatar_url: ''
          }
        },
        error: null
      };
    },
    signOut: async () => {
      return { data: undefined, error: null };
    }
  },

  accountService: {
    ...mockServices.accountService,
    getAccounts: async (_userId) => {
      const db = await getDb();
      return { data: db.accounts || [], error: null };
    }
  },

  portfolioService: {
    getHoldings: async (_userId, _accountId) => {
      const db = await getDb();
      return { data: db.holdings || [], error: null };
    },
    getRecentTrades: async (_userId, startDate, endDate, _accountId, stockCode) => {
      const db = await getDb();
      let trades = db.trades || [];
      if (startDate) trades = trades.filter((t: any) => t.date >= startDate);
      if (endDate) trades = trades.filter((t: any) => t.date <= endDate);
      if (stockCode) trades = trades.filter((t: any) => t.stock_code === stockCode);
      return { data: trades, error: null };
    },
    getTrendData: async (_userId, startDate, endDate, _accountId) => {
      const db = await getDb();
      let trend = db.trend || [];
      if (startDate) trend = trend.filter((t: any) => t.date >= startDate);
      if (endDate) trend = trend.filter((t: any) => t.date <= endDate);
      return { data: trend, error: null };
    },
    getKlineData: async (_userId, startDate, endDate, _accountId) => {
      const db = await getDb();
      let candles = db.kline || [];
      if (startDate) candles = candles.filter((c: any) => c.date >= startDate);
      if (endDate) candles = candles.filter((c: any) => c.date <= endDate);
      return { data: candles, error: null };
    },
    getMetrics: async (_userId, _endDate, _accountId) => {
      const db = await getDb();
      const metrics: PortfolioKlineMetrics = db.metrics || {
        startDate: '',
        endDate: '',
        days: 0,
        calculationStartDate: '',
        calculationEndDate: '',
        calculationDays: 0,
        observations: 0,
        tradingDays: 0,
        riskFreeRate: 0,
        totalReturn: 0,
        annualizedReturn: 0,
        annualizedMethod: 'daily',
        annualizedCalculationStartDate: '',
        annualizedCalculationEndDate: '',
        annualizedCalculationDays: 0,
        annualizedTotalReturn: 0,
        annualizedVolatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        calmarRatio: 0,
        bestDayReturn: 0,
        worstDayReturn: 0,
        positiveDayRatio: 0
      };
      return { data: metrics, error: null };
    },
    getAccounts: async (_userId) => {
      const db = await getDb();
      return { data: db.accounts || [], error: null };
    },
    getPortfolioHistory: async (accountAlias, _params) => {
      return {
        data: {
          account_alias: accountAlias,
          count: 0,
          history: [],
        },
        error: null,
      };
    },
    getHoldingsByUuid: async (_uuid) => {
      const db = await getDb();
      return { data: db.holdings || [], error: null };
    },
    getRecentTradesByUuid: async (_uuid, startDate, endDate) => {
      const db = await getDb();
      let trades = db.trades || [];
      if (startDate) trades = trades.filter((t: any) => t.date >= startDate);
      if (endDate) trades = trades.filter((t: any) => t.date <= endDate);
      return { data: trades, error: null };
    },
    getTrendDataByUuid: async (_uuid, startDate, endDate) => {
      const db = await getDb();
      let trend = db.trend || [];
      if (startDate) trend = trend.filter((t: any) => t.date >= startDate);
      if (endDate) trend = trend.filter((t: any) => t.date <= endDate);
      return { data: trend, error: null };
    },
    getKlineDataByUuid: async (_uuid, startDate, endDate) => {
      const db = await getDb();
      let candles = db.kline || [];
      if (startDate) candles = candles.filter((c: any) => c.date >= startDate);
      if (endDate) candles = candles.filter((c: any) => c.date <= endDate);
      return { data: candles, error: null };
    },
    getMetricsByUuid: async (_uuid, _endDate) => {
      const db = await getDb();
      const metrics: PortfolioKlineMetrics = db.metrics || {
        startDate: '',
        endDate: '',
        days: 0,
        calculationStartDate: '',
        calculationEndDate: '',
        calculationDays: 0,
        observations: 0,
        tradingDays: 0,
        riskFreeRate: 0,
        totalReturn: 0,
        annualizedReturn: 0,
        annualizedMethod: 'daily',
        annualizedCalculationStartDate: '',
        annualizedCalculationEndDate: '',
        annualizedCalculationDays: 0,
        annualizedTotalReturn: 0,
        annualizedVolatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        calmarRatio: 0,
        bestDayReturn: 0,
        worstDayReturn: 0,
        positiveDayRatio: 0
      };
      return { data: metrics, error: null };
    }
  },

  stockConfigService: {
    ...mockServices.stockConfigService,
    getStockConfigs: async () => {
      const db = await getDb();
      const configs = (db.holdings || []).map((h: any) => ({
        stock_code: h.stock_code,
        category: 'Stock',
        tags: [] as string[]
      }));
      return { data: configs, error: null };
    }
  },

  analysisService: {
    ...mockServices.analysisService,
    getPortfolioAnalysis: async (_userId, _accountId) => {
      const db = await getDb();
      return { data: db.portfolio_analysis || null, error: null };
    },
    getPortfolioAnalysisByUuid: async (_uuid) => {
      const db = await getDb();
      return { data: db.portfolio_analysis || null, error: null };
    },
    refreshPortfolioAnalysis: async (_userId, _accountId) => {
      const db = await getDb();
      return { data: db.portfolio_analysis || null, error: null };
    },
    refreshPortfolioAnalysisByUuid: async (_uuid) => {
      const db = await getDb();
      return { data: db.portfolio_analysis || null, error: null };
    }
  },

  operationService: {
    getOperations: async (_startDate, _endDate) => {
      const db = await getDb();
      return { data: db.operations || [], error: null };
    }
  },

  currencyService: {
    getCurrency: async () => {
      return { data: 'CNY', error: null };
    },
    setCurrency: async (_currency) => {
      return { data: undefined, error: null };
    }
  }
};
