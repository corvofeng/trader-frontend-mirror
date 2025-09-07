import type { CurrencyConfig, RegionalColorConfig } from '../types';

export const currencyConfigs: Record<string, CurrencyConfig> = {
  USD: { symbol: '$', position: 'before', separator: ',', region: 'US' },
  RMB: { symbol: '¥', position: 'before', separator: ',', region: 'CN' },
  JPY: { symbol: '¥', position: 'before', separator: ',', region: 'JP' },
  EUR: { symbol: '€', position: 'before', separator: '.', region: 'EU' },
  GBP: { symbol: '£', position: 'before', separator: ',', region: 'GB' }
};

export const regionalColorConfigs: Record<string, RegionalColorConfig> = {
  US: { upColor: '#26a69a', downColor: '#ef5350' },
  CN: { upColor: '#ef5350', downColor: '#26a69a' },
  EU: { upColor: '#26a69a', downColor: '#ef5350' },
  JP: { upColor: '#ef5350', downColor: '#26a69a' },
  GB: { upColor: '#26a69a', downColor: '#ef5350' }
};
