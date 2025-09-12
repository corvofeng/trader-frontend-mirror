import type { OptionsService, OptionsData, OptionsPortfolioData, OptionsPosition, OptionsStrategy } from '../types';
import type { CustomOptionsStrategy } from '../types';

// 支持的期权标的列表
const AVAILABLE_OPTIONS_SYMBOLS = [
  'SPY',   // SPDR S&P 500 ETF
  'QQQ',   // Invesco QQQ Trust
  'AAPL',  // Apple Inc.
  'TSLA',  // Tesla Inc.
  'MSFT',  // Microsoft Corporation
  'NVDA',  // NVIDIA Corporation
  'AMZN',  // Amazon.com Inc.
  'GOOGL', // Alphabet Inc.
];

// 支持的期权策略列表
const AVAILABLE_STRATEGIES = [
  'Long Call',
  'Long Put', 
  'Covered Call',
  'Protective Put',
  'Bull Call Spread',
  'Bear Put Spread',
  'Iron Condor',
  'Butterfly Spread',
  'Straddle',
  'Strangle'
];

// 存储自定义策略的内存数据库
const customStrategiesStore = new Map<string, CustomOptionsStrategy>();

// Mock期权持仓数据
const generateMockOptionsPortfolio = (): OptionsPortfolioData => {
  const positions: OptionsPosition[] = [
    {
      id: '1',
      symbol: 'SPY',
      strategy: 'Long Call',
      strategy_id: 'STR-001',
      type: 'call',
      position_type: 'buy',
      strike: 450,
      expiry: '2024-03-15',
      quantity: 10,
      premium: 5.50,
      currentValue: 7.20,
      profitLoss: 1700,
      profitLossPercentage: 30.91,
      impliedVolatility: 0.18,
      delta: 0.65,
      gamma: 0.02,
      theta: -0.05,
      vega: 0.12,
      status: 'open',
      openDate: '2024-01-15T10:30:00Z',
      notes: '看好市场短期上涨'
    },
    {
      id: '2',
      symbol: 'QQQ',
      strategy: 'Protective Put',
      strategy_id: 'STR-002',
      type: 'put',
      position_type: 'buy',
      strike: 380,
      expiry: '2024-02-16',
      quantity: 5,
      premium: 8.30,
      currentValue: 6.10,
      profitLoss: -1100,
      profitLossPercentage: -26.51,
      impliedVolatility: 0.22,
      delta: -0.35,
      gamma: 0.015,
      theta: -0.08,
      vega: 0.15,
      status: 'open',
      openDate: '2024-01-10T14:20:00Z',
      notes: '为现有QQQ持仓购买保护'
    },
    {
      id: '3',
      symbol: 'AAPL',
      strategy: 'Bull Call Spread',
      strategy_id: 'STR-003',
      type: 'spread',
      position_type: 'buy',
      strike: 175,
      expiry: '2024-04-19',
      quantity: 8,
      premium: 2.50,
      currentValue: 4.80,
      profitLoss: 1840,
      profitLossPercentage: 92.00,
      impliedVolatility: 0.25,
      delta: 0.45,
      gamma: 0.018,
      theta: -0.03,
      vega: 0.08,
      status: 'open',
      openDate: '2024-01-05T09:15:00Z',
      notes: '牛市价差策略'
    },
    {
      id: '4',
      symbol: 'TSLA',
      strategy: 'Iron Condor',
      strategy_id: 'STR-004',
      type: 'spread',
      position_type: 'sell',
      strike: 250,
      expiry: '2024-02-16',
      quantity: 3,
      premium: 4.20,
      currentValue: 2.80,
      profitLoss: -420,
      profitLossPercentage: -33.33,
      impliedVolatility: 0.45,
      delta: 0.05,
      gamma: 0.008,
      theta: 0.02,
      vega: -0.05,
      status: 'open',
      openDate: '2024-01-20T11:45:00Z',
      notes: '中性策略，收取时间价值'
    },
    {
      id: '5',
      symbol: 'MSFT',
      strategy: 'Covered Call',
      strategy_id: 'STR-005',
      type: 'call',
      position_type: 'sell',
      strike: 380,
      expiry: '2024-05-17',
      quantity: 12,
      premium: 6.80,
      currentValue: 8.90,
      profitLoss: 2520,
      profitLossPercentage: 30.88,
      impliedVolatility: 0.20,
      delta: 0.55,
      gamma: 0.012,
      theta: -0.04,
      vega: 0.10,
      status: 'open',
      openDate: '2024-01-08T15:30:00Z',
      notes: '对现有MSFT持仓卖出看涨期权'
    }
  ];

  // 按到期日分组
  const expiryGroups = positions.reduce((groups, position) => {
    const expiry = position.expiry;
    const existing = groups.find(g => g.expiry === expiry);
    
    if (existing) {
      existing.positions.push(position);
      existing.totalValue += position.currentValue * position.quantity * 100;
      existing.totalCost += position.premium * position.quantity * 100;
      existing.profitLoss += position.profitLoss;
    } else {
      const daysToExpiry = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      groups.push({
        expiry,
        daysToExpiry,
        positions: [position],
        totalValue: position.currentValue * position.quantity * 100,
        totalCost: position.premium * position.quantity * 100,
        profitLoss: position.profitLoss
      });
    }
    
    return groups;
  }, [] as OptionsPortfolioData['expiryGroups']);

  // 按策略分组
  const strategies = positions.reduce((strategies, position) => {
    const strategyName = position.strategy;
    const existing = strategies.find(s => s.name === strategyName);
    
    if (existing) {
      existing.positions.push(position);
      existing.totalCost += position.premium * position.quantity * 100;
      existing.currentValue += position.currentValue * position.quantity * 100;
      existing.profitLoss += position.profitLoss;
    } else {
      const totalCost = position.premium * position.quantity * 100;
      const currentValue = position.currentValue * position.quantity * 100;
      const profitLoss = position.profitLoss;
      
      strategies.push({
        id: strategyName.toLowerCase().replace(/\s+/g, '_'),
        name: strategyName,
        description: getStrategyDescription(strategyName),
        category: getStrategyCategory(strategyName),
        riskLevel: getStrategyRiskLevel(strategyName),
        positions: [position],
        totalCost,
        currentValue,
        profitLoss,
        profitLossPercentage: totalCost > 0 ? (profitLoss / totalCost) * 100 : 0,
        maxRisk: calculateMaxRisk(strategyName, [position]),
        maxReward: calculateMaxReward(strategyName, [position])
      });
    }
    
    return strategies;
  }, [] as OptionsStrategy[]);

  // 更新策略的盈亏百分比
  strategies.forEach(strategy => {
    strategy.profitLossPercentage = strategy.totalCost > 0 ? (strategy.profitLoss / strategy.totalCost) * 100 : 0;
  });

  const totalValue = positions.reduce((sum, pos) => sum + (pos.currentValue * pos.quantity * 100), 0);
  const totalCost = positions.reduce((sum, pos) => sum + (pos.premium * pos.quantity * 100), 0);
  const totalProfitLoss = positions.reduce((sum, pos) => sum + pos.profitLoss, 0);
  const totalProfitLossPercentage = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

  return {
    strategies,
    totalValue,
    totalCost,
    totalProfitLoss,
    totalProfitLossPercentage,
    expiryGroups: expiryGroups.sort((a, b) => a.daysToExpiry - b.daysToExpiry)
  };
};

