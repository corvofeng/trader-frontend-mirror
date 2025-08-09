import { mockUser, mockHoldings, tradeIdCounter, MOCK_STOCKS, MOCK_STOCK_CONFIGS, generateMockTrades, generateMockOperations, DEMO_STOCK_DATA } from './mockData';
import type { AuthService, TradeService, StockService, PortfolioService, CurrencyService, StockData, StockPrice, Operation, OperationService, TrendData, StockConfigService, StockConfig, UploadService, UploadResponse, AnalysisService, StockAnalysis, PortfolioAnalysis, OptionsService, OptionsData } from '../types';
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
    const baseValue = 100000; // Starting value
    let currentValue = baseValue;
    let currentPositionValue = 75000; // Starting position value (75% of total)
    
    // Helper function to fill missing trading days
    const fillMissingDays = (data: TrendData[]): TrendData[] => {
      if (data.length === 0) return data;
      
      const filledData: TrendData[] = [];
      const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      for (let i = 0; i < sortedData.length; i++) {
        filledData.push(sortedData[i]);
        
        // Fill gaps between current and next data point
        if (i < sortedData.length - 1) {
          const currentDate = new Date(sortedData[i].date);
          const nextDate = new Date(sortedData[i + 1].date);
          const daysDiff = Math.ceil((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // If there's a gap of more than 1 day, fill with interpolated values
          if (daysDiff > 1) {
            const currentPoint = sortedData[i];
            const nextPoint = sortedData[i + 1];
            
            for (let j = 1; j < daysDiff; j++) {
              const interpolationRatio = j / daysDiff;
              const interpolatedDate = new Date(currentDate);
              interpolatedDate.setDate(currentDate.getDate() + j);
              
              // Linear interpolation for smooth transitions
              const interpolatedValue = currentPoint.value + 
                (nextPoint.value - currentPoint.value) * interpolationRatio;
              const interpolatedPositionValue = (currentPoint.position_value || 0) + 
                ((nextPoint.position_value || 0) - (currentPoint.position_value || 0)) * interpolationRatio;
              const interpolatedReturnRate = ((interpolatedValue - baseValue) / baseValue) * 100;
              
              filledData.push({
                date: interpolatedDate.toISOString(),
                value: interpolatedValue,
                position_value: interpolatedPositionValue,
                return_rate: interpolatedReturnRate
              });
            }
          }
        }
      }
      
      return filledData;
    };
    
    // Generate base data points (simulate some missing trading days)
    for (let i = 0; i <= days; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      
      // Skip some weekends and holidays to simulate real trading data
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = Math.random() < 0.02; // 2% chance of holiday
      
      if (isWeekend || isHoliday) {
        continue; // Skip non-trading days
      }
      
      // Generate random growth with some volatility for total value
      const dailyChange = (Math.random() * 0.02) - 0.005; // Random change between -0.5% and 1.5%
      currentValue = currentValue * (1 + dailyChange);
      
      // Add some trend patterns
      const trendFactor = Math.sin(i / 30) * 0.01; // Cyclical trend
      currentValue = currentValue * (1 + trendFactor);
      
      // Generate position value with different patterns
      const positionChange = (Math.random() * 0.015) - 0.0075; // Smaller volatility for positions
      currentPositionValue = currentPositionValue * (1 + positionChange);
      
      // Position value should generally be less than total value
      const maxPositionRatio = 0.95;
      const minPositionRatio = 0.50;
      const currentRatio = currentPositionValue / currentValue;
      
      if (currentRatio > maxPositionRatio) {
        currentPositionValue = currentValue * maxPositionRatio;
      } else if (currentRatio < minPositionRatio) {
        currentPositionValue = currentValue * minPositionRatio;
      }
      
      // Calculate return rate based on base value
      const returnRate = ((currentValue - baseValue) / baseValue) * 100;
      
      trendData.push({
        date: currentDate.toISOString(),
        value: currentValue,
        position_value: currentPositionValue,
        return_rate: returnRate
      });
    }

    // Fill missing days and smooth the data
    const smoothedData = fillMissingDays(trendData);
    
    return { data: smoothedData, error: null };
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
    
    // Helper function to fill missing trading days
    const fillMissingDays = (data: TrendData[]): TrendData[] => {
      if (data.length === 0) return data;
      
      const filledData: TrendData[] = [];
      const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      for (let i = 0; i < sortedData.length; i++) {
        filledData.push(sortedData[i]);
        
        // Fill gaps between current and next data point
        if (i < sortedData.length - 1) {
          const currentDate = new Date(sortedData[i].date);
          const nextDate = new Date(sortedData[i + 1].date);
          const daysDiff = Math.ceil((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // If there's a gap of more than 1 day, fill with interpolated values
          if (daysDiff > 1) {
            const currentPoint = sortedData[i];
            const nextPoint = sortedData[i + 1];
            
            for (let j = 1; j < daysDiff; j++) {
              const interpolationRatio = j / daysDiff;
              const interpolatedDate = new Date(currentDate);
              interpolatedDate.setDate(currentDate.getDate() + j);
              
              // Linear interpolation for smooth transitions
              const interpolatedValue = currentPoint.value + 
                (nextPoint.value - currentPoint.value) * interpolationRatio;
              const interpolatedPositionValue = (currentPoint.position_value || 0) + 
                ((nextPoint.position_value || 0) - (currentPoint.position_value || 0)) * interpolationRatio;
              const interpolatedReturnRate = ((interpolatedValue - baseValue) / baseValue) * 100;
              
              filledData.push({
                date: interpolatedDate.toISOString(),
                value: interpolatedValue,
                position_value: interpolatedPositionValue,
                return_rate: interpolatedReturnRate
              });
            }
          }
        }
      }
      
      return filledData;
    };
    
    // Generate mock trend data for uploaded portfolio
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    const trendData: TrendData[] = [];
    const totalValue = portfolio.holdings.reduce((sum: number, h: any) => sum + (h.total_value || 0), 0);
    const positionValue = portfolio.holdings.reduce((sum: number, h: any) => sum + (h.market_value || 0), 0);
    
    const baseValue = totalValue * 0.9; // Start 10% lower
    let currentValue = baseValue;
    let currentPositionValue = positionValue * 0.9;
    
    for (let i = 0; i <= days; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      
      // Skip some weekends and holidays to simulate real trading data
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = Math.random() < 0.02; // 2% chance of holiday
      
      if (isWeekend || isHoliday) {
        continue; // Skip non-trading days
      }
      
      const progress = i / days;
      currentValue = totalValue * 0.9 + (totalValue * 0.1 * progress) + (Math.random() - 0.5) * totalValue * 0.02;
      currentPositionValue = positionValue * 0.9 + (positionValue * 0.1 * progress) + (Math.random() - 0.5) * positionValue * 0.015;
      
      // Calculate return rate based on base value
      const returnRate = ((currentValue - baseValue) / baseValue) * 100;
      
      trendData.push({
        date: currentDate.toISOString(),
        value: currentValue,
        position_value: currentPositionValue,
        return_rate: returnRate
      });
    }

    // Fill missing days and smooth the data
    const smoothedData = fillMissingDays(trendData);
    
    return { data: smoothedData, error: null };
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

export const uploadService: UploadService = {
  uploadPortfolioFile: async (file: File): Promise<UploadResponse> => {
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
  }
};

export const analysisService: AnalysisService = {
  getStockAnalysis: async (stockCode: string) => {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API delay
    
    const stock = MOCK_STOCKS.find(s => s.stock_code === stockCode);
    if (!stock) {
      return { data: null, error: new Error('Stock not found') };
    }

    // Generate realistic mock analysis data
    const mockAnalysis: StockAnalysis = {
      stock_code: stockCode,
      stock_name: stock.stock_name,
      analysis_time: new Date().toISOString(),
      technical_analysis: {
        trend: Math.random() > 0.5 ? 'bullish' : Math.random() > 0.3 ? 'bearish' : 'neutral',
        support_level: 140 + Math.random() * 20,
        resistance_level: 180 + Math.random() * 20,
        rsi: 30 + Math.random() * 40,
        macd: {
          signal: Math.random() > 0.6 ? 'buy' : Math.random() > 0.3 ? 'sell' : 'hold',
          value: (Math.random() - 0.5) * 2
        },
        moving_averages: {
          ma5: 165 + Math.random() * 10,
          ma10: 162 + Math.random() * 10,
          ma20: 158 + Math.random() * 10,
          ma50: 155 + Math.random() * 10
        }
      },
      fundamental_analysis: {
        pe_ratio: 15 + Math.random() * 20,
        pb_ratio: 1.5 + Math.random() * 2,
        dividend_yield: Math.random() * 4,
        market_cap: 1000000000000 + Math.random() * 2000000000000,
        revenue_growth: (Math.random() - 0.3) * 30,
        profit_margin: 10 + Math.random() * 20
      },
      sentiment_analysis: {
        score: (Math.random() - 0.5) * 2,
        news_sentiment: Math.random() > 0.6 ? 'positive' : Math.random() > 0.3 ? 'negative' : 'neutral',
        social_sentiment: Math.random() > 0.6 ? 'positive' : Math.random() > 0.3 ? 'negative' : 'neutral',
        analyst_rating: Math.random() > 0.6 ? 'buy' : Math.random() > 0.3 ? 'sell' : 'hold'
      },
      risk_metrics: {
        volatility: 15 + Math.random() * 25,
        beta: 0.8 + Math.random() * 0.8,
        var_95: -(2 + Math.random() * 8),
        sharpe_ratio: 0.5 + Math.random() * 1.5
      },
      recommendations: [
        {
          type: Math.random() > 0.5 ? 'buy' : 'hold',
          reason: '基于技术分析和基本面分析，该股票显示出积极的投资机会',
          confidence: 70 + Math.random() * 25,
          target_price: 180 + Math.random() * 40,
          stop_loss: 140 + Math.random() * 20
        }
      ]
    };

    return { data: mockAnalysis, error: null };
  },

  getPortfolioAnalysis: async (userId: string) => {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
    
    const mockPortfolioAnalysis: PortfolioAnalysis = {
      user_id: userId,
      analysis_time: new Date().toISOString(),
      content: `### 1. 持仓变化分析
- **显著变化**：
  - **加仓**：粤高速A（7月25日加仓400股至800股），中信证券（7月12日从400股增至600股，但当前回落至400股）。
  - **减仓**：暂无明显减仓操作。

### 2. 收益表现分析
- **整体表现**：投资组合在过去30天内表现良好，总收益率达到${(Math.random() * 10 + 5).toFixed(2)}%。
- **个股贡献**：
  - **AAPL**: 贡献了${(Math.random() * 3 + 1).toFixed(2)}%的收益
  - **GOOGL**: 贡献了${(Math.random() * 2 + 0.5).toFixed(2)}%的收益

### 3. 风险评估
- **风险水平**：当前投资组合风险处于**中等**水平
- **建议**：考虑适当分散投资，降低单一股票集中度风险

### 4. 投资建议
- **短期策略**：维持当前仓位，关注市场波动
- **长期规划**：建议逐步增加科技股配置比例`,
      overall_metrics: {
        total_return: (Math.random() - 0.3) * 30,
        annualized_return: (Math.random() - 0.2) * 25,
        volatility: 15 + Math.random() * 20,
        sharpe_ratio: 0.5 + Math.random() * 1.5,
        max_drawdown: -(5 + Math.random() * 15),
        win_rate: 45 + Math.random() * 30,
        profit_factor: 1.1 + Math.random() * 0.8
      },
      sector_allocation: [
        { sector: '科技', weight: 35 + Math.random() * 20, return: (Math.random() - 0.3) * 20, risk_contribution: 25 + Math.random() * 15 },
        { sector: '金融', weight: 20 + Math.random() * 15, return: (Math.random() - 0.4) * 15, risk_contribution: 15 + Math.random() * 10 },
        { sector: '医疗', weight: 15 + Math.random() * 10, return: (Math.random() - 0.2) * 18, risk_contribution: 12 + Math.random() * 8 },
        { sector: '消费', weight: 10 + Math.random() * 10, return: (Math.random() - 0.1) * 12, risk_contribution: 8 + Math.random() * 6 },
        { sector: '其他', weight: 5 + Math.random() * 10, return: (Math.random() - 0.2) * 10, risk_contribution: 5 + Math.random() * 5 }
      ],
      risk_analysis: {
        portfolio_beta: 0.9 + Math.random() * 0.4,
        var_95: -(3 + Math.random() * 7),
        correlation_matrix: mockHoldings.slice(0, 3).map((h1, i) => 
          mockHoldings.slice(i + 1, 4).map(h2 => ({
            stock1: h1.stock_code,
            stock2: h2.stock_code,
            correlation: (Math.random() - 0.5) * 1.8
          }))
        ).flat(),
        concentration_risk: 20 + Math.random() * 30
      },
      performance_attribution: mockHoldings.slice(0, 5).map(holding => ({
        stock_code: holding.stock_code,
        contribution_to_return: (Math.random() - 0.3) * 5,
        weight: (holding.total_value / mockHoldings.reduce((sum, h) => sum + h.total_value, 0)) * 100,
        alpha: (Math.random() - 0.4) * 8
      })),
      rebalancing_suggestions: mockHoldings.slice(0, 3).map(holding => ({
        stock_code: holding.stock_code,
        current_weight: (holding.total_value / mockHoldings.reduce((sum, h) => sum + h.total_value, 0)) * 100,
        suggested_weight: 15 + Math.random() * 20,
        action: Math.random() > 0.6 ? 'buy' : Math.random() > 0.3 ? 'sell' : 'hold',
        reason: '基于风险调整和市场前景，建议调整该股票的仓位配置'
      })),
      market_outlook: {
        trend: Math.random() > 0.5 ? 'bullish' : Math.random() > 0.3 ? 'bearish' : 'neutral',
        confidence: 60 + Math.random() * 30,
        key_factors: ['宏观经济环境', '行业政策变化', '市场流动性', '地缘政治风险'],
        time_horizon: Math.random() > 0.7 ? '1Y' : Math.random() > 0.5 ? '6M' : Math.random() > 0.3 ? '3M' : '1M'
      }
    };

    return { data: mockPortfolioAnalysis, error: null };
  },

  getPortfolioAnalysisByUuid: async (uuid: string) => {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
    
    // Check if portfolio exists
    const portfolio = uploadedPortfolios.get(uuid);
    if (!portfolio) {
      return { data: null, error: new Error('Portfolio not found') };
    }
    
    const mockPortfolioAnalysis: PortfolioAnalysis = {
      user_id: `shared-${uuid}`,
      analysis_time: new Date().toISOString(),
      overall_metrics: {
        total_return: (Math.random() - 0.3) * 30,
        annualized_return: (Math.random() - 0.2) * 25,
        volatility: 15 + Math.random() * 20,
        sharpe_ratio: 0.5 + Math.random() * 1.5,
        max_drawdown: -(5 + Math.random() * 15),
        win_rate: 45 + Math.random() * 30,
        profit_factor: 1.1 + Math.random() * 0.8
      },
      sector_allocation: [
        { sector: '科技', weight: 35 + Math.random() * 20, return: (Math.random() - 0.3) * 20, risk_contribution: 25 + Math.random() * 15 },
        { sector: '金融', weight: 20 + Math.random() * 15, return: (Math.random() - 0.4) * 15, risk_contribution: 15 + Math.random() * 10 },
        { sector: '医疗', weight: 15 + Math.random() * 10, return: (Math.random() - 0.2) * 18, risk_contribution: 12 + Math.random() * 8 },
        { sector: '消费', weight: 10 + Math.random() * 10, return: (Math.random() - 0.1) * 12, risk_contribution: 8 + Math.random() * 6 },
        { sector: '其他', weight: 5 + Math.random() * 10, return: (Math.random() - 0.2) * 10, risk_contribution: 5 + Math.random() * 5 }
      ],
      risk_analysis: {
        portfolio_beta: 0.9 + Math.random() * 0.4,
        var_95: -(3 + Math.random() * 7),
        correlation_matrix: portfolio.holdings.slice(0, 3).map((h1: any, i: number) => 
          portfolio.holdings.slice(i + 1, 4).map((h2: any) => ({
            stock1: h1.stock_code,
            stock2: h2.stock_code,
            correlation: (Math.random() - 0.5) * 1.8
          }))
        ).flat(),
        concentration_risk: 20 + Math.random() * 30
      },
      performance_attribution: portfolio.holdings.slice(0, 5).map((holding: any) => ({
        stock_code: holding.stock_code,
        contribution_to_return: (Math.random() - 0.3) * 5,
        weight: (holding.market_value / portfolio.holdings.reduce((sum: number, h: any) => sum + h.market_value, 0)) * 100,
        alpha: (Math.random() - 0.4) * 8
      })),
      rebalancing_suggestions: portfolio.holdings.slice(0, 3).map((holding: any) => ({
        stock_code: holding.stock_code,
        current_weight: (holding.market_value / portfolio.holdings.reduce((sum: number, h: any) => sum + h.market_value, 0)) * 100,
        suggested_weight: 15 + Math.random() * 20,
        action: Math.random() > 0.6 ? 'buy' : Math.random() > 0.3 ? 'sell' : 'hold',
        reason: '基于风险调整和市场前景，建议调整该股票的仓位配置'
      })),
      market_outlook: {
        trend: Math.random() > 0.5 ? 'bullish' : Math.random() > 0.3 ? 'bearish' : 'neutral',
        confidence: 60 + Math.random() * 30,
        key_factors: ['宏观经济环境', '行业政策变化', '市场流动性', '地缘政治风险'],
        time_horizon: Math.random() > 0.7 ? '1Y' : Math.random() > 0.5 ? '6M' : Math.random() > 0.3 ? '3M' : '1M'
      }
    };
  },

  refreshStockAnalysis: async (stockCode: string) => {
    // Same as getStockAnalysis but with a refresh indicator
    return analysisService.getStockAnalysis(stockCode);
  },

  refreshPortfolioAnalysis: async (userId: string) => {
    // Same as getPortfolioAnalysis but with a refresh indicator
    return analysisService.getPortfolioAnalysis(userId);
  },

  refreshPortfolioAnalysisByUuid: async (uuid: string) => {
    // Same as getPortfolioAnalysisByUuid but with a refresh indicator
    return analysisService.getPortfolioAnalysisByUuid(uuid);
  }
};

export const optionsService: OptionsService = {
  getOptionsData: async (symbol?: string) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate realistic options data
    const basePrice = 150 + Math.random() * 100; // Random base price between 150-250
    const expiryDates = [30, 60, 90].map(days => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString();
    });
    
    const strikes = [];
    for (let i = -5; i <= 5; i++) {
      strikes.push(Math.round((basePrice + i * 10) / 5) * 5); // Round to nearest 5
    }
    
    const quotes = expiryDates.flatMap(expiry => 
      strikes.map(strike => {
        const timeToExpiry = (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
        const moneyness = strike / basePrice;
        
        // Simple Black-Scholes approximation for realistic pricing
        const volatility = 0.2 + Math.random() * 0.3;
        const riskFreeRate = 0.05;
        
        const d1 = (Math.log(basePrice / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / (volatility * Math.sqrt(timeToExpiry));
        const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
        
        const callPrice = Math.max(0.01, basePrice * normalCDF(d1) - strike * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(d2));
        const putPrice = Math.max(0.01, strike * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(-d2) - basePrice * normalCDF(-d1));
        
        return {
          expiry,
          strike,
          callPrice: Math.round(callPrice * 100) / 100,
          putPrice: Math.round(putPrice * 100) / 100,
          callVolume: Math.floor(Math.random() * 1000 + 100),
          putVolume: Math.floor(Math.random() * 800 + 50),
          callOpenInterest: Math.floor(Math.random() * 5000 + 500),
          putOpenInterest: Math.floor(Math.random() * 4000 + 300),
          callImpliedVol: volatility + (Math.random() - 0.5) * 0.1,
          putImpliedVol: volatility + (Math.random() - 0.5) * 0.1
        };
      })
    );
    
    const surface = expiryDates.flatMap(expiry =>
      strikes.flatMap(strike => [
        {
          expiry,
          strike,
          type: 'call' as const,
          value: quotes.find(q => q.expiry === expiry && q.strike === strike)?.callPrice || 0
        },
        {
          expiry,
          strike,
          type: 'put' as const,
          value: quotes.find(q => q.expiry === expiry && q.strike === strike)?.putPrice || 0
        }
      ])
    );
    
    return { data: { quotes, surface }, error: null };
  }
};

// Helper function for normal cumulative distribution
function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

// Error function approximation
function erf(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;