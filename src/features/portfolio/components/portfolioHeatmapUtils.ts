import type { StockConfig } from '../../../lib/services/types';
import type { RegionalColorConfig } from '../../../shared/types';

export const PORTFOLIO_STOCK_CONFIG_CACHE_KEY = 'journal:stockConfigs';
export const PORTFOLIO_STOCK_CONFIG_CACHE_TTL_MS = 30 * 60_000;

export function getColorByPercentage(
  percentage: number,
  isDark: boolean,
  regionalColors: RegionalColorConfig,
): string {
  const colors = {
    positive: {
      veryStrong: regionalColors.upColor,
      strong: regionalColors.upColor + 'dd',
      medium: regionalColors.upColor + 'bb',
      weak: regionalColors.upColor + '99',
      veryWeak: regionalColors.upColor + '77',
    },
    negative: {
      veryStrong: regionalColors.downColor,
      strong: regionalColors.downColor + 'dd',
      medium: regionalColors.downColor + 'bb',
      weak: regionalColors.downColor + '99',
      veryWeak: regionalColors.downColor + '77',
    },
    neutral: isDark ? '#374151' : '#f3f4f6',
  };

  const thresholds = {
    veryStrong: 5.0,
    strong: 3.0,
    medium: 2.0,
    weak: 1.0,
    neutral: 0.2,
  };

  const getOpacity = (value: number): number => {
    const absValue = Math.abs(value);
    if (absValue >= thresholds.veryStrong) return 1.0;
    if (absValue >= thresholds.strong) return 0.9;
    if (absValue >= thresholds.medium) return 0.8;
    if (absValue >= thresholds.weak) return 0.7;
    return 0.6;
  };

  let baseColor: string;
  const absPercentage = Math.abs(percentage);

  if (absPercentage < thresholds.neutral) {
    return colors.neutral;
  } else if (percentage > 0) {
    if (absPercentage >= thresholds.veryStrong) baseColor = colors.positive.veryStrong;
    else if (absPercentage >= thresholds.strong) baseColor = colors.positive.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.positive.medium;
    else if (absPercentage >= thresholds.weak) baseColor = colors.positive.weak;
    else baseColor = colors.positive.veryWeak;
  } else {
    if (absPercentage >= thresholds.veryStrong) baseColor = colors.negative.veryStrong;
    else if (absPercentage >= thresholds.strong) baseColor = colors.negative.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.negative.medium;
    else if (absPercentage >= thresholds.weak) baseColor = colors.negative.weak;
    else baseColor = colors.negative.veryWeak;
  }

  const opacity = getOpacity(percentage);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(baseColor);
  if (!result) return baseColor;

  const rgb = {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

export function formatPercentage(value: number | undefined): string {
  if (typeof value !== 'number' || !isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

export function loadCachedStockConfigs(
  raw: string | null,
  now: number = Date.now(),
): StockConfig[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ts?: number; data?: StockConfig[] } | StockConfig[];
    if (Array.isArray(parsed)) return parsed;
    if (!Array.isArray(parsed.data)) return [];
    const ts = typeof parsed.ts === 'number' ? parsed.ts : 0;
    if (ts > 0 && now - ts > PORTFOLIO_STOCK_CONFIG_CACHE_TTL_MS) return [];
    return parsed.data;
  } catch {
    return [];
  }
}
