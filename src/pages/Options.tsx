import React, { useCallback, useRef, useState } from 'react';
import { logger } from '../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BarChart2, TrendingUp, Briefcase, Calculator, RefreshCw, Shield, Activity, BookOpen, Hourglass, BellRing, Compass, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Theme, themes } from '../lib/theme';
import { OptionsChain } from '../features/options/components/OptionsChain';
import { TimeValueChart } from '../features/options/components/TimeValueChart';
import { VerticalSpreadMonthlyPricesChart } from '../features/options/components/VerticalSpreadMonthlyPricesChart';
import { VolatilitySurface } from '../features/options/components/VolatilitySurface';
import { OptionsPortfolio } from '../features/options/components/OptionsPortfolio';
import { RiskAnalysis } from '../features/options/components/RiskAnalysis';
import { OptionExpiryRiskReportsPanel } from '../features/options/components/OptionExpiryRiskReportsPanel';
import { OptionsTradePlans } from '../features/options/components/OptionsTradePlans';
import { OptionsCalculatorCard } from '../features/options/components/OptionsCalculatorCard';
import { OptionMarketStatePanel } from '../features/options/components/OptionMarketStatePanel';
import type { PayoffChartEngine } from '../features/options/components/OptionPayoffCalculatorChart';
import { OptionsCalculatorModal } from './options/OptionsCalculatorModal';
import { RelatedLinks, AccountSelector } from '../shared/components';
import { optionsService, authService, accountService } from '../lib/services';
import { OptionsPortfolioManagement } from '../features/options/components/OptionsPortfolioManagement';
import { OptionWhitelistManager } from '../features/options/components/OptionWhitelistManager';
import { OptionsAnalysisTab } from './Options/components/OptionsAnalysisTab';
import type { Account, OptionsData } from '../lib/services/types';
import { OptionPriceWebSocketProvider } from '../features/options/context/OptionPriceWebSocketContext';
import { useAutoRefresh, useOptionPriceWebSocket } from '../features/options/hooks/useOptionPriceWebSocket';
import type { OptionsChartEngine } from '../features/options/utils/chartEngine';
import { TabNavigation } from './Journal/components/TabNavigation';
import {
  getAccountAliasFromSearch,
  OPTIONS_ACCOUNT_STORAGE,
  persistAccountAlias,
  resolveCurrentAccountAlias,
} from '../shared/utils/accountSelection';
import { OPTIONS_DEFAULT_TAB, OPTIONS_TABS, type OptionsTab, normalizeTab } from '../shared/utils/tabRouting';
import { useOptionsWebMcp } from './Options/hooks/useOptionsWebMcp';
import { WebMcpBadge } from '../lib/webmcp/components/WebMcpBadge';

interface OptionsProps {
  theme: Theme;
}

const normalizeIsoDateParam = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
  const ts = Date.parse(`${trimmed}T00:00:00Z`);
  return Number.isFinite(ts) ? trimmed : '';
};

