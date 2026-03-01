import React from 'react';
import { Theme, themes } from '../../../lib/theme';
import type { Holding } from '../../../lib/services/types';
import { formatCurrency } from '../../../shared/utils/format';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
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
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.total_value, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className={`text-xl font-semibold ${themes[theme].text} whitespace-nowrap`}>持仓列表</h3>
        <select
          value={holdingsPerPage}
          onChange={(e) => onHoldingsPerPageChange(Number(e.target.value))}
          className={`px-2 py-1 rounded-md text-base ${themes[theme].input} ${themes[theme].text}`}
        >
          <option value={5}>每页 5 条</option>
          <option value={10}>每页 10 条</option>
          <option value={20}>每页 20 条</option>
        </select>
      </div>


      <div className="overflow-x-auto w-full">
        <table className="w-full table-fixed whitespace-nowrap">
          <thead className={`${themes[theme].background}`}>
            <tr>
                      <th 
                        className={`w-[34%] md:w-[30%] px-1 py-2 sm:px-4 sm:py-3 text-left text-sm font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                        onClick={() => onHoldingsSort('stock_code')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>股票</span>
                          <SortIcon field="stock_code" currentSort={holdingsSort} />
                        </div>
                      </th>
                      <th 
                        className={`w-[30%] md:w-[30%] px-1 py-2 sm:px-4 sm:py-3 text-right text-sm font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                        onClick={() => onHoldingsSort('total_value')}
                      >
                        <div className="flex items-center justify-end space-x-1">
                          <span>市值</span>
                          <SortIcon field="total_value" currentSort={holdingsSort} />
                        </div>
                      </th>
                      <th 
                        className={`w-[24%] md:w-[25%] px-1 py-2 sm:px-4 sm:py-3 text-right text-sm font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                        onClick={() => onHoldingsSort('profit_loss_percentage')}
                      >
                        <div className="flex items-center justify-end space-x-1">
                          <span>盈亏<span className="hidden sm:inline">比</span></span>
                          <SortIcon field="profit_loss_percentage" currentSort={holdingsSort} />
                        </div>
                      </th>
                      <th className={`w-[12%] md:w-[15%] px-1 py-2 sm:px-4 sm:py-3 text-right text-sm font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                        <span className="hidden sm:inline">详情</span>
                      </th>
                    </tr>
          </thead>
          <tbody className={`divide-y ${themes[theme].border}`}>
            {paginatedHoldings.map((holding) => (
              <tr key={holding.stock_code} className={themes[theme].cardHover}>
                <td className="px-1 py-2 sm:px-4 sm:py-3 truncate">
                   <div className="flex flex-col">
                      <div className={`text-base font-medium ${themes[theme].text}`}>{holding.stock_code}</div>
                      <div className={`text-sm ${themes[theme].text} opacity-75 truncate max-w-full`}>{holding.stock_name}</div>
                   </div>
                </td>
                <td className={`px-1 py-2 sm:px-4 sm:py-3 text-right text-base ${themes[theme].text}`}>
                  <div>{formatCurrency(holding.total_value, currencyConfig)}</div>
                  <div className="text-sm opacity-75">
                    {totalPortfolioValue > 0 ? ((holding.total_value / totalPortfolioValue) * 100).toFixed(2) : '0.00'}%
                  </div>
                </td>
                <td className={`px-1 py-2 sm:px-4 sm:py-3 text-right text-base font-medium ${
                  holding.profit_loss_percentage >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {holding.profit_loss_percentage >= 0 ? '+' : ''}{holding.profit_loss_percentage.toFixed(2)}%
                </td>
                <td className="px-1 py-2 sm:px-4 sm:py-3">
                     <div className="flex justify-end">
                       <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAnalyzeStock(holding.stock_code, holding.stock_name);
                          }}
                          className={`px-2 py-1 rounded-md text-sm ${themes[theme].secondary} flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity whitespace-nowrap`}
                        >
                          <TrendingUp size={16} />
                          <span className="hidden sm:inline">详情</span>
                        </button>
                     </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
                <div className={`text-base ${themes[theme].text}`}>
                  显示 {Math.min(holdings.length, (holdingsPage - 1) * holdingsPerPage + 1)} 到 {Math.min(holdings.length, holdingsPage * holdingsPerPage)} 条，共 {holdings.length} 条持仓
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