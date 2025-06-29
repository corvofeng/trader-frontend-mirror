import type { CurrencyConfig } from './types';

export type Theme = 'light' | 'dark' | 'blue';

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  card: string;
  cardHover: string;
  input: string;
  border: string;
  chart: {
    upColor: string;
    downColor: string;
    gridColor: string;
    crosshairColor: string;
  };
}

export const themes: Record<Theme, ThemeColors> = {
  light: {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
    background: 'bg-gray-100',
    text: 'text-gray-900',
    card: 'bg-white',
    cardHover: 'hover:bg-gray-50',
    input: 'bg-white border-gray-300',
    border: 'border-gray-200',
    chart: {
      upColor: '#26a69a',
      downColor: '#ef5350',
      gridColor: '#e1e5eb',
      crosshairColor: '#9ca3af'
    }
  },
  dark: {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    secondary: 'bg-gray-700 hover:bg-gray-600 text-gray-100',
    background: 'bg-gray-900',
    text: 'text-gray-100',
    card: 'bg-gray-800',
    cardHover: 'hover:bg-gray-700',
    input: 'bg-gray-800 border-gray-600',
    border: 'border-gray-700',
    chart: {
      upColor: '#4caf50',
      downColor: '#f44336',
      gridColor: '#363c4e',
      crosshairColor: '#758696'
    }
  },
  blue: {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    secondary: 'bg-blue-100 hover:bg-blue-200 text-blue-900',
    background: 'bg-blue-50',
    text: 'text-blue-900',
    card: 'bg-white',
    cardHover: 'hover:bg-blue-50',
    input: 'bg-white border-blue-200',
    border: 'border-blue-100',
    chart: {
      upColor: '#3b82f6',
      downColor: '#f43f5e',
      gridColor: '#bfdbfe',
      crosshairColor: '#60a5fa'
    }
  }
};

export const currencyConfigs: Record<string, CurrencyConfig> = {
  USD: { symbol: '$', position: 'before', separator: ',' },
  RMB: { symbol: '¥', position: 'before', separator: ',' },
  JPY: { symbol: '¥', position: 'before', separator: ',' },
  EUR: { symbol: '€', position: 'before', separator: '.' },
  GBP: { symbol: '£', position: 'before', separator: ',' }
};