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
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-semibold ${themes[theme].text} whitespace-nowrap`}>成交记录</h3>
          <select
            value={tradesPerPage}
            onChange={(e) => onTradesPerPageChange(Number(e.target.value))}
            className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          >
            <option value={5}>每页 5 条</option>
            <option value={10}>每页 10 条</option>
            <option value={20}>每页 20 条</option>
          </select>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className={`${themes[theme].background}`}>
            <tr>
              <th 
                className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onSort('created_at')}
              >
                日期
              </th>
              <th 
                className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onSort('stock_code')}
              >
                股票
              </th>
              <th 
                className={`px-6 py-3 text-center text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onSort('operation')}
              >
                方向
              </th>
              <th 
                className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onSort('target_price')}
              >
                价格
              </th>
              <th 
                className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                onClick={() => onSort('quantity')}
              >
                数量
              </th>
              <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                金额
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y ${themes[theme].border}`}>
            {paginatedTrades.map((trade, idx) => (
              <tr key={`${trade.stock_code}-${trade.created_at}-${idx}`} className={themes[theme].cardHover}>
                <td className={`px-6 py-4 text-sm ${themes[theme].text}`}>
                  {format(new Date(trade.created_at), 'MMM d, yyyy HH:mm')}
                </td>
                <td className="px-6 py-4">
                  <div>
                    <div className={`text-sm font-medium ${themes[theme].text}`}>{trade.stock_code}</div>
                    <div className={`text-sm ${themes[theme].text} opacity-75`}>{trade.stock_name}</div>
                  </div>
                </td>
                <td className={`px-6 py-4 text-center text-sm ${themes[theme].text}`}>
                  {trade.operation === 'buy' ? '买入' : '卖出'}
                </td>
                <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                  {formatCurrency(trade.target_price, currencyConfig)}
                </td>
                <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                  {trade.quantity}
                </td>
                <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                  {formatCurrency(trade.target_price * trade.quantity, currencyConfig)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className={`text-sm ${themes[theme].text} whitespace-nowrap`}>
          显示第 {Math.min(trades.length, (tradesPage - 1) * tradesPerPage + 1)} 到第 {Math.min(trades.length, tradesPage * tradesPerPage)} 条，共 {trades.length} 条记录
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onTradesPageChange(Math.max(1, tradesPage - 1))}
            disabled={tradesPage === 1}
            className={`p-1 rounded-md ${themes[theme].secondary} ${
              tradesPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => onTradesPageChange(Math.min(totalTradesPages, tradesPage + 1))}
            disabled={tradesPage === totalTradesPages}
            className={`p-1 rounded-md ${themes[theme].secondary} ${
              tradesPage === totalTradesPages ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}