function getStrategyDescription(strategy: string): string {
  const descriptions: Record<string, string> = {
    'Long Call': '买入看涨期权，看好标的上涨',
    'Long Put': '买入看跌期权，看空标的下跌',
    'Covered Call': '持有标的同时卖出看涨期权',
    'Protective Put': '持有标的同时买入看跌期权保护',
    'Bull Call Spread': '牛市看涨价差，限制风险和收益',
    'Bear Put Spread': '熊市看跌价差，看空标的',
    'Iron Condor': '铁鹰策略，中性策略收取时间价值',
    'Butterfly Spread': '蝶式价差，赌标的价格不变',
    'Straddle': '跨式组合，赌标的大幅波动',
    'Strangle': '宽跨式组合，赌标的波动'
  };
  return descriptions[strategy] || '自定义期权策略';
}

function getStrategyCategory(strategy: string): 'bullish' | 'bearish' | 'neutral' | 'volatility' {
  const categories: Record<string, 'bullish' | 'bearish' | 'neutral' | 'volatility'> = {
    'Long Call': 'bullish',
    'Long Put': 'bearish',
    'Covered Call': 'neutral',
    'Protective Put': 'neutral',
    'Bull Call Spread': 'bullish',
    'Bear Put Spread': 'bearish',
    'Iron Condor': 'neutral',
    'Butterfly Spread': 'neutral',
    'Straddle': 'volatility',
    'Strangle': 'volatility'
  };
  return categories[strategy] || 'neutral';
}

