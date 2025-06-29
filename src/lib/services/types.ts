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

export interface PortfolioService {
  getHoldings: (userId: string) => Promise<ServiceResponse<Holding[]>>;
  getRecentTrades: (userId: string, startDate: string, endDate: string) => Promise<ServiceResponse<Trade[]>>;
  getTrendData: (userId: string, startDate: string, endDate: string) => Promise<ServiceResponse<TrendData[]>>;
  // UUID-based methods for shared portfolios
  getHoldingsByUuid: (uuid: string) => Promise<ServiceResponse<Holding[]>>;
  getRecentTradesByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<Trade[]>>;
  getTrendDataByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<TrendData[]>>;
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
  uploadService: UploadService;
}