import type { OptionsService } from '../types';

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

  getOptionsPortfolio: async (userId: string) => {
    try {
      const response = await fetch(`/api/options/portfolio/${userId}`);
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
  }
};