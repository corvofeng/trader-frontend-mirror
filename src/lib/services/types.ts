export interface User {
  id: string;
  email: string;
  avatar_url: string;
  name: string;
}

export interface Stock {
  stock_code: string;
  stock_name: string;
  price?: number;
}

export interface StockConfig {
  stock_code: string;
  category?: string;
  tags?: string[];
}

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

export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TrendData {
  date: string;
  value: number;
  position_value?: number; // 新增：持仓市值
  return_rate?: number; // 新增：收益率
}

export interface CurrencyConfig {
  symbol: string;
  position: 'before' | 'after';
  separator: string;
}

export interface ServiceResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface StockPrice {
  stock_code: string;
  stock_name: string;
  price: number;
}

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

// Stock Analysis Types
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
    score: number; // -1 to 1
    news_sentiment: 'positive' | 'negative' | 'neutral';
    social_sentiment: 'positive' | 'negative' | 'neutral';
    analyst_rating: 'buy' | 'sell' | 'hold';
  };
  risk_metrics: {
    volatility: number;
    beta: number;
    var_95: number; // Value at Risk 95%
    sharpe_ratio: number;
  };
  recommendations: Array<{
    type: 'buy' | 'sell' | 'hold' | 'reduce' | 'increase';
    reason: string;
    confidence: number; // 0-100
    target_price?: number;
    stop_loss?: number;
  }>;
}

