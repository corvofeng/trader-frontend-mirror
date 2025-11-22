import type { OptionsService, OptionsPortfolioData, OptionsPosition, OptionsStrategy, RatioSpreadPlanResult } from '../types';
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

// 初始化一些示例自定义策略
const initializeCustomStrategies = () => {
  const sampleStrategy: CustomOptionsStrategy = {
    id: 'sample-strategy-1',
    userId: 'mock-user-id',
    name: '示例牛市价差策略',
    description: '买入低行权价Call，卖出高行权价Call的牛市策略',
    strategyType: 'bull_call_spread',
    strategyCategory: 'bullish',
    riskLevel: 'low',
    isPresetStrategy: true,
    presetStrategyInfo: {
      id: 'bull_call_spread',
      name: '牛市看涨价差',
      description: '买入低行权价看涨期权，卖出高行权价看涨期权',
      category: 'bullish',
      minPositions: 2,
      maxPositions: 2,
      requiredTypes: ['call', 'call'],
      requiredActions: ['buy', 'sell']
    },
    positions: [
      {
        id: 'pos-1',
        symbol: 'SPY',
        strategy: '牛市看涨价差',
        strategy_id: 'sample-strategy-1',
        type: 'call',
        position_type: 'buy',
        strike: 440,
        expiry: '2024-03-15',
        quantity: 5,
        selectedQuantity: 3, // 在策略中选择的数量
        premium: 12.50,
        currentValue: 15.20,
        profitLoss: (15.20 - 12.50) * 3 * 100, // 基于选择数量计算
        profitLossPercentage: ((15.20 - 12.50) / 12.50) * 100,
        impliedVolatility: 0.18,
        delta: 0.65,
        gamma: 0.02,
        theta: -0.05,
        vega: 0.12,
        status: 'open',
        openDate: '2024-01-15T10:30:00Z',
        notes: '买入腿',
        // 新增：策略腿部详细信息
        contract_code: 'SPY20240315C440',
        contract_name: 'SPY 440 认购',
        contract_type: '认购',
        contract_type_zh: 'call',
        contract_strike_price: 440,
        position_type_zh: '权利',
        leg_quantity: 3,
        cost_price: 12.50
      },
      {
        id: 'pos-2',
        symbol: 'SPY',
        strategy: '牛市看涨价差',
        strategy_id: 'sample-strategy-1',
        type: 'call',
        position_type: 'sell',
        strike: 460,
        expiry: '2024-03-15',
        quantity: 5,
        selectedQuantity: 3, // 在策略中选择的数量
        premium: 6.80,
        currentValue: 8.10,
        profitLoss: (6.80 - 8.10) * 3 * 100, // 卖出期权的盈亏计算
        profitLossPercentage: ((6.80 - 8.10) / 6.80) * 100,
        impliedVolatility: 0.16,
        delta: 0.35,
        gamma: 0.015,
        theta: -0.03,
        vega: 0.08,
        status: 'open',
        openDate: '2024-01-15T10:30:00Z',
        notes: '卖出腿',
        // 新增：策略腿部详细信息
        contract_code: 'SPY20240315C460',
        contract_name: 'SPY 460 认购',
        contract_type: '认购',
        contract_type_zh: 'call',
        contract_strike_price: 460,
        position_type_zh: '义务',
        leg_quantity: 3,
        cost_price: 6.80
      }
    ],
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z'
  };
  
  customStrategiesStore.set(sampleStrategy.id, sampleStrategy);
};

// 初始化示例数据
initializeCustomStrategies();

function makeStrategy(name: string, positions: OptionsPosition[]): OptionsStrategy {
  const totalCost = positions.reduce((sum, p) => sum + p.premium * p.quantity * 100, 0);
  const currentValue = positions.reduce((sum, p) => sum + p.currentValue * p.quantity * 100, 0);
  const profitLoss = positions.reduce((sum, p) => sum + p.profitLoss, 0);
  return {
    id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    description: getStrategyDescription(name),
    category: getStrategyCategory(name),
    riskLevel: getStrategyRiskLevel(name),
    positions,
    totalCost,
    currentValue,
    profitLoss,
    profitLossPercentage: totalCost > 0 ? (profitLoss / totalCost) * 100 : 0,
    maxRisk: calculateMaxRisk(name, positions),
    maxReward: calculateMaxReward(name, positions)
  };
}

