import type { OptionsService } from '../types';
import type { CustomOptionsStrategy } from '../types';

export const optionsService: OptionsService = {
  getOptionsData: async (symbol?: string) => {
    try {
      const queryParam = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
      const response = await fetch(`/api/options${queryParam}`);
      if (!response.ok) {
        throw new Error('Failed to fetch options data');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching options data:', error);
      return { data: null, error: error as Error };
    }
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
      const params = new URLSearchParams();
      if (accountId) params.set('accountId', accountId);
      const qs = params.toString();
      const response = await fetch(`/api/options/portfolio/${userId}${qs ? `?${qs}` : ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch options portfolio');
      }
      const data = await response.json();
      return { data, error: null };
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

  getCustomStrategies: async (userId: string) => {
    try {
      const response = await fetch(`/api/options/strategies/custom?userId=${userId}`);
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

  getRatioSpreadPlans: async (symbol?: string, accountId?: string | null) => {
    try {
      const params = new URLSearchParams();
      if (symbol) params.set('symbol', symbol);
      if (accountId) params.set('accountId', accountId);
      const qs = params.toString();
      const response = await fetch(`/api/options/ratio-spread-plans${qs ? `?${qs}` : ''}`);
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
  saveRatioSpreadPlan: async (plan) => {
    try {
      const response = await fetch(`/api/options/ratio-spread-plans`, {
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
  refreshRatioSpreadPlan: async (plan) => {
    try {
      const response = await fetch(`/api/options/ratio-spread-plans/refresh`, {
        method: 'POST',
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
