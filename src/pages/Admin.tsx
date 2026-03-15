import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, Calendar, RefreshCw, BookOpen, History as HistoryIcon, ListChecks } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, isSameMonth, isSameDay } from 'date-fns';
import { logger } from '../shared/utils/logger';
import { Theme, themes } from '../lib/theme';
import { AccountSelector } from '../shared/components/AccountSelector';
import { TabNavigation } from './Journal/components/TabNavigation';
import { OperationsView } from './Journal/features';
import { authService, optionsService } from '../lib/services';
import type { OptionOrder } from '../lib/services/types';
import { AnalysisTab } from './Journal/components/AnalysisTab';
import { HistoryTradesChart } from '../features/trading/components/HistoryTradesChart';
import { DailyTradeHistory } from '../features/trading/components/DailyTradeHistory';
import { SequentialTradeTasks } from '../features/options/components/SequentialTradeTasks';

interface AdminProps {
  theme: Theme;
}

type AdminTab = 'operations' | 'calendar' | 'analysis' | 'history' | 'tasks';

export function Admin({ theme }: AdminProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') as AdminTab;
    return tab && ['operations', 'calendar', 'analysis', 'history', 'tasks'].includes(tab) ? tab : 'operations';
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    const alias =
      localStorage.getItem('adminSelectedAccountAlias') ||
      localStorage.getItem('adminAccountId') ||
      localStorage.getItem('optionsSelectedAccountAlias') ||
      localStorage.getItem('journalSelectedAccountAlias') ||
      localStorage.getItem('selectedAccountAlias') ||
      localStorage.getItem('selectedAccountId');
    const cookie = typeof document !== 'undefined'
      ? (document.cookie
          ? (document.cookie
              .split(';')
              .map(s => s.trim())
              .find(s => s.startsWith('adminAccountId='))?.split('=')[1] ?? null)
          : null)
      : null;
    return cookie || alias || null;
  });

  const [refreshKey, setRefreshKey] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const effectiveUserId = userId ?? 'demo';
  const [historyDateRange] = useState(() => ({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  }));

  const [ordersByDate, setOrdersByDate] = useState<Record<string, OptionOrder[]>>({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [tradingDaysByYear, setTradingDaysByYear] = useState<Record<number, Set<string>>>({});
  const [tradingCalendarError, setTradingCalendarError] = useState<string | null>(null);
  const [ordersStatsByMonth, setOrdersStatsByMonth] = useState<Record<string, Record<string, { completed_count: number; pending_count: number; junk_count: number; total_count: number }>>>({});
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());

  const handleTabChange = (newTab: AdminTab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', newTab);
    navigate(`/admin?${params.toString()}`, { replace: true });
  };

  React.useEffect(() => {
    authService.getUser().then(res => {
      const u = res?.data?.user;
      setUserId(u?.id || null);
    }).catch(() => setUserId(null));
  }, []);

  React.useEffect(() => {
    if (activeTab === 'calendar') {
      setOrdersByDate({});
      setOrdersStatsByMonth({});
    }
  }, [refreshKey, activeTab]);

  const loadOrdersForDate = React.useCallback(async (dateStr: string) => {
    if (!selectedAccountId) return;
    try {
      setOrdersLoading(true);
      setOrdersError(null);
      const { data, error } = await optionsService.getOptionOrders(selectedAccountId, effectiveUserId || null, { date: dateStr });
      if (error) {
        throw error;
      }
      setOrdersByDate(prev => ({
        ...prev,
        [dateStr]: data || []
      }));
    } catch (err) {
      console.error('Failed to load orders', err);
      setOrdersError('加载订单失败');
    } finally {
      setOrdersLoading(false);
    }
  }, [selectedAccountId, effectiveUserId]);

  React.useEffect(() => {
    if (activeTab !== 'calendar') return;
    if (!selectedAccountId) {
      setOrdersByDate({});
      return;
    }
    if (!selectedDate) return;
    if (ordersByDate[selectedDate]) return;
    loadOrdersForDate(selectedDate);
  }, [activeTab, selectedAccountId, selectedDate, ordersByDate, loadOrdersForDate]);

  React.useEffect(() => {
    if (activeTab !== 'calendar') return;
    if (!selectedAccountId) return;
    const monthKey = format(currentMonth, 'yyyy-MM');

    let cancelled = false;
    const fetchStats = async () => {
      try {
        const { data, error } = await optionsService.getOptionOrdersStats(selectedAccountId, monthKey);
        if (!cancelled && !error && data) {
          setOrdersStatsByMonth(prev => ({
            ...prev,
            [monthKey]: data
          }));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load orders stats', err);
        }
      }
    };
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentMonth, selectedAccountId]);

  React.useEffect(() => {
    if (activeTab !== 'calendar') return;
    const year = currentMonth.getFullYear();
    if (tradingDaysByYear[year]) return;
    let cancelled = false;
    const fetchTradingCalendar = async () => {
      try {
        const response = await fetch(`/api/trading-calendar?year=${year}`);
        if (!response.ok) {
          throw new Error('Failed to load trading calendar');
        }
        const raw = await response.json();
        let tradingDates: string[] = [];
        if (Array.isArray(raw)) {
          const stringDates = raw.filter((v): v is string => typeof v === 'string');
          if (stringDates.length > 0) {
            tradingDates = stringDates;
          } else {
            const objects = raw.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
            tradingDates = objects
              .filter(d => {
                const type = d.type;
                const isTrading = d.is_trading_day ?? d.trading ?? d.is_open;
                return isTrading === true || type === 'TRADING';
              })
              .map(d => (d.date ?? d.day ?? d.trading_date))
              .filter((v): v is string => typeof v === 'string');
          }
        } else if (raw && typeof raw === 'object') {
          const obj = raw as Record<string, unknown>;
          if (Array.isArray(obj.trading_days)) {
            tradingDates = obj.trading_days.filter((v): v is string => typeof v === 'string');
          } else {
            const list = Array.isArray(obj.data)
              ? obj.data
              : Array.isArray(obj.days)
                ? obj.days
                : [];
            const objects = list.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
            tradingDates = objects
              .filter(d => {
                const type = d.type;
                const isTrading = d.is_trading_day ?? d.trading ?? d.is_open;
                return isTrading === true || type === 'TRADING';
              })
              .map(d => (d.date ?? d.day ?? d.trading_date))
              .filter((v): v is string => typeof v === 'string');
          }
        }
        if (!cancelled && tradingDates.length > 0) {
          setTradingDaysByYear(prev => ({
            ...prev,
            [year]: new Set(tradingDates),
          }));
          setTradingCalendarError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load trading calendar', err);
          setTradingCalendarError('交易日历加载失败');
        }
      }
    };
    fetchTradingCalendar();
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentMonth, tradingDaysByYear]);

  const tabs = [
    { id: 'operations' as AdminTab, name: 'Operations', icon: Activity },
    { id: 'calendar' as AdminTab, name: 'Calendar', icon: Calendar },
    { id: 'analysis' as AdminTab, name: 'Analysis', icon: BookOpen },
    { id: 'history' as AdminTab, name: 'History', icon: HistoryIcon },
    { id: 'tasks' as AdminTab, name: 'Tasks', icon: ListChecks },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      <div className="space-y-6 mb-6">
        <div className={`${themes[theme].card} rounded-lg p-4`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className={`text-2xl font-bold ${themes[theme].text}`}>Admin</h1>
              <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                跨账户通用管理与监控
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AccountSelector
                userId={effectiveUserId}
                theme={theme}
                selectedAccountId={selectedAccountId}
                onAccountChange={(accountId) => {
                  setSelectedAccountId(accountId);
                  try {
                    localStorage.setItem('adminAccountId', accountId);
                    localStorage.setItem('adminSelectedAccountAlias', accountId);
                  } catch {
                    logger.debug('[Pages/Admin] Failed to persist adminAccountId to localStorage');
                  }
                  try {
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + 30);
                    document.cookie = `adminAccountId=${encodeURIComponent(accountId)}; expires=${expiryDate.toUTCString()}; path=/`;
                  } catch {
                    logger.debug('[Pages/Admin] Failed to persist adminAccountId to cookie');
                  }
                  setRefreshKey(k => k + 1);
                }}
                mode="all"
                showCreate={false}
                refreshKey={refreshKey}
              />
              <button
                onClick={() => setRefreshKey(k => k + 1)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${themes[theme].secondary}`}
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>
          </div>
        </div>

        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          theme={theme}
          onTabChange={(tab) => handleTabChange(tab as AdminTab)}
        />
      </div>

      {activeTab === 'operations' && (
        <OperationsView theme={theme} accountAlias={selectedAccountId} />
      )}

      {activeTab === 'analysis' && (
        <AnalysisTab
          theme={theme}
          portfolioUuid={null}
          userId={effectiveUserId}
          selectedAccountId={selectedAccountId}
          activeTab={activeTab}
        />
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          <HistoryTradesChart
            theme={theme}
            startDate={historyDateRange.startDate}
            endDate={historyDateRange.endDate}
            selectedAccountId={selectedAccountId}
          />
          <DailyTradeHistory
            theme={theme}
            startDate={historyDateRange.startDate}
            endDate={historyDateRange.endDate}
            selectedAccountId={selectedAccountId}
          />
        </div>
      )}

      {activeTab === 'tasks' && (
        <SequentialTradeTasks theme={theme} selectedAccountId={selectedAccountId} />
      )}

      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className={`${themes[theme].card} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className={`text-xl font-bold ${themes[theme].text}`}>订单日历</h2>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>
                  按日期浏览并筛选订单
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`p-2 rounded ${themes[theme].secondary}`}
                  onClick={() => setCurrentMonth(prev => addMonths(prev, -1))}
                >
                  ‹
                </button>
                <div className={`text-sm font-medium ${themes[theme].text}`}>
                  {format(currentMonth, 'yyyy年MM月')}
                </div>
                <button
                  className={`p-2 rounded ${themes[theme].secondary}`}
                  onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
                >
                  ›
                </button>
              </div>
            </div>

            {!selectedAccountId && (
              <div className={`text-sm ${themes[theme].text} opacity-75`}>
                请先在上方选择账户以加载订单。
              </div>
            )}

            {selectedAccountId && (
              <div className="space-y-4">
                <div className="grid grid-cols-7 gap-1 text-xs mb-3">
                  {['日', '一', '二', '三', '四', '五', '六'].map(label => (
                    <div
                      key={label}
                      className={`text-center font-semibold ${themes[theme].text} opacity-80 py-1 rounded-md`}
                    >
                      周{label}
                    </div>
                  ))}
                </div>
                <div key={format(currentMonth, 'yyyy-MM')} className="grid grid-cols-7 gap-1 animate-fade-in-up">
                  {(() => {
                    const monthStart = startOfMonth(currentMonth);
                    const monthEnd = endOfMonth(monthStart);
                    const start = startOfWeek(monthStart, { weekStartsOn: 0 });
                    const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
                    const days = eachDayOfInterval({ start, end });
                    const year = currentMonth.getFullYear();
                    const tradingSet = tradingDaysByYear[year];
                    const monthKey = format(currentMonth, 'yyyy-MM');
                    const monthStats = ordersStatsByMonth[monthKey];
                    return days.map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isCurrentMonth = isSameMonth(day, monthStart);
                      const isSelected = selectedDate && isSameDay(day, new Date(selectedDate));
                      const isTradingDay = !!tradingSet && tradingSet.has(dateStr);
                      const stats = monthStats ? monthStats[dateStr] : undefined;
                      let baseClass = 'border rounded-lg p-1 h-20 flex flex-col items-center justify-between cursor-pointer text-xs transition-colors duration-150 ease-out';
                      if (isTradingDay) {
                        baseClass += ' bg-emerald-50/70 dark:bg-emerald-900/25 border-emerald-400 dark:border-emerald-500 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40';
                      } else {
                        baseClass += ` ${themes[theme].border} bg-slate-50/40 dark:bg-slate-900/10 hover:bg-slate-100/60 dark:hover:bg-slate-900/40`;
                      }
                      if (isSelected) {
                        baseClass += ' ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/40';
                      }
                      if (!isCurrentMonth) {
                        baseClass += ' opacity-50';
                      }
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          className={baseClass}
                          onClick={() => {
                            const isSame = selectedDate === dateStr;
                            setSelectedDate(dateStr);
                            if (ordersByDate[dateStr] || isSame) {
                              loadOrdersForDate(dateStr);
                            }
                          }}
                        >
                          <div className="w-full flex items-start justify-between">
                            <div className={`text-xs ${themes[theme].text}`}>
                              {format(day, 'd')}
                            </div>
                            {stats && (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100 px-1.5 py-0.5 text-[10px] font-medium">
                                  共 {stats.total_count}
                                </span>
                                <div className="flex flex-wrap justify-end gap-0.5 max-w-full">
                                  {stats.pending_count > 0 && (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100 px-1.5 py-0.5 text-[10px] font-medium">
                                      待 {stats.pending_count}
                                    </span>
                                  )}
                                  {stats.junk_count > 0 && (
                                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100 px-1.5 py-0.5 text-[10px] font-medium">
                                      废 {stats.junk_count}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
                {tradingCalendarError && (
                  <div className="text-xs text-red-500">
                    {tradingCalendarError}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`${themes[theme].card} rounded-lg p-4 animate-fade-in-up animation-delay-200`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  {selectedDate ? `${selectedDate} 的订单` : '订单'}
                </h3>
                <p className={`text-xs ${themes[theme].text} opacity-70`}>
                  按日查看下单、成交和状态
                </p>
              </div>
            </div>

            {!selectedAccountId && (
              <div className={`text-sm ${themes[theme].text} opacity-75`}>
                请选择账户后再查看订单明细。
              </div>
            )}

            {selectedAccountId && (
              <>
                {ordersLoading && (
                  <div className="py-6 text-center text-sm text-gray-500">
                    正在加载订单明细...
                  </div>
                )}
                {!ordersLoading && !!ordersError && (
                  <div className="py-6 text-center text-sm text-red-500">
                    {ordersError}
                  </div>
                )}
                {!ordersLoading && !ordersError && selectedDate && (!ordersByDate[selectedDate] || ordersByDate[selectedDate].length === 0) && (
                  <div className="py-6 text-center text-sm text-gray-500">
                    该日暂无订单记录。
                  </div>
                )}
                {!ordersLoading && !ordersError && selectedDate && ordersByDate[selectedDate] && ordersByDate[selectedDate].length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">方向</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">价格</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">数量 (成/总)</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {ordersByDate[selectedDate].map((order, idx) => (
                          <tr key={`${selectedDate}-${idx}`}>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              {order.order_time ? (order.order_time.split(' ')[1] || order.order_time) : '-'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <div className="font-medium">{order.instrument_name}</div>
                              {order.is_combination && (
                                <span className="text-[10px] text-purple-500 bg-purple-100 dark:bg-purple-900 px-1 rounded">组合</span>
                              )}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs">
                              <span
                                className={`px-2 py-1 rounded-full text-[10px] font-medium ${
                                  ((order.op_type_name || '').includes('OPEN') || (order.op_type_name_zh || '').includes('开'))
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {order.op_type_name_zh || order.op_type_name}
                              </span>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-right text-gray-700 dark:text-gray-200">
                              <div>限价 {order.limit_price?.toFixed ? order.limit_price.toFixed(4) : order.limit_price}</div>
                              {order.traded_price ? (
                                <div className="text-[10px] text-gray-500">
                                  成交 {order.traded_price?.toFixed ? order.traded_price.toFixed(4) : order.traded_price}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-right text-gray-700 dark:text-gray-200">
                              {order.volume_traded}/{order.volume_total_original}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <div>{order.order_status_name}</div>
                              {order.order_status_name === 'JUNK' && order.cancel_info && (
                                <div className="text-[10px] text-red-500 mt-1 whitespace-normal break-all max-w-[240px]">
                                  {order.cancel_info}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
