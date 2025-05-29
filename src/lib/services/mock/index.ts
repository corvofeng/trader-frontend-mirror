import { mockUser, mockHoldings, tradeIdCounter, MOCK_STOCKS, MOCK_STOCK_CONFIGS, generateMockTrades, generateMockOperations, DEMO_STOCK_DATA } from './mockData';
import type { AuthService, TradeService, StockService, PortfolioService, CurrencyService, StockData, StockPrice, Operation, OperationService, TrendData, StockConfigService, StockConfig } from '../types';
import { format, subDays, addMinutes, startOfDay, endOfDay, parseISO } from 'date-fns';

export const authService: AuthService = {
  getUser: async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const user = localStorage.getItem('user');
    return { data: { user: user ? JSON.parse(user) : null }, error: null };
  },
  signIn: async () => {
    await new Promise(resolve => setTimeout(resolve, 800));
    localStorage.setItem('user', JSON.stringify(mockUser));
    return { data: { user: mockUser }, error: null };
  },
  signOut: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    localStorage.removeItem('user');
    return { error: null };
  }
};

export const tradeService: TradeService = {
  getTrades: async (userId: string, stockCode?: string, status?: string) => {
    await new Promise(resolve => setTimeout(resolve, 600));
    let filteredTrades = mockTrades.filter(trade => trade.user_id === userId);
    
    if (stockCode) {
      filteredTrades = filteredTrades.filter(trade => trade.stock_code === stockCode);
    }
    
    if (status && status !== 'all') {
      filteredTrades = filteredTrades.filter(trade => trade.status === status);
    }
    
    return { data: filteredTrades, error: null };
  },
  
  createTrade: async (trade) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const newTrade = {
      ...trade,
      id: tradeIdCounter.getNextId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockTrades.push(newTrade);
    return { data: newTrade, error: null };
  },
  
  updateTrade: async (trade) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const tradeIndex = mockTrades.findIndex(t => t.id === trade.id);
    
    if (tradeIndex === -1) {
      return { data: null, error: new Error('Trade not found') };
    }
    
    mockTrades[tradeIndex] = {
      ...trade,
      updated_at: new Date().toISOString()
    };
    return { data: trade, error: null };
  }
};

export const stockService: StockService = {
  getStockName: (stockCode: string) => {
    const stock = MOCK_STOCKS.find(s => s.stock_code === stockCode);
    return stock?.stock_name || stockCode;
  },
  
  getStocks: async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: MOCK_STOCKS, error: null };
  },
  
  searchStocks: async (query: string) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const lowercaseQuery = query.toLowerCase();
    const filteredStocks = MOCK_STOCKS.filter(stock => 
      stock.stock_code.toLowerCase().includes(lowercaseQuery) ||
      stock.stock_name.toLowerCase().includes(lowercaseQuery)
    );
    return { data: filteredStocks, error: null };
  },

  getStockData: async (symbol: string) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { data: DEMO_STOCK_DATA, error: null };
  },

  getCurrentPrice: async (symbol: string) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const lastPrice = DEMO_STOCK_DATA[DEMO_STOCK_DATA.length - 1].close;
    const randomChange = (Math.random() - 0.5) * 2;
    const newPrice = lastPrice * (1 + randomChange * 0.01);

    const stock = MOCK_STOCKS.find(s => s.stock_code === symbol) || {
      stock_code: symbol,
      stock_name: symbol
    };

    return { 
      data: {
        stock_code: stock.stock_code,
        stock_name: stock.stock_name,
        price: newPrice
      }, 
      error: null 
    };
  }
};

export const stockConfigService: StockConfigService = {
  getStockConfigs: async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: MOCK_STOCK_CONFIGS, error: null };
  },

  updateStockConfig: async (config: StockConfig) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const index = MOCK_STOCK_CONFIGS.findIndex(c => c.stock_code === config.stock_code);
    
    if (index !== -1) {
      MOCK_STOCK_CONFIGS[index] = config;
    } else {
      MOCK_STOCK_CONFIGS.push(config);
    }
    
    return { data: config, error: null };
  },

  deleteStockConfig: async (stockCode: string) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = MOCK_STOCK_CONFIGS.findIndex(c => c.stock_code === stockCode);
    
    if (index !== -1) {
      MOCK_STOCK_CONFIGS.splice(index, 1);
    }
    
    return { error: null };
  }
};

export const portfolioService: PortfolioService = {
  getHoldings: async (userId: string) => {
    await new Promise(resolve => setTimeout(resolve, 700));
    return { data: mockHoldings, error: null };
  },
  
  getRecentTrades: async (userId: string, startDate: string, endDate: string) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const filteredTrades = mockTrades
      .filter(trade => trade.user_id === userId && trade.status === 'completed')
      .filter(trade => {
        const tradeDate = new Date(trade.created_at).toISOString().split('T')[0];
        return tradeDate >= startDate && tradeDate <= endDate;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { data: filteredTrades, error: null };
  },

  getTrendData: async (userId: string, startDate: string, endDate: string) => {
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    const trendData: TrendData[] = [];
    let currentValue = 100000; // Starting value
    
    for (let i = 0; i <= days; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      
      // Generate random growth with some volatility
      const dailyChange = (Math.random() * 0.02) - 0.005; // Random change between -0.5% and 1.5%
      currentValue = currentValue * (1 + dailyChange);
      
      // Add some trend patterns
      const trendFactor = Math.sin(i / 30) * 0.01; // Cyclical trend
      currentValue = currentValue * (1 + trendFactor);
      
      trendData.push({
        date: currentDate.toISOString(),
        value: currentValue
      });
    }

    return { data: trendData, error: null };
  }
};

export const currencyService: CurrencyService = {
  getCurrency: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: 'USD', error: null };
  },
  setCurrency: async (currency: string) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { error: null };
  }
};

export const operationService: OperationService = {
  getOperations: async (startDate: string, endDate: string) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const operations = generateMockOperations(startDate, endDate);
    return { data: operations, error: null };
  }
};