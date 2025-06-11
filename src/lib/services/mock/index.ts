import { mockUser, mockHoldings, tradeIdCounter, MOCK_STOCKS, MOCK_STOCK_CONFIGS, generateMockTrades, generateMockOperations, DEMO_STOCK_DATA } from './mockData';
import type { AuthService, TradeService, StockService, PortfolioService, CurrencyService, StockData, StockPrice, Operation, OperationService, TrendData, StockConfigService, StockConfig } from '../types';
import { format, subDays, addMinutes, startOfDay, endOfDay, parseISO } from 'date-fns';

function generateDemoStockData(): StockData[] {
  const data: StockData[] = [];
  const basePrice = 150;
  const now = new Date();
  let currentPrice = basePrice;
  
  // Generate historical data (1 year)
  for (let i = 365; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // More realistic price movement with trends
    const trend = Math.sin(i / 30) * 0.3; // Cyclical trend
    const dailyVolatility = 0.015; // 1.5% daily volatility
    const priceChange = currentPrice * (dailyVolatility * (Math.random() - 0.5) + trend * 0.01);
    
    // Generate OHLC data with more realistic patterns
    const open = currentPrice;
    const range = currentPrice * 0.02; // 2% range
    const high = Math.max(open, open + priceChange) + (range * Math.random());
    const low = Math.min(open, open + priceChange) - (range * Math.random());
    const close = open + priceChange;
    
    // Volume varies with price movement and time of week
    const baseVolume = 2000000;
    const volumeVariation = Math.abs(priceChange / currentPrice);
    const dayOfWeek = date.getDay();
    const weekdayFactor = (dayOfWeek > 0 && dayOfWeek < 6) ? 1 : 0.6; // Lower volume on weekends
    const volume = Math.floor(baseVolume * weekdayFactor * (1 + volumeVariation * 3));

    data.push({
      date: date.toISOString().split('T')[0],
      open,
      high,
      low,
      close,
      volume
    });

    currentPrice = close;
  }

  return data;
}

export const DEMO_STOCK_DATA: StockData[] = generateDemoStockData();
export const mockTrades = generateMockTrades(DEMO_STOCK_DATA);

// Store for uploaded portfolio data
const uploadedPortfolios = new Map<string, {
  account: any;
  balance: any;
  holdings: any[];
  trades: any[];
  uploadTime: string;
  filename: string;
}>();

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
  },

  // UUID-based methods for shared portfolios
  getHoldingsByUuid: async (uuid: string) => {
    await new Promise(resolve => setTimeout(resolve, 700));
    const portfolio = uploadedPortfolios.get(uuid);
    if (!portfolio) {
      return { data: null, error: new Error('Portfolio not found') };
    }
    return { data: portfolio.holdings, error: null };
  },

  getRecentTradesByUuid: async (uuid: string, startDate: string, endDate: string) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const portfolio = uploadedPortfolios.get(uuid);
    if (!portfolio) {
      return { data: null, error: new Error('Portfolio not found') };
    }
    
    const filteredTrades = portfolio.trades.filter(trade => {
      const tradeDate = new Date(trade.created_at).toISOString().split('T')[0];
      return tradeDate >= startDate && tradeDate <= endDate;
    });
    
    return { data: filteredTrades, error: null };
  },

  getTrendDataByUuid: async (uuid: string, startDate: string, endDate: string) => {
    await new Promise(resolve => setTimeout(resolve, 600));
    const portfolio = uploadedPortfolios.get(uuid);
    if (!portfolio) {
      return { data: null, error: new Error('Portfolio not found') };
    }
    
    // Generate mock trend data for uploaded portfolio
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    const trendData: TrendData[] = [];
    const totalValue = portfolio.holdings.reduce((sum: number, h: any) => sum + (h.total_value || 0), 0);
    let currentValue = totalValue * 0.9; // Start 10% lower
    
    for (let i = 0; i <= days; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      
      const progress = i / days;
      currentValue = totalValue * 0.9 + (totalValue * 0.1 * progress) + (Math.random() - 0.5) * totalValue * 0.02;
      
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

// Mock upload endpoint with real data format
export const uploadPortfolioFile = async (file: File): Promise<{ 
  uuid: string; 
  filename: string; 
  uploadTime: string;
  account: any;
  balance: any;
  holdings: any[];
}> => {
  await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate upload time
  
  const uuid = 'portfolio-' + Math.random().toString(36).substr(2, 9);
  const uploadTime = new Date().toISOString();
  
  // Generate realistic account data based on your example
  const mockAccount = {
    broker: '中金财富',
    branch: '北京分公司',
    username: 'Demo User',
    account_no: '1200' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
  };

  const mockBalance = {
    currency: '人民币',
    available: 35607.94 + (Math.random() - 0.5) * 10000,
    withdrawable: 101.83 + (Math.random() - 0.5) * 200,
    total_asset: 153165.94 + (Math.random() - 0.5) * 50000,
    market_value: 117558.0 + (Math.random() - 0.5) * 30000,
    timestamp: uploadTime
  };

  // Use mockHoldings as base data and convert to uploaded format
  const mockHoldingsFromFile = mockHoldings.map(holding => ({
    stock_code: holding.stock_code,
    stock_name: holding.stock_name,
    quantity: holding.quantity,
    available_quantity: holding.quantity,
    price: holding.current_price,
    cost: holding.average_price,
    market_value: holding.total_value,
    profit: holding.profit_loss,
    profit_ratio: holding.profit_loss_percentage,
    today_profit: holding.daily_profit_loss,
    today_profit_ratio: holding.daily_profit_loss_percentage,
    currency: '人民币',
    timestamp: uploadTime
  }));
  
  const mockTradesFromFile = [
    {
      id: 1001,
      user_id: 'uploaded-user',
      stock_code: mockHoldings[0].stock_code,
      stock_name: mockHoldings[0].stock_name,
      operation: 'buy' as const,
      target_price: mockHoldings[0].average_price,
      quantity: mockHoldings[0].quantity,
      notes: `建仓${mockHoldings[0].stock_name}`,
      status: 'completed' as const,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 1002,
      user_id: 'uploaded-user',
      stock_code: mockHoldings[1].stock_code,
      stock_name: mockHoldings[1].stock_name,
      operation: 'buy' as const,
      target_price: mockHoldings[1].average_price,
      quantity: mockHoldings[1].quantity,
      notes: `分批建仓${mockHoldings[1].stock_name}`,
      status: 'completed' as const,
      created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];
  
  // Store the uploaded portfolio data
  uploadedPortfolios.set(uuid, {
    account: mockAccount,
    balance: mockBalance,
    holdings: mockHoldingsFromFile,
    trades: mockTradesFromFile,
    uploadTime,
    filename: file.name
  });
  
  return { 
    uuid, 
    filename: file.name, 
    uploadTime,
    account: mockAccount,
    balance: mockBalance,
    holdings: mockHoldingsFromFile
  };
};