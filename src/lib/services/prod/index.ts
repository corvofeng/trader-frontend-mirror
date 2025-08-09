import type { AuthService, TradeService, StockService, PortfolioService, CurrencyService, OperationService, StockConfigService, StockConfig, UploadService, UploadResponse, AnalysisService } from '../types';
import type { OptionsService } from '../types';
import type { Trade } from '../types';

export const authService: AuthService = {
  getUser: async () => {
    const checker = await (await fetch('/api/check')).json();
    if (checker['status']) {
      const user = await (await fetch('/api/user')).json();
      return { data: { user: user } };
    } else {
      return null;
    }
  },

  signIn: async () => {
    window.location.href = '/api/user';
  },

  signOut: async () => {
    window.location.href = '/api/logout';
  }
};

export const tradeService: TradeService = {
  getTrades: async (userId: string, stock_code?: string, status?: string) => {
    let filteredTrades = await (await fetch('/api/actions')).json();
    console.log(userId, stock_code, status, filteredTrades);

    if (stock_code) {
      filteredTrades = filteredTrades.filter(trade => trade.stock_code === stock_code);
    }

    if (status && status !== 'all') {
      filteredTrades = filteredTrades.filter(trade => trade.status === status);
    }

    return { data: filteredTrades, error: null };
  },

  createTrade: async (trade: Omit<Trade, 'id' | 'created_at'>) => {
    const response = await fetch('/api/actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(trade)
    });

    if (!response.ok) {
      return { data: null, error: 'Failed to create trade' };
    }

    const newTrade = await response.json();
    return { data: newTrade, error: null };
  },

  updateTrade: async (trade: Trade) => {
    const response = await fetch('/api/actions', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(trade)
    });

    if (!response.ok) {
      return { data: null, error: 'Failed to update trade' };
    }

    return { data: trade, error: null };
  }
};

export const stockService: StockService = {
  getStockName: (stockCode: string) => {
    throw new Error('Not implemented');
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

  getCurrentPrice: async (symbol: string) => {
    try {
      const response = await fetch(`/api/stocks/${symbol}/price`);
      if (!response.ok) {
        throw new Error('Failed to fetch current price');
      }
      const data = await response.json();
      return { 
        data: {
          stock_code: symbol,
          stock_name: data.stock_name || symbol,
          price: data.latest_value.lastPrice
        }, 
        error: null 
      };
    } catch (error) {
      console.error('Error fetching current price:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const stockConfigService: StockConfigService = {
  getStockConfigs: async () => {
    try {
      const response = await fetch('/api/stock-configs');
      if (!response.ok) {
        throw new Error('Failed to fetch stock configs');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stock configs:', error);
      return { data: null, error: error as Error };
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
      
      return { error: null };
    } catch (error) {
      console.error('Error deleting stock config:', error);
      return { error: error as Error };
    }
  }
};

export const portfolioService: PortfolioService = {
  getHoldings: async (userId: string) => {
    try {
      const response = await fetch(`/api/portfolio/${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio data');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      return { data: null, error: error as Error };
    }
  },
  
  getRecentTrades: async (userId: string, startDate: string, endDate: string) => {
    try {
      const response = await fetch(
        `/api/portfolio/${userId}/recent-trades?startDate=${startDate}&endDate=${endDate}`
      );
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

  getTrendData: async (userId: string, startDate: string, endDate: string) => {
    try {
      const response = await fetch(
        `/api/portfolio/${userId}/trend?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch trend data');
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching trend data:', error);
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
      return { data, error: null };
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
      const response = await fetch(
        `/api/portfolio/shared/${uuid}/trend?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch shared portfolio trend data');
      }
      
      const data = await response.json();
      return { data, error: null };
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
      return { error: null };
    } catch (error) {
      console.error('Error updating currency:', error);
      return { error: error as Error };
    }
  }
};

export const operationService: OperationService = {
  getOperations: async (startDate: string, endDate: string) => {
    try {
      const response = await fetch(
        `/api/operations?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch operations');
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching operations:', error);
      return { data: null, error: error as Error };
    }
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

  getPortfolioAnalysis: async (userId: string) => {
    try {
      const response = await fetch(`/api/analysis/portfolio/${userId}`);
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

  refreshPortfolioAnalysis: async (userId: string) => {
    try {
      const response = await fetch(`/api/analysis/portfolio/${userId}/refresh`, {
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
  }
};