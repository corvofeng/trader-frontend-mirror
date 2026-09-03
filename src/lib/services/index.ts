import type { Services } from './types';
import * as mockServices from './mock';
import * as prodServices from './prod';
import { cloudflareServices } from './cloudflare';

const env = import.meta.env.VITE_ENV;
console.log(`Running in ${env} environment mode`);

const services: Services = env === 'cloudflare'
  ? cloudflareServices
  : env === 'production'
    ? prodServices
    : mockServices;

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
  noticeService,
  cashFlowService
} = services;
