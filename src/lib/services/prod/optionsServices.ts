import type { OptionsService, OptionsPosition, OptionsPortfolioData, OptionsStrategy, OptionWhitelist, OptionContractDetail } from '../types';
import type { CustomOptionsStrategy } from '../types';

// Helper to adapt backend response to OptionsPortfolioData
const adaptToPortfolioData = (data: any): OptionsPortfolioData => {
  // Case 1: Data has expiryGroups (Legacy or already adapted)
  if (data.expiryGroups && Array.isArray(data.expiryGroups)) {
    return data as OptionsPortfolioData;
  }

  // Case 2: Data has expiryBuckets (New backend format)
  if (data.expiryBuckets && Array.isArray(data.expiryBuckets)) {
    let totalValue = Number(data.totalValue || 0);
    let totalCost = Number(data.totalCost || 0);
    let totalProfitLoss = Number(data.totalProfitLoss || 0);
    const singleLegPositions: OptionsPosition[] = [];
    const complexStrategies: OptionsStrategy[] = [];

    // If totals are missing from root, calculate them from buckets
    const shouldCalcTotals = data.totalValue === undefined || data.totalCost === undefined || data.totalProfitLoss === undefined;

    data.expiryBuckets.forEach((bucket: any) => {
        const singles = (bucket.single || []) as OptionsPosition[];
        const complexes = (bucket.complex || []) as OptionsStrategy[];
        
        singleLegPositions.push(...singles);
        complexStrategies.push(...complexes);
        
        if (shouldCalcTotals) {
             singles.forEach((p: any) => {
                 // Try multiple field names
                 const val = Number(p.currentValue ?? (p as any).current_value ?? 0);
                 const pl = Number(p.profitLoss ?? (p as any).profit_loss ?? 0);
                 // Cost calculation might vary, default to premium * quantity * 100 if not provided
                 const cost = (p.premium ?? (p as any).cost_price ?? 0) * Math.abs(p.quantity || 0) * 100;

                 totalValue += val;
                 totalProfitLoss += pl;
                 totalCost += cost;
             });
             complexes.forEach((c: any) => {
                 totalValue += Number(c.currentValue || 0);
                 totalCost += Number(c.totalCost || 0); // Strategy usually has totalCost
                 totalProfitLoss += Number(c.profitLoss || 0);
             });
        }
    });

    const totalProfitLossPercentage = totalCost !== 0 ? (totalProfitLoss / totalCost) * 100 : 0;

    return {
        strategies: [], 
        singleLegPositions,
        complexStrategies,
        expiryBuckets: data.expiryBuckets,
        totalValue,
        totalCost,
        totalProfitLoss,
        totalProfitLossPercentage,
        expiryGroups: [], // Component can fallback to buckets if this is empty
        is_snapshot: data.is_snapshot,
        balance: data.balance,
        real_used_margin: data.real_used_margin,
        available: data.available,
        position_profit: data.position_profit ?? totalProfitLoss,
        customStrategies: data.customStrategies || [],
        advised_combinations: data.advised_combinations || [],
        subject_positions: data.subject_positions || [],
        expiry_analysis: data.expiry_analysis
    };
  }

  // Case 3: Flat positions list (Legacy or simplified format)
  const positions: OptionsPosition[] = Array.isArray(data.positions) ? data.positions : [];
  
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
    // Handle potential snake_case from backend if necessary
    const val = Number(p.currentValue ?? (p as any).current_value ?? 0);
    const pl = Number(p.profitLoss ?? (p as any).profit_loss ?? 0);
    const cost = Number(p.premium ?? (p as any).cost_price ?? 0) * Math.abs(p.quantity || 0) * 100;
    
    // Normalize fields on the object if needed (casting to any to avoid strict type checks on readonly)
    if (p.currentValue === undefined) (p as any).currentValue = val;
    if (p.profitLoss === undefined) (p as any).profitLoss = pl;

    totalValue += val;
    totalProfitLoss += pl;
    totalCost += cost;

    // Try to find expiry from various possible field names
    let expiry = p.expiry || (p as any).expiration || (p as any).expiry_date || (p as any).expire_date || (p as any).expiryDate;
    
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
              } catch (e) {
                  console.warn('Invalid expiry date:', expiry);
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
      if (!p.expiry) (p as any).expiry = expiry;
      
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
    is_snapshot: data.is_snapshot,
    balance: data.balance,
    real_used_margin: data.real_used_margin,
    available: data.available,
    customStrategies: data.customStrategies || [],
    advised_combinations: data.advised_combinations || [],
    subject_positions: data.subject_positions || []
  };
};

// Cache for options data to prevent redundant requests
const optionsDataCache: Record<string, Promise<{ data: unknown; error: Error | null }>> = {};

export const optionsService: OptionsService = {
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

    const fetchPromise = (async () => {
      try {
        if (symbol) {
          const externalUrl = `https://stock.in.corvo.fun/api/options?symbol=${encodeURIComponent(symbol)}`;
          const externalResp = await fetch(externalUrl);
          if (externalResp.ok) {
            const externalData = await externalResp.json();
            // Allow data if quotes are present, populate surface if missing
            if (externalData && Array.isArray(externalData.quotes)) {
              if (!Array.isArray(externalData.surface)) {
                externalData.surface = [];
              }
              return { data: externalData, error: null };
            }
          }
        }
        const queryParam = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
        const fallbackResp = await fetch(`/api/options${queryParam}`);
        if (!fallbackResp.ok) {
          throw new Error('Failed to fetch options data');
        }
        const data = await fallbackResp.json();
        return { data, error: null };
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
      const data = await response.json();
      return { data, error: null };
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
      if (!response.ok) {
        throw new Error('Failed to sync positions');
      }
      const data = await response.json();
      return { data, error: null };
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
      if (!response.ok) {
        throw new Error('Failed to execute combination');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error executing combination:', error);
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
      if (!response.ok) {
        throw new Error('Failed to close combination');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error closing combination:', error);
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
      const data = await response.json();
      // Ensure data is an array or extracted from 'orders' field
      const orders = Array.isArray(data) ? data : (Array.isArray(data.orders) ? data.orders : (Array.isArray(data.data) ? data.data : []));
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
      if (raw && typeof raw === 'object' && (raw as { stats?: unknown }).stats && typeof (raw as { stats?: unknown }).stats === 'object') {
        return {
          data: (raw as { stats: Record<string, { completed_count: number; pending_count: number; total_count: number }> }).stats,
          error: null
        };
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error fetching option orders stats:', error);
      return { data: null, error: error as Error };
    }
  }
};
