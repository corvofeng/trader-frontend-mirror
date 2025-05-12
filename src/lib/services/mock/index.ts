import { mockUser, mockHoldings, tradeIdCounter, MOCK_STOCKS, generateMockTrades } from './mockData';
import type { AuthService, TradeService, StockService, PortfolioService, CurrencyService, StockData, StockPrice, Operation, OperationService } from '../types';
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

function generateMockOperations(startDate: string, endDate: string): Operation[] {
  const operations: Operation[] = [];
  const functionNames = [
    'user_auth',
    'data_sync',
    'cache_refresh',
    'backup_create',
    'log_cleanup',
    'index_rebuild',
    'metrics_collect',
    'email_send',
    'report_generate',
    'security_scan'
  ];

  // Function patterns - some functions run more frequently during certain hours
  const functionPatterns = {
    user_auth: { peakHours: [9, 10, 11, 14, 15, 16], baseCount: 3, peakCount: 8 },
    data_sync: { peakHours: [0, 1, 2], baseCount: 1, peakCount: 4 },
    cache_refresh: { peakHours: [4, 5], baseCount: 2, peakCount: 5 },
    backup_create: { peakHours: [1], baseCount: 0, peakCount: 2 },
    log_cleanup: { peakHours: [3], baseCount: 0, peakCount: 1 },
    index_rebuild: { peakHours: [2], baseCount: 0, peakCount: 1 },
    metrics_collect: { peakHours: [], baseCount: 1, peakCount: 1 },
    email_send: { peakHours: [9, 10, 14, 15], baseCount: 2, peakCount: 6 },
    report_generate: { peakHours: [6, 7], baseCount: 1, peakCount: 3 },
    security_scan: { peakHours: [4, 12, 20], baseCount: 1, peakCount: 2 }
  };

  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));
  let current = start;

  while (current <= end) {
    const hour = current.getHours();
    const isWeekend = current.getDay() === 0 || current.getDay() === 6;

    functionNames.forEach(funcName => {
      const pattern = functionPatterns[funcName as keyof typeof functionPatterns];
      let baseCount = isWeekend ? Math.floor(pattern.baseCount / 2) : pattern.baseCount;
      let peakCount = isWeekend ? Math.floor(pattern.peakCount / 2) : pattern.peakCount;
      
      const isPeakHour = pattern.peakHours.includes(hour);
      const count = isPeakHour ? peakCount : baseCount;
      
      // Generate operations for this function for this hour
      for (let i = 0; i < count; i++) {
        // Add some randomness to the minutes and seconds
        const randomMinutes = Math.floor(Math.random() * 60);
        const randomSeconds = Math.floor(Math.random() * 60);
        const operationTime = new Date(current);
        operationTime.setMinutes(randomMinutes);
        operationTime.setSeconds(randomSeconds);
        
        // 90% success rate for most operations, adjust as needed
        const successRate = funcName === 'security_scan' ? 0.95 : 0.9;
        
        operations.push({
          func_name: funcName,
          call_time: format(operationTime, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
          result: Math.random() < successRate ? 'success' : 'failed'
        });
      }
    });

    // Move to next hour
    current = addMinutes(current, 60);
  }

  // Sort operations by call_time in descending order (newest first)
  return operations.sort((a, b) => 
    new Date(b.call_time).getTime() - new Date(a.call_time).getTime()
  );
}

export const operationService: OperationService = {
  getOperations: async (startDate: string, endDate: string) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const operations = generateMockOperations(startDate, endDate);
    return { data: operations, error: null };
  }
};