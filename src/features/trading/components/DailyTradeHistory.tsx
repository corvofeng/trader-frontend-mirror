import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { authService, portfolioService } from '../../../lib/services';
import type { Trade } from '../../../lib/services/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface DailyTradeHistoryProps {
  theme: Theme;
  startDate: string;
  endDate: string;
  selectedStockCode?: string;
  selectedAccountId?: string | null;
}

// Helper: group trades by date (YYYY-MM-DD) then by stock_name (fallback stock_code)
function groupTradesDailyByStock(trades: Trade[]) {
  const map: Record<string, Record<string, Trade[]>> = {};
  for (const t of trades) {
    const day = t.created_at.split('T')[0];
    const stock = t.stock_name ?? t.stock_code;
    if (!map[day]) map[day] = {};
    if (!map[day][stock]) map[day][stock] = [];
    map[day][stock].push(t);
  }
  // Sort dates descending
  const days = Object.keys(map).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return { map, days };
}

export function DailyTradeHistory({ theme, startDate, endDate, selectedStockCode, selectedAccountId }: DailyTradeHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]); // key: `${day}|${stock}`

  useEffect(() => {
    const fetchRecentTrades = async () => {
      setIsLoading(true);
      try {
        const userResp = await authService.getUser();
        const user = userResp.data?.user;
        if (!user) {
          setTrades([]);
          return;
        }
        const resp = await portfolioService.getRecentTrades(
          user.id,
          startDate,
          endDate,
          selectedAccountId || undefined
        );
        const data = resp.data || [];
        // Optional filter by selectedStockCode
        const filtered = selectedStockCode ? data.filter(t => t.stock_code === selectedStockCode) : data;
        setTrades(filtered);
      } catch (e) {
        console.error('Failed to load recent trades for DailyTradeHistory', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecentTrades();
  }, [startDate, endDate, selectedStockCode, selectedAccountId]);

  const grouped = useMemo(() => groupTradesDailyByStock(trades), [trades]);

  const toggleDay = (day: string) => {
    setExpandedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleGroup = (day: string, stock: string) => {
    const key = `${day}|${stock}`;
    setExpandedGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  return (
    <div className={`${themes[theme].card} rounded-lg`}> 
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <h3 className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>每日交易（按股票分组）</h3>
        <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-70`}>范围：{startDate} 到 {endDate}</p>
      </div>

      {isLoading ? (
        <div className="p-6">
          <p className={`${themes[theme].text} opacity-70`}>加载中...</p>
        </div>
      ) : grouped.days.length === 0 ? (
        <div className="p-6 text-center">
          <p className={`${themes[theme].text} opacity-70`}>该时间范围内没有交易记录</p>
        </div>
      ) : (
        <div className={`divide-y ${themes[theme].border}`}>
          {grouped.days.map(day => {
            const isDayExpanded = expandedDays.includes(day);
            return (
              <div key={day} className={`p-4 sm:p-6 ${themes[theme].cardHover}`}>
                <button onClick={() => toggleDay(day)} className="w-full text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-base sm:text-lg font-medium ${themes[theme].text}`}>{format(new Date(day), 'yyyy-MM-dd')}</h4>
                      <p className={`text-xs ${themes[theme].text} opacity-60`}>股票数：{Object.keys(grouped.map[day]).length}</p>
                    </div>
                    {isDayExpanded ? (
                      <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
                    ) : (
                      <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
                    )}
                  </div>
                </button>

                {isDayExpanded && (
                  <div className="mt-4 space-y-4">
                    {Object.entries(grouped.map[day]).map(([stock, items]) => {
                      const key = `${day}|${stock}`;
                      const isGroupExpanded = expandedGroups.includes(key);
                      const displayCode = items[0]?.stock_code ?? '';
                      const buyCount = items.filter(t => t.operation === 'buy').length;
                      const sellCount = items.filter(t => t.operation === 'sell').length;
                      return (
                        <div key={key} className={`rounded-lg p-3 sm:p-4 ${themes[theme].background}`}>
                          <button onClick={() => toggleGroup(day, stock)} className="w-full text-left">
                            <div className="flex items-center justify-between">
                              <div className="flex items-baseline gap-2">
                                <span className={`text-sm sm:text-base font-medium ${themes[theme].text}`}>{stock}</span>
                                {displayCode && (
                                  <span className={`text-xs ${themes[theme].text} opacity-70`}>{displayCode}</span>
                                )}
                              </div>
                              <div className={`text-xs sm:text-sm ${themes[theme].text} opacity-80`}>
                                买 {buyCount} / 卖 {sellCount} / 共 {items.length}
                              </div>
                            </div>
                          </button>

                          {isGroupExpanded && (
                            <div className="mt-3">
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead className={`${themes[theme].background}`}>
                                    <tr>
                                      <th className={`px-3 py-2 text-left text-xs font-medium ${themes[theme].text} opacity-75`}>时间</th>
                                      <th className={`px-3 py-2 text-center text-xs font-medium ${themes[theme].text} opacity-75`}>方向</th>
                                      <th className={`px-3 py-2 text-right text-xs font-medium ${themes[theme].text} opacity-75`}>价格</th>
                                      <th className={`px-3 py-2 text-right text-xs font-medium ${themes[theme].text} opacity-75`}>数量</th>
                                      <th className={`px-3 py-2 text-right text-xs font-medium ${themes[theme].text} opacity-75`}>金额</th>
                                      <th className={`px-3 py-2 text-left text-xs font-medium ${themes[theme].text} opacity-75`}>备注</th>
                                    </tr>
                                  </thead>
                                  <tbody className={`divide-y ${themes[theme].border}`}>
                                    {items
                                      .slice()
                                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                      .map((t) => (
                                        <tr key={`${t.id}-${t.created_at}`} className={themes[theme].cardHover}>
                                          <td className={`px-3 py-2 text-sm ${themes[theme].text}`}>{format(new Date(t.created_at), 'HH:mm')}</td>
                                          <td className={`px-3 py-2 text-sm text-center ${themes[theme].text}`}>{t.operation === 'buy' ? '买入' : '卖出'}</td>
                                          <td className={`px-3 py-2 text-sm text-right ${themes[theme].text}`}>{t.target_price.toFixed(2)}</td>
                                          <td className={`px-3 py-2 text-sm text-right ${themes[theme].text}`}>{t.quantity}</td>
                                          <td className={`px-3 py-2 text-sm text-right ${themes[theme].text}`}>{(t.quantity * t.target_price).toFixed(2)}</td>
                                          <td className={`px-3 py-2 text-sm ${themes[theme].text}`}>{t.notes || '-'}</td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DailyTradeHistory;