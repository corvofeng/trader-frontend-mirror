import { mockUser, mockHoldings, tradeIdCounter, MOCK_STOCKS, generateMockTrades, generateMockOperations, DEMO_STOCK_DATA } from './mockData';
import type { AuthService, TradeService, StockService, PortfolioService, CurrencyService, StockData, StockPrice, Operation, OperationService, TrendData } from '../types';
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
  },

  getTrendData: async (userId: string, startDate: string, endDate: string) => {
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const trades = await tradeService.getTrades(userId);
    if (!trades.data) return { data: [], error: new Error('Failed to fetch trades') };

    const sortedTrades = trades.data
      .filter(trade => trade.status === 'completed')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (sortedTrades.length === 0) {
      return { data: [], error: null };
    }

    let currentValue = mockHoldings.reduce((sum, holding) => sum + holding.total_value, 0);
    const profitLoss = mockHoldings.reduce((sum, holding) => sum + holding.profit_loss, 0);
    const initialValue = currentValue - profitLoss;

    const trendData: TrendData[] = [{
      date: startDate,
      value: initialValue
    }];

    sortedTrades.forEach(trade => {
      const tradeValue = trade.target_price * trade.quantity;
      if (trade.operation === 'buy') {
        currentValue += tradeValue;
      } else {
        currentValue -= tradeValue;
      }
      
      trendData.push({
        date: trade.created_at,
        value: currentValue
      });
    });

    // Add current value
    trendData.push({
      date: new Date().toISOString(),
      value: currentValue
    });

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