function getStrategyRiskLevel(strategy: string): 'low' | 'medium' | 'high' {
  const riskLevels: Record<string, 'low' | 'medium' | 'high'> = {
    'Long Call': 'medium',
    'Long Put': 'medium',
    'Covered Call': 'low',
    'Protective Put': 'low',
    'Bull Call Spread': 'low',
    'Bear Put Spread': 'low',
    'Iron Condor': 'medium',
    'Butterfly Spread': 'medium',
    'Straddle': 'high',
    'Strangle': 'high'
  };
  return riskLevels[strategy] || 'medium';
}

function calculateMaxRisk(strategy: string, positions: OptionsPosition[]): number {
  // 简化的风险计算，实际应根据具体策略计算
  return positions.reduce((sum, pos) => sum + (pos.premium * pos.quantity * 100), 0);
}

function calculateMaxReward(strategy: string, positions: OptionsPosition[]): number {
  // 简化的收益计算，实际应根据具体策略计算
  const riskMultipliers: Record<string, number> = {
    'Long Call': Infinity,
    'Long Put': 10,
    'Covered Call': 2,
    'Protective Put': 1.5,
    'Bull Call Spread': 3,
    'Bear Put Spread': 3,
    'Iron Condor': 2,
    'Butterfly Spread': 4,
    'Straddle': Infinity,
    'Strangle': Infinity
  };
  
  const multiplier = riskMultipliers[strategy] || 2;
  const totalCost = positions.reduce((sum, pos) => sum + (pos.premium * pos.quantity * 100), 0);
  
  return multiplier === Infinity ? Infinity : totalCost * multiplier;
}

