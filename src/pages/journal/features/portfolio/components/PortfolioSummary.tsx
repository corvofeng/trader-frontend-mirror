import React from 'react';
import { Theme, themes } from '../../../../../lib/theme';
import type { CurrencyConfig } from '../../../../../lib/types';
import { formatCurrency } from '../../../../../lib/types';

interface PortfolioSummaryProps {
  totalValue: number;
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  theme: Theme;
  currencyConfig: CurrencyConfig;
}

export function PortfolioSummary({ 
  totalValue, 
  totalProfitLoss, 
  totalProfitLossPercentage, 
  theme, 
  currencyConfig 
}: PortfolioSummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className={`${themes[theme].background} rounded-lg p-4`}>
        <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>Total Portfolio Value</h3>
        <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
          {formatCurrency(totalValue, currencyConfig)}
        </p>
      </div>
      <div className={`${themes[theme].background} rounded-lg p-4`}>
        <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>Total Profit/Loss</h3>
        <p className={`text-2xl font-bold mt-1 ${totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}
        </p>
      </div>
      <div className={`${themes[theme].background} rounded-lg p-4`}>
        <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>Return</h3>
        <p className={`text-2xl font-bold mt-1 ${totalProfitLossPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {totalProfitLossPercentage >= 0 ? '+' : ''}{totalProfitLossPercentage.toFixed(2)}%
        </p>
      </div>
    </div>
  );
}