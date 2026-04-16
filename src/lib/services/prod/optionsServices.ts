import type {
  OptionsData,
  OptionOrder,
  OptionPriceWebSocketClient,
  OptionPriceWebSocketHandlers,
  OptionsService,
  OptionsPosition,
  OptionsPortfolioData,
  OptionsStrategy,
  OptionWhitelist,
  SequentialTradeTask,
  ServiceResponse
} from '../types';
import type { CustomOptionsStrategy } from '../types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

const safeParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const adaptToPortfolioData = (data: unknown): OptionsPortfolioData => {
  const record = asRecord(data);
  if (!record) {
    return {
      strategies: [],
      singleLegPositions: [],
      complexStrategies: [],
      expiryBuckets: [],
      totalValue: 0,
      totalCost: 0,
      totalProfitLoss: 0,
      totalProfitLossPercentage: 0,
      expiryGroups: [],
    };
  }

  const expiryGroupsRaw = record.expiryGroups;
  if (Array.isArray(expiryGroupsRaw)) {
    return record as unknown as OptionsPortfolioData;
  }

  // Case 2: Data has expiryBuckets (New backend format)
  const expiryBucketsRaw = record.expiryBuckets;
  if (Array.isArray(expiryBucketsRaw)) {
    let totalValue = toNumber(record.totalValue, 0);
    let totalCost = toNumber(record.totalCost, 0);
    let totalProfitLoss = toNumber(record.totalProfitLoss, 0);
    const singleLegPositions: OptionsPosition[] = [];
    const complexStrategies: OptionsStrategy[] = [];

    // If totals are missing from root, calculate them from buckets
    const shouldCalcTotals =
      record.totalValue === undefined || record.totalCost === undefined || record.totalProfitLoss === undefined;

    expiryBucketsRaw.forEach((bucketValue) => {
      const bucket = asRecord(bucketValue);
      const singlesRaw = bucket && Array.isArray(bucket.single) ? (bucket.single as unknown[]) : [];
      const complexesRaw = bucket && Array.isArray(bucket.complex) ? (bucket.complex as unknown[]) : [];

      singleLegPositions.push(...(singlesRaw as OptionsPosition[]));
      complexStrategies.push(...(complexesRaw as OptionsStrategy[]));

      if (shouldCalcTotals) {
        singlesRaw.forEach((pValue) => {
          const p = asRecord(pValue);
          if (!p) return;
          const val = toNumber(p.currentValue ?? p['current_value'], 0);
          const pl = toNumber(p.profitLoss ?? p['profit_loss'], 0);
          const premium = toNumber(p.premium ?? p['cost_price'], 0);
          const qty = toNumber(p.quantity, 0);
          const cost = premium * Math.abs(qty) * 100;

          totalValue += val;
          totalProfitLoss += pl;
          totalCost += cost;
        });

        complexesRaw.forEach((cValue) => {
          const c = asRecord(cValue);
          if (!c) return;
          totalValue += toNumber(c.currentValue, 0);
          totalCost += toNumber(c.totalCost, 0);
          totalProfitLoss += toNumber(c.profitLoss, 0);
        });
      }
    });

    const totalProfitLossPercentage = totalCost !== 0 ? (totalProfitLoss / totalCost) * 100 : 0;

    return {
        strategies: [], 
        singleLegPositions,
        complexStrategies,
        expiryBuckets: expiryBucketsRaw as unknown as OptionsPortfolioData['expiryBuckets'],
        totalValue,
        totalCost,
        totalProfitLoss,
        totalProfitLossPercentage,
        expiryGroups: [], // Component can fallback to buckets if this is empty
        is_snapshot: record.is_snapshot as OptionsPortfolioData['is_snapshot'],
        balance: record.balance as OptionsPortfolioData['balance'],
        real_used_margin: record.real_used_margin as OptionsPortfolioData['real_used_margin'],
        available: record.available as OptionsPortfolioData['available'],
        position_profit: (record.position_profit as OptionsPortfolioData['position_profit']) ?? totalProfitLoss,
        customStrategies: (record.customStrategies as CustomOptionsStrategy[]) || [],
        advised_combinations: (record.advised_combinations as OptionsPortfolioData['advised_combinations']) || [],
        subject_positions: (record.subject_positions as OptionsPortfolioData['subject_positions']) || [],
        expiry_analysis: record.expiry_analysis as OptionsPortfolioData['expiry_analysis']
    };
  }

  // Case 3: Flat positions list (Legacy or simplified format)
  const positions: OptionsPosition[] = Array.isArray(record.positions) ? (record.positions as OptionsPosition[]) : [];
  
  let totalValue = 0;
  let totalCost = 0;
  let totalProfitLoss = 0;

  // Grouping map
  const expiryGroupsMap = new Map<string, {
    expiry: string;
    daysToExpiry: number;
    positions: OptionsPosition[];
    totalValue: number;
    totalCost: number;
    profitLoss: number;
  }>();

  positions.forEach(p => {
    const pRecord = p as unknown as Record<string, unknown> & Partial<OptionsPosition>;
    // Handle potential snake_case from backend if necessary
    const val = toNumber(pRecord.currentValue ?? pRecord['current_value'], 0);
    const pl = toNumber(pRecord.profitLoss ?? pRecord['profit_loss'], 0);
    const premium = toNumber(pRecord.premium ?? pRecord['cost_price'], 0);
    const qty = toNumber(pRecord.quantity, 0);
    const cost = premium * Math.abs(qty) * 100;
    
    // Normalize fields on the object if needed (casting to any to avoid strict type checks on readonly)
    if (pRecord.currentValue === undefined) pRecord.currentValue = val;
    if (pRecord.profitLoss === undefined) pRecord.profitLoss = pl;

    totalValue += val;
    totalProfitLoss += pl;
    totalCost += cost;

    // Try to find expiry from various possible field names
    let expiry =
      pRecord.expiry ||
      (pRecord['expiration'] as string | undefined) ||
      (pRecord['expiry_date'] as string | undefined) ||
      (pRecord['expire_date'] as string | undefined) ||
      (pRecord['expiryDate'] as string | undefined);
    
    // If expiry is missing, group under "Unknown"
    if (!expiry) {
        expiry = 'Unknown';
    }

    if (expiry) {
      if (!expiryGroupsMap.has(expiry)) {
          let days = 0;
          if (expiry !== 'Unknown') {
              try {
                  days = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              } catch (error) {
                  console.warn('Invalid expiry date:', expiry, error);
              }
          }
          expiryGroupsMap.set(expiry, {
              expiry,
              daysToExpiry: days,
              positions: [],
              totalValue: 0,
              totalCost: 0,
              profitLoss: 0
          });
      }
      const group = expiryGroupsMap.get(expiry)!;
      // Ensure position has the normalized expiry
      if (!pRecord.expiry) pRecord.expiry = expiry;
      
      group.positions.push(p);
      group.totalValue += val;
      group.profitLoss += pl;
      group.totalCost += cost;
    }
  });

  const expiryGroups = Array.from(expiryGroupsMap.values())
    .sort((a, b) => {
        if (a.expiry === 'Unknown') return 1;
        if (b.expiry === 'Unknown') return -1;
        return a.expiry.localeCompare(b.expiry);
    });

  const expiryBuckets = expiryGroups.map(g => ({
      expiry: g.expiry,
      daysToExpiry: g.daysToExpiry,
      single: g.positions,
      complex: [] as OptionsStrategy[]
  }));

  const totalProfitLossPercentage = totalCost !== 0 ? (totalProfitLoss / totalCost) * 100 : 0;

  return {
    strategies: [],
    singleLegPositions: positions,
    complexStrategies: [],
    expiryBuckets,
    totalValue,
    totalCost,
    totalProfitLoss,
    totalProfitLossPercentage,
    expiryGroups,
    is_snapshot: record.is_snapshot as OptionsPortfolioData['is_snapshot'],
    balance: record.balance as OptionsPortfolioData['balance'],
    real_used_margin: record.real_used_margin as OptionsPortfolioData['real_used_margin'],
    available: record.available as OptionsPortfolioData['available'],
    customStrategies: (record.customStrategies as CustomOptionsStrategy[]) || [],
    advised_combinations: (record.advised_combinations as OptionsPortfolioData['advised_combinations']) || [],
    subject_positions: (record.subject_positions as OptionsPortfolioData['subject_positions']) || []
  };
};

