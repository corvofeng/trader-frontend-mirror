import React, { useState } from 'react';
import { logger } from '../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, TrendingUp, Briefcase, Calculator, RefreshCw, Shield, Calendar, Activity, BookOpen } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, isSameMonth, isSameDay } from 'date-fns';
import { Theme, themes } from '../lib/theme';
import { OptionsChain } from '../features/options/components/OptionsChain';
import { TimeValueChart } from '../features/options/components/TimeValueChart';
import { VolatilitySurface } from '../features/options/components/VolatilitySurface';
import { OptionsPortfolio } from '../features/options/components/OptionsPortfolio';
import { RiskAnalysis } from '../features/options/components/RiskAnalysis';
import { OptionsTradePlans } from '../features/options/components/OptionsTradePlans';
import { OptionsCalculatorCard } from '../features/options/components/OptionsCalculatorCard';
import { OptionsCalculatorModal } from './options/OptionsCalculatorModal';
import { RelatedLinks, AccountSelector } from '../shared/components';
import { optionsService, authService } from '../lib/services';
import { OptionsPortfolioManagement } from '../features/options/components/OptionsPortfolioManagement';
import { OptionWhitelistManager } from '../features/options/components/OptionWhitelistManager';
import { OptionsAnalysisTab } from './Options/components/OptionsAnalysisTab';
import type { OptionsData, OptionOrder } from '../lib/services/types';
import { OptionPriceWebSocketProvider } from '../features/options/context/OptionPriceWebSocketContext';
import { TabNavigation } from './Journal/components/TabNavigation';

interface OptionsProps {
  theme: Theme;
}

type OptionsTab = 'data' | 'portfolio' | 'trading' | 'management' | 'whitelist' | 'calendar' | 'risk' | 'analysis';

