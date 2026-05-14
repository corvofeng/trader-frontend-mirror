import type {
  AuthService,
  TradeService,
  StockService,
  PortfolioService,
  CurrencyService,
  Operation,
  OperationService,
  StockConfigService,
  StockConfig,
  UploadService,
  UploadResponse,
  AnalysisService,
  AccountService,
  ServiceResponse,
  User,
  AccountPromptService,
  AccountPrompt,
  Notice,
  NoticeActionResponse,
  NoticeService,
  StockOrder,
  AdminAccountStatusItem
} from '../types';
import type { Trade } from '../types';

let cachedUser: User | null = null;
let pendingUserPromise: Promise<ServiceResponse<{ user: User | null }>> | null = null;

type CacheEntry<T> = { data: T; expiresAt: number };

const getCached = <T>(map: Map<string, CacheEntry<T>>, key: string) => {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.data;
};

const setCached = <T>(map: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number) => {
  map.set(key, { data, expiresAt: Date.now() + ttlMs });
};

export const authService: AuthService = {
  getUser: async () => {
    if (cachedUser !== null) {
      return { data: { user: cachedUser }, error: null };
    }
    if (pendingUserPromise) {
      const result = await pendingUserPromise;
      return result;
    }
    pendingUserPromise = (async () => {
      const checker = await (await fetch('/api/check')).json();
      if (checker['status']) {
        const user = await (await fetch('/api/user')).json() as User;
        cachedUser = user;
        return { data: { user }, error: null };
      }
      return { data: { user: null }, error: null };
    })();
    try {
      const res = await pendingUserPromise;
      return res;
    } finally {
      pendingUserPromise = null;
    }
  },

  signIn: async () => {
    window.location.href = '/api/user';
    return { data: { user: cachedUser as User }, error: null };
  },

  signOut: async () => {
    cachedUser = null;
    pendingUserPromise = null;
    window.location.href = '/api/logout';
    return { data: null, error: null };
  }
};

const getCurrentAccountAlias = () => {
  try {
    const fromLocalStorage =
      (typeof localStorage !== 'undefined' && localStorage.getItem('journalSelectedAccountAlias')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('journalAccountId')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('selectedAccountAlias'));
    return fromLocalStorage || undefined;
  } catch {
    return undefined;
  }
};

const actionsCache = new Map<string, CacheEntry<Trade[]>>();
const actionsPending = new Map<string, Promise<Trade[]>>();

export const tradeService: TradeService = {
  getTrades: async (userId: string, stock_code?: string, status?: string, accountAlias?: string) => {
    const params = new URLSearchParams();

    const targetAccount = accountAlias || getCurrentAccountAlias() || '';
    if (targetAccount) {
      params.set('account_alias', targetAccount);
    }

    const cacheKey = targetAccount || '__all__';
    const cached = getCached(actionsCache, cacheKey);
    const baseTrades = cached
      ? cached
      : await (async () => {
          const pending = actionsPending.get(cacheKey);
          if (pending) return pending;

          const promise = (async () => {
            const url = params.toString() ? `/api/actions?${params.toString()}` : '/api/actions';
            const res = await fetch(url);
            const json = await res.json();
            const list = Array.isArray(json) ? (json as Trade[]) : [];
            setCached(actionsCache, cacheKey, list, 15_000);
            return list;
          })();

          actionsPending.set(cacheKey, promise);
          try {
            return await promise;
          } finally {
            actionsPending.delete(cacheKey);
          }
        })();

    let filteredTrades = baseTrades;
    if (stock_code) {
      filteredTrades = filteredTrades.filter((trade: Trade) => trade.stock_code === stock_code);
    }
    if (status && status !== 'all') {
      filteredTrades = filteredTrades.filter((trade: Trade) => trade.status === status);
    }

    return { data: filteredTrades, error: null };
  },

  createTrade: async (trade: Omit<Trade, 'id' | 'created_at' | 'updated_at'>) => {
    const accountAlias = getCurrentAccountAlias();
    const payload = {
      ...trade,
      account_alias: trade.account_alias || accountAlias
    };

    const response = await fetch('/api/actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return { data: null, error: new Error('Failed to create trade') };
    }

    actionsCache.clear();
    actionsPending.clear();

    const newTrade = await response.json();
    return { data: newTrade, error: null };
  },

  updateTrade: async (trade: Trade) => {
    const accountAlias = getCurrentAccountAlias();
    const payload = {
      ...trade,
      account_alias: trade.account_alias || accountAlias
    };

    const response = await fetch('/api/actions', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return { data: null, error: new Error('Failed to update trade') };
    }

    actionsCache.clear();
    actionsPending.clear();

    return { data: trade, error: null };
  }
};

