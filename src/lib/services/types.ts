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
  account_alias?: string;
  stock_code: string;
  stock_name?: string;
  operation: 'buy' | 'sell';
  target_price: number;
  quantity: number;
  notes: string;
  status: 'pending' | 'completed' | 'cancelled';
  execute_immediately?: boolean;
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

export interface PortfolioData {
  positions: Holding[];
  is_snapshot: boolean;
  balance?: number;
  available?: number;
  frozen?: number;
  fetch_balance?: unknown;
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

export interface PortfolioKlinePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  value?: number;
  adjusted_open?: number;
  adjusted_high?: number;
  adjusted_low?: number;
  adjusted_close?: number;
  adjusted_value?: number;
  nav_open?: number;
  nav_high?: number;
  nav_low?: number;
  nav_close?: number;
  nav_value?: number;
  position_open?: number;
  position_high?: number;
  position_low?: number;
  position_close?: number;
  position_value?: number;
  cash_flow?: number;
  cash_flow_deposit?: number;
  cash_flow_withdraw?: number;
  cash_flow_adjustment?: number;
}

export interface PortfolioKlineMetrics {
  startDate: string;
  endDate: string;
  days: number;
  calculationStartDate: string;
  calculationEndDate: string;
  calculationDays: number;
  observations: number;
  tradingDays: number;
  riskFreeRate: number;
  totalReturn: number;
  annualizedReturn: number;
  annualizedMethod: 'period_return' | 'cagr';
  annualizedCalculationStartDate: string;
  annualizedCalculationEndDate: string;
  annualizedCalculationDays: number;
  annualizedTotalReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  bestDayReturn: number;
  worstDayReturn: number;
  positiveDayRatio: number;
}

export interface CurrencyConfig {
  symbol: string;
  position: 'before' | 'after';
  separator: string;
}

export interface ServiceResponse<T> {
  data: T | null;
  error: Error | null;
  isSnapshot?: boolean;
  meta?: unknown;
}

export interface Notice {
  notice_uuid: string;
  title: string;
  content: string;
  account_id: string | null;
  is_acked?: boolean;
  acked_at?: string | null;
  acker?: string | null;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolver: string | null;
  extra_data?: Record<string, unknown>;
}

export interface NoticeListResponse {
  data: Notice[];
  success: boolean;
}

export interface NoticeActionResponse {
  success: boolean;
  data?: Notice;
  message?: string;
}

export interface NoticeService {
  listNotices: () => Promise<ServiceResponse<Notice[]>>;
  getNotice: (noticeUuid: string) => Promise<ServiceResponse<Notice>>;
  ackNotice: (noticeUuid: string, extraData?: Record<string, unknown>) => Promise<ServiceResponse<Notice | null>>;
  resolveNotice: (noticeUuid: string, extraData?: Record<string, unknown>) => Promise<ServiceResponse<Notice | null>>;
}

export interface StockPrice {
  stock_code: string;
  stock_name: string;
  price: number;
  last_price?: number;
  pre_close?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  amount?: number;
  bid?: number;
  ask?: number;
  bid_price?: (number | null | undefined)[];
  bid_prices?: (number | null | undefined)[];
  bid_vol?: (number | null | undefined)[];
  bid_volume?: (number | null | undefined)[];
  ask_price?: (number | null | undefined)[];
  ask_prices?: (number | null | undefined)[];
  ask_vol?: (number | null | undefined)[];
  ask_volume?: (number | null | undefined)[];
}

export interface StockOrder {
  contract_code_full?: string;
  instrument_id?: string;
  instrument_name?: string;
  limit_price?: number;
  traded_price?: number;
  op_type?: number;
  op_type_name?: string;
  op_type_name_zh?: string;
  order_status?: number;
  order_status_name?: string;
  order_time?: string;
  order_sys_id?: string;
  remark?: string;
  error_msg?: string;
  volume_total_original?: number;
  volume_traded?: number;
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
  getStockHistoryRaw: (symbol: string, options?: { signal?: AbortSignal }) => Promise<ServiceResponse<Record<string, unknown>[]>>;
  getStockTicksRaw: (symbol: string, options?: { signal?: AbortSignal }) => Promise<ServiceResponse<Record<string, unknown>[]>>;
  getStockGtimgRaw: (symbol: string, options?: { signal?: AbortSignal }) => Promise<ServiceResponse<Record<string, unknown>[]>>;
  getCurrentPrice: (symbol: string) => Promise<ServiceResponse<StockPrice>>;
  getTodayOrders: (accountAlias: string) => Promise<ServiceResponse<StockOrder[]>>;
  getTradingCalendar: (year: number) => Promise<ServiceResponse<string[]>>;
  createStockPriceWebSocketClient?: (handlers?: StockPriceWebSocketHandlers) => StockPriceWebSocketClient;
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
  getTrades: (userId: string, stockCode?: string, status?: string, accountAlias?: string) => Promise<ServiceResponse<Trade[]>>;
  createTrade: (trade: Omit<Trade, 'id' | 'created_at' | 'updated_at'>) => Promise<ServiceResponse<Trade>>;
  updateTrade: (trade: Trade) => Promise<ServiceResponse<Trade>>;
}

export interface Account {
  id: string;
  user_id: string;
  alias?: string;
  name: string;
  description?: string;
  broker?: string;
  account_no?: string;
  is_default: boolean;
  currency: string;
  created_at?: string;
  updated_at?: string;
}