export function Options({ theme }: OptionsProps) {
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'sequential') {
      params.set('tab', 'tasks');
      navigate(`/admin?${params.toString()}`, { replace: true });
    }
  }, [location.search, navigate]);

  const [activeTab, setActiveTab] = useState<OptionsTab>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') as OptionsTab;
    return tab && ['data', 'portfolio', 'trading', 'management', 'whitelist', 'calendar', 'risk', 'analysis'].includes(tab) ? tab : 'data';
  });

  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    const alias = localStorage.getItem('optionsSelectedAccountAlias');
    const legacyAlias = localStorage.getItem('selectedAccountAlias');
    const legacyId = localStorage.getItem('selectedAccountId');
    const ls = alias || legacyAlias || legacyId;
    const cookie = typeof document !== 'undefined'
      ? (document.cookie
          ? (() => {
              const parts = document.cookie.split(';').map(s => s.trim());
              const current = parts.find(s => s.startsWith('optionsSelectedAccountId='))?.split('=')[1];
              if (current) return current;
              const legacy = parts.find(s => s.startsWith('selectedAccountId='))?.split('=')[1];
              return legacy ?? null;
            })()
          : null)
      : null;
    return cookie || ls || null;
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const effectiveUserId = userId ?? 'demo';

  const [ordersByDate, setOrdersByDate] = useState<Record<string, OptionOrder[]>>({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [tradingDaysByYear, setTradingDaysByYear] = useState<Record<number, Set<string>>>({});
  const [tradingCalendarError, setTradingCalendarError] = useState<string | null>(null);
  const [ordersStatsByMonth, setOrdersStatsByMonth] = useState<Record<string, Record<string, { completed_count: number; pending_count: number; junk_count: number; total_count: number }>>>({});
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());

  const handleTabChange = (newTab: OptionsTab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', newTab);
    navigate(`/options?${params.toString()}`, { replace: true });
  };

  // Fetch available symbols on component mount
  React.useEffect(() => {
    const fetchAvailableSymbols = async () => {
      try {
        setIsLoadingSymbols(true);
        const { data, error } = await optionsService.getAvailableSymbols();
        
        if (error) {
          throw error;
        }
        
        if (data && data.length > 0) {
          setAvailableSymbols(data);
          setSelectedSymbol(data[0]); // Set first symbol as default
        }
      } catch (err) {
        console.error('Error fetching available symbols:', err);
        // 不使用默认回退数据，只有当接口返回成功时才设置 selectedSymbol
        setAvailableSymbols([]);
      } finally {
        setIsLoadingSymbols(false);
      }
    };

    fetchAvailableSymbols();
  }, []);

  React.useEffect(() => {
    authService.getUser().then(res => {
      const u = res?.data?.user;
      setUserId(u?.id || null);
    }).catch(() => setUserId(null));
  }, []);

  // Fetch options data when selected symbol changes (only for data tab)
  React.useEffect(() => {
    const fetchOptionsData = async () => {
    if (!selectedSymbol || activeTab !== 'data') {
      logger.debug('[Pages/Options] Guard: selectedSymbol missing or tab not data', {
        selectedSymbol,
        activeTab,
      });
      return;
    }
      
      try {
        setIsLoading(true);
        setError(null);
        const { data, error } = await optionsService.getOptionsData(selectedSymbol);
        
        if (error) {
          throw error;
        }
        
        if (data) {
          setOptionsData(data);
          // Set the first expiry date as default
          const uniqueExpiryDates = Array.from(new Set(data.quotes.map(q => q.expiry)))
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          if (uniqueExpiryDates.length > 0) {
            setSelectedExpiry(uniqueExpiryDates[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching options data:', err);
        setError(err instanceof Error ? err.message : `Failed to load options data for ${selectedSymbol}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOptionsData();
  }, [selectedSymbol, activeTab, refreshKey]);

  // Handle refresh for calendar tab
  React.useEffect(() => {
    if (activeTab === 'calendar') {
      setOrdersByDate({});
      setOrdersStatsByMonth({});
      // We can also clear trading days if we want to force refresh that too, 
      // but usually trading days are static. 
      // setTradingDaysByYear({}); 
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

      // Update stats based on loaded orders to ensure consistency
      // REMOVED: We now rely on the backend stats API to provide accurate counts (including junk_count)
      // to avoid client-side calculation discrepancies.
    } catch (err) {
      console.error('Failed to load option orders', err);
      setOrdersError('加载期权订单失败');
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
    
    // Use a ref or just fetch every time month changes. 
    // We prioritize correctness over saving one request per month view.
    // Merging logic ensures we don't overwrite detailed daily stats with bulk stats.
    
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
          console.error('Failed to load option orders stats', err);
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
    { id: 'data' as OptionsTab, name: 'Market', icon: BarChart2 },
    { id: 'portfolio' as OptionsTab, name: 'Portfolio', icon: Briefcase },
    { id: 'analysis' as OptionsTab, name: 'Analysis', icon: BookOpen },
    { id: 'trading' as OptionsTab, name: 'Plans', icon: TrendingUp },
    { id: 'management' as OptionsTab, name: 'Manage', icon: Calculator },
    { id: 'whitelist' as OptionsTab, name: 'Whitelist', icon: Shield },
    { id: 'calendar' as OptionsTab, name: 'Calendar', icon: Calendar },
    { id: 'risk' as OptionsTab, name: 'Risk', icon: Activity },
  ];

  return (
    <OptionPriceWebSocketProvider>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="space-y-6">
        <div className={`${themes[theme].card} rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${themes[theme].text}`}>
                Options Trading Analysis
              </h1>
              <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                Advanced options analysis and trading tools
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  账户:
                </label>
                <AccountSelector
                  userId={effectiveUserId}
                  theme={theme}
                  selectedAccountId={selectedAccountId}
                  onAccountChange={(id) => {
                    setSelectedAccountId(id);
                    try {
                      localStorage.setItem('optionsSelectedAccountId', id);
                      localStorage.setItem('optionsSelectedAccountAlias', id);
                    } catch {
                      logger.debug('[Pages/Options] Failed to persist selectedAccountId to localStorage');
                    } 
                    try {
                      const expiryDate = new Date();
                      expiryDate.setDate(expiryDate.getDate() + 30);
                      document.cookie = `optionsSelectedAccountId=${encodeURIComponent(id)}; expires=${expiryDate.toUTCString()}; path=/`;
                    } catch {
                      logger.debug('[Pages/Options] Failed to persist selectedAccountId to cookie');
                    } 
                    setRefreshKey((k) => k + 1);
                  }}
                  refreshKey={refreshKey}
                />
                <button
                  onClick={() => setRefreshKey((k) => k + 1)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${themes[theme].secondary}`}
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  Symbol:
                </label>
                {availableSymbols.length > 0 ? (
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    disabled={isLoading || isLoadingSymbols}
                    className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text} ${
                      isLoading || isLoadingSymbols ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {availableSymbols.map(symbol => (
                      <option key={symbol} value={symbol}>
                        {symbol}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-sm ${themes[theme].text} opacity-70`}>
                    No symbols available
                  </span>
                )}
              </div>
              {(isLoading || isLoadingSymbols) && activeTab === 'data' && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              )}
            </div>
          </div>
        </div>

        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          theme={theme}
          onTabChange={handleTabChange}
        />

        {activeTab === 'data' && (
          <div className="space-y-6">
            {(isLoading || isLoadingSymbols) && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">
                  {isLoadingSymbols ? 'Loading available symbols...' : (selectedSymbol ? `Loading options data for ${selectedSymbol}...` : 'Waiting for symbol selection...')}
                </p>
              </div>
            )}

            {error && (
              <div className="text-center py-12">
                <div className="text-red-500 mb-4">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-4">{error}</p>
                {selectedSymbol && (
                  <button
                    onClick={() => setSelectedSymbol(selectedSymbol)} // Trigger re-fetch
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {!isLoading && !isLoadingSymbols && !error && optionsData && selectedSymbol && (
              <>
                <OptionsChain
                  theme={theme}
                  optionsData={optionsData}
                  selectedSymbol={selectedSymbol}
                  selectedExpiry={selectedExpiry}
                  onExpiryChange={setSelectedExpiry}
                />

                <OptionsCalculatorCard
                  theme={theme}
                  onOpenCalculator={() => setShowCalculatorModal(true)}
                />

                <TimeValueChart
                  theme={theme}
                  optionsData={optionsData}
                  selectedSymbol={selectedSymbol}
                />

                <VolatilitySurface
                  theme={theme}
                  optionsData={optionsData}
                  selectedSymbol={selectedSymbol}
                />
              </>
            )}

            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=data" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="space-y-6">
              <OptionsPortfolio theme={theme} selectedAccountId={selectedAccountId} refreshKey={refreshKey} selectedSymbol={selectedSymbol} />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=portfolio" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="space-y-6">
            <OptionsAnalysisTab theme={theme} selectedSymbol={selectedSymbol} selectedAccountId={selectedAccountId} />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=analysis" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'trading' && (
          <div className="space-y-6">
            <OptionsTradePlans theme={theme} selectedSymbol={selectedSymbol} selectedAccountId={selectedAccountId} userId={userId} />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=trading" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'management' && (
          <div className="space-y-6">
            <OptionsPortfolioManagement theme={theme} selectedSymbol={selectedSymbol} />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=management" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'whitelist' && (
          <div className="space-y-6">
            <OptionWhitelistManager 
              theme={theme} 
              userId={effectiveUserId} 
              accountId={selectedAccountId}
            />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=whitelist" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className={`${themes[theme].card} rounded-lg p-4`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className={`text-xl font-bold ${themes[theme].text}`}>期权订单日历</h2>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    按日期浏览并筛选期权订单
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
                  请先在上方选择账户以加载期权订单。
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
                              // 如果数据已存在，或者用户点击当前选中的日期（可能是重试或刷新），强制刷新
                              // 如果点击不同日期且无缓存，让 useEffect 处理加载以避免重复请求
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
                    {selectedDate ? `${selectedDate} 的期权订单` : '期权订单'}
                  </h3>
                  <p className={`text-xs ${themes[theme].text} opacity-70`}>
                    按日查看期权下单、成交和状态
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
                  {!ordersLoading && !ordersError && selectedDate && (!ordersByDate[selectedDate] || ordersByDate[selectedDate].length === 0) && (
                    <div className="py-6 text-center text-sm text-gray-500">
                      该日暂无期权订单记录。
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

            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=calendar" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="space-y-6">
            <RiskAnalysis theme={theme} selectedAccountId={selectedAccountId} selectedSymbol={selectedSymbol} />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=risk" 
              maxItems={4}
            />
          </div>
        )}
      </div>

      {/* Options Calculator Modal */}
      {showCalculatorModal && (
        <OptionsCalculatorModal
          theme={theme}
          optionsData={optionsData}
          selectedSymbol={selectedSymbol}
          onClose={() => setShowCalculatorModal(false)}
        />
        )}
      </main>
    </OptionPriceWebSocketProvider>
  );
}