export const stockService: StockService = {
  getStockName: (stockCode: string) => {
    throw new Error(`Not implemented: ${stockCode}`);
  },
  
  getStocks: async () => {
    try {
      const response = await fetch(`/api/stocks`);
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stocks:', error);
      return { data: null, error: error as Error };
    }
  },
  
  searchStocks: async (query: string) => {
    try {
      const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('Failed to search stocks');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error searching stocks:', error);
      return { data: null, error: error as Error };
    }
  },

  getStockData: async (symbol: string) => {
    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/history`);
      if (!response.ok) {
        throw new Error('Failed to fetch stock data');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stock data:', error);
      return { data: null, error: error as Error };
    }
  },

  getStockHistoryRaw: async (symbol: string, options?: { signal?: AbortSignal }) => {
    const extractList = (value: unknown): Record<string, unknown>[] => {
      if (Array.isArray(value)) {
        return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v));
      }
      if (!value || typeof value !== 'object') return [];
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.data)) return extractList(obj.data);
      return [];
    };

    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/history`, {
        signal: options?.signal,
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return { data: extractList(data), error: null };
    } catch (error) {
      console.error('Error fetching stock history:', error);
      return { data: null, error: error as Error };
    }
  },

  getStockTicksRaw: async (symbol: string, options?: { signal?: AbortSignal }) => {
    const extractList = (value: unknown): Record<string, unknown>[] => {
      if (Array.isArray(value)) {
        return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v));
      }
      if (!value || typeof value !== 'object') return [];
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.data)) return extractList(obj.data);
      return [];
    };

    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/ticks`, {
        signal: options?.signal,
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return { data: extractList(data), error: null };
    } catch (error) {
      console.error('Error fetching stock ticks:', error);
      return { data: null, error: error as Error };
    }
  },

  getStockGtimgRaw: async (symbol: string, options?: { signal?: AbortSignal }) => {
    const extractList = (value: unknown): Record<string, unknown>[] => {
      if (Array.isArray(value)) {
        return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v));
      }
      if (!value || typeof value !== 'object') return [];
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.data)) return extractList(obj.data);
      return [obj];
    };

    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/gtimg`, {
        signal: options?.signal,
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return { data: extractList(data), error: null };
    } catch (error) {
      console.error('Error fetching gtimg data:', error);
      return { data: null, error: error as Error };
    }
  },

  getStockYfinanceRaw: async (symbol: string, options?: { signal?: AbortSignal }) => {
    const extractList = (value: unknown): Record<string, unknown>[] => {
      if (Array.isArray(value)) {
        return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v));
      }
      if (!value || typeof value !== 'object') return [];
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.data)) return extractList(obj.data);
      return [obj];
    };

    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/yfinance`, {
        signal: options?.signal,
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return { data: extractList(data), error: null };
    } catch (error) {
      console.error('Error fetching yfinance data:', error);
      return { data: null, error: error as Error };
    }
  },

  getCurrentPrice: async (symbol: string) => {
    try {
      const response = await fetch(`/api/stocks/${symbol}/price`);
      if (!response.ok) {
        throw new Error('Failed to fetch current price');
      }
      const data = await response.json();
      // Handle both new API format (last_price) and legacy format (latest_value.lastPrice)
      const price = data.last_price !== undefined 
        ? data.last_price 
        : (data.latest_value?.lastPrice);

      return { 
        data: {
          stock_code: symbol,
          stock_name: data.stock_name || symbol,
          price: price
        }, 
        error: null 
      };
    } catch (error) {
      console.error('Error fetching current price:', error);
      return { data: null, error: error as Error };
    }
  },

  getTodayOrders: async (accountAlias: string) => {
    const extractOrders = (value: unknown): StockOrder[] => {
      if (Array.isArray(value)) return value as StockOrder[];
      if (!value || typeof value !== 'object') return [];
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.orders)) return obj.orders as StockOrder[];
      if ('data' in obj) return extractOrders(obj.data);
      return [];
    };

    const cacheKey = accountAlias;
    const cached = getCached(todayOrdersCache, cacheKey);
    if (cached) return { data: cached, error: null };

    const pending = todayOrdersPending.get(cacheKey);
    if (pending) {
      try {
        const data = await pending;
        return { data, error: null };
      } catch (error) {
        return { data: null, error: error as Error };
      }
    }

    const promise = (async () => {
      const response = await fetch(
        `/api/stocks/orders/${encodeURIComponent(accountAlias)}?only_today=true&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `请求失败 (${response.status})`);
      }
      const raw = await response.json();
      const data = extractOrders(raw);
      setCached(todayOrdersCache, cacheKey, data, 5_000);
      return data;
    })();

    todayOrdersPending.set(cacheKey, promise);
    try {
      const data = await promise;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching today orders:', error);
      return { data: null, error: error as Error };
    } finally {
      todayOrdersPending.delete(cacheKey);
    }
  },
  getTradingCalendar: async (year: number) => {
    try {
      const response = await fetch(`/api/trading-calendar?year=${encodeURIComponent(String(year))}`);
      if (!response.ok) {
        throw new Error('Failed to load trading calendar');
      }
      const raw = await response.json();
      let tradingDates: string[] = [];
      if (Array.isArray(raw)) {
        const stringDates = raw.filter((v): v is string => typeof v === 'string');
        if (stringDates.length > 0) {
          tradingDates = stringDates;
        } else {
          const objects = raw.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
          tradingDates = objects
            .filter(d => {
              const type = d.type;
              const isTrading = d.is_trading_day ?? d.trading ?? d.is_open;
              return isTrading === true || type === 'TRADING';
            })
            .map(d => (d.date ?? d.day ?? d.trading_date))
            .filter((v): v is string => typeof v === 'string');
        }
      } else if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (Array.isArray(obj.trading_days)) {
          tradingDates = obj.trading_days.filter((v): v is string => typeof v === 'string');
        } else {
          const list = Array.isArray(obj.data)
            ? obj.data
            : Array.isArray(obj.days)
              ? obj.days
              : [];
          const objects = list.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
          tradingDates = objects
            .filter(d => {
              const type = d.type;
              const isTrading = d.is_trading_day ?? d.trading ?? d.is_open;
              return isTrading === true || type === 'TRADING';
            })
            .map(d => (d.date ?? d.day ?? d.trading_date))
            .filter((v): v is string => typeof v === 'string');
        }
      }
      return { data: tradingDates, error: null };
    } catch (error) {
      console.error('Error fetching trading calendar:', error);
      return { data: null, error: error as Error };
    }
  }
};

