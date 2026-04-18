import React from 'react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import type { Trade } from '../../../lib/services/types';
import { formatCurrency } from '../../../shared/utils/format';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCurrency } from '../../../lib/context/CurrencyContext';

interface TradesTableProps {
  theme: Theme;
  trades: Trade[];
  paginatedTrades: Trade[];
  tradesPage: number;
  tradesPerPage: number;
  totalTradesPages: number;
  onTradesPageChange: (page: number) => void;
  onTradesPerPageChange: (value: number) => void;
  onSort: (field: string) => void;
  sort: { field: string; direction: 'asc' | 'desc' };
  // 新增：可选是否显示内部标题
  showHeader?: boolean;
}

export function TradesTable({
  theme,
  trades,
  paginatedTrades,
  tradesPage,
  tradesPerPage,
  totalTradesPages,
  onTradesPageChange,
  onTradesPerPageChange,
  sort,
  onSort,
  showHeader = true,
}: TradesTableProps) {
  const { currencyConfig } = useCurrency();

  return (
    <div>
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h3 className={`text-lg sm:text-xl font-semibold ${themes[theme].text} whitespace-nowrap`}>成交记录</h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <button
              type="button"
              onClick={() => onSort('created_at')}
              className={`sm:hidden w-full inline-flex items-center justify-center px-2 py-1 rounded-md text-sm ${themes[theme].secondary} ${themes[theme].text}`}
            >
              时间
              {sort.field === 'created_at' ? (
                <span className="ml-1">{sort.direction === 'asc' ? '↑' : '↓'}</span>
              ) : (
                <span className="ml-1 opacity-70">↓</span>
              )}
            </button>
            <select
              value={tradesPerPage}
              onChange={(e) => onTradesPerPageChange(Number(e.target.value))}
              className={`w-full sm:w-auto px-2 py-1 rounded-md text-sm sm:text-base ${themes[theme].input} ${themes[theme].text}`}
            >
              <option value={5}>每页 5 条</option>
              <option value={10}>每页 10 条</option>
              <option value={20}>每页 20 条</option>
            </select>
          </div>
        </div>
      )}

      {!showHeader && (
        <div className="sm:hidden flex justify-end mb-2">
          <button
            type="button"
            onClick={() => onSort('created_at')}
            className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-sm ${themes[theme].secondary} ${themes[theme].text}`}
          >
            时间
            <span className="ml-1">{sort.direction === 'asc' ? '↑' : '↓'}</span>
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead className={`${themes[theme].background} border-b-2 ${themes[theme].border}`}>
            <tr>
              <th 
                className={`hidden sm:table-cell w-[140px] lg:w-auto px-3 sm:px-6 py-2 sm:py-4 text-left text-xs sm:text-sm font-bold ${themes[theme].text} uppercase tracking-wider cursor-pointer transition-colors duration-200 hover:opacity-80`}
                onClick={() => onSort('created_at')}
              >
                <div className="flex items-center gap-1">
                  日期
                  {sort.field === 'created_at' && (
                    <span className="text-blue-500">
                      {sort.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                className={`px-3 sm:px-6 py-2 sm:py-4 text-left text-xs sm:text-sm font-bold ${themes[theme].text} uppercase tracking-wider`}
              >
                股票
              </th>
              <th 
                className={`hidden sm:table-cell px-6 py-4 text-center text-sm font-bold ${themes[theme].text} uppercase tracking-wider`}
              >
                方向
              </th>
              <th 
                className={`hidden sm:table-cell px-6 py-4 text-right text-sm font-bold ${themes[theme].text} uppercase tracking-wider`}
              >
                价格
              </th>
              <th 
                className={`hidden sm:table-cell px-6 py-4 text-right text-sm font-bold ${themes[theme].text} uppercase tracking-wider`}
              >
                数量
              </th>
              <th className={`hidden sm:table-cell px-6 py-4 text-right text-sm font-bold ${themes[theme].text} uppercase tracking-wider`}>
                金额
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y ${themes[theme].border}`}>
            {paginatedTrades.map((trade, idx) => (
              <tr key={`${trade.stock_code}-${trade.created_at}-${idx}`} className={themes[theme].cardHover}>
                <td className={`hidden sm:table-cell px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-base ${themes[theme].text} align-top`}>
                  {format(new Date(trade.created_at), 'MMM d, yyyy HH:mm')}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 align-top">
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`text-xs sm:text-base font-medium ${themes[theme].text} font-mono`}>
                            {trade.stock_code}
                          </div>
                          <span
                            className={`sm:hidden inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              trade.operation === 'buy'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                            }`}
                          >
                            {trade.operation === 'buy' ? '买入' : '卖出'}
                          </span>
                        </div>
                        <div className={`text-xs sm:text-base ${themes[theme].text} opacity-75 truncate`}>
                          {trade.stock_name}
                        </div>
                      </div>
                      <div className="sm:hidden shrink-0 text-[11px] text-right font-mono">
                        <div className={`${themes[theme].text} opacity-60 leading-4`}>
                          {format(new Date(trade.created_at), 'MM-dd HH:mm')}
                        </div>
                      </div>
                    </div>
                    <div className="sm:hidden mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                      <div className="min-w-0">
                        <div className={`${themes[theme].text} opacity-60`}>价格</div>
                        <div className={`${themes[theme].text} font-mono truncate`}>
                          {formatCurrency(trade.target_price, currencyConfig)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={`${themes[theme].text} opacity-60`}>数量</div>
                        <div className={`${themes[theme].text} font-mono truncate`}>{trade.quantity}</div>
                      </div>
                      <div className="min-w-0">
                        <div className={`${themes[theme].text} opacity-60`}>金额</div>
                        <div className={`${themes[theme].text} font-mono truncate`}>
                          {formatCurrency(trade.target_price * trade.quantity, currencyConfig)}
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
                <td className={`hidden sm:table-cell px-6 py-4 text-center align-middle`}>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold shadow-sm transition-all duration-200 ${
                      trade.operation === 'buy'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 ring-1 ring-emerald-500/20'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 ring-1 ring-rose-500/20'
                    }`}
                  >
                    {trade.operation === 'buy' ? '买入' : '卖出'}
                  </span>
                </td>
                <td className={`hidden sm:table-cell px-6 py-4 text-right text-base font-mono ${themes[theme].text}`}>
                  {formatCurrency(trade.target_price, currencyConfig)}
                </td>
                <td className={`hidden sm:table-cell px-6 py-4 text-right text-base font-mono ${themes[theme].text}`}>
                  {trade.quantity}
                </td>
                <td className={`hidden sm:table-cell px-6 py-4 text-right text-base font-mono ${themes[theme].text}`}>
                  {formatCurrency(trade.target_price * trade.quantity, currencyConfig)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
        <div className={`text-xs sm:text-base ${themes[theme].text} whitespace-normal sm:whitespace-nowrap`}>
          显示第 {Math.min(trades.length, (tradesPage - 1) * tradesPerPage + 1)} 到第 {Math.min(trades.length, tradesPage * tradesPerPage)} 条，共 {trades.length} 条记录
        </div>
        <div className="flex gap-2 self-end sm:self-auto">
          <button
            onClick={() => onTradesPageChange(Math.max(1, tradesPage - 1))}
            disabled={tradesPage === 1}
            className={`p-1.5 sm:p-1 rounded-md ${themes[theme].secondary} ${
              tradesPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={() => onTradesPageChange(Math.min(totalTradesPages, tradesPage + 1))}
            disabled={tradesPage === totalTradesPages}
            className={`p-1.5 sm:p-1 rounded-md ${themes[theme].secondary} ${
              tradesPage === totalTradesPages ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
