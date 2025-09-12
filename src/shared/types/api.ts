// API Response Types
export interface ServiceResponse<T> {
  data: T | null;
  error: Error | null;
}

// User Types
export interface User {
  id: string;
  email: string;
  avatar_url: string;
  name: string;
}

// Stock Types
export interface Stock {
  stock_code: string;
  stock_name: string;
  price?: number;
}

export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockPrice {
  stock_code: string;
  stock_name: string;
  price: number;
}

export interface StockConfig {
  stock_code: string;
  category?: string;
  tags?: string[];
}

// Trade Types
export interface Trade {
  id: number;
  user_id: string;
  stock_code: string;
  stock_name?: string;
  operation: 'buy' | 'sell';
  target_price: number;
  quantity: number;
  notes: string;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

// Portfolio Types
export interface Holding {
  stock_code: string;
  stock_name: string;
  quantity: number;
  average_price: number;
  current_price: number;
  total_value: number;
  profit_loss: number;
  profit_loss_percentage: number;
  daily_profit_loss: number;
  daily_profit_loss_percentage: number;
  last_updated: string;
}

export interface TrendData {
  date: string;
  value: number;
  position_value?: number;
  return_rate?: number;
}

// Options Types
export interface OptionQuote {
  expiry: string;
  strike: number;
  callPrice: number;
  putPrice: number;
  callIntrinsicValue?: number;
  callTimeValue?: number;
  putIntrinsicValue?: number;
  putTimeValue?: number;
  callVolume: number;
  putVolume: number;
  callOpenInterest: number;
  putOpenInterest: number;
  callImpliedVol: number;
  putImpliedVol: number;
  callUrl?: string;
  putUrl?: string;
}

export interface OptionSurfacePoint {
  expiry: string;
  strike: number;
  type: 'call' | 'put';
  value: number;
}

export interface OptionsData {
  quotes: OptionQuote[];
  surface: OptionSurfacePoint[];
}

export interface OptionsPosition {
  id: string;
  symbol: string;
  strategy: string;
  type: 'call' | 'put' | 'spread' | 'straddle' | 'strangle' | 'iron_condor' | 'butterfly';
  position_type: 'buy' | 'sell';
  strike: number;
  expiry: string;
  quantity: number;
  premium: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  status: 'open' | 'closed' | 'expired';
  openDate: string;
  closeDate?: string;
  notes?: string;
}

export interface OptionsStrategy {
  id: string;
  name: string;
  description: string;
  category: 'bullish' | 'bearish' | 'neutral' | 'volatility';
  riskLevel: 'low' | 'medium' | 'high';
  positions: OptionsPosition[];
  totalCost: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  maxRisk: number;
  maxReward: number;
}

export interface OptionsPortfolioData {
  strategies: OptionsStrategy[];
  totalValue: number;
  totalCost: number;
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  expiryGroups: Array<{
    expiry: string;
    daysToExpiry: number;
    positions: OptionsPosition[];
    totalValue: number;
    totalCost: number;
    profitLoss: number;
  }>;
}

export interface OptionsService {
  getOptionsData: (symbol?: string) => Promise<ServiceResponse<OptionsData>>;
  getAvailableSymbols: () => Promise<ServiceResponse<string[]>>;
  getOptionsPortfolio: (userId: string) => Promise<ServiceResponse<OptionsPortfolioData>>;
  getAvailableStrategies: () => Promise<ServiceResponse<string[]>>;
  saveCustomStrategy: (strategy: Omit<CustomOptionsStrategy, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ServiceResponse<CustomOptionsStrategy>>;
  deleteCustomStrategy: (strategyId: string) => Promise<ServiceResponse<void>>;
  getCustomStrategies: (userId: string) => Promise<ServiceResponse<CustomOptionsStrategy[]>>;
}

export interface CustomOptionsStrategy {
  id: string;
  userId: string;
  name: string;
  description: string;
  positions: OptionsPosition[];
  createdAt: string;
  updatedAt: string;
}

// Analysis Types
export interface StockAnalysis {
  stock_code: string;
  stock_name: string;
  analysis_time: string;
  technical_analysis: {
    trend: 'bullish' | 'bearish' | 'neutral';
    support_level: number;
    resistance_level: number;
    rsi: number;
    macd: {
      signal: 'buy' | 'sell' | 'hold';
      value: number;
    };
    moving_averages: {
      ma5: number;
      ma10: number;
      ma20: number;
      ma50: number;
    };
  };
  fundamental_analysis: {
    pe_ratio: number;
    pb_ratio: number;
    dividend_yield: number;
    market_cap: number;
    revenue_growth: number;
    profit_margin: number;
  };
  sentiment_analysis: {
    score: number;
    news_sentiment: 'positive' | 'negative' | 'neutral';
    social_sentiment: 'positive' | 'negative' | 'neutral';
    analyst_rating: 'buy' | 'sell' | 'hold';
  };
  risk_metrics: {
    volatility: number;
    beta: number;
    var_95: number;
    sharpe_ratio: number;
  };
  recommendations: Array<{
    type: 'buy' | 'sell' | 'hold' | 'reduce' | 'increase';
    reason: string;
    confidence: number;
    target_price?: number;
    stop_loss?: number;
  }>;
}

export interface PortfolioAnalysis {
  user_id: string;
  analysis_time: string;
  content?: string;
  overall_metrics: {
    total_return: number;
    annualized_return: number;
    volatility: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
  };
  sector_allocation: Array<{
    sector: string;
    weight: number;
    return: number;
    risk_contribution: number;
  }>;
  risk_analysis: {
    portfolio_beta: number;
    var_95: number;
    correlation_matrix: Array<{
      stock1: string;
      stock2: string;
      correlation: number;
    }>;
    concentration_risk: number;
  };
  performance_attribution: Array<{
    stock_code: string;
    contribution_to_return: number;
    weight: number;
    alpha: number;
  }>;
  rebalancing_suggestions: Array<{
    stock_code: string;
    current_weight: number;
    suggested_weight: number;
    action: 'buy' | 'sell' | 'hold';
    reason: string;
  }>;
  market_outlook: {
    trend: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    key_factors: string[];
    time_horizon: '1M' | '3M' | '6M' | '1Y';
  };
}

// Upload Types
export interface UploadResponse {
  uuid: string;
  filename: string;
  uploadTime: string;
  account: {
    broker: string;
    branch: string;
    username: string;
    account_no: string;
  };
  balance: {
    currency: string;
    available: number;
    withdrawable: number;
    total_asset: number;
    market_value: number;
    timestamp: string;
  };
  holdings: Array<{
    stock_code: string;
    stock_name: string;
    quantity: number;
    available_quantity: number;
    price: number;
    cost: number;
    market_value: number;
    profit: number;
    profit_ratio: number;
    today_profit: number;
    today_profit_ratio: number;
    currency: string;
    timestamp: string;
  }>;
}

// Operations Types
export interface Operation {
  func_name: string;
  call_time: string;
  result: 'success' | 'failed';
}