export interface PortfolioAnalysis {
  user_id: string;
  analysis_time: string;
  content?: string; // 新增：支持markdown格式的分析报告内容
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

export interface StockService {
  getStockName: (stockCode: string) => string;
  getStocks: () => Promise<ServiceResponse<Stock[]>>;
  searchStocks: (query: string) => Promise<ServiceResponse<Stock[]>>;
  getStockData: (symbol: string) => Promise<ServiceResponse<StockData[]>>;
  getCurrentPrice: (symbol: string) => Promise<ServiceResponse<StockPrice>>;
}

export interface StockConfigService {
  getStockConfigs: () => Promise<ServiceResponse<StockConfig[]>>;
  updateStockConfig: (config: StockConfig) => Promise<ServiceResponse<StockConfig>>;
  deleteStockConfig: (stockCode: string) => Promise<ServiceResponse<void>>;
}

export interface AuthService {
  getUser: () => Promise<ServiceResponse<{ user: User | null }>>;
  signIn: () => Promise<ServiceResponse<{ user: User }>>;
  signOut: () => Promise<ServiceResponse<void>>;
}

export interface TradeService {
  getTrades: (userId: string, stockCode?: string, status?: string) => Promise<ServiceResponse<Trade[]>>;
  createTrade: (trade: Omit<Trade, 'id' | 'created_at'>) => Promise<ServiceResponse<Trade>>;
  updateTrade: (trade: Trade) => Promise<ServiceResponse<Trade>>;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  broker?: string;
  account_no?: string;
  is_default: boolean;
  currency: string;
  created_at?: string;
  updated_at?: string;
}

export interface AccountService {
  getAccounts: (userId: string) => Promise<ServiceResponse<Account[]>>;
  createAccount: (account: Omit<Account, 'id' | 'created_at' | 'updated_at'>) => Promise<ServiceResponse<Account>>;
  updateAccount: (account: Account) => Promise<ServiceResponse<Account>>;
  deleteAccount: (accountId: string) => Promise<ServiceResponse<void>>;
  setDefaultAccount: (userId: string, accountId: string) => Promise<ServiceResponse<void>>;
}

export interface PortfolioService {
  getHoldings: (userId: string, accountId?: string) => Promise<ServiceResponse<Holding[]>>;
  getRecentTrades: (userId: string, startDate: string, endDate: string, accountId?: string) => Promise<ServiceResponse<Trade[]>>;
  getTrendData: (userId: string, startDate: string, endDate: string, accountId?: string) => Promise<ServiceResponse<TrendData[]>>;
  getAccounts: (userId: string) => Promise<ServiceResponse<Account[]>>;
  // UUID-based methods for shared portfolios
  getHoldingsByUuid: (uuid: string) => Promise<ServiceResponse<Holding[]>>;
  getRecentTradesByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<Trade[]>>;
  getTrendDataByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<TrendData[]>>;
}

export interface AnalysisService {
  getStockAnalysis: (stockCode: string) => Promise<ServiceResponse<StockAnalysis>>;
  getPortfolioAnalysis: (userId: string, accountId?: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  getPortfolioAnalysisByUuid: (uuid: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  refreshStockAnalysis: (stockCode: string) => Promise<ServiceResponse<StockAnalysis>>;
  refreshPortfolioAnalysis: (userId: string, accountId?: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  refreshPortfolioAnalysisByUuid: (uuid: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
}

export interface CurrencyService {
  getCurrency: () => Promise<ServiceResponse<string>>;
  setCurrency: (currency: string) => Promise<ServiceResponse<void>>;
}

export interface Operation {
  func_name: string;
  call_time: string;
  result: 'success' | 'failed';
}

export interface OperationService {
  getOperations: (startDate: string, endDate: string) => Promise<ServiceResponse<Operation[]>>;
}

export interface UploadService {
  uploadPortfolioFile: (file: File) => Promise<UploadResponse>;
}

export interface Services {
  authService: AuthService;
  tradeService: TradeService;
  stockService: StockService;
  stockConfigService: StockConfigService;
  portfolioService: PortfolioService;
  currencyService: CurrencyService;
  operationService: OperationService;
  analysisService: AnalysisService;
  uploadService: UploadService;
  optionsService: OptionsService;
  accountService: AccountService;
}

// Options Service Types
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
  // 用户持仓相关（可选）：展示在期权链中的我的买入/卖出数量
  myCallBuyQty?: number;
  myCallSellQty?: number;
  myPutBuyQty?: number;
  myPutSellQty?: number;
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

// Options Portfolio Types
export interface OptionsPosition {
  id: string;
  symbol: string;
  strategy: string;
  strategy_id?: string;
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
  selectedQuantity?: number; // 在策略中选择的数量
  // 新增：策略腿部详细信息
  contract_code?: string;
  contract_name?: string;
  contract_type?: string; // 认购/认沽
  contract_type_zh?: string; // call/put
  contract_strike_price?: number; // 行权价格
  position_type_zh?: string; // 权利/义务/备兑
  leg_quantity?: number; // 该leg对应的持仓数量
  cost_price?: number; // 成本价格
}

// 策略腿部结构体
export interface OptionStrategyLeg {
  contract_code: string;
  contract_name: string;
  contract_type: string; // 认购/认沽
  contract_type_zh: string; // call/put
  contract_strike_price: number; // 行权价格
  position_type: string; // buy/sell
  position_type_zh: string; // 权利/义务/备兑
  leg_quantity: number; // 该leg对应的持仓数量
  cost_price: number; // 成本价格
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
  strategyType?: string; // 策略类型ID
  isPresetStrategy?: boolean; // 是否为预设策略
  createdAt?: string; // 创建时间
  updatedAt?: string; // 更新时间
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
  customStrategies?: CustomOptionsStrategy[]; // 自定义策略列表
}
export interface OptionsService {
  getOptionsData: (symbol?: string) => Promise<ServiceResponse<OptionsData>>;
  getAvailableSymbols: () => Promise<ServiceResponse<string[]>>;
  getOptionsPortfolio: (userId: string) => Promise<ServiceResponse<OptionsPortfolioData>>;
  getAvailableStrategies: () => Promise<ServiceResponse<string[]>>;
  saveCustomStrategy: (
    strategy: CustomOptionsStrategy | Omit<CustomOptionsStrategy, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<ServiceResponse<CustomOptionsStrategy>>;
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
  strategyType?: string; // 策略类型ID
  strategyCategory?: 'bullish' | 'bearish' | 'neutral' | 'volatility'; // 策略分类
  riskLevel?: 'low' | 'medium' | 'high'; // 风险等级
  isPresetStrategy?: boolean; // 是否为预设策略
  presetStrategyInfo?: { // 预设策略信息
    id: string;
    name: string;
    description: string;
    category: 'bullish' | 'bearish' | 'neutral' | 'volatility';
    minPositions: number;
    maxPositions: number;
    requiredTypes: string[];
    requiredActions: string[];
  };
}