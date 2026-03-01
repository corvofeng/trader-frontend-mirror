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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
      <div className={`${themes[theme].background} rounded-lg p-3 md:p-4 min-w-0`}>
        <h3 className={`text-sm md:text-base font-medium ${themes[theme].text} opacity-75 truncate`}>总市值</h3>
        <p className={`text-lg sm:text-xl md:text-3xl font-bold ${themes[theme].text} mt-1 truncate`} title={formatCurrency(latestTrendValue, currencyConfig)}>
          {formatCurrency(latestTrendValue, currencyConfig)}
        </p>
        <p className={`text-xs md:text-sm ${themes[theme].text} opacity-60 mt-1 truncate`}>
          {hasTrendData ? 'Based on latest trend data' : 'Based on holdings value'}
        </p>
      </div>
      <div className={`${themes[theme].background} rounded-lg p-3 md:p-4 min-w-0`}>
        <h3 className={`text-sm md:text-base font-medium ${themes[theme].text} opacity-75 truncate`}>总仓位</h3>
        <p className={`text-lg sm:text-xl md:text-3xl font-bold ${themes[theme].text} mt-1 truncate`} title={formatCurrency(totalHoldingsValue, currencyConfig)}>
          {formatCurrency(totalHoldingsValue, currencyConfig)}
        </p>
        <p className={`text-xs md:text-sm ${themes[theme].text} opacity-60 mt-1 truncate`}>
          Sum of all holdings market value
        </p>
      </div>
      <div className={`${themes[theme].background} rounded-lg p-3 md:p-4 min-w-0`}>
        <h3 className={`text-sm md:text-base font-medium ${themes[theme].text} opacity-75 truncate`}>持仓比例</h3>
        <p className={`text-lg sm:text-xl md:text-3xl font-bold ${themes[theme].text} mt-1 truncate`}>
          {positionRatio.toFixed(2)}%
        </p>
        <p className={`text-xs md:text-sm ${themes[theme].text} opacity-60 mt-1 truncate`}>
          Holdings / Total market value
        </p>
      </div>
      <div className={`${themes[theme].background} rounded-lg p-3 md:p-4 min-w-0`}>
        <h3 className={`text-sm md:text-base font-medium ${themes[theme].text} opacity-75 truncate`}>持仓盈亏</h3>
        <p className={`text-lg sm:text-xl md:text-3xl font-bold mt-1 truncate ${totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`${totalProfitLoss >= 0 ? '+' : ''}${formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}`}>
          {totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}
        </p>
        <p className={`text-xs md:text-sm ${themes[theme].text} opacity-60 mt-1 truncate`}>
          Sum of all holdings P/L
        </p>
      </div>
    </div>
  );
}