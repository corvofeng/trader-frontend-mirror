import React, { useState } from 'react';
import { format } from 'date-fns';
import { Filter, ChevronLeft, ChevronRight, ArrowUpCircle, ArrowDownCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';
import { formatCurrency } from '../../../../../shared/utils/format';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';
import type { Trade } from '../../../../../lib/services/types';

interface PortfolioTradesProps {
  recentTrades: Trade[];
  theme: Theme;
}

export function PortfolioTrades({ recentTrades, theme }: PortfolioTradesProps) {
  const [showRecentTrades, setShowRecentTrades] = useState(true);
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPerPage, setTradesPerPage] = useState(5);
  const [tradesSort, setTradesSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ 
    field: 'created_at', 
    direction: 'desc' 
  });
  const { currencyConfig } = useCurrency();

  const sortTrades = (trades: Trade[]) => {
    return [...trades].sort((a, b) => {
      const multiplier = tradesSort.direction === 'asc' ? 1 : -1;
      switch (tradesSort.field) {
        case 'created_at':
          return multiplier * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        case 'stock_code':
          return multiplier * a.stock_code.localeCompare(b.stock_code);
        case 'operation':
          return multiplier * a.operation.localeCompare(b.operation);
        case 'target_price':
          return multiplier * (a.target_price - b.target_price);
        case 'quantity':
          return multiplier * (a.quantity - b.quantity);
        default:
          return 0;
      }
    });
  };

  const handleTradesSort = (field: string) => {
    setTradesSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ field, currentSort }: { field: string, currentSort: { field: string; direction: 'asc' | 'desc' } }) => {
    if (field !== currentSort.field) {
      return <ArrowUp className="w-4 h-4 opacity-30" />;
    }
    return currentSort.direction === 'asc' ? 
      <ArrowUp className="w-4 h-4" /> : 
      <ArrowDown className="w-4 h-4" />;
  };

  const sortedTrades = sortTrades(recentTrades);
  const paginatedTrades = sortedTrades.slice(
    (tradesPage - 1) * tradesPerPage,
    tradesPage * tradesPerPage
  );
  const totalTradesPages = Math.ceil(recentTrades.length / tradesPerPage);

  if (recentTrades.length === 0) return null;

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <h2 className={`text-lg font-semibold ${themes[theme].text}`}>Recent Trades</h2>
          <button
            onClick={() => setShowRecentTrades(!showRecentTrades)}
            className={`p-2 rounded-md ${themes[theme].secondary}`}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {showRecentTrades && (
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <div className={`text-sm ${themes[theme].text}`}>
              Showing {Math.min(recentTrades.length, (tradesPage - 1) * tradesPerPage + 1)} to {Math.min(recentTrades.length, tradesPage * tradesPerPage)} of {recentTrades.length} trades
            </div>
            <select
              value={tradesPerPage}
              onChange={(e) => setTradesPerPage(Number(e.target.value))}
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
                    onClick={() => handleTradesSort('created_at')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Date</span>
                      <SortIcon field="created_at" currentSort={tradesSort} />
                    </div>
                  </th>
                  <th 
                    className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleTradesSort('stock_code')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Stock</span>
                      <SortIcon field="stock_code" currentSort={tradesSort} />
                    </div>
                  </th>
                  <th 
                    className={`px-6 py-3 text-center text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleTradesSort('operation')}
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <span>Operation</span>
                      <SortIcon field="operation" currentSort={tradesSort} />
                    </div>
                  </th>
                  <th 
                    className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleTradesSort('target_price')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Price</span>
                      <SortIcon field="target_price" currentSort={tradesSort} />
                    </div>
                  </th>
                  <th 
                    className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleTradesSort('quantity')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Quantity</span>
                      <SortIcon field="quantity" currentSort={tradesSort} />
                    </div>
                  </th>
                  <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${themes[theme].border}`}>
                {paginatedTrades.map((trade) => (
                  <tr key={trade.id} className={themes[theme].cardHover}>
                    <td className={`px-6 py-4 text-sm ${themes[theme].text}`}>
                      {format(new Date(trade.created_at), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className={`text-sm font-medium ${themes[theme].text}`}>{trade.stock_code}</div>
                        <div className={`text-sm ${themes[theme].text} opacity-75`}>{trade.stock_name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {trade.operation === 'buy' ? (
                          <ArrowUpCircle className="w-5 h-5" style={{ color: currencyConfig.region === 'CN' || currencyConfig.region === 'JP' ? '#ef5350' : '#26a69a' }} />
                        ) : (
                          <ArrowDownCircle className="w-5 h-5" style={{ color: currencyConfig.region === 'CN' || currencyConfig.region === 'JP' ? '#26a69a' : '#ef5350' }} />
                        )}
                      </div>
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

          <div className="flex justify-end mt-4">
            <div className="flex gap-2">
              <button
                onClick={() => setTradesPage(Math.max(1, tradesPage - 1))}
                disabled={tradesPage === 1}
                className={`p-1 rounded-md ${themes[theme].secondary} ${
                  tradesPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setTradesPage(Math.min(totalTradesPages, tradesPage + 1))}
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
      )}
    </div>
  );
}