function computeExpiryGroups(positions: OptionsPosition[]): OptionsPortfolioData['expiryGroups'] {
  const groups = positions.reduce((acc, position) => {
    const existing = acc.find(g => g.expiry === position.expiry);
    if (existing) {
      existing.positions.push(position);
      existing.totalValue += position.currentValue * position.quantity * 100;
      existing.totalCost += position.premium * position.quantity * 100;
      existing.profitLoss += position.profitLoss;
    } else {
      const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      acc.push({
        expiry: position.expiry,
        daysToExpiry,
        positions: [position],
        totalValue: position.currentValue * position.quantity * 100,
        totalCost: position.premium * position.quantity * 100,
        profitLoss: position.profitLoss
      });
    }
    return acc;
  }, [] as OptionsPortfolioData['expiryGroups']);
  return groups.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

function computeTotals(positions: OptionsPosition[]) {
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue * p.quantity * 100, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.premium * p.quantity * 100, 0);
  const totalProfitLoss = positions.reduce((sum, p) => sum + p.profitLoss, 0);
  const totalProfitLossPercentage = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;
  return { totalValue, totalCost, totalProfitLoss, totalProfitLossPercentage };
}

function buildComplexStrategies(positions: OptionsPosition[]): OptionsStrategy[] {
  const byName = new Map<string, OptionsPosition[]>();
  positions.forEach(p => {
    const name = p.strategy;
    const arr = byName.get(name) || [];
    arr.push(p);
    byName.set(name, arr);
  });
  const strategies: OptionsStrategy[] = [];
  byName.forEach((legs, name) => {
    const isComplex = legs.some(l => l.type !== 'call' && l.type !== 'put');
    if (isComplex) {
      strategies.push(makeStrategy(name, legs));
    }
  });
  return strategies;
}

