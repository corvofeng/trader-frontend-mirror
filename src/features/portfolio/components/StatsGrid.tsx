import React from 'react';
import { Theme, themes } from '../../../lib/theme';
import type { CurrencyConfig } from '../../../shared/types';
import { formatCurrency } from '../../../shared/utils/format';

interface StatsGridProps {
  theme: Theme;
  currencyConfig: CurrencyConfig;
  latestTrendValue: number;
  totalHoldingsValue: number;
  positionRatio: number;
  totalProfitLoss: number;
  hasTrendData?: boolean;
}

export function StatsGrid({
  theme,
  currencyConfig,
  latestTrendValue,
  totalHoldingsValue,
  positionRatio,
  totalProfitLoss,
  hasTrendData = false,
}: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className={`${themes[theme].background} rounded-lg p-4`}>
        <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总市值</h3>
        <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
          {formatCurrency(latestTrendValue, currencyConfig)}
        </p>
        <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
          {hasTrendData ? 'Based on latest trend data' : 'Based on holdings value'}
        </p>
      </div>
      <div className={`${themes[theme].background} rounded-lg p-4`}>
        <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总仓位</h3>
        <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
          {formatCurrency(totalHoldingsValue, currencyConfig)}
        </p>
        <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
          Sum of all holdings market value
        </p>
      </div>
      <div className={`${themes[theme].background} rounded-lg p-4`}>
        <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>持仓比例</h3>
        <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
          {positionRatio.toFixed(2)}%
        </p>
        <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
          Holdings / Total market value
        </p>
      </div>
      <div className={`${themes[theme].background} rounded-lg p-4`}>
        <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>持仓盈亏</h3>
        <p className={`text-2xl font-bold mt-1 ${totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}
        </p>
        <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
          Sum of all holdings P/L
        </p>
      </div>
    </div>
  );
}