export interface AdminAccountStatusItem {
  account_id_alias: string;
  account_type: string;
  alias: string;
  last_check: string;
  last_snapshot_at?: string;
  last_trading_day?: string;
  message: string;
  status: string;
}

export interface AccountService {
  getAccounts: (userId: string) => Promise<ServiceResponse<Account[]>>;
  getOptionsAccounts: (userId: string) => Promise<ServiceResponse<Account[]>>;
  createAccount: (account: Omit<Account, 'id' | 'created_at' | 'updated_at'>) => Promise<ServiceResponse<Account>>;
  updateAccount: (account: Account) => Promise<ServiceResponse<Account>>;
  deleteAccount: (accountId: string) => Promise<ServiceResponse<void>>;
  setDefaultAccount: (userId: string, accountId: string) => Promise<ServiceResponse<void>>;
  getAdminAccountsStatus: (options?: { signal?: AbortSignal }) => Promise<ServiceResponse<AdminAccountStatusItem[]>>;
}

export interface CashFlowItem {
  id: number;
  account_alias?: string;
  amount: string | number;
  benefit_note?: string | null;
  counterparty?: string | null;
  created_at: string;
  currency: string;
  description?: string | null;
  external_id?: string | null;
  flow_date: string;
  flow_type: 'deposit' | 'withdraw' | string;
  source?: string | null;
  updated_at: string;
}

export interface CashFlowsResponseData {
  account_alias: string;
  items: CashFlowItem[];
}

export interface CreateCashFlowPayload {
  flow_date: string;
  flow_type: string;
  amount: string | number;
  currency?: string;
  counterparty?: string | null;
  description?: string | null;
  benefit_note?: string | null;
  external_id?: string | null;
  source?: string | null;
}

export interface UpdateCashFlowPayload {
  flow_date?: string;
  flow_type?: string;
  amount?: string | number;
  currency?: string;
  counterparty?: string | null;
  description?: string | null;
  benefit_note?: string | null;
  external_id?: string | null;
  source?: string | null;
}

export interface CashFlowService {
  getCashFlows: (accountAlias: string) => Promise<ServiceResponse<CashFlowsResponseData>>;
  getCashFlow: (accountAlias: string, id: number | string) => Promise<ServiceResponse<CashFlowItem>>;
  createCashFlow: (accountAlias: string, payload: CreateCashFlowPayload) => Promise<ServiceResponse<CashFlowItem>>;
  updateCashFlow: (accountAlias: string, id: number | string, payload: UpdateCashFlowPayload) => Promise<ServiceResponse<CashFlowItem>>;
  deleteCashFlow: (accountAlias: string, id: number | string) => Promise<ServiceResponse<void>>;
}

export interface PortfolioHistoryItem {
  id?: number;
  date: string;
  capital_inflow: number;
  allocation_flow: number;
  total_inflow: number;
  reported_total_inflow: number | null;
  total_inflow_difference?: number | null;
  pure_cash_investment: number;
  occupied_assets: number;
  stock_lots_delta?: number;
  stock_lots?: number;
  option_account_assets: number | null;
  reported_total_assets: number | null;
  calculated_total_assets: number | null;
  total_assets_difference?: number | null;
  reported_profit: number | null;
  calculated_profit: number | null;
  profit_difference?: number | null;
  currency?: string;
  source?: string;
  external_id?: string | null;
  note?: string | null;
}

export interface PortfolioHistoryData {
  account_alias: string;
  count: number;
  history: PortfolioHistoryItem[];
}

export interface PortfolioService {
  getHoldings: (userId: string, accountId?: string) => Promise<ServiceResponse<Holding[]>>;
  getRecentTrades: (userId: string, startDate: string, endDate: string, accountId?: string, stockCode?: string) => Promise<ServiceResponse<Trade[]>>;
  getTrendData: (userId: string, startDate: string, endDate: string, accountId?: string) => Promise<ServiceResponse<TrendData[]>>;
  getKlineData: (userId: string, startDate: string, endDate: string, accountId?: string) => Promise<ServiceResponse<PortfolioKlinePoint[]>>;
  getMetrics: (userId: string, endDate: string, accountId?: string) => Promise<ServiceResponse<PortfolioKlineMetrics>>;
  getAccounts: (userId: string) => Promise<ServiceResponse<Account[]>>;
  getPortfolioHistory: (
    accountAlias: string,
    params?: { startDate?: string; endDate?: string }
  ) => Promise<ServiceResponse<PortfolioHistoryData>>;
  // UUID-based methods for shared portfolios
  getHoldingsByUuid: (uuid: string) => Promise<ServiceResponse<Holding[]>>;
  getRecentTradesByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<Trade[]>>;
  getTrendDataByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<TrendData[]>>;
  getKlineDataByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<PortfolioKlinePoint[]>>;
  getMetricsByUuid: (uuid: string, endDate: string) => Promise<ServiceResponse<PortfolioKlineMetrics>>;
}