const collectBatchErrors = (data: unknown): string[] => {
  const errors: string[] = [];

  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : null;

  const failed = Array.isArray(record?.failed) ? record?.failed : [];
  for (const item of failed) {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const msg = obj?.error || obj?.message || (item ? JSON.stringify(item) : '');
    if (msg) errors.push(String(msg));
  }

  const dataRecord =
    record?.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
  const results = Array.isArray(record?.results)
    ? record?.results
    : Array.isArray(dataRecord?.results)
      ? dataRecord?.results
      : [];
  for (const item of results) {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!obj) continue;
    const ok = obj.success;
    const errMsg = obj.error || obj.error_msg || obj.message;
    if (ok === false || errMsg) {
      const prefix = obj.strategy_id ? `策略 ${String(obj.strategy_id)}: ` : '';
      const msg = errMsg || JSON.stringify(item);
      errors.push(`${prefix}${String(msg)}`);
    }
  }

  const rootFail =
    record && record.success === false ? (record.error || record.error_msg || record.message) : null;
  if (rootFail) errors.push(String(rootFail));

  return errors;
};

// Cache for options data to prevent redundant requests
const optionsDataCache: Partial<Record<string, Promise<ServiceResponse<OptionsData>>>> = {};

export const optionsService: OptionsService = {
  createOptionPriceWebSocketClient: (handlers?: OptionPriceWebSocketHandlers): OptionPriceWebSocketClient => {
    const getWebSocketUrl = () => {
      const meta = import.meta as unknown as { env?: { VITE_WS_URL?: string } };
      if (meta.env?.VITE_WS_URL) {
        return meta.env.VITE_WS_URL;
      }
      if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/api/ws/option`;
      }
      return 'ws://localhost:8000/api/ws/option';
    };

    let ws: WebSocket | null = null;

    const send = (payload: unknown) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (typeof payload === 'string') {
        ws.send(payload);
      } else {
        ws.send(JSON.stringify(payload));
      }
    };

    const client: OptionPriceWebSocketClient = {
      connect: () => {
        if (ws) {
          ws.close();
          ws = null;
        }
        ws = new WebSocket(getWebSocketUrl());
        ws.onopen = () => handlers?.onOpen?.();
        ws.onclose = () => handlers?.onClose?.();
        ws.onerror = (event) => handlers?.onError?.(event);
        ws.onmessage = (event) => {
          const raw = event.data;
          if (typeof raw === 'string') {
            try {
              handlers?.onMessage?.(JSON.parse(raw));
            } catch {
              handlers?.onMessage?.(raw);
            }
            return;
          }
          handlers?.onMessage?.(raw);
        };
      },
      close: () => {
        if (ws) ws.close();
        ws = null;
      },
      send,
      subscribe: (contractCodes: string[]) => {
        send({ action: 'subscribe', contract_codes: contractCodes });
      },
      queryOrders: (accountId: string) => {
        send({ action: 'query_option_orders', account_id: accountId, only_today: true });
      },
      getReadyState: () => ws?.readyState ?? WebSocket.CLOSED,
    };

    return client;
  },
  getOptionContractDetail: async (contractCode: string) => {
    try {
      const response = await fetch(`https://stock.in.corvo.fun/api/option-contract/detail/${contractCode}`);
      if (!response.ok) {
        throw new Error('Failed to fetch option contract detail');
      }
      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error('Invalid response from option contract API');
      }
      return { data: result.data, error: null };
    } catch (error) {
      console.error('Error fetching option contract detail:', error);
      return { data: null, error: error as Error };
    }
  },
  getOptionsData: async (symbol?: string) => {
    const cacheKey = symbol || '__default__';
    
    if (optionsDataCache[cacheKey]) {
      return optionsDataCache[cacheKey];
    }

    const fetchPromise: Promise<ServiceResponse<OptionsData>> = (async () => {
      try {
        if (symbol) {
          const externalUrl = `https://stock.in.corvo.fun/api/options?symbol=${encodeURIComponent(symbol)}`;
          const externalResp = await fetch(externalUrl);
          if (externalResp.ok) {
            const externalData = await safeParseJson(externalResp);
            const externalRecord = asRecord(externalData);
            const quotesRaw = externalRecord && Array.isArray(externalRecord.quotes) ? externalRecord.quotes : null;
            if (quotesRaw) {
              const surface = Array.isArray(externalRecord?.surface) ? (externalRecord.surface as OptionsData['surface']) : [];
              const opt_undl_code_full =
                typeof externalRecord?.opt_undl_code_full === 'string' ? externalRecord.opt_undl_code_full : undefined;
              const vertical_spread_monthly_prices = Array.isArray(externalRecord?.vertical_spread_monthly_prices)
                ? (externalRecord.vertical_spread_monthly_prices as OptionsData['vertical_spread_monthly_prices'])
                : undefined;
              return {
                data: {
                  quotes: quotesRaw as OptionsData['quotes'],
                  surface,
                  opt_undl_code_full,
                  vertical_spread_monthly_prices,
                },
                error: null
              };
            }
          }
        }
        const queryParam = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
        const fallbackResp = await fetch(`/api/options${queryParam}`);
        if (!fallbackResp.ok) {
          throw new Error('Failed to fetch options data');
        }
        const raw = await safeParseJson(fallbackResp);
        const rec = asRecord(raw);
        if (!rec || !Array.isArray(rec.quotes)) {
          return { data: null, error: new Error('Invalid options data response') };
        }
        return {
          data: {
            quotes: rec.quotes as OptionsData['quotes'],
            surface: Array.isArray(rec.surface) ? (rec.surface as OptionsData['surface']) : [],
            opt_undl_code_full: typeof rec.opt_undl_code_full === 'string' ? rec.opt_undl_code_full : undefined,
            vertical_spread_monthly_prices: Array.isArray(rec.vertical_spread_monthly_prices)
              ? (rec.vertical_spread_monthly_prices as OptionsData['vertical_spread_monthly_prices'])
              : undefined,
          },
          error: null
        };
      } catch (error) {
        console.error('Error fetching options data:', error);
        // Remove from cache on error to allow retries
        delete optionsDataCache[cacheKey];
        return { data: null, error: error as Error };
      }
    })();

    optionsDataCache[cacheKey] = fetchPromise;
    return fetchPromise;
  },

  getAvailableSymbols: async () => {
    try {
      const response = await fetch('/api/options/symbols');
      if (!response.ok) {
        throw new Error('Failed to fetch available symbols');
      }
      const data = await safeParseJson(response);
      const batchErrors = collectBatchErrors(data);
      if (batchErrors.length > 0) return { data: null, error: new Error(batchErrors.join('; ')) };
      const record = asRecord(data);
      const list = Array.isArray(data) ? data : record && Array.isArray(record.data) ? record.data : null;
      if (!list) return { data: null, error: new Error('Invalid symbols response') };
      const symbols = list.filter((s): s is string => typeof s === 'string');
      return { data: symbols, error: null };
    } catch (error) {
      console.error('Error fetching available symbols:', error);
      return { data: null, error: error as Error };
    }
  },

  getOptionsPortfolio: async (userId: string, accountId?: string | null, options?: { symbol?: string }) => {
    try {
      const path = accountId ? `/api/options/portfolio/${accountId}` : `/api/options/portfolio/${userId}`;
      const queryParams = new URLSearchParams();
      if (options?.symbol) queryParams.set('symbol', options.symbol);
      const url = queryParams.toString() ? `${path}?${queryParams}` : path;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch options portfolio');
      }
      const data = await response.json();
      console.log('[[OptionsService Debug]] Raw Backend Response:', data);
      return { data: adaptToPortfolioData(data), error: null };
    } catch (error) {
      console.error('Error fetching options portfolio:', error);
      return { data: null, error: error as Error };
    }
  },

  getPortfolioAnalysis: async (userId: string, accountId?: string | null) => {
    try {
      const path = accountId ? `/api/options/portfolio/${accountId}/analysis` : `/api/options/portfolio/${userId}/analysis`;
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio analysis');
      }
      const data = await response.json();
      console.log('[[OptionsService Debug]] Analysis Response:', data);
      // Backend might return { expiry_analysis: ... } or just the map
      return { data: data.expiry_analysis || data, error: null };
    } catch (error) {
      console.error('Error fetching portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  getPayoffSurface: async (accountId: string, symbol?: string) => {
    try {
      const url = `/api/options/payoff-surface/${accountId}${symbol ? `?symbol=${symbol}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch payoff surface');
      }
      const data = await response.json();
      return { data: data.data, error: null };
    } catch (error) {
      console.error('Error fetching payoff surface:', error);
      return { data: null, error: error as Error };
    }
  },

  getMarginStress: async (accountId: string, symbol?: string) => {
    try {
      const url = `/api/options/margin-stress/${accountId}${symbol ? `?symbol=${symbol}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch margin stress data');
      }
      const data = await response.json();
      return { data: data.data, error: null };
    } catch (error) {
      console.error('Error fetching margin stress data:', error);
      return { data: null, error: error as Error };
    }
  },

  getAvailableStrategies: async () => {
    try {
      const response = await fetch('/api/options/strategies');
      if (!response.ok) {
        throw new Error('Failed to fetch available strategies');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching available strategies:', error);
      return { data: null, error: error as Error };
    }
  },

  saveCustomStrategy: async (
    strategy: CustomOptionsStrategy | Omit<CustomOptionsStrategy, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      const response = await fetch('/api/options/strategies/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(strategy)
      });
      
      if (!response.ok) {
        throw new Error('Failed to save custom strategy');
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error saving custom strategy:', error);
      return { data: null, error: error as Error };
    }
  },

  deleteCustomStrategy: async (strategyId: string) => {
    try {
      const response = await fetch(`/api/options/strategies/custom/${strategyId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete custom strategy');
      }
      
      return { data: null, error: null };
    } catch (error) {
      console.error('Error deleting custom strategy:', error);
      return { data: null, error: error as Error };
    }
  },

  getCustomStrategies: async (userId: string, accountId?: string | null) => {
    try {
      const url = accountId
        ? `/api/options/strategies/custom?accountId=${accountId}`
        : `/api/options/strategies/custom?userId=${userId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch custom strategies');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching custom strategies:', error);
      return { data: null, error: error as Error };
    }
  },

  getRatioSpreadPlans: async (symbol?: string, accountId?: string | null, userId?: string | null) => {
    try {
      const params = new URLSearchParams();
      if (symbol) params.set('symbol', symbol);
      if (userId) params.set('userId', userId);
      const qs = params.toString();
      const base = `/api/options/ratio-spread-plans${accountId ? `/accounts/${encodeURIComponent(accountId)}` : ''}`;
      const response = await fetch(`${base}${qs ? `?${qs}` : ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch ratio spread plans');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching ratio spread plans:', error);
      return { data: null, error: error as Error };
    }
  }
  ,
  closePositions: async (payload, accountId?: string | null, userId?: string | null) => {
    try {
      const base = `/api/options/positions/close${accountId ? `/accounts/${encodeURIComponent(accountId)}` : ''}`;
      const url = userId ? `${base}?userId=${encodeURIComponent(userId)}` : base;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Failed to close positions');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error closing positions:', error);
      return { data: null, error: error as Error };
    }
  },
  updatePositions: async (payload: { updates: Array<{ id?: string; type: 'call' | 'put'; position_type: 'buy' | 'sell'; strike: number; expiry: string; quantity: number; original_quantity?: number; change_quantity?: number; is_covered?: boolean; symbol?: string; option_type?: string; strike_price?: string | number; price?: number }>, positions?: OptionsPosition[], accountId?: string | null, userId?: string | null }) => {
    try {
      const base = `/api/options/positions/sync${payload.accountId ? `/accounts/${encodeURIComponent(payload.accountId)}` : ''}`;
      const url = payload.userId ? `${base}?userId=${encodeURIComponent(payload.userId)}` : base;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await safeParseJson(response);

      if (!response.ok) {
        const batchErrors = collectBatchErrors(data);
        if (batchErrors.length > 0) throw new Error(batchErrors.join('; '));
        const record = asRecord(data);
        throw new Error(String(record?.error || record?.error_msg || record?.message || 'Failed to sync positions'));
      }

      const batchErrors = collectBatchErrors(data);
      if (batchErrors.length > 0) return { data: null, error: new Error(batchErrors.join('; ')) };

      const record = asRecord(data);
      const inner = asRecord(record?.data);
      const updated = toNumber(record?.updated ?? inner?.updated, 0);
      return { data: { updated }, error: null };
    } catch (error) {
      console.error('Error syncing positions:', error);
      return { data: null, error: error as Error };
    }
  },
  executeCombination: async (combo, accountId?: string | null, userId?: string | null) => {
    try {
      const base = `/api/options/combinations/execute${accountId ? `/accounts/${encodeURIComponent(accountId)}` : ''}`;
      const url = userId ? `${base}?userId=${encodeURIComponent(userId)}` : base;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(combo)
      });

      const data = await safeParseJson(response);

      if (!response.ok) {
        const batchErrors = collectBatchErrors(data);
        if (batchErrors.length > 0) throw new Error(batchErrors.join('; '));
        const record = asRecord(data);
        throw new Error(String(record?.error || record?.error_msg || record?.message || 'Failed to execute combination'));
      }

      const batchErrors = collectBatchErrors(data);
      if (batchErrors.length > 0) return { data: null, error: new Error(batchErrors.join('; ')) };

      const record = asRecord(data);
      const inner = asRecord(record?.data);
      const combinationIdRaw =
        inner?.combinationId ??
        inner?.combination_id ??
        record?.combinationId ??
        record?.combination_id;
      const combinationId = typeof combinationIdRaw === 'string' ? combinationIdRaw : undefined;

      const executedRaw = inner?.executed ?? record?.executed;
      const executed = typeof executedRaw === 'boolean' ? executedRaw : true;

      return { data: { executed, combinationId }, error: null };
    } catch (error) {
      console.error('Error executing combination:', error);
      return { data: null, error: error as Error };
    }
  },
  createOptionCombination: async (combo, accountId?: string | null, userId?: string | null) => {
    try {
      const base = `/api/options/combinations/create${accountId ? `/accounts/${encodeURIComponent(accountId)}` : ''}`;
      const url = userId ? `${base}?userId=${encodeURIComponent(userId)}` : base;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(combo)
      });

      const data = await safeParseJson(response);

      if (!response.ok) {
        const batchErrors = collectBatchErrors(data);
        if (batchErrors.length > 0) throw new Error(batchErrors.join('; '));
        const record = asRecord(data);
        throw new Error(String(record?.error || record?.error_msg || record?.message || 'Failed to create option combination'));
      }

      const batchErrors = collectBatchErrors(data);
      if (batchErrors.length > 0) return { data: null, error: new Error(batchErrors.join('; ')) };

      const record = asRecord(data);
      const inner = asRecord(record?.data);
      const combinationIdRaw =
        inner?.combinationId ??
        inner?.combination_id ??
        record?.combinationId ??
        record?.combination_id;
      const combinationId = typeof combinationIdRaw === 'string' ? combinationIdRaw : undefined;

      const createdRaw = inner?.created ?? record?.created;
      const created = typeof createdRaw === 'boolean' ? createdRaw : true;

      return { data: { created, combinationId }, error: null };
    } catch (error) {
      console.error('Error creating option combination:', error);
      return { data: null, error: error as Error };
    }
  },
  closeCombination: async (payload, accountId?: string | null, userId?: string | null) => {
    try {
      const base = `/api/options/combinations/close${accountId ? `/accounts/${encodeURIComponent(accountId)}` : ''}`;
      const url = userId ? `${base}?userId=${encodeURIComponent(userId)}` : base;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await safeParseJson(response);

      if (!response.ok) {
        const batchErrors = collectBatchErrors(data);
        if (batchErrors.length > 0) throw new Error(batchErrors.join('; '));
        const record = asRecord(data);
        throw new Error(String(record?.error || record?.error_msg || record?.message || 'Failed to close combination'));
      }

      const batchErrors = collectBatchErrors(data);
      if (batchErrors.length > 0) return { data: null, error: new Error(batchErrors.join('; ')) };

      const record = asRecord(data);
      const inner = asRecord(record?.data);
      const closedIdsRaw = inner?.closedIds ?? inner?.closed_ids ?? record?.closedIds ?? record?.closed_ids;
      const closedIds = Array.isArray(closedIdsRaw)
        ? closedIdsRaw.filter((x): x is string => typeof x === 'string')
        : [];

      return { data: { closedIds }, error: null };
    } catch (error) {
      console.error('Error closing combination:', error);
      return { data: null, error: error as Error };
    }
  },

  clearCombination: async (accountAlias: string, comboId: string) => {
    try {
      const response = await fetch(`/api/sequential-trade/${encodeURIComponent(accountAlias)}/clear-combination`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comb_id: comboId })
      });
      if (!response.ok) {
        throw new Error('Failed to clear combination');
      }
      const result = await response.json();
      if (!result.success) {
         throw new Error(result.error_msg || 'Failed to clear combination');
      }
      return { data: result.data, error: null };
    } catch (error) {
      console.error('Error clearing combination:', error);
      return { data: null, error: error as Error };
    }
  },
  saveRatioSpreadPlan: async (plan, accountId?: string | null, userId?: string | null) => {
    try {
      const base = `/api/options/ratio-spread-plans${accountId ? `/accounts/${encodeURIComponent(accountId)}` : ''}`;
      const url = userId ? `${base}?userId=${encodeURIComponent(userId)}` : base;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
      });
      if (!response.ok) {
        throw new Error('Failed to save ratio spread plan');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error saving ratio spread plan:', error);
      return { data: null, error: error as Error };
    }
  }
  ,
  refreshRatioSpreadPlan: async (plan, accountId?: string | null, userId?: string | null) => {
    try {
      const planId = encodeURIComponent(`${plan?.plan?.label}-${plan?.plan?.expiry}`);
      const base = `/api/options/ratio-spread-plans/${planId}${accountId ? `/accounts/${encodeURIComponent(accountId)}` : ''}`;
      const url = userId ? `${base}?userId=${encodeURIComponent(userId)}` : base;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
      });
      if (!response.ok) {
        throw new Error('Failed to refresh ratio spread plan');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error refreshing ratio spread plan:', error);
      return { data: null, error: error as Error };
    }
  },

  getWhitelists: async (userId: string, accountId?: string | null) => {
    try {
      if (!accountId) {
        // Return empty if no account alias provided, as it is required for the URL
        return { data: [], error: null };
      }
      
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      
      const response = await fetch(`/api/option-whitelist/${encodeURIComponent(accountId)}/list?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch whitelists');
      }
      const data = await response.json();
      // Ensure data is an array
      const whitelists = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : (Array.isArray(data.list) ? data.list : []));
      return { data: whitelists, error: null };
    } catch (error) {
      console.error('Error fetching whitelists:', error);
      return { data: null, error: error as Error };
    }
  },

  addWhitelist: async (whitelist: Omit<OptionWhitelist, 'id' | 'created_at'>, userId: string, accountId?: string | null) => {
    try {
      if (!accountId) {
        throw new Error('Account alias is required to add whitelist');
      }

      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);

      const response = await fetch(`/api/option-whitelist/${encodeURIComponent(accountId)}/add?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(whitelist)
      });
      
      if (!response.ok) {
        throw new Error('Failed to add whitelist');
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error adding whitelist:', error);
      return { data: null, error: error as Error };
    }
  },

  updateWhitelist: async (id: string | number, whitelist: Partial<OptionWhitelist>, userId: string, accountId?: string | null) => {
    try {
      if (!accountId) {
        throw new Error('Account alias is required to update whitelist');
      }

      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);

      const response = await fetch(`/api/option-whitelist/${encodeURIComponent(accountId)}/update/${id}?${params.toString()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(whitelist)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update whitelist');
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error updating whitelist:', error);
      return { data: null, error: error as Error };
    }
  },

  deleteWhitelist: async (id: string | number, userId: string, accountId?: string | null) => {
    try {
      if (!accountId) {
        throw new Error('Account alias is required to delete whitelist');
      }

      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);

      const response = await fetch(`/api/option-whitelist/${encodeURIComponent(accountId)}/delete/${id}?${params.toString()}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete whitelist');
      }
      
      return { data: null, error: null };
    } catch (error) {
      console.error('Error deleting whitelist:', error);
      return { data: null, error: error as Error };
    }
  },

  getOptionOrders: async (accountId: string, userId?: string | null, options?: { only_today?: boolean; date?: string }) => {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (options?.only_today) params.set('only_today', 'true');
      if (options?.date) params.set('date', options.date);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      
      const response = await fetch(`/api/options/orders/${encodeURIComponent(accountId)}${queryString}`);
      if (!response.ok) {
        throw new Error('Failed to fetch option orders');
      }
      const raw = await response.json();

      const extractOrders = (value: unknown): unknown[] => {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];

        const obj = value as Record<string, unknown>;
        if (Array.isArray(obj.orders)) return obj.orders;
        if ('data' in obj) return extractOrders(obj.data);
        return [];
      };

      const orders = extractOrders(raw) as OptionOrder[];
      return { data: orders, error: null };
    } catch (error) {
      console.error('Error fetching option orders:', error);
      return { data: null, error: error as Error };
    }
  },

  getOptionOrdersStats: async (accountId: string, month: string) => {
    try {
      const params = new URLSearchParams();
      params.set('month', month);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/options/orders-stats/${encodeURIComponent(accountId)}${queryString}`);
      if (!response.ok) {
        throw new Error('Failed to fetch option orders stats');
      }
      const raw = await response.json();
      
      let stats = raw;
      if (raw && typeof raw === 'object') {
        // Try to find the map if it's nested under 'stats' or 'data'
        if ('stats' in raw && raw.stats && typeof raw.stats === 'object') {
            stats = raw.stats;
        } else if ('data' in raw && raw.data && typeof raw.data === 'object') {
            stats = raw.data;
        }
      }

      return {
        data: stats as Record<string, { completed_count: number; pending_count: number; junk_count: number; total_count: number }>,
        error: null
      };
    } catch (error) {
      console.error('Error fetching option orders stats:', error);
      return { data: null, error: error as Error };
    }
  },

  getAdminOrders: async (accountId: string, options?: { only_today?: boolean; date?: string }) => {
    try {
      const params = new URLSearchParams();
      if (options?.only_today) params.set('only_today', 'true');
      if (options?.date) params.set('date', options.date);
      const queryString = params.toString() ? `?${params.toString()}` : '';

      const response = await fetch(`/api/admin/${encodeURIComponent(accountId)}/orders${queryString}`);
      if (!response.ok) {
        throw new Error('Failed to fetch admin orders');
      }
      const raw = await response.json();
      const payload =
        raw && typeof raw === 'object' && 'data' in raw && (raw as { data?: unknown }).data !== undefined
          ? (raw as { data?: unknown }).data
          : raw;
      const orders = Array.isArray(payload)
        ? payload
        : (Array.isArray((payload as { orders?: unknown }).orders)
            ? (payload as { orders: unknown[] }).orders
            : (Array.isArray((payload as { data?: unknown }).data)
                ? ((payload as { data: unknown[] }).data as unknown[])
                : []));

      const normalize = (item: unknown): OptionOrder => {
        const obj = asRecord(item) || {};

        const stockName =
          typeof obj.stock_name === 'string'
            ? obj.stock_name
            : (typeof obj.stockName === 'string' ? obj.stockName : undefined);
        const stockCode =
          typeof obj.stock_code === 'string'
            ? obj.stock_code
            : (typeof obj.stockCode === 'string' ? obj.stockCode : undefined);
        const direction =
          typeof obj.direction === 'string'
            ? obj.direction
            : (typeof obj.op_type_name === 'string' ? obj.op_type_name : '');
        const status =
          typeof obj.order_status === 'string'
            ? obj.order_status
            : (typeof obj.order_status_name === 'string' ? obj.order_status_name : '');

        const instrument_name =
          typeof obj.instrument_name === 'string'
            ? obj.instrument_name
            : stockName && stockCode
              ? `${stockName} (${stockCode})`
              : (stockName || stockCode || '-');

        const op_type_name = typeof obj.op_type_name === 'string' ? obj.op_type_name : direction;
        const op_type_name_zh =
          typeof obj.op_type_name_zh === 'string'
            ? obj.op_type_name_zh
            : direction.includes('BUY')
              ? '买入'
              : direction.includes('SELL')
                ? '卖出'
                : direction;

        const order_status_name = typeof obj.order_status_name === 'string' ? obj.order_status_name : status;
        const order_time = typeof obj.order_time === 'string' ? obj.order_time : '';

        return {
          instrument_name,
          op_type_name,
          op_type_name_zh,
          order_status_name,
          limit_price: toNumber(obj.price ?? obj.limit_price, 0),
          traded_price: toNumber(obj.traded_price ?? obj.price, 0),
          volume_total_original: toNumber(obj.volume ?? obj.volume_total_original, 0),
          volume_traded: toNumber(obj.traded_volume ?? obj.volume_traded, 0),
          remark: typeof obj.remark === 'string' ? obj.remark : (typeof obj.order_id === 'string' ? obj.order_id : ''),
          order_time,
          is_combination: Boolean(obj.is_combination),
          compact_no: typeof obj.compact_no === 'string' ? obj.compact_no : undefined,
          contract_ids: Array.isArray(obj.contract_ids) ? (obj.contract_ids.filter((x): x is string => typeof x === 'string')) : undefined,
          instrument_id: typeof obj.instrument_id === 'string' ? obj.instrument_id : stockCode,
          contract_code_full: typeof obj.contract_code_full === 'string' ? obj.contract_code_full : stockCode,
          cancel_info: typeof obj.cancel_info === 'string' ? obj.cancel_info : undefined
        };
      };

      const normalized = orders.map(normalize);
      return { data: normalized, error: null };
    } catch (error) {
      console.error('Error fetching admin orders:', error);
      return { data: null, error: error as Error };
    }
  },

  getAdminOrdersStats: async (accountId: string, month: string) => {
    try {
      const params = new URLSearchParams();
      params.set('month', month);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/admin/${encodeURIComponent(accountId)}/orders-stats${queryString}`);
      if (!response.ok) {
        throw new Error('Failed to fetch admin orders stats');
      }
      const raw = await response.json();
      const payload =
        raw && typeof raw === 'object' && 'data' in raw && (raw as { data?: unknown }).data !== undefined
          ? (raw as { data?: unknown }).data
          : raw;

      let stats = payload;
      if (payload && typeof payload === 'object') {
        if ('stats' in payload && (payload as { stats?: unknown }).stats && typeof (payload as { stats?: unknown }).stats === 'object') {
          stats = (payload as { stats: unknown }).stats;
        } else if ('data' in payload && (payload as { data?: unknown }).data && typeof (payload as { data?: unknown }).data === 'object') {
          stats = (payload as { data: unknown }).data;
        }
      }

      return {
        data: stats as Record<string, { completed_count: number; pending_count: number; junk_count: number; total_count: number }>,
        error: null
      };
    } catch (error) {
      console.error('Error fetching admin orders stats:', error);
      return { data: null, error: error as Error };
    }
  },

  getSequentialTrades: async (accountId: string, options?: { status?: string; limit?: number; offset?: number; today_only?: boolean }) => {
    try {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      if (options?.limit != null) params.set('limit', String(options.limit));
      if (options?.offset != null) params.set('offset', String(options.offset));
      if (options?.today_only) params.set('today_only', 'true');
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/sequential-trade/${encodeURIComponent(accountId)}/list${queryString}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sequential trades');
      }
      const raw = await response.json();
      let tasks = [];
      if (Array.isArray(raw)) {
        tasks = raw;
      } else if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
        tasks = (raw as { data: unknown[] }).data;
      }
      return { data: tasks, error: null };
    } catch (error) {
      console.error('Error fetching sequential trades:', error);
      return { data: null, error: error as Error };
    }
  },

  getSequentialTradeDetail: async (accountAlias: string, tradeId: number | string) => {
    try {
      const response = await fetch(
        `/api/sequential-trade/${encodeURIComponent(accountAlias)}/detail/${encodeURIComponent(String(tradeId))}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch sequential trade detail');
      }
      const raw = await response.json();
      let task = null;
      if (raw && typeof raw === 'object') {
        const obj = raw as { data?: unknown };
        if (obj.data && typeof obj.data === 'object') {
          task = obj.data;
        } else {
          task = raw;
        }
      }
      return { data: task as SequentialTradeTask | null, error: null };
    } catch (error) {
      console.error('Error fetching sequential trade detail:', error);
      return { data: null, error: error as Error };
    }
  },

  pauseSequentialTrade: async (accountAlias: string, tradeId: number | string) => {
    try {
      const response = await fetch(
        `/api/sequential-trade/${encodeURIComponent(accountAlias)}/pause/${encodeURIComponent(String(tradeId))}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        throw new Error('Failed to pause sequential trade');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error pausing sequential trade:', error);
      return { data: null, error: error as Error };
    }
  },

  resumeSequentialTrade: async (accountAlias: string, tradeId: number | string) => {
    try {
      const response = await fetch(
        `/api/sequential-trade/${encodeURIComponent(accountAlias)}/resume/${encodeURIComponent(String(tradeId))}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        throw new Error('Failed to resume sequential trade');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error resuming sequential trade:', error);
      return { data: null, error: error as Error };
    }
  },

  terminateSequentialTrade: async (accountAlias: string, tradeId: number | string) => {
    try {
      const response = await fetch(
        `/api/sequential-trade/${encodeURIComponent(accountAlias)}/terminate/${encodeURIComponent(String(tradeId))}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        throw new Error('Failed to terminate sequential trade');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error terminating sequential trade:', error);
      return { data: null, error: error as Error };
    }
  },

  restartSequentialTrade: async (accountAlias: string, tradeId: number | string, stepIndex?: number) => {
    try {
      const params = new URLSearchParams();
      if (stepIndex != null) {
        params.set('step_index', String(stepIndex));
      }
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(
        `/api/sequential-trade/${encodeURIComponent(accountAlias)}/restart/${encodeURIComponent(String(tradeId))}${queryString}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        throw new Error('Failed to restart sequential trade');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error restarting sequential trade:', error);
      return { data: null, error: error as Error };
    }
  }
};
