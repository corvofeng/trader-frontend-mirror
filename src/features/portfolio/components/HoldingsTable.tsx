import React from 'react';
import { Theme, themes } from '../../../lib/theme';
import type { Holding } from '../../../lib/services/types';
import { formatCurrency } from '../../../shared/utils/format';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useCurrency } from '../../../lib/context/CurrencyContext';

interface HoldingsTableProps {
  theme: Theme;
  holdings: Holding[];
  paginatedHoldings: Holding[];
  holdingsPage: number;
  holdingsPerPage: number;
  totalHoldingsPages: number;
  onHoldingsPageChange: (page: number) => void;
  onHoldingsPerPageChange: (value: number) => void;
  holdingsSort: { field: string; direction: 'asc' | 'desc' };
  onHoldingsSort: (field: string) => void;
  onAnalyzeStock: (code: string, name: string) => void;
}

const SortIcon = ({ field, currentSort }: { field: string, currentSort: { field: string; direction: 'asc' | 'desc' } }) => {
  if (field !== currentSort.field) {
    return <ArrowUp className="w-4 h-4 opacity-30" />;
  }
  return currentSort.direction === 'asc' ? 
    <ArrowUp className="w-4 h-4" /> : 
    <ArrowDown className="w-4 h-4" />;
};

export function HoldingsTable({
  theme,
  holdings,
  paginatedHoldings,
  holdingsPage,
  holdingsPerPage,
  totalHoldingsPages,
  onHoldingsPageChange,
  onHoldingsPerPageChange,
  holdingsSort,
  onHoldingsSort,
  onAnalyzeStock,
}: HoldingsTableProps) {
  const { currencyConfig } = useCurrency();

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>Holdings</h3>
        <select
          value={holdingsPerPage}
          onChange={(e) => onHoldingsPerPageChange(Number(e.target.value))}
          className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
        >
          <option value={5}>5 per page</option>
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className={`${themes[theme].background}`}>
            <tr>
              <th 
                className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onHoldingsSort('stock_code')}
              >
                <div className="flex items-center space-x-1">
                  <span>Stock</span>
                  <SortIcon field="stock_code" currentSort={holdingsSort} />
                </div>
              </th>
              <th 
                className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onHoldingsSort('total_value')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Value</span>
                  <SortIcon field="total_value" currentSort={holdingsSort} />
                </div>
              </th>
              <th 
                className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onHoldingsSort('profit_loss_percentage')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>P/L %</span>
                  <SortIcon field="profit_loss_percentage" currentSort={holdingsSort} />
                </div>
              </th>
              <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                操作
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y ${themes[theme].border}`}>
            {paginatedHoldings.map((holding) => (
              <tr key={holding.stock_code} className={themes[theme].cardHover}>
                <td className="px-6 py-4">
                  <div>
                    <div className={`text-sm font-medium ${themes[theme].text}`}>{holding.stock_code}</div>
                    <div className={`text-sm ${themes[theme].text} opacity-75`}>{holding.stock_name}</div>
                  </div>
                </td>
                <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                  {formatCurrency(holding.total_value, currencyConfig)}
                </td>
                <td className={`px-6 py-4 text-right text-sm font-medium ${
                  holding.profit_loss_percentage >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {holding.profit_loss_percentage >= 0 ? '+' : ''}{holding.profit_loss_percentage.toFixed(2)}%
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onAnalyzeStock(holding.stock_code, holding.stock_name)}
                    className={`px-3 py-1 rounded-md text-xs ${themes[theme].secondary}`}
                  >
                    分析
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className={`text-sm ${themes[theme].text}`}>
          Showing {Math.min(holdings.length, (holdingsPage - 1) * holdingsPerPage + 1)} to {Math.min(holdings.length, holdingsPage * holdingsPerPage)} of {holdings.length} holdings
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onHoldingsPageChange(Math.max(1, holdingsPage - 1))}
            disabled={holdingsPage === 1}
            className={`p-1 rounded-md ${themes[theme].secondary} ${
              holdingsPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => onHoldingsPageChange(Math.min(totalHoldingsPages, holdingsPage + 1))}
            disabled={holdingsPage === totalHoldingsPages}
            className={`p-1 rounded-md ${themes[theme].secondary} ${
              holdingsPage === totalHoldingsPages ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}