export interface AccountPrompt {
  id: number;
  account_alias: string;
  prompt_name: string;
  prompt_content: string;
  prompt_type: 'stock_analysis' | 'option_analysis';
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AnalysisService {
  getStockAnalysis: (stockCode: string) => Promise<ServiceResponse<StockAnalysis>>;
  getPortfolioAnalysis: (userId: string, accountId?: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  getPortfolioAnalysisByUuid: (uuid: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  refreshStockAnalysis: (stockCode: string) => Promise<ServiceResponse<StockAnalysis>>;
  refreshPortfolioAnalysis: (userId: string, accountId?: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  refreshPortfolioAnalysisByUuid: (uuid: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
}

export interface AccountPromptService {
  listPrompts: (accountAlias: string, promptType?: 'stock_analysis' | 'option_analysis') => Promise<ServiceResponse<AccountPrompt[]>>;
  getPrompt: (id: number) => Promise<ServiceResponse<AccountPrompt>>;
  createPrompt: (payload: {
    account_alias: string;
    prompt_name: string;
    prompt_content: string;
    prompt_type: 'stock_analysis' | 'option_analysis';
    is_active: number;
  }) => Promise<ServiceResponse<AccountPrompt>>;
  updatePrompt: (id: number, payload: {
    prompt_name?: string;
    prompt_content?: string;
    prompt_type?: 'stock_analysis' | 'option_analysis';
    is_active?: number;
  }) => Promise<ServiceResponse<AccountPrompt>>;
  deletePrompt: (id: number) => Promise<ServiceResponse<void>>;
  activatePrompt: (id: number) => Promise<ServiceResponse<AccountPrompt>>;
  deactivatePrompt: (id: number) => Promise<ServiceResponse<AccountPrompt>>;
  getActivePrompt: (accountAlias: string, promptType: 'stock_analysis' | 'option_analysis') => Promise<ServiceResponse<AccountPrompt>>;
  previewPrompt: (accountAlias: string, promptType: 'stock_analysis' | 'option_analysis') => Promise<ServiceResponse<{
    has_custom_prompt: boolean;
    prompt: string;
  }>>;
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
  accountPromptService: AccountPromptService;
  noticeService: NoticeService;
  cashFlowService: CashFlowService;
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
  callMargin?: number;
  putMargin?: number;
  call_margin?: number;
  put_margin?: number;
  callVolume: number;
  putVolume: number;
  callOpenInterest: number;
  putOpenInterest: number;
  callImpliedVol: number;
  putImpliedVol: number;
  callUrl?: string;
  putUrl?: string;
  callCurrentValue?: number;
  putCurrentValue?: number;
  call_current_value?: number;
  put_current_value?: number;
  call_contract_code?: string;
  call_contract_code_full?: string;
  put_contract_code?: string;
  put_contract_code_full?: string;
  call_last_price?: number;
  put_last_price?: number;
  callDelta?: number;
  putDelta?: number;
  callGamma?: number;
  putGamma?: number;
  callTheta?: number;
  putTheta?: number;
  callVega?: number;
  putVega?: number;
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

export interface VerticalSpreadMonthlyPriceRange {
  min: number;
  max: number;
}

export interface VerticalSpreadMonthlyPricePoint {
  expiry?: string;
  month?: string;
  price?: number;
  value?: number;
  min?: number;
  max?: number;
  [key: string]: unknown;
}

export interface VerticalSpreadMonthlyPriceItem {
  option_type: 'call' | 'put' | string;
  lower_strike: number;
  upper_strike: number;
  spread_width: number;
  prices_by_expiry: Array<number | VerticalSpreadMonthlyPricePoint>;
  price_range: VerticalSpreadMonthlyPriceRange;
}

export interface OptionsData {
  quotes: OptionQuote[];
  surface: OptionSurfacePoint[];
  opt_undl_code_full?: string;
  vertical_spread_monthly_prices?: VerticalSpreadMonthlyPriceItem[];
}

// Options Portfolio Types
export interface OptionsPosition {
  id: string;
  symbol: string;
  opt_undl_code_full?: string;
  strategy: string;
  strategy_id?: string;
  type: 'call' | 'put' | 'spread' | 'straddle' | 'strangle' | 'iron_condor' | 'butterfly';
  option_type?: string;
  position_type: 'buy' | 'sell';
  strike: number;
  strike_price?: string | number;
  expiry: string;
  quantity: number;
  available?: number;
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
  contract_code_full?: string;
  contract_name?: string;
  contract_type?: string; // 认购/认沽
  contract_type_zh?: string; // call/put
  contract_strike_price?: number; // 行权价格
  position_type_zh?: string; // 权利/义务/备兑
  leg_quantity?: number; // 该leg对应的持仓数量
  cost_price?: number; // 成本价格
  is_covered?: boolean;
  hold_type?: string;
  hold_type_zh?: string;
  margin?: number; // 保证金
  last_price?: number;
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

export interface SubjectPosition {
  covered_volume: number;
  lock_volume: number;
  stock_code: string;
  total_volume: number;
  stock_price?: number;
  total_stock_price?: number;
}

export interface OptionOrder {
  instrument_name: string;
  op_type_name: string;
  op_type_name_zh: string;
  order_status_name: string;
  limit_price: number;
  traded_price: number;
  volume_total_original: number;
  volume_traded: number;
  remark: string;
  order_time: string;
  submitted_at?: string;
  is_combination: boolean;
  compact_no?: string;
  contract_ids?: string[];
  instrument_id?: string;
  contract_code_full?: string;
  cancel_info?: string;
  order_sys_id?: string;
  error_msg?: string;
}

export type SequentialTradeStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'paused'
  | 'cancelled'
  | string;

export interface SequentialTradeStep {
  name: string;
  action: string;
  status: SequentialTradeStatus;
  description?: string | null;
  params?: Record<string, unknown> | null;
  method_name?: string | null;
  symbol?: string | null;
  user_order_id?: string | null;
  general?: Record<string, unknown> | null;
  start_time?: string | null;
  end_time?: string | null;
}

export interface SequentialTradeTask {
  id: number;
  account_id: string;
  account_alias?: string;
  env?: string | null;
  combo_id?: string | number;
  expiry_date?: string | null;
  action_type: string;
  order_ids?: string[];
  status: SequentialTradeStatus;
  current_step?: number | null;
  steps_count?: number | null;
  current_step_index?: number | null;
  steps?: SequentialTradeStep[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  error_msg?: string | null;
  timeout_seconds?: number | null;
  trade_uuid?: string | null;
}

export interface OptionsPortfolioData {
  strategies: OptionsStrategy[];
  singleLegPositions?: OptionsPosition[];
  complexStrategies?: OptionsStrategy[];
  expiryBuckets?: Array<{
    expiry: string;
    daysToExpiry: number;
    single: OptionsPosition[];
    complex: OptionsStrategy[];
  }>;
  totalValue: number;
  totalCost: number;
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  balance?: number;
  available?: number;
  position_profit?: number;
  real_used_margin?: number;
  expiryGroups: Array<{
    expiry: string;
    daysToExpiry: number;
    positions: OptionsPosition[];
    totalValue: number;
    totalCost: number;
    profitLoss: number;
  }>;
  customStrategies?: CustomOptionsStrategy[]; // 自定义策略列表
  advised_combinations?: AdvisedCombination[];
  is_snapshot?: boolean;
  subject_positions?: SubjectPosition[];
  expiry_analysis?: Record<string, ExpiryAnalysisReport>;
  expiry_risk_report?: {
    expiries?: OptionExpiryRiskReportItem[];
  } | OptionExpiryRiskReport;
}

export interface ExerciseAnalysis {
  call_covered_count: number;
  call_covered_positions: unknown[];
  call_covered_stock_to_deliver: number;
  call_obligation_count: number;
  call_obligation_count_worst: number;
  call_obligation_positions: unknown[];
  call_obligation_stock_required: number;
  call_obligation_stock_required_worst: number;
  put_obligation_avg_price: number;
  put_obligation_avg_price_worst: number;
  put_obligation_cash_required: number;
  put_obligation_cash_required_worst: number;
  put_obligation_count: number;
  put_obligation_count_worst: number;
  put_obligation_positions: unknown[];
  put_obligation_stock_to_buy: number;
  put_obligation_stock_to_buy_worst: number;
  total_exercise_count: number;
  total_exercise_count_worst: number;
}

export interface ExpiryAnalysisReport {
  phase: string;
  days_to_expiry: number;
  risk_positions_count: number;
  safe_positions_count: number;
  strategies_count: number;
  exercise_analysis?: ExerciseAnalysis;
  report: string;
  underlyings?: OptionExpiryRiskReportItem[];
}

export interface OptionWhitelist {
  id: number;
  account_id: string;
  account_alias?: string;
  contract_code: string;
  contract_code_full?: string;
  contract_name?: string;
  underlying_code?: string;
  expiry_month: string;
  expiry_date?: string;
  option_type: string;
  strike_price: number;
  hold_type: string;
  quantity?: number;
  reason: string;
  notes?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  option_detail?: {
    contract_name: string;
    expiry_date: string;
    option_type: string;
    strike_price: number;
    underlying_code: string;
    underlying_name?: string;
  };
}

export interface OptionContractDetail {
  contract_code: string;
  contract_name: string;
  contract_unit: number;
  strike_price: number;
  raw_data: {
    optType: string;
    ExpireDate: number;
    InstrumentName: string;
    OptExercisePrice: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PayoffSurfaceData {
  S_axis: number[];
  T_axis: string[];
  payoff_matrix: number[][];
  current_pnl: number;
  max_profit: number;
  max_loss: number;
  underlying_price: number;
  underlying_name: string;
  legs_summary: Array<{
    contract_code: string;
    contract_name: string;
    contract_type: string;
    strike: number;
    expiry: string;
    position_type: string;
    quantity: number;
    cost_price: number;
    sigma: number;
    days_to_expiry: number;
  }>;
}

export interface MarginStressScenario {
  shock_pct: number;
  shock_label: string;
  new_undl_price: number;
  gross_margin: number;
  combination_discount: number;
  net_margin: number;
  margin_gap: number;
  is_forced_close: boolean;
  option_value_change: number;
}

export interface MarginStressData {
  current_margin: number;
  gross_margin_no_discount: number;
  combination_discount: number;
  available_cash: number;
  margin_buffer: number;
  scenarios: MarginStressScenario[];
  legs_count: number;
  legs_summary: unknown[];
}

export interface AdminOrdersDailyStats {
  total_count: number;
  completed_count: number;
  succeeded_count: number;
  canceled_count: number;
  failed_count: number;
  pending_count: number;
  status_breakdown?: Record<string, number>;
}

export interface OptionExpiryRiskReportListItem {
  id?: number;
  report_id?: string;
  report_date: string;
  account_alias?: string;
  account_id?: string;
  status?: string;
  error_message?: string | null;
  generated_at?: string;
  created_at?: string;
  updated_at?: string;
  report_markdown?: string;
  summary?: Record<string, unknown>;
}

export interface OptionExpiryRiskReportItem {
  expiry_date: string;
  underlying_code?: string;
  underlying_name?: string;
  phase?: string;
  days_to_expiry?: number;
  calendar_days_to_expiry?: number;
  risk_positions_count?: number;
  safe_positions_count?: number;
  strategies_count?: number;
  report?: string;
  exercise_analysis?: ExerciseAnalysis;
  payoff_calculator?: unknown;
  surface?: unknown;
}

export interface OptionExpiryRiskReport {
  id?: number;
  report_id?: string;
  report_date: string;
  account_alias?: string;
  account_id?: string;
  status?: string;
  error_message?: string | null;
  generated_at?: string;
  created_at?: string;
  updated_at?: string;
  report_markdown?: string;
  summary?: Record<string, unknown>;
  items?: OptionExpiryRiskReportItem[];
  expiries?: OptionExpiryRiskReportItem[];
}

export interface OptionsPortfolioAnalysisData {
  expiry_risk_report?: {
    expiries?: OptionExpiryRiskReportItem[];
  } | OptionExpiryRiskReport;
  expiry_analysis?: Record<string, ExpiryAnalysisReport>;
}

export interface PriceDistributionBandPoint {
  date: string;
  offset_days?: number;
  lower: number;
  mid?: number;
  upper: number;
  expected?: number;
}

export interface PriceDistributionBand {
  probability: number;
  label?: string;
  points: PriceDistributionBandPoint[];
}

export interface PriceDistributionDensityPoint {
  price: number;
  pdf?: number;
  probabilityDensity?: number;
  cdf?: number;
}

export interface PriceDistributionForecast {
  model?: string;
  probabilityMeasure?: string;
  volatilitySource?: string;
  selectedStrike?: number;
  iv?: number;
  riskFreeRate?: number;
  anchorDate?: string;
  anchorPrice?: number;
  expiryDate?: string;
  calendarDaysToExpiry?: number;
  pointStepDays?: number;
  bands: PriceDistributionBand[];
  densityAtExpiry?: PriceDistributionDensityPoint[];
}

export interface PriceDistributionSource {
  baseEndpoint?: string;
  volatilitySource?: string;
  selectedStrike?: number;
  mode?: string;
}

export interface PriceDistributionData {
  success?: boolean;
  symbol: string;
  spot: number;
  asOfDate?: string;
  source?: PriceDistributionSource;
  forecast?: PriceDistributionForecast;
  forecasts?: PriceDistributionForecast[];
  expiryDates?: string[];
}

export interface OptionMarketStateData {
  meta: {
    as_of: string;
    generated_at: string;
    lookback_days: number;
    schema_version: string;
    source: string;
    source_updated_at: string;
    symbol: string;
    timezone: string;
    trading_day_count: number;
    data_age_seconds?: number;
  };
  state: {
    label: string;
    regime: string;
    stress_score: number;
    positioning_score: number;
    confidence: number;
    summary: string;
    signals: Array<{
      code: string;
      direction: string;
      message: string;
      severity: string;
    }>;
  };
  latest: {
    underlying_price: {
      change: number | null;
      change_percent: number | null;
      value: number;
    };
    atm_iv: {
      call: number;
      change: number;
      change_percent: number;
      percentile: number;
      put: number;
      value: number;
    };
    liquidity: {
      average_spread_percent: number;
      change: number;
      change_percent: number;
      percentile: number;
      value: number;
    };
    open_interest: {
      call: number;
      call_change: number;
      put: number;
      put_call_ratio: number;
      put_change: number;
      total: number;
      total_change: number;
    };
    volume: {
      call: number;
      put: number;
      put_call_ratio: number;
      total: number;
    };
    put_call_iv_skew: {
      percentile: number;
      value: number;
    };
    concentration: {
      dominant_expiry: string;
      dominant_expiry_share: number;
      top_five_contract_share: number;
    };
    contract_count: number;
    expiry_count: number;
  };
  underlying_market: {
    symbol: string;
    as_of: string;
    current_price: number;
    change_5d?: number;
    change_20d?: number;
    change_60d?: number;
    change_ytd?: number;
    volatility_20d?: number;
    volatility_60d?: number;
    max_drawdown_20d?: number;
    max_drawdown_60d?: number;
    average_amount_20d?: number;
    ma20?: number;
    ma60?: number;
    ma120?: number;
    history_trading_days?: number;
  };
  history?: Array<{
    date: string;
    stress_score?: number | null;
    positioning_score?: number | null;
    underlying_price?: number | null;
    underlying_price_change?: number | null;
    underlying_price_change_percent?: number | null;
    atm_iv?: number | null;
    atm_call_iv?: number | null;
    atm_put_iv?: number | null;
    atm_iv_change?: number | null;
    atm_iv_change_percent?: number | null;
    iv_percentile?: number | null;
    call_open_interest?: number | null;
    put_open_interest?: number | null;
    total_open_interest?: number | null;
    call_volume?: number | null;
    put_volume?: number | null;
    total_volume?: number | null;
    put_call_iv_skew?: number | null;
    put_call_oi_ratio?: number | null;
    put_call_volume_ratio?: number | null;
    spread_percent?: number | null;
    open_interest?: number;
    volume?: number;
  }>;
  term_structure?: Array<{
    expiry: string;
    days_to_expiry: number;
    atm_call_iv?: number;
    atm_put_iv?: number;
    put_skew_25d?: number;
    put_call_oi_ratio?: number;
    call_25d_iv?: number;
    put_25d_iv?: number;
    call_open_interest?: number;
    call_open_interest_change?: number;
    call_volume?: number;
    put_open_interest?: number;
    put_open_interest_change?: number;
    put_volume?: number;
    contract_count?: number;
    liquidity?: number;
  }>;
  contract_activity?: {
    by_expiry?: Record<string, {
      largest_builds: Array<{
        contract_code: string;
        contract_name: string;
        expiry: string;
        implied_volatility?: number;
        liquidity?: number;
        moneyness_type?: string;
        open_interest: number;
        open_interest_change: number;
        option_type: 'call' | 'put';
        strike_price: string;
        volume: number;
      }>;
      largest_unwinds: Array<{
        contract_code: string;
        contract_name: string;
        expiry: string;
        implied_volatility?: number;
        liquidity?: number;
        moneyness_type?: string;
        open_interest: number;
        open_interest_change: number;
        option_type: 'call' | 'put';
        strike_price: string;
        volume: number;
      }>;
      most_active: Array<{
        contract_code: string;
        contract_name: string;
        expiry: string;
        implied_volatility?: number;
        liquidity?: number;
        moneyness_type?: string;
        open_interest: number;
        open_interest_change: number;
        option_type: 'call' | 'put';
        strike_price: string;
        volume: number;
      }>;
    }>;
    oi_increase?: Array<{ contract_code: string; delta_oi: number; delta_oi_percent: number }>;
    oi_decrease?: Array<{ contract_code: string; delta_oi: number; delta_oi_percent: number }>;
    volume_active?: Array<{ contract_code: string; volume: number }>;
    t_quotes?: Record<string, {
      atm_strike: number;
      underlying_price: number;
      rows: Array<{
        strike_price: number;
        is_atm: boolean;
        call?: {
          contract_code: string;
          bid: number;
          ask: number;
          iv: number;
          delta: number;
          gamma: number;
          oi: number;
          delta_oi: number;
        };
        put?: {
          contract_code: string;
          bid: number;
          ask: number;
          iv: number;
          delta: number;
          gamma: number;
          oi: number;
          delta_oi: number;
        };
      }>;
    }>;
  };
  data_quality?: {
    coverage?: number;
    confidence?: string;
    missing_fields?: string[];
  };
  methodology?: {
    formula?: string;
    limits?: string[];
  };
  oi_analysis?: {
    meta: {
      as_of: string;
      generated_at: string;
      expiry_dates: string[];
    };
    comparison_dates: Record<string, string>;
    volatility_regime: {
      windows: Record<string, {
        status: string;
        baseline_date?: string;
        current_atm_iv_percent?: number;
        baseline_atm_iv_percent?: number;
        delta_atm_iv_points?: number;
        comparable_delta_oi?: number;
        signal_code: string;
        label: string;
        confidence: string;
        interpretation: string;
      }>;
      atm_call_iv_percent?: number;
      atm_iv_percent?: number;
      atm_put_iv_percent?: number;
      history_percentile?: number;
      valid_history_samples?: number;
      history_summary?: {
        requested_calendar_days: number;
        start_date: string;
        end_date: string;
        valid_samples: number;
        metrics: {
          atm_call_iv_percent: {
            start_date: string;
            end_date: string;
            valid_samples: number;
            latest_daily_average_percent: number;
            percentile: number;
            minimum: { value_percent: number; date: string };
            maximum: { value_percent: number; date: string };
          };
          atm_put_iv_percent: {
            start_date: string;
            end_date: string;
            valid_samples: number;
            latest_daily_average_percent: number;
            percentile: number;
            minimum: { value_percent: number; date: string };
            maximum: { value_percent: number; date: string };
          };
          atm_iv_percent: {
            start_date: string;
            end_date: string;
            valid_samples: number;
            latest_daily_average_percent: number;
            percentile: number;
            minimum: { value_percent: number; date: string };
            maximum: { value_percent: number; date: string };
          };
        };
      };
    };
    market_summary: {
      current_total_oi: number;
      windows: Record<string, {
        delta_oi: number;
        delta_oi_percent: number;
      }>;
    };
    term_structure: Record<string, {
      expiry_date: string;
      call_oi: number;
      call_delta_oi_1d?: number;
      call_delta_oi_3d?: number;
      call_delta_oi_5d?: number;
      put_oi: number;
      put_delta_oi_1d?: number;
      put_delta_oi_3d?: number;
      put_delta_oi_5d?: number;
    }>;
    t_shapes: Record<string, {
      atm_strike: number;
      underlying_price: number;
      wings: number;
      rows: Array<{
        strike_price: number;
        is_atm: boolean;
        call: {
          contract_code: string;
          open_interest: number;
          daily_volume: number;
          implied_volatility_percent: number;
          windows: Record<string, {
            status: string;
            baseline_date?: string;
            baseline_open_interest?: number;
            delta_oi?: number;
            delta_oi_percent?: number;
          }>;
        };
        put: {
          contract_code: string;
          open_interest: number;
          daily_volume: number;
          implied_volatility_percent: number;
          windows: Record<string, {
            status: string;
            baseline_date?: string;
            baseline_open_interest?: number;
            delta_oi?: number;
            delta_oi_percent?: number;
          }>;
        };
      }>;
    }>;
    rankings: {
      absolute_increase?: Array<{ contract_code: string; delta_oi: number; expiry: string; strike: number; option_type: string }>;
      absolute_decrease?: Array<{ contract_code: string; delta_oi: number; expiry: string; strike: number; option_type: string }>;
      relative_increase?: Array<{ contract_code: string; delta_oi_percent: number; expiry: string; strike: number; option_type: string }>;
      relative_decrease?: Array<{ contract_code: string; delta_oi_percent: number; expiry: string; strike: number; option_type: string }>;
    };
    interpretations: Array<{
      title: string;
      confidence: string;
      possible_explanations: string[];
      limitations?: string[];
      evidence: Array<{
        code: string;
        expiry_date: string | null;
        label: string;
        unit: string;
        value: number;
        window: number;
      }>;
    }>;
    data_quality?: Record<string, any>;
    methodology?: Record<string, any>;
  };
}

export interface OptionsService {
  getOptionsData: (symbol?: string) => Promise<ServiceResponse<OptionsData>>;
  refreshOptionsData: (symbol?: string) => Promise<ServiceResponse<OptionsData>>;
  getOptionMarketState: (
    symbol: string,
    params?: {
      days?: number;
      windows?: string;
      top?: number;
      wings?: number;
      min_base_oi?: number;
      as_of?: string;
      expiry?: string | string[];
      refresh?: boolean;
    }
  ) => Promise<ServiceResponse<OptionMarketStateData>>;
  getOptionContractDetail: (contractCode: string) => Promise<ServiceResponse<OptionContractDetail>>;
  getAvailableSymbols: () => Promise<ServiceResponse<string[]>>;
  getPriceDistribution: (
    symbol: string,
    options?: {
      expiry?: string;
      allExpiries?: boolean;
      bands?: number | number[];
      pointStepDays?: number;
      densityPoints?: number;
      riskFreeRate?: number;
      fallbackVolatility?: number;
      marginMultiplier?: number;
    }
  ) => Promise<ServiceResponse<PriceDistributionData>>;
  getOptionsPortfolio: (userId: string, accountId?: string | null, options?: { symbol?: string }) => Promise<ServiceResponse<OptionsPortfolioData>>;
  getPortfolioAnalysis: (userId: string, accountId?: string | null) => Promise<ServiceResponse<OptionsPortfolioAnalysisData>>;
  getPayoffSurface: (accountId: string, symbol?: string) => Promise<ServiceResponse<PayoffSurfaceData>>;
  getMarginStress: (accountId: string, symbol?: string) => Promise<ServiceResponse<MarginStressData>>;
  listOptionExpiryRiskReports: (accountAlias: string, options?: { limit?: number }) => Promise<ServiceResponse<OptionExpiryRiskReportListItem[]>>;
  getOptionExpiryRiskReport: (
    accountAlias: string,
    reportDate: string,
    options?: { expiry_date?: string; raw?: boolean }
  ) => Promise<ServiceResponse<OptionExpiryRiskReport>>;
  generateOptionExpiryRiskReport: (
    accountAlias: string,
    payload?: { report_date?: string; overwrite?: boolean }
  ) => Promise<ServiceResponse<OptionExpiryRiskReport>>;
  getAvailableStrategies: () => Promise<ServiceResponse<string[]>>;
  createOptionPriceWebSocketClient: (handlers?: OptionPriceWebSocketHandlers) => OptionPriceWebSocketClient;
  saveCustomStrategy: (
    strategy: CustomOptionsStrategy | Omit<CustomOptionsStrategy, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<ServiceResponse<CustomOptionsStrategy>>;
  deleteCustomStrategy: (strategyId: string) => Promise<ServiceResponse<void>>;
  getCustomStrategies: (userId: string, accountId?: string | null) => Promise<ServiceResponse<CustomOptionsStrategy[]>>;
  getRatioSpreadPlans: (symbol?: string, accountId?: string | null, userId?: string | null) => Promise<ServiceResponse<RatioSpreadPlanResult[]>>;
  saveRatioSpreadPlan: (plan: RatioSpreadPlanResult, accountId?: string | null, userId?: string | null) => Promise<ServiceResponse<RatioSpreadPlanResult>>;
  refreshRatioSpreadPlan: (plan: RatioSpreadPlanResult, accountId?: string | null, userId?: string | null) => Promise<ServiceResponse<RatioSpreadPlanResult>>;
  closePositions: (
    payload: {
      positions: OptionsPosition[];
      meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string };
      overrides?: Record<string, number>;
    },
    accountId?: string | null,
    userId?: string | null
  ) => Promise<ServiceResponse<{ closedIds: string[] }>>;
  updatePositions: (payload: { updates: Array<{ id?: string; type: 'call' | 'put'; position_type: 'buy' | 'sell'; strike: number; expiry: string; quantity: number; original_quantity?: number; change_quantity?: number; is_covered?: boolean; symbol?: string; option_type?: string; strike_price?: string | number; price?: number; limit_price?: number; last_price_refer?: number }>, positions?: OptionsPosition[], accountId?: string | null, userId?: string | null }) => Promise<ServiceResponse<{ updated: number }>>;
  executeCombination: (combo: AdvisedCombination & { quantity: number }, accountId?: string | null, userId?: string | null) => Promise<ServiceResponse<{ executed: boolean; combinationId?: string }>>;
  createOptionCombination: (combo: AdvisedCombination & { quantity: number }, accountId?: string | null, userId?: string | null) => Promise<ServiceResponse<{ created: boolean; combinationId?: string }>>;
  closeCombination: (
    payload: {
      positions: OptionsPosition[];
      meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string };
      overrides?: Record<string, number>;
    },
    accountId?: string | null,
    userId?: string | null
  ) => Promise<ServiceResponse<{ closedIds: string[] }>>;
  clearCombination: (accountAlias: string, comboId: string) => Promise<ServiceResponse<{ task_id: number; msg: string }>>;
  getWhitelists: (userId: string, accountId?: string | null) => Promise<ServiceResponse<OptionWhitelist[]>>;
  addWhitelist: (whitelist: Omit<OptionWhitelist, 'id' | 'created_at'>, userId: string, accountId?: string | null) => Promise<ServiceResponse<OptionWhitelist>>;
  updateWhitelist: (id: string | number, whitelist: Partial<OptionWhitelist>, userId: string, accountId?: string | null) => Promise<ServiceResponse<OptionWhitelist>>;
  deleteWhitelist: (id: string | number, userId: string, accountId?: string | null) => Promise<ServiceResponse<void>>;
  getOptionOrders: (accountId: string, userId?: string | null, options?: { only_today?: boolean; date?: string }) => Promise<ServiceResponse<OptionOrder[]>>;
  cancelOptionOrderByRemark: (accountId: string, remark: string, userId?: string | null) => Promise<ServiceResponse<unknown>>;
  getOptionOrdersStats: (accountId: string, month: string) => Promise<ServiceResponse<Record<string, { completed_count: number; pending_count: number; junk_count: number; total_count: number }>>>;
  getAdminOrders: (accountId: string, options?: { date?: string; only_today?: boolean }) => Promise<ServiceResponse<OptionOrder[]>>;
  getAdminOrdersStats: (accountId: string, month: string) => Promise<ServiceResponse<Record<string, AdminOrdersDailyStats>>>;
  getSequentialTrades: (accountId: string, options?: { status?: string; limit?: number; offset?: number; today_only?: boolean }) => Promise<ServiceResponse<SequentialTradeTask[]>>;
  getSequentialTradeDetail: (accountAlias: string, tradeId: number | string) => Promise<ServiceResponse<SequentialTradeTask>>;
  pauseSequentialTrade: (accountAlias: string, tradeId: number | string) => Promise<ServiceResponse<void>>;
  resumeSequentialTrade: (accountAlias: string, tradeId: number | string) => Promise<ServiceResponse<void>>;
  terminateSequentialTrade: (accountAlias: string, tradeId: number | string) => Promise<ServiceResponse<void>>;
  restartSequentialTrade: (accountAlias: string, tradeId: number | string, stepIndex?: number) => Promise<ServiceResponse<void>>;
}

export type OptionPriceWebSocketHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: unknown) => void;
  onMessage?: (data: unknown) => void;
};

export interface OptionPriceWebSocketClient {
  connect: () => void;
  close: () => void;
  send: (payload: unknown) => void;
  subscribe: (contractCodes: string[]) => void;
  queryOptionsData: (symbol: string) => void;
  queryOrders: (accountId: string) => void;
  getReadyState: () => number;
}

export type StockPriceWebSocketHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: unknown) => void;
  onMessage?: (data: unknown) => void;
};

export interface StockPriceWebSocketClient {
  connect: () => void;
  close: () => void;
  send: (payload: unknown) => void;
  subscribe: (stockCodes: string[]) => void;
  getReadyState: () => number;
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

export interface OptionContract {
  code: string;
  name: string;
  price: number;
  option_type: 'call' | 'put';
  strike_price: number;
  expiry: string;
}

export interface AdvisedLegPosition {
  code: string;
  name: string;
  position: OptionsPosition;
  strike: number;
  volume: number;
}

export interface AdvisedCombination {
  type: string;
  description: string;
  expiry: string;
  quantity: number;
  buy_position: AdvisedLegPosition;
  sell_position: AdvisedLegPosition;
  buy_strike: number;
  sell_strike: number;
}

export interface RatioSpreadPlanConfig {
  expiry: string;
  option_type: 'call' | 'put';
  lower_strike: number;
  upper_strike: number;
  target_spread: number;
  cover_contracts_needed: number;
  label: string;
}

export interface RatioSpreadPlanResult {
  plan: RatioSpreadPlanConfig;
  current_spread: number;
  leverage: number;
  cover_contracts_needed: number;
  action: 'open' | 'close' | 'hold';
  reason: string;
  best_net_premium: number;
  buy_price: number;
  sell_price: number;
  saved?: boolean;
  analysis?: {
    strike_type: 'call' | 'put';
    buy_strike: OptionContract;
    sell_strike: OptionContract;
    buy_price: number;
    sell_price: number;
    buy_strike_price: number;
    sell_strike_price: number;
    buy_count: number;
    sell_count: number;
    best_net_premium: number;
    cover_contracts_needed: number;
    到期日: string;
  };
}
