import type { CurrencyConfig } from '../types';

export interface User {
  id: string;
  email: string;
  avatar_url: string;
  name: string;
}

export interface Stock {
  stock_code: string;
  stock_name: string;
  category?: string;
  tags?: string[];
  price?: number;
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
  category?: string;
  tags?: string[];
  quantity: number;
  average_price: number;
  current_price: number;
  total_value: number;
  profit_loss: number;
  profit_loss_percentage: number;
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

export interface StockService {
  getStockName: (stockCode: string) => string;
  getStocks: () => Promise<ServiceResponse<Stock[]>>;
  searchStocks: (query: string) => Promise<ServiceResponse<Stock[]>>;
  getStockData: (symbol: string) => Promise<ServiceResponse<StockData[]>>;
  getCurrentPrice: (symbol: string) => Promise<ServiceResponse<StockPrice>>;
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

export interface Services {
  authService: AuthService;
  tradeService: TradeService;
  stockService: StockService;
  portfolioService: PortfolioService;
  currencyService: CurrencyService;
  operationService: OperationService;
}