import type { AuthService, TradeService, StockService, PortfolioService, CurrencyService } from './types';
import * as mockServices from './mock';
import * as prodServices from './prod';

const isProduction = import.meta.env.VITE_ENV === 'production';
console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

const services = isProduction ? prodServices : mockServices;

export const { 
  authService, 
  tradeService, 
  stockService, 
  portfolioService,
  currencyService,
  operationService 
} = services;