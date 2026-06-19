import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase } from 'lucide-react';

import { Theme, themes } from '../lib/theme';
import { portfolioService, accountService, stockService } from '../lib/services';
import { AccountSelector } from '../shared/components/AccountSelector';
import type { Account, Stock, Holding, Trade, StockOrder, User } from '../lib/services/types';
import { TabNavigation } from './Journal/components/TabNavigation';
import { getAccountAliasFromSearch, getPreferredAccountAlias } from '../shared/utils/accountSelection';
import {
  buildJournalSearch,
  getJournalTabDefinitions,
  resolveJournalTab,
} from './Journal/tabConfig';

interface JournalProps {
  selectedStock: Stock | null;
  theme: Theme;
  onStockSelect: (stock: Stock) => void;
  user: User | null;
}

const DEMO_USER_ID = 'mock-user-id';

export function Journal({ selectedStock, theme, onStockSelect, user }: JournalProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const canViewTradePlans = Boolean(user);
  const requestedAccountAlias = useMemo(() => getAccountAliasFromSearch(location.search) || '', [location.search]);
  const tabs = useMemo(() => getJournalTabDefinitions({ canViewTradePlans }), [canViewTradePlans]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'analysis' || tab === 'history' || tab === 'operations' || tab === 'upload') {
      params.set('tab', tab);
      navigate(`/admin?${params.toString()}`, { replace: true });
    }
  }, [location.search, navigate]);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isSnapshot, setIsSnapshot] = useState(false);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    return getPreferredAccountAlias({
      search: location.search,
      localStorageKeys: ['journalSelectedAccountAlias', 'selectedAccountAlias', 'journalAccountId', 'selectedAccountId'],
      cookieKeys: ['journalAccountId'],
    });
  });
  const [accountAccessError, setAccountAccessError] = useState<string | null>(null);
  const [accessibleAccountKeys, setAccessibleAccountKeys] = useState<string[] | null>(null);
  const [defaultAccountKey, setDefaultAccountKey] = useState<string | null>(null);

  // Get UUID from URL params for portfolio sharing
  const portfolioUuid = new URLSearchParams(location.search).get('uuid');
  const activeTab = useMemo(
    () => resolveJournalTab(new URLSearchParams(location.search).get('tab'), { canViewTradePlans }),
    [canViewTradePlans, location.search]
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
        const accounts = (response.data || []) as Account[];
        if (cancelled) return;
        const keys = accounts
          .map((acc) => acc.alias || acc.id)
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
        const def = accounts.find((acc) => acc.is_default) || accounts[0];
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
      if (defaultAccountKey && defaultAccountKey !== selectedAccountId) {
        setSelectedAccountId(defaultAccountKey);
      } else if (!defaultAccountKey && selectedAccountId !== null) {
        setSelectedAccountId(null);
      }
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
    const nextQuery = buildJournalSearch({
      currentSearch: location.search,
      activeTab,
      selectedAccountId,
      portfolioUuid,
      canViewTradePlans,
    });
    const currentQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (nextQuery === currentQuery) return;
    navigate(nextQuery ? `/journal?${nextQuery}` : '/journal', { replace: true });
  }, [activeTab, canViewTradePlans, location.search, navigate, portfolioUuid, selectedAccountId]);

  const handleTabChange = (tabId: string) => {
    const nextQuery = buildJournalSearch({
      currentSearch: location.search,
      activeTab: tabId,
      selectedAccountId,
      portfolioUuid,
      canViewTradePlans,
    });
    navigate(nextQuery ? `/journal?${nextQuery}` : '/journal', { replace: true });
  };

  const [todayOrders, setTodayOrders] = useState<StockOrder[]>([]);
  const [todayOrdersLoading, setTodayOrdersLoading] = useState(false);
  const [todayOrdersError, setTodayOrdersError] = useState<string | null>(null);
  const [todayOrdersLastUpdatedAt, setTodayOrdersLastUpdatedAt] = useState<number | null>(null);

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

  useEffect(() => {
    const fetchData = async () => {
      if (activeTab === 'portfolio') {
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

          const accounts = accountsResponse.data || [];
          const isAccountValid = selectedAccountId && accounts.some(a => (a.alias || a.id) === selectedAccountId);

          if ((!selectedAccountId || !isAccountValid) && accounts.length > 0) {
            const def = accounts.find(a => a.is_default) || accounts[0];
            const key = def.alias || def.id;
            
            if (key !== selectedAccountId) {
              setSelectedAccountId(key);
              try {
                localStorage.setItem('journalAccountId', key);
                localStorage.setItem('journalSelectedAccountAlias', key);
              } catch {
                logger.debug('[Journal] Failed to persist journalAccountId to localStorage');
              }
              try {
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 30);
                document.cookie = `journalAccountId=${encodeURIComponent(key)}; expires=${expiryDate.toUTCString()}; path=/`;
              } catch {
                logger.debug('[Journal] Failed to persist journalAccountId to cookie');
              }
            }
          }
        }
      }
    };

    fetchData();
  }, [activeTab, dateRange, portfolioUuid, selectedAccountId]);

  useEffect(() => {
    if (activeTab !== 'trades' || portfolioUuid) return;
    fetchTodayOrders();
  }, [activeTab, fetchTodayOrders, portfolioUuid]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      <div className="space-y-6 mb-6">
        <div className={`${themes[theme].card} rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${themes[theme].text}`}>
                Stock Trading Journal
              </h1>
              <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                Review your portfolio, trades and performance in one place
              </p>
            </div>
            {!portfolioUuid && (
              <AccountSelector
                userId={DEMO_USER_ID}
                theme={theme}
                selectedAccountId={selectedAccountId}
                onAccountChange={(accountId) => {
                  setSelectedAccountId(accountId);
                  try {
                    localStorage.setItem('journalAccountId', accountId);
                      localStorage.setItem('journalSelectedAccountAlias', accountId);
                  } catch {
                    logger.debug('[Journal] Failed to persist journalAccountId to localStorage from header');
                  }
                  try {
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + 30);
                    document.cookie = `journalAccountId=${encodeURIComponent(accountId)}; expires=${expiryDate.toUTCString()}; path=/`;
                  } catch {
                    logger.debug('[Journal] Failed to persist journalAccountId to cookie from header');
                  }
                }}
                preferOptions={false}
              />
            )}
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
          onAccountChange: setSelectedAccountId,
          isSnapshot,
          todayOrders,
          todayOrdersLoading,
          todayOrdersError,
          todayOrdersLastUpdatedAt,
          onRefreshTodayOrders: fetchTodayOrders,
        })}
      </div>

      {/* Show portfolio UUID info if viewing shared portfolio */}
      {portfolioUuid && activeTab === 'portfolio' && (
        <div className={`${themes[theme].card} rounded-lg p-4 mb-6 border-l-4 border-blue-500`}>
          <div className="flex items-center space-x-2">
            <Briefcase className="w-5 h-5 text-blue-500" />
            <span className={`text-sm font-medium ${themes[theme].text}`}>
              Viewing shared portfolio: {portfolioUuid}
            </span>
          </div>
        </div>
      )}

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
        onAccountChange: setSelectedAccountId,
        isSnapshot,
        todayOrders,
        todayOrdersLoading,
        todayOrdersError,
        todayOrdersLastUpdatedAt,
        onRefreshTodayOrders: fetchTodayOrders,
      })}
    </main>
  );
}
