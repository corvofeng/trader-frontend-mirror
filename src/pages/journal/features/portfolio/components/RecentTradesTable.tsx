import React from 'react';
import { format } from 'date-fns';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';
import type { Trade } from '../../../../../lib/services/types';
import type { CurrencyConfig } from '../../../../../lib/types';
import { formatCurrency } from '../../../../../lib/types';

interface RecentTradesTableProps {
  trades: Trade[];
  theme: Theme;
  currencyConfig: CurrencyConfig;
  currentPage: number;
  itemsPerPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
}

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

export function RecentTradesTable({
  trades,
  theme,
  currencyConfig,
  currentPage,
  itemsPerPage,
  totalPages,
  onPageChange,
  onItemsPerPageChange,
}: RecentTradesTableProps) {
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTrades = trades.slice(startIndex, startIndex + itemsPerPage);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className={`${themes[theme].background}`}>
            <tr>
              <th className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Date</th>
              <th className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Stock</th>
              <th className={`px-6 py-3 text-center text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Operation</th>
              <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Price</th>
              <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Quantity</th>
              <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Total</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${themes[theme].border}`}>
            {paginatedTrades.map((trade) => (
              <tr key={trade.id} className={themes[theme].cardHover}>
                <td className={`px-6 py-4 whitespace-nowrap text-sm ${themes[theme].text}`}>
                  {format(new Date(trade.created_at), 'MMM d, yyyy')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className={`text-sm font-medium ${themes[theme].text}`}>{trade.stock_code}</div>
                    <div className={`text-sm ${themes[theme].text} opacity-75`}>{trade.stock_name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex justify-center">
                    {trade.operation === 'buy' ? (
                      <ArrowUpCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <ArrowDownCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-right text-sm ${themes[theme].text}`}>
                  {formatCurrency(trade.target_price, currencyConfig)}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-right text-sm ${themes[theme].text}`}>
                  {trade.quantity}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-right text-sm ${themes[theme].text}`}>
                  {formatCurrency(trade.target_price * trade.quantity, currencyConfig)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-gray-200">
        <div className="flex items-center gap-4">
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className={`px-3 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          >
            {ITEMS_PER_PAGE_OPTIONS.map(value => (
              <option key={value} value={value}>{value} per page</option>
            ))}
          </select>
          <span className={`text-sm ${themes[theme].text}`}>
            {startIndex + 1}-{Math.min(startIndex + itemsPerPage, trades.length)} of {trades.length}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className={`p-1 rounded-md ${themes[theme].secondary} ${
              currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ArrowUpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className={`p-1 rounded-md ${themes[theme].secondary} ${
              currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <ArrowDownCircle className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
}