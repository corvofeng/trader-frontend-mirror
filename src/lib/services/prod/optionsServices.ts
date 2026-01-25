import type { OptionsService, OptionsPosition, OptionsPortfolioData, OptionsStrategy } from '../types';
import type { CustomOptionsStrategy } from '../types';

// Helper to adapt backend response to OptionsPortfolioData
const adaptToPortfolioData = (data: any): OptionsPortfolioData => {
  // If data already looks like OptionsPortfolioData (has expiryGroups), return it
  if (data.expiryGroups && Array.isArray(data.expiryGroups)) {
    return data as OptionsPortfolioData;
  }

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

    const expiry = p.expiry;
    if (expiry) {
      if (!expiryGroupsMap.has(expiry)) {
          const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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
      group.positions.push(p);
      group.totalValue += val;
      group.profitLoss += pl;
      group.totalCost += cost;
    }
  });

  const expiryGroups = Array.from(expiryGroupsMap.values())
    .sort((a, b) => a.expiry.localeCompare(b.expiry));

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
    advised_combinations: data.advised_combinations || []
  };
};

// Cache for options data to prevent redundant requests
const optionsDataCache: Record<string, Promise<{ data: unknown; error: Error | null }>> = {};

export const optionsService: OptionsService = {
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

  getOptionsPortfolio: async (userId: string, accountId?: string | null) => {
    try {
      const path = accountId ? `/api/options/portfolio/${accountId}` : `/api/options/portfolio/${userId}`;
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to fetch options portfolio');
      }
      const data = await response.json();
      return { data: adaptToPortfolioData(data), error: null };
    } catch (error) {
      console.error('Error fetching options portfolio:', error);
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
  updatePositions: async (payload: { updates: Array<{ id?: string; type: 'call' | 'put'; position_type: 'buy' | 'sell'; strike: number; expiry: string; quantity: number; original_quantity?: number; change_quantity?: number; is_covered?: boolean; symbol?: string; option_type?: string; strike_price?: string | number }>, positions?: OptionsPosition[], accountId?: string | null, userId?: string | null }) => {
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
  }
};