export const optionsService: OptionsService = {
  getOptionsData: async (symbol?: string) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const targetSymbol = symbol || 'SPY';
    
    // Generate realistic options data
    const basePrices: Record<string, number> = {
      'SPY': 450 + Math.random() * 50,
      'QQQ': 380 + Math.random() * 40,
      'AAPL': 175 + Math.random() * 25,
      'TSLA': 250 + Math.random() * 100,
      'MSFT': 380 + Math.random() * 40,
      'NVDA': 800 + Math.random() * 200,
      'AMZN': 150 + Math.random() * 30,
      'GOOGL': 140 + Math.random() * 20,
    };
    
    const basePrice = basePrices[targetSymbol] || (150 + Math.random() * 100);
    
    const expiryDates = [30, 60, 90].map(days => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString();
    });
    
    // Generate strikes based on the symbol's typical price range
    const strikeRange = targetSymbol === 'NVDA' ? 50 : targetSymbol === 'SPY' || targetSymbol === 'QQQ' || targetSymbol === 'MSFT' ? 25 : 10;
    const strikes = [];
    for (let i = -4; i <= 4; i++) {
      strikes.push(Math.round((basePrice + i * strikeRange) / 5) * 5); // Round to nearest 5
    }
    
    const quotes = expiryDates.flatMap(expiry => 
      strikes.map(strike => {
        const timeToExpiry = (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
        const moneyness = strike / basePrice;
        
        // Simple Black-Scholes approximation for realistic pricing
        // Different volatilities for different symbols
        const baseVolatilities: Record<string, number> = {
          'SPY': 0.15,
          'QQQ': 0.20,
          'AAPL': 0.25,
          'TSLA': 0.45,
          'MSFT': 0.22,
          'NVDA': 0.35,
          'AMZN': 0.28,
          'GOOGL': 0.24,
        };
        const volatility = (baseVolatilities[targetSymbol] || 0.25) + (Math.random() - 0.5) * 0.1;
        const riskFreeRate = 0.05;
        
        const d1 = (Math.log(basePrice / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / (volatility * Math.sqrt(timeToExpiry));
        const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
        
        const callPrice = Math.max(0.01, basePrice * normalCDF(d1) - strike * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(d2));
        const putPrice = Math.max(0.01, strike * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(-d2) - basePrice * normalCDF(-d1));
        
        // Volume varies by symbol popularity
        const volumeMultipliers: Record<string, number> = {
          'SPY': 3.0,
          'QQQ': 2.5,
          'AAPL': 2.0,
          'TSLA': 1.8,
          'MSFT': 1.5,
          'NVDA': 1.7,
          'AMZN': 1.3,
          'GOOGL': 1.2,
        };
        const volumeMultiplier = volumeMultipliers[targetSymbol] || 1.0;
        
        return {
          expiry,
          strike,
          callPrice: Math.round(callPrice * 100) / 100,
          putPrice: Math.round(putPrice * 100) / 100,
          callIntrinsicValue: Math.max(0, (basePrice - strike) * 100),
          callTimeValue: Math.max(0, (callPrice - Math.max(0, basePrice - strike)) * 100),
          putIntrinsicValue: Math.max(0, (strike - basePrice) * 100),
          putTimeValue: Math.max(0, (putPrice - Math.max(0, strike - basePrice)) * 100),
          callVolume: Math.floor((Math.random() * 1000 + 100) * volumeMultiplier),
          putVolume: Math.floor((Math.random() * 800 + 50) * volumeMultiplier),
          callOpenInterest: Math.floor((Math.random() * 5000 + 500) * volumeMultiplier),
          putOpenInterest: Math.floor((Math.random() * 4000 + 300) * volumeMultiplier),
          callImpliedVol: volatility + (Math.random() - 0.5) * 0.1,
          putImpliedVol: volatility + (Math.random() - 0.5) * 0.1,
          callUrl: `https://finance.yahoo.com/quote/${targetSymbol}${new Date(expiry).getFullYear().toString().slice(-2)}${String(new Date(expiry).getMonth() + 1).padStart(2, '0')}${String(new Date(expiry).getDate()).padStart(2, '0')}C${String(strike).replace('.', '')}`,
          putUrl: `https://finance.yahoo.com/quote/${targetSymbol}${new Date(expiry).getFullYear().toString().slice(-2)}${String(new Date(expiry).getMonth() + 1).padStart(2, '0')}${String(new Date(expiry).getDate()).padStart(2, '0')}P${String(strike).replace('.', '')}`
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
  },

  getAvailableSymbols: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: AVAILABLE_OPTIONS_SYMBOLS, error: null };
  },

  getOptionsPortfolio: async (userId: string) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const portfolioData = generateMockOptionsPortfolio();
    console.log(portfolioData);
    return { data: portfolioData, error: null };
  },

  getAvailableStrategies: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: AVAILABLE_STRATEGIES, error: null };
  },

  saveCustomStrategy: async (strategy: Omit<CustomOptionsStrategy, 'id' | 'createdAt' | 'updatedAt'>) => {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
    
    const newStrategy: CustomOptionsStrategy = {
      ...strategy,
      id: `strategy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    customStrategiesStore.set(newStrategy.id, newStrategy);
    return { data: newStrategy, error: null };
  },

  deleteCustomStrategy: async (strategyId: string) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
    
    if (!customStrategiesStore.has(strategyId)) {
      return { data: null, error: new Error('Strategy not found') };
    }
    
    customStrategiesStore.delete(strategyId);
    return { data: null, error: null };
  },

  getCustomStrategies: async (userId: string) => {
    await new Promise(resolve => setTimeout(resolve, 800)); // Simulate API delay
    
    const userStrategies = Array.from(customStrategiesStore.values())
      .filter(strategy => strategy.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return { data: userStrategies, error: null };
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
}