import React from 'react';
import { Theme, themes } from '../../../../../lib/theme';
import { formatCurrency } from '../../../../../shared/utils/format';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';
import type { Holding, TrendData } from '../../../../../lib/services/types';

interface PortfolioMetricsProps {
  holdings: Holding[];
  trendData: TrendData[];
  theme: Theme;
}

export function PortfolioMetrics({ holdings, trendData, theme }: PortfolioMetricsProps) {
  const { currencyConfig } = useCurrency();
  
  // Calculate portfolio metrics
  const totalHoldingsValue = holdings.reduce((sum, holding) => sum + holding.total_value, 0);
  const totalProfitLoss = holdings.reduce((sum, holding) => sum + holding.profit_loss, 0);
  
  // Get latest trend value for total market value
  const latestTrendValue = trendData.length > 0 ? trendData[trendData.length - 1].value : totalHoldingsValue;
  
  // Calculate position ratio
  const positionRatio = latestTrendValue > 0 ? (totalHoldingsValue / latestTrendValue) * 100 : 0;

  return (
    <div className="p-6 border-b border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={`${themes[theme].background} rounded-lg p-4`}>
          <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总市值</h3>
          <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
            {formatCurrency(latestTrendValue, currencyConfig)}
          </p>
          <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
            {trendData.length > 0 ? 'Based on latest trend data' : 'Based on holdings value'}
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
    </div>
  );
}