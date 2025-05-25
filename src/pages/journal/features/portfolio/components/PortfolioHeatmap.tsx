import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Filter, X } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';
import type { Holding } from '../../../../../lib/services/types';
import { formatCurrency } from '../../../../../lib/types';
import type { CurrencyConfig } from '../../../../../lib/types';

interface PortfolioHeatmapProps {
  holdings: Holding[];
  theme: Theme;
  currencyConfig: CurrencyConfig;
}

type GroupingDimension = 'category' | 'tags';

interface GroupStats {
  totalValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  holdings: Holding[];
}

function getColorByPercentage(percentage: number, isDark: boolean, isGroup: boolean = false): string {
  // Define base colors for different percentage ranges
  const colors = {
    positive: {
      strong: isDark 
        ? isGroup ? '#065f46' : '#059669' // Darker green for groups
        : isGroup ? '#047857' : '#10b981', // Strong gain
      medium: isDark
        ? isGroup ? '#047857' : '#34d399'
        : isGroup ? '#059669' : '#6ee7b7', // Medium gain
      weak: isDark
        ? isGroup ? '#059669' : '#6ee7b7'
        : isGroup ? '#10b981' : '#a7f3d0', // Weak gain
    },
    negative: {
      strong: isDark
        ? isGroup ? '#991b1b' : '#dc2626'
        : isGroup ? '#b91c1c' : '#ef4444', // Strong loss
      medium: isDark
        ? isGroup ? '#b91c1b' : '#f87171'
        : isGroup ? '#dc2626' : '#fca5a5', // Medium loss
      weak: isDark
        ? isGroup ? '#dc2626' : '#fca5a5'
        : isGroup ? '#ef4444' : '#fee2e2', // Weak loss
    },
    neutral: isDark 
      ? isGroup ? '#1f2937' : '#374151'
      : isGroup ? '#e5e7eb' : '#f3f4f6' // Near zero
  };

  // Define percentage thresholds
  const thresholds = {
    strong: isGroup ? 8 : 10,   // ±8/10% or more
    medium: isGroup ? 4 : 5,    // ±4/5% to 8/10%
    weak: isGroup ? 1.5 : 2,    // ±1.5/2% to 4/5%
    neutral: isGroup ? 1.5 : 2  // Between -1.5/2% and 1.5/2%
  };

  // Calculate opacity based on absolute percentage
  const getOpacity = (value: number): number => {
    const absValue = Math.abs(value);
    if (absValue >= thresholds.strong) return isGroup ? 1 : 0.9;
    if (absValue >= thresholds.medium) return isGroup ? 0.85 : 0.7;
    if (absValue >= thresholds.weak) return isGroup ? 0.7 : 0.5;
    return isGroup ? 0.5 : 0.3;
  };

  // Get base color
  let baseColor: string;
  const absPercentage = Math.abs(percentage);

  if (absPercentage < thresholds.neutral) {
    return colors.neutral;
  } else if (percentage > 0) {
    if (absPercentage >= thresholds.strong) baseColor = colors.positive.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.positive.medium;
    else baseColor = colors.positive.weak;
  } else {
    if (absPercentage >= thresholds.strong) baseColor = colors.negative.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.negative.medium;
    else baseColor = colors.negative.weak;
  }

  // Convert hex to rgba
  const opacity = getOpacity(percentage);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(baseColor);
  if (!result) return baseColor;
  
  const rgb = {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

export function PortfolioHeatmap({ holdings, theme, currencyConfig }: PortfolioHeatmapProps) {
  // Component implementation will go here
  return (
    <div>
      {/* Component content */}
    </div>
  );
}