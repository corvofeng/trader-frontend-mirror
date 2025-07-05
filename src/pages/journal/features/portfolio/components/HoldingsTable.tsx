import React from 'react';
import { Theme, themes } from '../../../../../lib/theme';
import type { Holding } from '../../../../../lib/services/types';
import type { CurrencyConfig } from '../../../../../lib/types';
import { formatCurrency } from '../../../../../lib/types';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';

interface HoldingsTableProps {
  holdings: Holding[];
  theme: Theme;
}

export function HoldingsTable({ holdings, theme }: HoldingsTableProps) {
  const { currencyConfig, regionalColors } = useCurrency();

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className={`${themes[theme].background}`}>
          <tr>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Stock</th>
            <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Value</th>
            <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>P/L %</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${themes[theme].border}`}>
          {holdings.map((holding) => (
            <tr key={holding.stock_code} className={themes[theme].cardHover}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div>
                    <div className={`text-sm font-medium ${themes[theme].text}`}>{holding.stock_code}</div>
                    <div className={`text-sm ${themes[theme].text} opacity-75`}>{holding.stock_name}</div>
                  </div>
                </div>
              </td>
              <td className={`px-6 py-4 whitespace-nowrap text-right text-sm ${themes[theme].text}`}>
                {formatCurrency(holding.total_value, currencyConfig)}
              </td>
              <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                holding.profit_loss_percentage >= 0 
                  ? `text-[${regionalColors.upColor}]` 
                  : `text-[${regionalColors.downColor}]`
              }`}>
                {holding.profit_loss_percentage >= 0 ? '+' : ''}{holding.profit_loss_percentage.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}