function OptionsContent({ theme }: OptionsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedAccountAlias = React.useMemo(() => getAccountAliasFromSearch(location.search) || '', [location.search]);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'sequential') {
      params.set('tab', 'tasks');
      navigate(`/admin?${params.toString()}`, { replace: true });
      return;
    }
    if (tab === 'calendar') {
      params.set('tab', 'data');
      navigate(`/options?${params.toString()}`, { replace: true });
    }
  }, [location.search, navigate]);

  const [activeTab, setActiveTab] = useState<OptionsTab>(() => {
    const params = new URLSearchParams(location.search);
    return normalizeTab(OPTIONS_TABS, OPTIONS_DEFAULT_TAB, params.get('tab'));
  });

  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    try {
      return localStorage.getItem('optionsSelectedSymbol') || '';
    } catch {
      return '';
    }
  });
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    return resolveCurrentAccountAlias({
      search: location.search,
      storage: OPTIONS_ACCOUNT_STORAGE,
    });
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const effectiveUserId = userId ?? 'demo';
  const isAuthenticated = Boolean(userId);
  const [isMobileHeaderCollapsed, setIsMobileHeaderCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('options_header_mobile_collapsed') === '1';
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('options_header_mobile_collapsed', isMobileHeaderCollapsed ? '1' : '0');
  }, [isMobileHeaderCollapsed]);
  const [accountAccessError, setAccountAccessError] = useState<string | null>(null);
  const [accessibleAccountKeys, setAccessibleAccountKeys] = useState<string[] | null>(null);
  const [optionsAccounts, setOptionsAccounts] = useState<Account[]>([]);
  const [defaultAccountKey, setDefaultAccountKey] = useState<string | null>(null);
  const { isConnected, queryOptionsData, optionsDataSnapshots } = useOptionPriceWebSocket();
  const pendingFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [payoffChartEngine, setPayoffChartEngine] = useState<PayoffChartEngine>(() => {
    try {
      const raw = localStorage.getItem('optionsPayoffChartEngine') || '';
      return raw === 'plotly' || raw === 'echarts' ? raw : 'tradingview';
    } catch {
      return 'tradingview';
    }
  });
  const [marketChartEngine, setMarketChartEngine] = useState<OptionsChartEngine>(() => {
    try {
      const raw = localStorage.getItem('optionsMarketChartEngine') || '';
      return raw === 'plotly' || raw === 'echarts' ? raw : 'tradingview';
    } catch {
      return 'tradingview';
    }
  });

  React.useEffect(() => {
    if (!requestedAccountAlias || requestedAccountAlias === selectedAccountId) return;
    setSelectedAccountId(requestedAccountAlias);
  }, [requestedAccountAlias]);

  React.useEffect(() => {
    const currentParams = new URLSearchParams(location.search);
    const tabFromUrl = currentParams.get('tab');
    const isExpiryRisk = tabFromUrl === 'expiry-risk' || activeTab === 'expiry-risk';
    const nextParams = new URLSearchParams();

    if (selectedAccountId) nextParams.set('account_alias', selectedAccountId);

    if (isExpiryRisk) {
      nextParams.set('tab', 'expiry-risk');
      const report = normalizeIsoDateParam(currentParams.get('report')) || normalizeIsoDateParam(currentParams.get('report_date'));
      const expiryDate = normalizeIsoDateParam(currentParams.get('expiry_date')) || normalizeIsoDateParam(currentParams.get('expiry'));
      if (report) nextParams.set('report', report);
      if (expiryDate) nextParams.set('expiry_date', expiryDate);
    } else {
      nextParams.set('tab', activeTab);
    }

    const nextQuery = nextParams.toString();
    const currentQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (nextQuery === currentQuery) return;
    navigate(nextQuery ? `/options?${nextQuery}` : '/options', { replace: true });
  }, [activeTab, location.search, navigate, selectedAccountId]);

  const handleTabChange = (newTab: string) => {
    const nextTab = newTab as OptionsTab;
    setActiveTab(nextTab);
    if (nextTab === 'expiry-risk') {
      const params = new URLSearchParams();
      params.set('tab', 'expiry-risk');
      if (selectedAccountId) params.set('account_alias', selectedAccountId);
      navigate(`/options?${params.toString()}`, { replace: true });
      return;
    }
    const params = new URLSearchParams();
    if (selectedAccountId) params.set('account_alias', selectedAccountId);
    params.set('tab', nextTab);
    const qs = params.toString();
    navigate(qs ? `/options?${qs}` : '/options', { replace: true });
  };

  const handlePayoffChartEngineChange = useCallback((engine: PayoffChartEngine) => {
    setPayoffChartEngine(engine);
    try {
      localStorage.setItem('optionsPayoffChartEngine', engine);
    } catch {}
  }, []);

  const handleMarketChartEngineChange = useCallback((engine: OptionsChartEngine) => {
    setMarketChartEngine(engine);
    try {
      localStorage.setItem('optionsMarketChartEngine', engine);
    } catch {}
  }, []);

  const handleAccountChange = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    persistAccountAlias(accountId, { storage: OPTIONS_ACCOUNT_STORAGE });
    setRefreshKey((k) => k + 1);
  }, []);

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
          setSelectedSymbol((prev) => (prev && data.includes(prev) ? prev : data[0]));
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
    if (!selectedSymbol) return;
    try {
      localStorage.setItem('optionsSelectedSymbol', selectedSymbol);
    } catch {
      logger.debug('[Pages/Options] Failed to persist selectedSymbol to localStorage');
    }
  }, [selectedSymbol]);

  React.useEffect(() => {
    authService.getUser().then(res => {
      const u = res?.data?.user;
      setUserId(u?.id || null);
    }).catch(() => setUserId(null));
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAccessibleAccountKeys(null);
      setDefaultAccountKey(null);
      try {
        const response = await accountService.getOptionsAccounts(effectiveUserId);
        let accounts = (response.data || []) as Account[];
        if (accounts.length === 0) {
          const fallback = await accountService.getAccounts(effectiveUserId);
          accounts = (fallback.data || []) as Account[];
        }
        if (cancelled) return;

        const keys = accounts
          .map((acc) => acc.alias || acc.id)
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
        const def = accounts.find((acc) => acc.is_default) || accounts[0];
        setAccessibleAccountKeys(keys);
        setOptionsAccounts(accounts);
        setDefaultAccountKey((def?.alias || def?.id || null) ?? null);
      } catch (err) {
        if (cancelled) return;
        setAccessibleAccountKeys(null);
        setOptionsAccounts([]);
        setDefaultAccountKey(null);
        setAccountAccessError(err instanceof Error ? err.message : '账户列表加载失败，无法校验 account_alias');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId]);

  React.useEffect(() => {
    if (!accessibleAccountKeys) return;
    const allowed = new Set(accessibleAccountKeys);
    const requested = requestedAccountAlias;

    if (requested && !allowed.has(requested)) {
      setAccountAccessError(`无权访问账户: ${requested}，已切换到默认账户`);
      const fallbackId = defaultAccountKey || null;
      if (fallbackId !== selectedAccountId) {
        setSelectedAccountId(fallbackId);
      }
      // 从 URL 中删除无权访问的 account_alias 并重定向
      const params = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search);
      params.delete('account_alias');
      const nextQuery = params.toString();
      navigate(nextQuery ? `/options?${nextQuery}` : '/options', { replace: true });
      return;
    }

    if (selectedAccountId && !allowed.has(selectedAccountId)) {
      setAccountAccessError(`无权访问账户: ${selectedAccountId}，已切换到默认账户`);
      if (defaultAccountKey && defaultAccountKey !== selectedAccountId) {
        setSelectedAccountId(defaultAccountKey);
      } else if (!defaultAccountKey) {
        setSelectedAccountId(null);
      }
      return;
    }

    setAccountAccessError(null);
  }, [accessibleAccountKeys, defaultAccountKey, requestedAccountAlias, selectedAccountId]);

  const applyOptionsData = useCallback((data: OptionsData) => {
    setOptionsData(data);
    const uniqueExpiryDates = Array.from(new Set(data.quotes.map(q => q.expiry)))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    if (uniqueExpiryDates.length === 0) return;
    setSelectedExpiry((prev) => (prev && uniqueExpiryDates.includes(prev) ? prev : uniqueExpiryDates[0]));
  }, []);

  const fetchOptionsDataViaRest = useCallback(async (symbol: string) => {
    try {
      const { data, error } = await optionsService.getOptionsData(symbol);
      if (error) throw error;
      if (data) {
        applyOptionsData(data);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching options data:', err);
      setError(err instanceof Error ? err.message : `Failed to load options data for ${symbol}`);
    } finally {
      setIsLoading(false);
    }
  }, [applyOptionsData]);

  // Data tab manual/route-driven refresh: WS first, REST fallback.
  React.useEffect(() => {
    if (!selectedSymbol || activeTab !== 'data') {
      logger.debug('[Pages/Options] Guard: selectedSymbol missing or tab not data', {
        selectedSymbol,
        activeTab,
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    if (pendingFallbackTimerRef.current) {
      clearTimeout(pendingFallbackTimerRef.current);
      pendingFallbackTimerRef.current = null;
    }

    if (isConnected) {
      queryOptionsData(selectedSymbol);
      pendingFallbackTimerRef.current = setTimeout(() => {
        void fetchOptionsDataViaRest(selectedSymbol);
      }, 1500);
      return () => {
        if (pendingFallbackTimerRef.current) {
          clearTimeout(pendingFallbackTimerRef.current);
          pendingFallbackTimerRef.current = null;
        }
      };
    }

    void fetchOptionsDataViaRest(selectedSymbol);
  }, [selectedSymbol, activeTab, refreshKey, isConnected, queryOptionsData, fetchOptionsDataViaRest]);

  // Consume WS snapshots pushed by backend.
  React.useEffect(() => {
    if (activeTab !== 'data' || !selectedSymbol) return;
    const wsData = optionsDataSnapshots[selectedSymbol];
    if (!wsData) return;
    if (pendingFallbackTimerRef.current) {
      clearTimeout(pendingFallbackTimerRef.current);
      pendingFallbackTimerRef.current = null;
    }
    applyOptionsData(wsData);
    setError(null);
    setIsLoading(false);
  }, [activeTab, selectedSymbol, optionsDataSnapshots, applyOptionsData]);

  const wsCountdownEnabled = isConnected && activeTab === 'data' && !!selectedSymbol;
  const { remainingMs: wsRemainingMs, progress: wsProgress, triggerNow: triggerWsNow } = useAutoRefresh(
    () => {
      if (!selectedSymbol) return;
      queryOptionsData(selectedSymbol);
    },
    {
      enabled: wsCountdownEnabled,
      intervalMs: 10000,
      immediate: true,
      tickMs: 500,
    }
  );

  const tabs = [
    { id: 'data' as OptionsTab, name: 'Market', icon: BarChart2 },
    { id: 'market-state' as OptionsTab, name: '市场状态', icon: Compass },
    { id: 'portfolio' as OptionsTab, name: 'Portfolio', icon: Briefcase },
    { id: 'analysis' as OptionsTab, name: 'Analysis', icon: BookOpen },
    { id: 'trading' as OptionsTab, name: 'Plans', icon: TrendingUp },
    { id: 'management' as OptionsTab, name: 'Manage', icon: Calculator },
    { id: 'whitelist' as OptionsTab, name: 'Whitelist', icon: Shield },
    { id: 'expiry-risk' as OptionsTab, name: '到期风险', icon: BellRing },
    { id: 'risk' as OptionsTab, name: 'Risk', icon: Activity },
  ];

  const webMcp = useOptionsWebMcp({
    userId: effectiveUserId,
    selectedAccountId,
    selectedSymbol,
    activeTab,
    isAuthenticated,
    onSelectSymbol: (symbol: string) => {
      setSelectedSymbol(symbol);
      try {
        localStorage.setItem('optionsSelectedSymbol', symbol);
      } catch {}
    },
    onSwitchTab: (tab: OptionsTab) => handleTabChange(tab),
    onSelectAccount: handleAccountChange,
    getAccounts: () => optionsAccounts,
  });

  return (
    <main className="max-w-7xl mx-auto pl-2.5 pr-11 sm:px-6 lg:px-8 py-2.5 sm:py-8">
      <div className="space-y-3 sm:space-y-6">
        <div className={`${themes[theme].card} rounded-xl p-3 sm:p-5 border ${themes[theme].border} card-subtle-ring transition-colors duration-150`}>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            {/* 标题栏与移动端折叠动作区 */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className={`text-base sm:text-2xl font-bold tracking-tight ${themes[theme].text} font-sans`}>
                      期权交易分析
                    </h1>
                    <span className="text-[10px] sm:text-xs font-mono font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40">
                      Options
                    </span>
                    <WebMcpBadge
                      theme={theme}
                      toolCount={webMcp.registeredToolCount}
                      isSupported={webMcp.isSupported}
                      isReady={webMcp.isReady}
                      pageTitle="Options 期权分析"
                      customTools={webMcp.tools}
                    />
                  </div>
                  {/* 移动端紧凑模式摘要提示 */}
                  <div className="sm:hidden flex items-center gap-1.5 mt-0.5 text-[11px] font-mono tabular-nums text-gray-500 dark:text-zinc-400">
                    <span className="font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[120px]">
                      {selectedAccountId || '未选账户'}
                    </span>
                    <span className="opacity-40">/</span>
                    <span className="font-medium text-gray-700 dark:text-zinc-300">
                      {selectedSymbol || '--'}
                    </span>
                  </div>
                  <p className={`hidden sm:block text-xs sm:text-sm ${themes[theme].text} opacity-75 mt-0.5`}>
                    Advanced options analysis and trading tools
                  </p>
                </div>
              </div>

              {/* 移动端专属操作栏：折叠状态下的1键刷新与折叠开关 */}
              <div className="flex sm:hidden items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'data' && selectedSymbol) {
                      if (wsCountdownEnabled) {
                        triggerWsNow();
                      } else if (isConnected) {
                        queryOptionsData(selectedSymbol);
                      }
                    }
                    setRefreshKey((k) => k + 1);
                    toast.success('已触发行情数据刷新！', { id: 'options-refresh-toast' });
                  }}
                  className={`p-1.5 rounded-lg border ${themes[theme].border} btn-tactile ${themes[theme].secondary}`}
                  title="刷新数据"
                  aria-label="刷新数据"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileHeaderCollapsed((prev) => !prev)}
                  className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs btn-tactile border ${themes[theme].border} ${
                    isMobileHeaderCollapsed
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-medium'
                      : `${themes[theme].secondary} opacity-85`
                  }`}
                  title={isMobileHeaderCollapsed ? '展开账户与标的设置' : '收起设置'}
                  aria-label={isMobileHeaderCollapsed ? '展开设置' : '收起设置'}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span className="text-[11px]">{isMobileHeaderCollapsed ? '设置' : '收起'}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${
                      !isMobileHeaderCollapsed ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 控制器区：桌面端始终水平展开，移动端支持折叠 */}
            <div
              className={`w-full min-w-0 ${
                isMobileHeaderCollapsed ? 'hidden sm:flex' : 'flex'
              } flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3.5 pt-2 sm:pt-0 border-t sm:border-0 ${themes[theme].border} transition-all duration-200`}
            >
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <label className={`text-xs sm:text-sm font-medium ${themes[theme].text}`}>
                  账户:
                </label>
                <AccountSelector
                  userId={effectiveUserId}
                  theme={theme}
                  selectedAccountId={selectedAccountId}
                  onAccountChange={handleAccountChange}
                  refreshKey={refreshKey}
                />
                <button
                  onClick={() => {
                    if (activeTab === 'data' && selectedSymbol) {
                      if (wsCountdownEnabled) {
                        triggerWsNow();
                      } else if (isConnected) {
                        queryOptionsData(selectedSymbol);
                      }
                    }
                    setRefreshKey((k) => k + 1);
                    toast.success('已触发行情数据刷新！', { id: 'options-refresh-toast' });
                  }}
                  className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm whitespace-nowrap btn-tactile ${themes[theme].secondary}`}
                >
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  刷新
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <label className={`text-xs sm:text-sm font-medium ${themes[theme].text}`}>
                  Symbol:
                </label>
                {availableSymbols.length > 0 ? (
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    disabled={isLoading || isLoadingSymbols}
                    className={`max-w-full px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-mono tabular-nums ${themes[theme].input} ${themes[theme].text} ${
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
                  <span className={`text-xs sm:text-sm ${themes[theme].text} opacity-70`}>
                    No symbols available
                  </span>
                )}
                {activeTab === 'data' && (
                  <div className={`flex items-center gap-1 px-1.5 py-1 sm:px-2 rounded-lg border ${themes[theme].border} shrink-0`}>
                    <Hourglass className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${themes[theme].text} opacity-60`} />
                    <div className="w-14 sm:w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div className="h-1 bg-blue-500" style={{ width: `${Math.round(wsProgress * 100)}%` }} />
                    </div>
                    <div className={`text-[10px] font-mono tabular-nums ${themes[theme].text} opacity-60 w-7 sm:w-8 text-right`}>
                      {wsCountdownEnabled ? `${Math.ceil(wsRemainingMs / 1000)}s` : '--'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (wsCountdownEnabled) {
                          triggerWsNow();
                        } else {
                          setRefreshKey((k) => k + 1);
                        }
                        toast.success('期权数据刷新请求已发送！', { id: 'options-refresh-toast' });
                      }}
                      disabled={!selectedSymbol}
                      className={`${themes[theme].secondary} rounded-md p-1 sm:p-1.5 btn-tactile disabled:opacity-50 disabled:cursor-not-allowed`}
                      title="刷新行情"
                      aria-label="刷新行情"
                    >
                      <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                )}
              </div>
              {(isLoading || isLoadingSymbols) && activeTab === 'data' && (
                <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-blue-500"></div>
              )}
            </div>
          </div>
        </div>

        {accountAccessError && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {accountAccessError}
          </div>
        )}

        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          theme={theme}
          onTabChange={handleTabChange}
        />

        <div key={activeTab} className="animate-fade-in">
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
                    chartEngine={marketChartEngine}
                    onChartEngineChange={handleMarketChartEngineChange}
                  />

                  <VerticalSpreadMonthlyPricesChart
                    theme={theme}
                    optionsData={optionsData}
                    selectedSymbol={selectedSymbol}
                    chartEngine={marketChartEngine}
                    onChartEngineChange={handleMarketChartEngineChange}
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
                hideTradePlans={!isAuthenticated}
              />
            </div>
          )}

          {activeTab === 'market-state' && (
            <div className="space-y-6">
              <OptionMarketStatePanel theme={theme} selectedSymbol={selectedSymbol} />
              <RelatedLinks 
                theme={theme} 
                currentPath="/options?tab=market-state" 
                maxItems={4}
                hideTradePlans={!isAuthenticated}
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
                hideTradePlans={!isAuthenticated}
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
                hideTradePlans={!isAuthenticated}
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
                hideTradePlans={!isAuthenticated}
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
                hideTradePlans={!isAuthenticated}
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
                hideTradePlans={!isAuthenticated}
              />
            </div>
          )}

          {activeTab === 'expiry-risk' && (
            <div className="space-y-6">
              <OptionExpiryRiskReportsPanel
                theme={theme}
                selectedAccountId={selectedAccountId}
                chartEngine={payoffChartEngine}
                onChartEngineChange={handlePayoffChartEngineChange}
              />
              <RelatedLinks
                theme={theme}
                currentPath="/options?tab=expiry-risk"
                maxItems={4}
                hideTradePlans={!isAuthenticated}
              />
            </div>
          )}

          {activeTab === 'risk' && (
            <div className="space-y-6">
              <RiskAnalysis
                theme={theme}
                selectedAccountId={selectedAccountId}
                selectedSymbol={selectedSymbol}
              />
              <RelatedLinks 
                theme={theme} 
                currentPath="/options?tab=risk" 
                maxItems={4}
                hideTradePlans={!isAuthenticated}
              />
            </div>
          )}
        </div>
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
  );
}

export function Options({ theme }: OptionsProps) {
  return (
    <OptionPriceWebSocketProvider>
      <OptionsContent theme={theme} />
    </OptionPriceWebSocketProvider>
  );
}
