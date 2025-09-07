// Business Logic Types

// Service Interface Types
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

export interface PortfolioService {
  getHoldings: (userId: string) => Promise<ServiceResponse<Holding[]>>;
  getRecentTrades: (userId: string, startDate: string, endDate: string) => Promise<ServiceResponse<Trade[]>>;
  getTrendData: (userId: string, startDate: string, endDate: string) => Promise<ServiceResponse<TrendData[]>>;
  getHoldingsByUuid: (uuid: string) => Promise<ServiceResponse<Holding[]>>;
  getRecentTradesByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<Trade[]>>;
  getTrendDataByUuid: (uuid: string, startDate: string, endDate: string) => Promise<ServiceResponse<TrendData[]>>;
}

export interface AnalysisService {
  getStockAnalysis: (stockCode: string) => Promise<ServiceResponse<StockAnalysis>>;
  getPortfolioAnalysis: (userId: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  getPortfolioAnalysisByUuid: (uuid: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  refreshStockAnalysis: (stockCode: string) => Promise<ServiceResponse<StockAnalysis>>;
  refreshPortfolioAnalysis: (userId: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
  refreshPortfolioAnalysisByUuid: (uuid: string) => Promise<ServiceResponse<PortfolioAnalysis>>;
}

export interface CurrencyService {
  getCurrency: () => Promise<ServiceResponse<string>>;
  setCurrency: (currency: string) => Promise<ServiceResponse<void>>;
}

export interface OperationService {
  getOperations: (startDate: string, endDate: string) => Promise<ServiceResponse<Operation[]>>;
}

export interface UploadService {
  uploadPortfolioFile: (file: File) => Promise<UploadResponse>;
}

export interface OptionsService {
  getOptionsData: (symbol?: string) => Promise<ServiceResponse<OptionsData>>;
  getAvailableSymbols: () => Promise<ServiceResponse<string[]>>;
  getOptionsPortfolio: (userId: string) => Promise<ServiceResponse<OptionsPortfolioData>>;
  getAvailableStrategies: () => Promise<ServiceResponse<string[]>>;
}

// Import all API types
import type {
  ServiceResponse,
  User,
  Stock,
  StockData,
  StockPrice,
  StockConfig,
  Trade,
  Holding,
  TrendData,
  OptionQuote,
  OptionSurfacePoint,
  OptionsData,
  OptionsPosition,
  OptionsStrategy,
  OptionsPortfolioData,
  StockAnalysis,
  PortfolioAnalysis,
  UploadResponse,
  Operation
} from './api';