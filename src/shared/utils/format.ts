import type { CurrencyConfig } from '../types';

export function getCurrencySymbol(stockCode?: string): string {
  if (!stockCode) return '$';
  const upper = stockCode.toUpperCase().trim();
  if (
    upper.endsWith('.SH') ||
    upper.endsWith('.SZ') ||
    upper.endsWith('.SS') ||
    upper.endsWith('.SZSE') ||
    upper.endsWith('.SSE') ||
    upper.endsWith('.BJ') ||
    /^\d{6}$/.test(upper)
  ) {
    return '¥';
  }
  if (upper.endsWith('.HK') || /^\d{5}$/.test(upper)) {
    return 'HK$';
  }
  return '$';
}

export function getCurrencySymbolFromCode(currency?: string): string {
  if (!currency) return '$';
  const upper = currency.toUpperCase().trim();
  if (upper === 'CNY' || upper === 'RMB') return '¥';
  if (upper === 'HKD') return 'HK$';
  if (upper === 'USD') return '$';
  return '$';
}

export function formatCurrency(amount: number, config: CurrencyConfig, precision: number = 2): string {
  const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping: true
  });

  return config.position === 'before'
    ? `${config.symbol}${formattedNumber}`
    : `${formattedNumber}${config.symbol}`;
}

export function formatPercentage(value: number | undefined): string {
  if (typeof value !== 'number' || !isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

export function formatCompactNumber(value: number, region?: string): string {
  const abs = Math.abs(value);
  const isCN = region === 'CN';
  const toFixedClean = (val: number) => {
    const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
    return rounded.toString();
  };

  if (isCN) {
    if (abs >= 1e8) {
      return `${toFixedClean(value / 1e8)}亿`;
    }
    if (abs >= 1e4) {
      return `${toFixedClean(value / 1e4)}万`;
    }
    return abs % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  } else {
    if (abs >= 1e9) {
      return `${toFixedClean(value / 1e9)}B`;
    }
    if (abs >= 1e6) {
      return `${toFixedClean(value / 1e6)}M`;
    }
    if (abs >= 1e3) {
      return `${toFixedClean(value / 1e3)}K`;
    }
    return abs % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  }
}

export function formatCompactCurrency(amount: number, config: CurrencyConfig): string {
  const formattedNumber = formatCompactNumber(amount, config.region);

  return config.position === 'before'
    ? `${config.symbol}${formattedNumber}`
    : `${formattedNumber}${config.symbol}`;
}


