import React, { useState } from 'react';
import { X, LineChart } from 'lucide-react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../shared/constants/theme';
import { StockChart } from '../../trading/components/StockChart';
import type { Trade } from '../../../lib/services/types';

interface StockAnalysisModalProps {
  stockCode: string;
  stockName: string;
  theme: Theme;
  userId?: string;
  accountId?: string | null;
  onClose: () => void;
}

export function StockAnalysisModal({ stockCode, stockName, theme, userId, accountId, onClose }: StockAnalysisModalProps) {
  const [trades, setTrades] = useState<Trade[]>([]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 sm:p-4 backdrop-blur-sm">
      <div className={`${themes[theme].card} w-full h-full sm:h-[85vh] sm:max-w-5xl sm:rounded-lg flex flex-col shadow-xl`}>
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-blue-500" />
            <h2 className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>
              {stockName} ({stockCode})
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${themes[theme].text}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 min-h-0 overflow-hidden relative p-2 sm:p-4 flex flex-col gap-2 sm:gap-4">
          <div className={`${trades.length > 0 ? 'flex-[1.5] sm:flex-[2]' : 'flex-1'} min-h-0`}>
            <StockChart
              stockCode={stockCode}
              theme={theme}
              userId={userId}
              accountId={accountId}
              onTradesLoaded={setTrades}
              fillContainer
            />
          </div>

          {trades.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              <h3 className={`text-sm font-semibold mb-3 ${themes[theme].text} flex items-center gap-2`}>
                <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                交易记录
              </h3>
              <div className={`flex-1 overflow-auto border ${themes[theme].border} rounded-lg`}>
                <table className="w-full text-sm">
                  <thead className={`sticky top-0 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'} z-10 border-b ${themes[theme].border}`}>
                    <tr className={`text-left text-xs uppercase tracking-wider ${themes[theme].text} opacity-70 font-medium`}>
                      <th className="px-6 py-3 whitespace-nowrap">时间</th>
                      <th className="px-6 py-3 whitespace-nowrap">操作</th>
                      <th className="px-6 py-3 text-right whitespace-nowrap">价格</th>
                      <th className="px-6 py-3 text-right whitespace-nowrap">数量</th>
                      <th className="px-6 py-3 text-right whitespace-nowrap">总额</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${themes[theme].border} ${themes[theme].text}`}>
                    {trades.map(trade => (
                      <tr key={trade.id} className={`transition-colors hover:${theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">
                          {format(new Date(trade.created_at), 'yyyy-MM-dd HH:mm')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            trade.operation === 'buy' 
                              ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' 
                              : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                          }`}>
                            {trade.operation === 'buy' ? '买入' : '卖出'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap font-mono">
                          {trade.target_price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap font-mono">
                          {trade.quantity.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap font-mono opacity-75">
                          {(trade.target_price * trade.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
