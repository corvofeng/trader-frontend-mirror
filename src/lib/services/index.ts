import type { Services } from './types';
import * as mockServices from './mock';
import * as prodServices from './prod';

const isProduction = import.meta.env.VITE_ENV === 'production';
console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

const services: Services = isProduction ? prodServices : mockServices;

export const {
  authService,
  tradeService,
  stockService,
  portfolioService,
  currencyService,
  operationService,
  stockConfigService,
  analysisService,
  uploadService,
  optionsService,
  accountService,
  accountPromptService,
  noticeService
} = services;
