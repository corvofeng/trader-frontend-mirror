import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { format } from 'date-fns';

import { Theme, themes } from '../../lib/theme';
import { portfolioService, accountService, stockService, optionsService, isCloudflareEnv } from '../../lib/services';
import { AccountSelector } from '../../shared/components/AccountSelector';
import type { Account, Stock, Holding, Trade, StockOrder, User, OptionOrder } from '../../lib/services/types';
import { TabNavigation } from './components/TabNavigation';
import { useJournalWebMcp } from './hooks/useJournalWebMcp';
import { WebMcpBadge } from '../../lib/webmcp/components/WebMcpBadge';
import { useLanguage } from '../../lib/context/LanguageContext';
import {
  checkIsMainAccount,
  getAccountAliasFromSearch,
  JOURNAL_ACCOUNT_STORAGE,
  persistAccountAlias,
  resolveCurrentAccountAlias,
} from '../../shared/utils/accountSelection';
import {
  buildJournalSearch,
  getJournalTabDefinitions,
  resolveJournalTab,
} from './tabConfig';

interface JournalProps {
  selectedStock: Stock | null;
  theme: Theme;
  onStockSelect: (stock: Stock) => void;
  user: User | null;
}

const DEMO_USER_ID = 'mock-user-id';

export function Journal({ selectedStock, theme, onStockSelect, user }: JournalProps) {
  const { isEn } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = Boolean(user);
  const requestedAccountAlias = useMemo(() => getAccountAliasFromSearch(location.search) || '', [location.search]);
  const tabs = useMemo(
    () =>
      getJournalTabDefinitions({
        isAuthenticated: isCloudflareEnv ? false : isAuthenticated,
        canViewTradePlans: isCloudflareEnv ? false : undefined,
        canViewHistory: isCloudflareEnv ? false : undefined,
        canViewOrders: isCloudflareEnv ? false : undefined,
        isEn,
      }),
    [isAuthenticated, isEn]
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'analysis' || tab === 'operations' || tab === 'upload') {
      params.set('tab', tab);
      navigate(`/admin?${params.toString()}`, { replace: true });
    }
  }, [location.search, navigate]);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isSnapshot, setIsSnapshot] = useState(false);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    return resolveCurrentAccountAlias({
      search: location.search,
      storage: JOURNAL_ACCOUNT_STORAGE,
    });
  });
  const [accountAccessError, setAccountAccessError] = useState<string | null>(null);
  const [accessibleAccountKeys, setAccessibleAccountKeys] = useState<string[] | null>(null);
  const [defaultAccountKey, setDefaultAccountKey] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const isMainAccount = useMemo(() => {
    return checkIsMainAccount({
      selectedAccountId,
      defaultAccountId: defaultAccountKey,
      accounts,
    });
  }, [accounts, defaultAccountKey, selectedAccountId]);

  // Get UUID from URL params for portfolio sharing
  const portfolioUuid = new URLSearchParams(location.search).get('uuid');
  const activeTab = useMemo(
    () => resolveJournalTab(new URLSearchParams(location.search).get('tab'), { isAuthenticated }),
    [isAuthenticated, location.search]
  );
  const activeTabConfig = useMemo(
    () => tabs.find((tab) => tab.id === activeTab) ?? tabs[0],
    [activeTab, tabs]
  );

  useEffect(() => {
    if (portfolioUuid) return;
    let cancelled = false;

    const load = async () => {
      setAccessibleAccountKeys(null);
      setDefaultAccountKey(null);
      try {
        const response = await accountService.getAccounts(DEMO_USER_ID);
        const fetchedAccounts = (response.data || []) as Account[];
        if (cancelled) return;
        setAccounts(fetchedAccounts);
        const keys = fetchedAccounts
          .map((acc) => acc.alias || acc.id)
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
        const def = fetchedAccounts.find((acc) => acc.is_default) || fetchedAccounts[0];
        setAccessibleAccountKeys(keys);
        setDefaultAccountKey((def?.alias || def?.id || null) ?? null);
      } catch (err) {
        if (cancelled) return;
        setAccessibleAccountKeys(null);
        setDefaultAccountKey(null);
        setAccountAccessError(err instanceof Error ? err.message : '账户列表加载失败，无法校验 account_alias');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [portfolioUuid]);

  useEffect(() => {
    if (portfolioUuid) return;
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
      navigate(nextQuery ? `/journal?${nextQuery}` : '/journal', { replace: true });
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
  }, [accessibleAccountKeys, defaultAccountKey, portfolioUuid, requestedAccountAlias, selectedAccountId]);

  useEffect(() => {
    if (!requestedAccountAlias || requestedAccountAlias === selectedAccountId) return;
    setSelectedAccountId(requestedAccountAlias);
  }, [requestedAccountAlias, selectedAccountId]);

  useEffect(() => {
    if (isCloudflareEnv) {
      const params = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search);
      if (params.has('tab') || params.has('account_alias')) {
        params.delete('tab');
        params.delete('account_alias');
        const nextQuery = params.toString();
        navigate(nextQuery ? `/journal?${nextQuery}` : '/journal', { replace: true });
      }
      return;
    }
    if (!portfolioUuid && requestedAccountAlias && requestedAccountAlias !== selectedAccountId) {
      return;
    }
    const nextQuery = buildJournalSearch({
      currentSearch: location.search,
      activeTab,
      selectedAccountId,
      portfolioUuid,
      isAuthenticated,
    });
    const currentQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (nextQuery === currentQuery) return;
    navigate(nextQuery ? `/journal?${nextQuery}` : '/journal', { replace: true });
  }, [activeTab, isAuthenticated, location.search, navigate, portfolioUuid, requestedAccountAlias, selectedAccountId]);

  const handleTabChange = (tabId: string) => {
    const nextQuery = buildJournalSearch({
      currentSearch: location.search,
      activeTab: tabId,
      selectedAccountId,
      portfolioUuid,
      isAuthenticated,
    });
    navigate(nextQuery ? `/journal?${nextQuery}` : '/journal', { replace: true });
  };

  const [todayOrders, setTodayOrders] = useState<StockOrder[]>([]);
  const [todayOrdersLoading, setTodayOrdersLoading] = useState(false);
  const [todayOrdersError, setTodayOrdersError] = useState<string | null>(null);
  const [todayOrdersLastUpdatedAt, setTodayOrdersLastUpdatedAt] = useState<number | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [ordersByDate, setOrdersByDate] = useState<OptionOrder[]>([]);
  const [ordersByDateLoading, setOrdersByDateLoading] = useState(false);
  const [ordersByDateError, setOrdersByDateError] = useState<string | null>(null);

  const persistSelectedAccount = useCallback((accountId: string) => {
    persistAccountAlias(accountId, { storage: JOURNAL_ACCOUNT_STORAGE });
  }, []);

  const handleAccountChange = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    persistSelectedAccount(accountId);
    // Clear holdings cache to trigger loading skeleton during account swap
    setHoldings([]);

    const nextQuery = buildJournalSearch({
      currentSearch: location.search,
      activeTab,
      selectedAccountId: accountId,
      portfolioUuid,
      isAuthenticated,
    });
    const currentQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (nextQuery === currentQuery) return;
    navigate(nextQuery ? `/journal?${nextQuery}` : '/journal', { replace: true });
  }, [activeTab, isAuthenticated, location.search, navigate, persistSelectedAccount, portfolioUuid]);

  const fetchTodayOrders = useCallback(async () => {
    const accountAlias = selectedAccountId || undefined;
    if (!accountAlias) {
      setTodayOrders([]);
      setTodayOrdersError('请选择账户后再查看当日订单。');
      return;
    }
    setTodayOrdersLoading(true);
    setTodayOrdersError(null);
    try {
      const { data, error } = await stockService.getTodayOrders(accountAlias);
      if (error) throw error;
      setTodayOrders(data || []);
      setTodayOrdersLastUpdatedAt(Date.now());
    } catch (e) {
      setTodayOrders([]);
      setTodayOrdersError(e instanceof Error ? e.message : '加载当日订单失败');
    } finally {
      setTodayOrdersLoading(false);
    }
  }, [selectedAccountId]);

  const fetchOrdersByDate = useCallback(async (dateToFetch?: string) => {
    const targetDate = dateToFetch || selectedDate;
    if (!selectedAccountId) {
      setOrdersByDate([]);
      setOrdersByDateError('请选择账户后再查看成交订单。');
      return;
    }
    setOrdersByDateLoading(true);
    setOrdersByDateError(null);
    try {
      const { data, error } = await optionsService.getAdminOrders(selectedAccountId, { date: targetDate });
      if (error) throw error;
      setOrdersByDate(data || []);
    } catch (e) {
      setOrdersByDate([]);
      setOrdersByDateError(e instanceof Error ? e.message : '加载成交订单失败');
    } finally {
      setOrdersByDateLoading(false);
    }
  }, [selectedAccountId, selectedDate]);

  useEffect(() => {
    const fetchData = async () => {
      if (activeTab === 'portfolio') {
        setIsPortfolioLoading(true);
        try {
          if (portfolioUuid) {
            // Fetch portfolio data by UUID
            const [holdingsResponse, tradesResponse] = await Promise.all([
              portfolioService.getHoldingsByUuid(portfolioUuid),
              portfolioService.getRecentTradesByUuid(portfolioUuid, dateRange.startDate, dateRange.endDate)
            ]);
            
            if (holdingsResponse.data) {
              setHoldings(holdingsResponse.data);
              setIsSnapshot(holdingsResponse.isSnapshot || false);
            }
            if (tradesResponse.data) setRecentTrades(tradesResponse.data);
          } else {
            if (!selectedAccountId) {
              logger.debug('[Journal] Guard: selectedAccountId missing');
            }

            const [holdingsResponse, tradesResponse, accountsResponse] = await Promise.all([
              selectedAccountId ? portfolioService.getHoldings(selectedAccountId) : Promise.resolve({ data: null, error: null, isSnapshot: false }),
              selectedAccountId
                ? portfolioService.getRecentTrades(DEMO_USER_ID, dateRange.startDate, dateRange.endDate, selectedAccountId)
                : Promise.resolve({ data: null, error: null }),
              accountService.getAccounts(DEMO_USER_ID)
            ]);
            
            if (holdingsResponse.data) {
              setHoldings(holdingsResponse.data);
              setIsSnapshot(holdingsResponse.isSnapshot || false);
            }
            if (tradesResponse.data) setRecentTrades(tradesResponse.data);

            const accountsList = accountsResponse.data || [];
            if (accountsList.length > 0) {
              setAccounts(accountsList);
            }
            const isAccountValid = selectedAccountId && accountsList.some(a => (a.alias || a.id) === selectedAccountId);

            if ((!selectedAccountId || !isAccountValid) && accountsList.length > 0) {
              const def = accountsList.find(a => a.is_default) || accountsList[0];
              const key = def.alias || def.id;
              
              if (key !== selectedAccountId) {
                setSelectedAccountId(key);
                persistSelectedAccount(key);
              }
            }
          }
        } catch (err) {
          console.error('[Journal] Failed to fetch portfolio:', err);
        } finally {
          setIsPortfolioLoading(false);
        }
      }
    };

    fetchData();
  }, [activeTab, dateRange, persistSelectedAccount, portfolioUuid, selectedAccountId]);

  useEffect(() => {
    if (activeTab !== 'trades' || portfolioUuid) return;
    fetchTodayOrders();
  }, [activeTab, fetchTodayOrders, portfolioUuid]);

  useEffect(() => {
    if (activeTab !== 'orders' || portfolioUuid) return;
    fetchOrdersByDate(selectedDate);
  }, [activeTab, fetchOrdersByDate, portfolioUuid, selectedAccountId, selectedDate]);

  const webMcp = useJournalWebMcp({
    userId: DEMO_USER_ID,
    selectedAccountId,
    activeTab,
    isAuthenticated,
    allowedTabs: tabs.map((t) => t.id),
    onSelectAccount: handleAccountChange,
    onSwitchTab: handleTabChange,
    getAccounts: () => accounts,
  });

  return (
    <main className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 py-2.5 sm:py-8">
      <div className="space-y-4 sm:space-y-6 mb-6">
        <div className={`${themes[theme].card} rounded-xl sm:rounded-2xl p-3 sm:p-5 border ${themes[theme].border} fin-card-elevated relative transition-colors duration-150`}>
          <div className="fin-specular-line" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex items-center gap-2.5 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 ring-1 ring-blue-500/20 shadow-xs">
                <Briefcase className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h1 className={`text-base sm:text-2xl font-bold tracking-tight ${themes[theme].text}`}>
                    {isCloudflareEnv ? (isEn ? 'Portfolio' : '投资组合') : (isEn ? 'Journal' : '交易日志')}
                  </h1>
                  <span className="text-[10px] sm:text-xs font-mono font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40">
                    {isCloudflareEnv ? 'Portfolio' : 'Journal'}
                  </span>
                  {isCloudflareEnv && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-medium bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {isEn ? 'Post-Market Synced' : '交易日盘后同步'}
                    </span>
                  )}
                  {!isCloudflareEnv && (
                    <WebMcpBadge
                      theme={theme}
                      toolCount={webMcp.registeredToolCount}
                      isSupported={webMcp.isSupported}
                      isReady={webMcp.isReady}
                      pageTitle={isEn ? 'Journal' : 'Journal 交易日志'}
                      customTools={webMcp.tools}
                    />
                  )}
                </div>
                <p className={`hidden sm:block text-sm ${themes[theme].text} opacity-75 mt-0.5`}>
                  {isCloudflareEnv 
                    ? (isEn ? 'Live portfolio assets and holdings overview' : '实盘资产与持仓概览') 
                    : (isEn ? 'Review your portfolio, trades and performance in one place' : '统一查阅投资组合、成交与交易表现')}
                </p>
              </div>
            </div>
            {!isCloudflareEnv && !portfolioUuid && (
              <div className="shrink-0">
                <AccountSelector
                  userId={DEMO_USER_ID}
                  theme={theme}
                  selectedAccountId={selectedAccountId}
                  onAccountChange={handleAccountChange}
                  preferOptions={false}
                  align="right"
                />
              </div>
            )}
          </div>
        </div>
        {accountAccessError && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {accountAccessError}
          </div>
        )}
        {!isCloudflareEnv && tabs.length > 1 && (
          <TabNavigation
            tabs={tabs}
            activeTab={activeTab}
            theme={theme}
            onTabChange={handleTabChange}
          />
        )}
        {activeTabConfig?.renderToolbar?.({
          activeTab,
          selectedStock,
          theme,
          onStockSelect,
          user,
          holdings,
          recentTrades,
          dateRange,
          onDateRangeChange: setDateRange,
          portfolioUuid,
          userId: DEMO_USER_ID,
          selectedAccountId,
          onAccountChange: handleAccountChange,
          isSnapshot,
          isPortfolioLoading,
          isMainAccount,
          todayOrders,
          todayOrdersLoading,
          todayOrdersError,
          todayOrdersLastUpdatedAt,
          onRefreshTodayOrders: fetchTodayOrders,
          selectedDate,
          onSelectDate: (date: string) => {
            setSelectedDate(date);
            fetchOrdersByDate(date);
          },
          ordersByDate,
          ordersByDateLoading,
          ordersByDateError,
          onRefreshOrdersByDate: () => fetchOrdersByDate(selectedDate),
        })}
      </div>

      {/* Show portfolio UUID info if viewing shared portfolio */}
      {portfolioUuid && activeTab === 'portfolio' && (
        <div className={`${themes[theme].card} rounded-xl p-4 mb-6 border-l-4 border-blue-500 card-subtle-ring`}>
          <div className="flex items-center space-x-2">
            <Briefcase className="w-5 h-5 text-blue-500" />
            <span className={`text-sm font-medium ${themes[theme].text}`}>
              Viewing shared portfolio: {portfolioUuid}
            </span>
          </div>
        </div>
      )}

      <div key={activeTab} className="animate-fade-in">
        {activeTabConfig?.renderContent({
          activeTab,
          selectedStock,
          theme,
          onStockSelect,
          user,
          holdings,
          recentTrades,
          dateRange,
          onDateRangeChange: setDateRange,
          portfolioUuid,
          userId: DEMO_USER_ID,
          selectedAccountId,
          onAccountChange: handleAccountChange,
          isSnapshot,
          isPortfolioLoading,
          isMainAccount,
          todayOrders,
          todayOrdersLoading,
          todayOrdersError,
          todayOrdersLastUpdatedAt,
          onRefreshTodayOrders: fetchTodayOrders,
          selectedDate,
          onSelectDate: (date: string) => {
            setSelectedDate(date);
            fetchOrdersByDate(date);
          },
          ordersByDate,
          ordersByDateLoading,
          ordersByDateError,
          onRefreshOrdersByDate: () => fetchOrdersByDate(selectedDate),
        })}
      </div>
    </main>
  );
}
