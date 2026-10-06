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
  onAnalyzeStock?: (code: string, name: string) => void;
  isLoading?: boolean;
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
  isLoading = false,
}: HoldingsTableProps) {
  const { currencyConfig } = useCurrency();
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.total_value, 0);
  const showSkeleton = isLoading && holdings.length === 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className={`text-lg sm:text-xl font-semibold ${themes[theme].text} whitespace-nowrap`}>持仓明细</h3>
          <span className={`text-xs ${themes[theme].text} opacity-60 font-mono`}>({holdings.length})</span>
        </div>
        <select
          value={holdingsPerPage}
          onChange={(e) => onHoldingsPerPageChange(Number(e.target.value))}
          disabled={showSkeleton}
          className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
        >
          <option value={5}>每页 5 条</option>
          <option value={10}>每页 10 条</option>
          <option value={20}>每页 20 条</option>
        </select>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full table-auto whitespace-nowrap">
          <thead className={`${themes[theme].background} border-b ${themes[theme].border}`}>
            <tr>
              <th 
                className={`px-2 py-2 sm:px-4 sm:py-3 text-left text-xs sm:text-sm font-semibold ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onHoldingsSort('stock_code')}
              >
                <div className="flex items-center space-x-1">
                  <span>股票</span>
                  <SortIcon field="stock_code" currentSort={holdingsSort} />
                </div>
              </th>
              <th 
                className={`hidden sm:table-cell px-2 py-2 sm:px-3 sm:py-3 text-right text-xs sm:text-sm font-semibold ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onHoldingsSort('quantity')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>持仓数</span>
                  <SortIcon field="quantity" currentSort={holdingsSort} />
                </div>
              </th>
              <th 
                className={`hidden md:table-cell px-2 py-2 sm:px-3 sm:py-3 text-right text-xs sm:text-sm font-semibold ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onHoldingsSort('current_price')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>现价 / 成本</span>
                  <SortIcon field="current_price" currentSort={holdingsSort} />
                </div>
              </th>
              <th 
                className={`px-2 py-2 sm:px-4 sm:py-3 text-right text-xs sm:text-sm font-semibold ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onHoldingsSort('total_value')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>市值 (占比)</span>
                  <SortIcon field="total_value" currentSort={holdingsSort} />
                </div>
              </th>
              <th 
                className={`px-2 py-2 sm:px-4 sm:py-3 text-right text-xs sm:text-sm font-semibold ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onHoldingsSort('profit_loss_percentage')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>浮动盈亏</span>
                  <SortIcon field="profit_loss_percentage" currentSort={holdingsSort} />
                </div>
              </th>
              {onAnalyzeStock && (
                <th className={`px-2 py-2 sm:px-3 sm:py-3 text-right text-xs sm:text-sm font-semibold ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                  <span className="hidden sm:inline">分析</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className={`divide-y ${themes[theme].border}`}>
            {showSkeleton
              ? Array.from({ length: holdingsPerPage }, (_, idx) => (
                  <tr key={`sk-${idx}`} className={themes[theme].cardHover}>
                    <td className="px-2 py-2.5 sm:px-4 sm:py-3">
                      <div className="h-5 w-24 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
                      <div className="mt-1 h-3.5 w-32 rounded bg-gray-200/60 dark:bg-gray-800/60 animate-pulse" />
                    </td>
                    <td className="hidden sm:table-cell px-2 py-2.5 sm:px-3 sm:py-3">
                      <div className="ml-auto h-5 w-16 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
                    </td>
                    <td className="hidden md:table-cell px-2 py-2.5 sm:px-3 sm:py-3">
                      <div className="ml-auto h-5 w-20 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
                    </td>
                    <td className="px-2 py-2.5 sm:px-4 sm:py-3">
                      <div className="ml-auto h-5 w-24 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
                    </td>
                    <td className="px-2 py-2.5 sm:px-4 sm:py-3">
                      <div className="ml-auto h-5 w-16 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
                    </td>
                    {onAnalyzeStock && (
                      <td className="px-2 py-2.5 sm:px-3 sm:py-3">
                        <div className="ml-auto h-7 w-12 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
                      </td>
                    )}
                  </tr>
                ))
              : paginatedHoldings.map((holding) => {
                  const isProfit = (holding.profit_loss ?? 0) >= 0;
                  return (
                    <tr key={holding.stock_code} className={`transition-colors duration-150 ${themes[theme].cardHover}`}>
                      <td className="px-2 py-2.5 sm:px-4 sm:py-3 truncate">
                        <div className="flex flex-col">
                          <div className={`text-sm sm:text-base font-semibold font-mono ${themes[theme].text}`}>{holding.stock_code}</div>
                          <div className={`text-xs sm:text-sm ${themes[theme].text} opacity-75 truncate max-w-full`}>{holding.stock_name}</div>
                        </div>
                      </td>
                      <td className={`hidden sm:table-cell px-2 py-2.5 sm:px-3 sm:py-3 text-right font-mono tabular-nums ${themes[theme].text}`}>
                        <div className="text-sm sm:text-base font-medium">{holding.quantity?.toLocaleString() ?? '--'}</div>
                        <div className="text-[11px] opacity-50">股</div>
                      </td>
                      <td className={`hidden md:table-cell px-2 py-2.5 sm:px-3 sm:py-3 text-right font-mono tabular-nums ${themes[theme].text}`}>
                        <div className="text-sm sm:text-base font-medium">{holding.current_price?.toFixed(2) ?? '--'}</div>
                        <div className="text-[11px] opacity-50">{holding.average_price?.toFixed(2) ?? '--'}</div>
                      </td>
                      <td className={`px-2 py-2.5 sm:px-4 sm:py-3 text-right ${themes[theme].text}`}>
                        <div className="text-sm sm:text-base font-semibold font-mono tabular-nums">{formatCurrency(holding.total_value, currencyConfig)}</div>
                        <div className="text-xs opacity-60 font-mono">
                          {totalPortfolioValue > 0 ? ((holding.total_value / totalPortfolioValue) * 100).toFixed(2) : '0.00'}%
                        </div>
                      </td>
                      <td className={`px-2 py-2.5 sm:px-4 sm:py-3 text-right font-mono tabular-nums font-medium ${
                        isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        <div className="hidden sm:block text-sm sm:text-base font-semibold">
                          {isProfit ? '+' : ''}{formatCurrency(holding.profit_loss ?? 0, currencyConfig)}
                        </div>
                        <div className="text-xs sm:text-sm">
                          {isProfit ? '+' : ''}{holding.profit_loss_percentage.toFixed(2)}%
                        </div>
                      </td>
                      {onAnalyzeStock && (
                        <td className="px-2 py-2.5 sm:px-3 sm:py-3">
                          <div className="flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onAnalyzeStock(holding.stock_code, holding.stock_name);
                              }}
                              className={`px-2 py-1 rounded-md text-xs ${themes[theme].secondary} flex items-center gap-1 btn-tactile opacity-85 hover:opacity-100 whitespace-nowrap`}
                              title="个股分析"
                            >
                              <TrendingUp size={14} />
                              <span className="hidden sm:inline">分析</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className={`text-xs sm:text-sm ${themes[theme].text} opacity-75`}>
          {showSkeleton
            ? '正在加载持仓…'
            : `显示 ${Math.min(holdings.length, (holdingsPage - 1) * holdingsPerPage + 1)} 到 ${Math.min(holdings.length, holdingsPage * holdingsPerPage)} 条，共 ${holdings.length} 条持仓`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onHoldingsPageChange(Math.max(1, holdingsPage - 1))}
            disabled={showSkeleton || holdingsPage === 1}
            className={`p-1.5 rounded-md btn-tactile ${themes[theme].secondary} ${
              showSkeleton || holdingsPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => onHoldingsPageChange(Math.min(totalHoldingsPages, holdingsPage + 1))}
            disabled={showSkeleton || holdingsPage === totalHoldingsPages}
            className={`p-1.5 rounded-md btn-tactile ${themes[theme].secondary} ${
              showSkeleton || holdingsPage === totalHoldingsPages ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