function buildExpiryBuckets(positions: OptionsPosition[]): OptionsPortfolioData['expiryBuckets'] {
  const positionsByExpiry = new Map<string, OptionsPosition[]>();
  positions.forEach(p => {
    const arr = positionsByExpiry.get(p.expiry) || [];
    arr.push(p);
    positionsByExpiry.set(p.expiry, arr);
  });

  const buckets: OptionsPortfolioData['expiryBuckets'] = [];
  positionsByExpiry.forEach((legs, expiry) => {
    const daysToExpiry = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const single = legs.filter(l => l.type === 'call' || l.type === 'put');
    const complexStrategies = buildComplexStrategies(legs);
    buckets.push({ expiry, daysToExpiry, single, complex: complexStrategies });
  });
  return buckets.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

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
      notes: '看好市场短期上涨',
      // 策略腿部详细信息
      contract_code: 'SPY20240315C450',
      contract_name: 'SPY 450 认购',
      contract_type: '认购',
      contract_type_zh: 'call',
      contract_strike_price: 450,
      position_type_zh: '权利',
      leg_quantity: 10,
      cost_price: 5.50
    },
    // 追加：同一到期日(2024-03-15)下的多组 Call / Put 期权，便于多选构建策略
    {
      id: '6',
      symbol: 'SPY',
      strategy: 'Long Call',
      strategy_id: 'STR-006',
      type: 'call',
      position_type: 'buy',
      strike: 455,
      expiry: '2024-03-15',
      quantity: 6,
      premium: 6.20,
      currentValue: 7.10,
      profitLoss: (7.10 - 6.20) * 6 * 100,
      profitLossPercentage: ((7.10 - 6.20) / 6.20) * 100,
      impliedVolatility: 0.19,
      delta: 0.58,
      gamma: 0.019,
      theta: -0.045,
      vega: 0.11,
      status: 'open',
      openDate: '2024-01-18T10:00:00Z',
      notes: '同到期增补的看涨仓位',
      contract_code: 'SPY20240315C455',
      contract_name: 'SPY 455 认购',
      contract_type: '认购',
      contract_type_zh: 'call',
      contract_strike_price: 455,
      position_type_zh: '权利',
      leg_quantity: 6,
      cost_price: 6.20
    },
    {
      id: '7',
      symbol: 'SPY',
      strategy: 'Short Call',
      strategy_id: 'STR-007',
      type: 'call',
      position_type: 'sell',
      strike: 465,
      expiry: '2024-03-15',
      quantity: 4,
      premium: 4.80,
      currentValue: 5.60,
      profitLoss: (4.80 - 5.60) * 4 * 100,
      profitLossPercentage: ((4.80 - 5.60) / 4.80) * 100,
      impliedVolatility: 0.17,
      delta: 0.32,
      gamma: 0.013,
      theta: -0.028,
      vega: 0.07,
      status: 'open',
      openDate: '2024-01-18T10:30:00Z',
      notes: '同到期的卖出看涨',
      contract_code: 'SPY20240315C465',
      contract_name: 'SPY 465 认购',
      contract_type: '认购',
      contract_type_zh: 'call',
      contract_strike_price: 465,
      position_type_zh: '义务',
      leg_quantity: 4,
      cost_price: 4.80
    },
    {
      id: '8',
      symbol: 'SPY',
      strategy: 'Long Put',
      strategy_id: 'STR-008',
      type: 'put',
      position_type: 'buy',
      strike: 440,
      expiry: '2024-03-15',
      quantity: 5,
      premium: 5.10,
      currentValue: 4.70,
      profitLoss: (4.70 - 5.10) * 5 * 100,
      profitLossPercentage: ((4.70 - 5.10) / 5.10) * 100,
      impliedVolatility: 0.23,
      delta: -0.38,
      gamma: 0.017,
      theta: -0.06,
      vega: 0.13,
      status: 'open',
      openDate: '2024-01-18T11:00:00Z',
      notes: '同到期的看跌买入',
      contract_code: 'SPY20240315P440',
      contract_name: 'SPY 440 认沽',
      contract_type: '认沽',
      contract_type_zh: 'put',
      contract_strike_price: 440,
      position_type_zh: '权利',
      leg_quantity: 5,
      cost_price: 5.10
    },
    {
      id: '9',
      symbol: 'SPY',
      strategy: 'Short Put',
      strategy_id: 'STR-009',
      type: 'put',
      position_type: 'sell',
      strike: 430,
      expiry: '2024-03-15',
      quantity: 3,
      premium: 3.90,
      currentValue: 3.20,
      profitLoss: (3.90 - 3.20) * 3 * 100,
      profitLossPercentage: ((3.90 - 3.20) / 3.90) * 100,
      impliedVolatility: 0.21,
      delta: -0.22,
      gamma: 0.011,
      theta: -0.025,
      vega: 0.06,
      status: 'open',
      openDate: '2024-01-18T11:20:00Z',
      notes: '同到期的卖出看跌',
      contract_code: 'SPY20240315P430',
      contract_name: 'SPY 430 认沽',
      contract_type: '认沽',
      contract_type_zh: 'put',
      contract_strike_price: 430,
      position_type_zh: '义务',
      leg_quantity: 3,
      cost_price: 3.90
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
      notes: '为现有QQQ持仓购买保护',
      // 策略腿部详细信息
      contract_code: 'QQQ20240216P380',
      contract_name: 'QQQ 380 认沽',
      contract_type: '认沽',
      contract_type_zh: 'put',
      contract_strike_price: 380,
      position_type_zh: '权利',
      leg_quantity: 5,
      cost_price: 8.30
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
      notes: '牛市价差策略',
      // 策略腿部详细信息
      contract_code: 'AAPL20240419C175',
      contract_name: 'AAPL 175 认购价差',
      contract_type: '认购',
      contract_type_zh: 'call',
      contract_strike_price: 175,
      position_type_zh: '权利',
      leg_quantity: 8,
      cost_price: 2.50
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
      notes: '中性策略，收取时间价值',
      // 策略腿部详细信息
      contract_code: 'TSLA20240216IC250',
      contract_name: 'TSLA 250 铁鹰',
      contract_type: '价差',
      contract_type_zh: 'spread',
      contract_strike_price: 250,
      position_type_zh: '义务',
      leg_quantity: 3,
      cost_price: 4.20
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
      notes: '对现有MSFT持仓卖出看涨期权',
      // 策略腿部详细信息
      contract_code: 'MSFT20240517C380',
      contract_name: 'MSFT 380 备兑认购',
      contract_type: '认购',
      contract_type_zh: 'call',
      contract_strike_price: 380,
      position_type_zh: '备兑',
      leg_quantity: 12,
      cost_price: 6.80
    },
    {
      id: '6',
      symbol: 'SPY',
      strategy: 'Straddle',
      strategy_id: 'STR-006',
      type: 'straddle',
      position_type: 'buy',
      strike: 450,
      expiry: '2024-03-15',
      quantity: 2,
      premium: 10.50,
      currentValue: 12.00,
      profitLoss: (12.00 - 10.50) * 2 * 100,
      profitLossPercentage: ((12.00 - 10.50) / 10.50) * 100,
      impliedVolatility: 0.30,
      delta: 0.00,
      gamma: 0.010,
      theta: -0.02,
      vega: 0.15,
      status: 'open',
      openDate: '2024-01-12T10:00:00Z',
      notes: '在 2024-03-15 到期内添加复杂策略用于调试',
      // 策略腿部详细信息
      contract_code: 'SPY20240315SD450',
      contract_name: 'SPY 450 跨式',
      contract_type: '价差',
      contract_type_zh: 'spread',
      contract_strike_price: 450,
      position_type_zh: '权利',
      leg_quantity: 2,
      cost_price: 10.50
    },
    {
      id: '7',
      symbol: 'MSFT',
      strategy: 'Butterfly Spread',
      strategy_id: 'STR-007',
      type: 'butterfly',
      position_type: 'buy',
      strike: 380,
      expiry: '2024-05-17',
      quantity: 4,
      premium: 1.20,
      currentValue: 1.50,
      profitLoss: (1.50 - 1.20) * 4 * 100,
      profitLossPercentage: ((1.50 - 1.20) / 1.20) * 100,
      impliedVolatility: 0.22,
      delta: 0.10,
      gamma: 0.020,
      theta: -0.01,
      vega: 0.05,
      status: 'open',
      openDate: '2024-01-22T12:00:00Z',
      notes: '在 2024-05-17 到期内添加复杂策略用于调试',
      // 策略腿部详细信息
      contract_code: 'MSFT20240517BF380',
      contract_name: 'MSFT 380 蝶式价差',
      contract_type: '价差',
      contract_type_zh: 'spread',
      contract_strike_price: 380,
      position_type_zh: '权利',
      leg_quantity: 4,
      cost_price: 1.20
    }
  ];
  const expiryBuckets = buildExpiryBuckets(positions);
  const { totalValue, totalCost, totalProfitLoss, totalProfitLossPercentage } = computeTotals(positions);
  return {
    strategies: [],
    singleLegPositions: [],
    complexStrategies: [],
    expiryBuckets,
    totalValue,
    totalCost,
    totalProfitLoss,
    totalProfitLossPercentage,
    expiryGroups: []
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

  getOptionsPortfolio: async (userId: string, accountId?: string | null) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const portfolioData = generateMockOptionsPortfolio();
    if (accountId) {
      portfolioData.totalValue = Math.round(portfolioData.totalValue * 1.0);
      portfolioData.totalCost = Math.round(portfolioData.totalCost * 1.0);
    }
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
  ,
  getRatioSpreadPlans: async (symbol?: string, accountId?: string | null) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const sample: RatioSpreadPlanResult[] = [
      {
        plan: {
          expiry: '2026-06-24',
          option_type: 'put',
          lower_strike: 1.35,
          upper_strike: 1.4,
          target_spread: 10,
          cover_contracts_needed: 3,
          label: `2026-06-24-put-1.35-1.40${symbol ? `-${symbol}` : ''}${accountId ? `-${accountId}` : ''}`
        },
        current_spread: 0,
        leverage: 4,
        cover_contracts_needed: 3,
        action: 'open',
        reason: 'leverage 4 >= threshold 4',
        best_net_premium: 0.0338,
        buy_price: 0.1894,
        sell_price: 0.1505,
        analysis: {
          strike_type: 'put',
          buy_strike: { code: '10010360', name: '科创50沽6月1400', price: 0.1865, option_type: 'put', strike_price: 1.4, expiry: '2026-06-24' },
          sell_strike: { code: '10010359', name: '科创50沽6月1350', price: 0.1561, option_type: 'put', strike_price: 1.35, expiry: '2026-06-24' },
          buy_price: 0.1894,
          sell_price: 0.1505,
          buy_strike_price: 1.4,
          sell_strike_price: 1.35,
          buy_count: 3,
          sell_count: 4,
          best_net_premium: 0.0338,
          cover_contracts_needed: 3,
          到期日: '2026-06-24'
        }
      }
    ];
    return { data: sample, error: null };
  }
  ,
  saveRatioSpreadPlan: async (plan) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: { ...plan, saved: true }, error: null };
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