const todayOrdersCache = new Map<string, CacheEntry<StockOrder[]>>();
const todayOrdersPending = new Map<string, Promise<StockOrder[]>>();

const stockConfigsCache = new Map<string, CacheEntry<StockConfig[]>>();
let stockConfigsPending: Promise<StockConfig[]> | null = null;

export const stockConfigService: StockConfigService = {
  getStockConfigs: async () => {
    try {
      const cached = getCached(stockConfigsCache, 'all');
      if (cached) return { data: cached, error: null };

      if (stockConfigsPending) {
        const data = await stockConfigsPending;
        return { data, error: null };
      }

      stockConfigsPending = (async () => {
        const response = await fetch('/api/stock-configs');
        if (!response.ok) {
          throw new Error('Failed to fetch stock configs');
        }
        const data = (await response.json()) as StockConfig[];
        setCached(stockConfigsCache, 'all', data, 5 * 60_000);
        return data;
      })();

      const data = await stockConfigsPending;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stock configs:', error);
      return { data: null, error: error as Error };
    } finally {
      stockConfigsPending = null;
    }
  },

  updateStockConfig: async (config: StockConfig) => {
    try {
      const response = await fetch('/api/stock-configs', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update stock config');
      }
      
      const data = await response.json();
      stockConfigsCache.clear();
      return { data, error: null };
    } catch (error) {
      console.error('Error updating stock config:', error);
      return { data: null, error: error as Error };
    }
  },

  deleteStockConfig: async (stockCode: string) => {
    try {
      const response = await fetch(`/api/stock-configs/${stockCode}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete stock config');
      }
      
      stockConfigsCache.clear();
      return { data: null, error: null };
    } catch (error) {
      console.error('Error deleting stock config:', error);
      return { data: null, error: error as Error };
    }
  }
};

const trendCache = new Map<string, CacheEntry<unknown>>();
const trendPending = new Map<string, Promise<unknown>>();

export const portfolioService: PortfolioService = {
  getHoldings: async (userId: string, accountId?: string) => {
    try {
      const url = accountId
        ? `/api/portfolio/${accountId}`
        : `/api/portfolio/${userId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio data');
      }
      const data = await response.json();
      // Adapt to new API response structure which returns an object with positions
      // or fall back to array if legacy API is still in use
      if (Array.isArray(data)) {
        return { data, error: null, isSnapshot: false };
      } else {
        return { data: data.positions || [], error: null, isSnapshot: data.is_snapshot || false };
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      return { data: null, error: error as Error };
    }
  },

  getRecentTrades: async (userId: string, startDate: string, endDate: string, accountId?: string, stockCode?: string) => {
    try {
      if (!accountId) return { data: [], error: null };

      let url = `/api/portfolio/${accountId}/recent-trades?startDate=${startDate}&endDate=${endDate}&userId=${userId}`;
      if (stockCode) {
        url += `&stockCode=${encodeURIComponent(stockCode)}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch recent trades');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching recent trades:', error);
      return { data: null, error: error as Error };
    }
  },

  getTrendData: async (userId: string, startDate: string, endDate: string, accountId?: string) => {
    try {
      // 使用默认账户ID或用户ID作为路径参数
      if (!accountId) return { data: null, error: new Error('Account ID is required') };

      const cacheKey = `${accountId}|${startDate}|${endDate}`;
      const cached = getCached(trendCache, cacheKey);
      if (cached) return { data: cached as any, error: null };

      const pending = trendPending.get(cacheKey);
      if (pending) {
        const data = await pending;
        return { data: data as any, error: null };
      }

      const promise = (async () => {
        const url = `/api/portfolio/${accountId}/trend?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&userId=${userId}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error('Failed to fetch trend data');
        }

        const data = await response.json();
        setCached(trendCache, cacheKey, data, 30_000);
        return data;
      })();

      trendPending.set(cacheKey, promise);
      try {
        const data = await promise;
        return { data: data as any, error: null };
      } finally {
        trendPending.delete(cacheKey);
      }
    } catch (error) {
      console.error('Error fetching trend data:', error);
      return { data: null, error: error as Error };
    }
  },

  getAccounts: async (userId: string) => {
    try {
      const response = await fetch(`/api/portfolio/${userId}/accounts`);
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching accounts:', error);
      return { data: null, error: error as Error };
    }
  },

  // UUID-based methods for shared portfolios
  getHoldingsByUuid: async (uuid: string) => {
    try {
      const response = await fetch(`/api/portfolio/shared/${uuid}`);
      if (!response.ok) {
        throw new Error('Failed to fetch shared portfolio data');
      }
      const data = await response.json();
      // Adapt to new API response structure which returns an object with positions
      // or fall back to array if legacy API is still in use
      if (Array.isArray(data)) {
        return { data, error: null, isSnapshot: false };
      } else {
        return { data: data.positions || [], error: null, isSnapshot: data.is_snapshot || false };
      }
    } catch (error) {
      console.error('Error fetching shared portfolio:', error);
      return { data: null, error: error as Error };
    }
  },

  getRecentTradesByUuid: async (uuid: string, startDate: string, endDate: string) => {
    try {
      const response = await fetch(
        `/api/portfolio/shared/${uuid}/recent-trades?startDate=${startDate}&endDate=${endDate}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch shared portfolio trades');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching shared portfolio trades:', error);
      return { data: null, error: error as Error };
    }
  },

  getTrendDataByUuid: async (uuid: string, startDate: string, endDate: string) => {
    try {
      const cacheKey = `uuid:${uuid}|${startDate}|${endDate}`;
      const cached = getCached(trendCache, cacheKey);
      if (cached) return { data: cached as any, error: null };

      const pending = trendPending.get(cacheKey);
      if (pending) {
        const data = await pending;
        return { data: data as any, error: null };
      }

      const promise = (async () => {
        const response = await fetch(
          `/api/portfolio/shared/${uuid}/trend?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch shared portfolio trend data');
        }

        const data = await response.json();
        setCached(trendCache, cacheKey, data, 30_000);
        return data;
      })();

      trendPending.set(cacheKey, promise);
      try {
        const data = await promise;
        return { data: data as any, error: null };
      } finally {
        trendPending.delete(cacheKey);
      }
    } catch (error) {
      console.error('Error fetching shared portfolio trend data:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const currencyService: CurrencyService = {
  getCurrency: async () => {
    try {
      const response = await fetch('/api/settings/currency');
      if (!response.ok) {
        throw new Error('Failed to fetch currency');
      }
      const data = await response.json();
      return { data: data.currency, error: null };
    } catch (error) {
      console.error('Error fetching currency:', error);
      return { data: null, error: error as Error };
    }
  },
  setCurrency: async (currency: string) => {
    try {
      const response = await fetch('/api/settings/currency', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currency })
      });
      if (!response.ok) {
        throw new Error('Failed to update currency');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error updating currency:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const operationService: OperationService = {
  getOperations: async (startDate: string, endDate: string) => {
    try {
      const accountAlias = getCurrentAccountAlias();
      if (!accountAlias) return { data: [], error: null };

      const cacheKey = `${accountAlias}|${startDate}|${endDate}`;
      const cached = getCached(operationsCache, cacheKey);
      if (cached) return { data: cached, error: null };

      const pending = operationsPending.get(cacheKey);
      if (pending) {
        const data = await pending;
        return { data, error: null };
      }

      const url = `/api/portfolio/${encodeURIComponent(accountAlias)}/operations?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

      const promise = (async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch operations');
        }
        const data = await response.json();
        setCached(operationsCache, cacheKey, data, 30_000);
        return data as Operation[];
      })();

      operationsPending.set(cacheKey, promise);
      try {
        const data = await promise;
        return { data, error: null };
      } finally {
        operationsPending.delete(cacheKey);
      }
    } catch (error) {
      console.error('Error fetching operations:', error);
      return { data: null, error: error as Error };
    }
  }
};

const operationsCache = new Map<string, CacheEntry<Operation[]>>();
const operationsPending = new Map<string, Promise<Operation[]>>();

const listNotices = async (): Promise<ServiceResponse<Notice[]>> => {
  const normalizeNotice = (raw: unknown): Notice | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const uuid =
      (typeof r.notice_uuid === 'string' && r.notice_uuid) ||
      (typeof r.trader_alert_uuid === 'string' && r.trader_alert_uuid) ||
      '';
    if (!uuid) return null;

    const extraData =
      r.extra_data && typeof r.extra_data === 'object' && !Array.isArray(r.extra_data)
        ? (r.extra_data as Record<string, unknown>)
        : undefined;

    return {
      notice_uuid: uuid,
      title: typeof r.title === 'string' ? r.title : '',
      content: typeof r.content === 'string' ? r.content : '',
      account_id: typeof r.account_id === 'string' ? r.account_id : r.account_id === null ? null : null,
      is_acked: typeof r.is_acked === 'boolean' ? r.is_acked : undefined,
      acked_at: typeof r.acked_at === 'string' ? r.acked_at : r.acked_at === null ? null : null,
      acker: typeof r.acker === 'string' ? r.acker : r.acker === null ? null : null,
      is_resolved: typeof r.is_resolved === 'boolean' ? r.is_resolved : false,
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
      resolved_at: typeof r.resolved_at === 'string' ? r.resolved_at : r.resolved_at === null ? null : null,
      resolver: typeof r.resolver === 'string' ? r.resolver : r.resolver === null ? null : null,
      extra_data: extraData
    };
  };

  const normalizeNoticeListResponse = (payload: unknown): Notice[] => {
    const unwrap = (v: unknown): unknown => {
      if (!v || typeof v !== 'object') return v;
      const r = v as Record<string, unknown>;
      if (Array.isArray(r.data)) return r.data;
      if (r.data && typeof r.data === 'object') {
        const nested = r.data as Record<string, unknown>;
        if (Array.isArray(nested.data)) return nested.data;
        if (Array.isArray(nested.items)) return nested.items;
        if (Array.isArray(nested.list)) return nested.list;
      }
      if (Array.isArray(r.items)) return r.items;
      if (Array.isArray(r.list)) return r.list;
      return v;
    };

    const unwrapped = unwrap(payload);
    if (!Array.isArray(unwrapped)) return [];
    return unwrapped.map(normalizeNotice).filter((v): v is Notice => v !== null);
  };

  const fetchNotices = async (url: string): Promise<Notice[]> => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = (await response.json().catch(() => null)) as unknown;
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      const r = json as Record<string, unknown>;
      if (r.success === false) {
        throw new Error('Notices response not successful');
      }
    }
    return normalizeNoticeListResponse(json);
  };

  try {
    const data = await fetchNotices('/api/trader-alerts');
    return { data, error: null };
  } catch (error) {
    try {
      const data = await fetchNotices('/api/notices');
      return { data, error: null };
    } catch (fallbackError) {
      console.error('Error fetching notices:', error);
      return { data: null, error: fallbackError as Error };
    }
  }
};

const postNoticeAction = async (
  noticeUuid: string,
  action: 'ack' | 'resolve',
  extraData?: Record<string, unknown>
): Promise<ServiceResponse<Notice | null>> => {
  const normalizeNotice = (raw: unknown): Notice | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const uuid =
      (typeof r.notice_uuid === 'string' && r.notice_uuid) ||
      (typeof r.trader_alert_uuid === 'string' && r.trader_alert_uuid) ||
      '';
    if (!uuid) return null;

    const extra =
      r.extra_data && typeof r.extra_data === 'object' && !Array.isArray(r.extra_data)
        ? (r.extra_data as Record<string, unknown>)
        : undefined;

    return {
      notice_uuid: uuid,
      title: typeof r.title === 'string' ? r.title : '',
      content: typeof r.content === 'string' ? r.content : '',
      account_id: typeof r.account_id === 'string' ? r.account_id : r.account_id === null ? null : null,
      is_acked: typeof r.is_acked === 'boolean' ? r.is_acked : undefined,
      acked_at: typeof r.acked_at === 'string' ? r.acked_at : r.acked_at === null ? null : null,
      acker: typeof r.acker === 'string' ? r.acker : r.acker === null ? null : null,
      is_resolved: typeof r.is_resolved === 'boolean' ? r.is_resolved : false,
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
      resolved_at: typeof r.resolved_at === 'string' ? r.resolved_at : r.resolved_at === null ? null : null,
      resolver: typeof r.resolver === 'string' ? r.resolver : r.resolver === null ? null : null,
      extra_data: extra
    };
  };

  try {
    const urls = [
      `/api/trader-alerts/${encodeURIComponent(noticeUuid)}/${action}`,
      `/api/notices/${encodeURIComponent(noticeUuid)}/${action}`
    ];

    let lastError: Error | null = null;

    for (const url of urls) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ extra_data: extraData ?? {} })
      });

      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);

      if (!response.ok) {
        if (response.status === 404 || response.status === 405) {
          lastError = new Error(response.statusText || `HTTP ${response.status}`);
          continue;
        }
        const messageFromBody =
          body && typeof body === 'object'
            ? String((body as Record<string, unknown>).message || (body as Record<string, unknown>).error || response.statusText)
            : '';
        throw new Error(messageFromBody || response.statusText || `Failed to ${action} notice`);
      }

      if (body && typeof body === 'object') {
        const json = body as NoticeActionResponse;
        if (json?.success === false) {
          throw new Error(json.message || `Notice ${action} not successful`);
        }
        const normalized = normalizeNotice(json.data) ?? null;
        return { data: normalized, error: null };
      }

      return { data: null, error: null };
    }

    throw lastError ?? new Error(`Failed to ${action} notice`);
  } catch (error) {
    console.error(`Error ${action} notice:`, error);
    return { data: null, error: error as Error };
  }
};

export const noticeService: NoticeService = {
  listNotices,
  getNotice: async (noticeUuid: string) => {
    const { data, error } = await listNotices();
    if (error) return { data: null, error };
    const notice = (data || []).find(n => n.notice_uuid === noticeUuid) || null;
    if (!notice) {
      return { data: null, error: new Error('Notice not found') };
    }
    return { data: notice, error: null };
  },
  ackNotice: async (noticeUuid: string, extraData?: Record<string, unknown>) => {
    return await postNoticeAction(noticeUuid, 'ack', extraData);
  },
  resolveNotice: async (noticeUuid: string, extraData?: Record<string, unknown>) => {
    return await postNoticeAction(noticeUuid, 'resolve', extraData);
  }
};

export const uploadService: UploadService = {
  uploadPortfolioFile: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/portfolio/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    return result;
  }
};

export const analysisService: AnalysisService = {
  getStockAnalysis: async (stockCode: string) => {
    try {
      const response = await fetch(`/api/analysis/stock/${stockCode}`);
      if (!response.ok) {
        throw new Error('Failed to fetch stock analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stock analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  getPortfolioAnalysis: async (userId: string, accountId?: string) => {
    try {
      const defaultAccountId = 'default-account';
      const url = `/api/analysis/portfolio/${accountId || defaultAccountId}?userId=${userId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  getPortfolioAnalysisByUuid: async (uuid: string) => {
    try {
      const response = await fetch(`/api/analysis/portfolio/shared/${uuid}`);
      if (!response.ok) {
        throw new Error('Failed to fetch shared portfolio analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching shared portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  },
  refreshStockAnalysis: async (stockCode: string) => {
    try {
      const response = await fetch(`/api/analysis/stock/${stockCode}/refresh`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to refresh stock analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error refreshing stock analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  refreshPortfolioAnalysis: async (userId: string, accountId?: string) => {
    try {
      const defaultAccountId = 'default-account';
      const url = `/api/analysis/portfolio/${accountId || defaultAccountId}/refresh?userId=${userId}`;
      const response = await fetch(url, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to refresh portfolio analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error refreshing portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  refreshPortfolioAnalysisByUuid: async (uuid: string) => {
    try {
      const response = await fetch(`/api/analysis/portfolio/shared/${uuid}/refresh`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to refresh shared portfolio analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error refreshing shared portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const accountService: AccountService = {
  getAccounts: async (userId: string) => {
    try {
      const response = await fetch(`/api/accounts?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching accounts:', error);
      return { data: null, error: error as Error };
    }
  },
  getOptionsAccounts: async (userId: string) => {
    try {
      const response = await fetch(`/api/options/accounts?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch options accounts');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching options accounts:', error);
      return { data: null, error: error as Error };
    }
  },

  createAccount: async (account) => {
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(account)
      });
      if (!response.ok) {
        throw new Error('Failed to create account');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error creating account:', error);
      return { data: null, error: error as Error };
    }
  },

  updateAccount: async (account) => {
    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(account)
      });
      if (!response.ok) {
        throw new Error('Failed to update account');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error updating account:', error);
      return { data: null, error: error as Error };
    }
  },

  deleteAccount: async (accountId) => {
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete account');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error deleting account:', error);
      return { data: null, error: error as Error };
    }
  },

  setDefaultAccount: async (userId, accountId) => {
    try {
      const response = await fetch(`/api/accounts/${accountId}/set-default`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      });
      if (!response.ok) {
        throw new Error('Failed to set default account');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error setting default account:', error);
      return { data: null, error: error as Error };
    }
  },
  getAdminAccountsStatus: async (options?: { signal?: AbortSignal }) => {
    try {
      const response = await fetch('/api/admin/accounts/status', { signal: options?.signal });
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);

      if (!response.ok) {
        const messageFromJson =
          body && typeof body === 'object'
            ? String((body as Record<string, unknown>).message || (body as Record<string, unknown>).error || response.statusText)
            : '';
        const message = typeof body === 'string' ? body : messageFromJson;
        throw new Error(message || `HTTP ${response.status}`);
      }

      const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
      const rawList = Array.isArray(record?.data) ? record?.data : [];
      const normalized: AdminAccountStatusItem[] = rawList
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
        .map((v) => ({
          account_id_alias: String(v.account_id_alias ?? ''),
          account_type: String(v.account_type ?? ''),
          alias: String(v.alias ?? ''),
          last_check: String(v.last_check ?? ''),
          last_snapshot_at: String(v.last_snapshot_at ?? ''),
          message: String(v.message ?? ''),
          status: String(v.status ?? ''),
        }))
        .filter(v => v.account_id_alias || v.alias);

      return { data: normalized, error: null };
    } catch (error) {
      console.error('Error fetching admin accounts status:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const accountPromptService: AccountPromptService = {
  listPrompts: async (accountAlias, promptType) => {
    try {
      const params = new URLSearchParams({ account_alias: accountAlias });
      if (promptType) {
        params.set('prompt_type', promptType);
      }
      const response = await fetch(`/api/llm/prompts?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch prompts');
      }
      const json = await response.json();
      const prompts: AccountPrompt[] = json.prompts || [];
      return { data: prompts, error: null };
    } catch (error) {
      console.error('Error fetching prompts:', error);
      return { data: null, error: error as Error };
    }
  },
  getPrompt: async (id) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error fetching prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  createPrompt: async (payload) => {
    try {
      const response = await fetch('/api/llm/prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Failed to create prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error creating prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  updatePrompt: async (id, payload) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Failed to update prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error updating prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  deletePrompt: async (id) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete prompt');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error deleting prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  activatePrompt: async (id) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}/activate`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to activate prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error activating prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  deactivatePrompt: async (id) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}/deactivate`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to deactivate prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error deactivating prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  getActivePrompt: async (accountAlias, promptType) => {
    try {
      const params = new URLSearchParams({
        account_alias: accountAlias,
        prompt_type: promptType
      });
      const response = await fetch(`/api/llm/prompts/active?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch active prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error fetching active prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  previewPrompt: async (accountAlias, promptType) => {
    try {
      const params = new URLSearchParams({
        account_alias: accountAlias,
        prompt_type: promptType
      });
      const response = await fetch(`/api/llm/prompts/preview?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to preview prompt');
      }
      const json = await response.json();
      const preview = {
        has_custom_prompt: !!json.has_custom_prompt,
        prompt: json.prompt as string
      };
      return { data: preview, error: null };
    } catch (error) {
      console.error('Error previewing prompt:', error);
      return { data: null, error: error as Error };
    }
  }
};
