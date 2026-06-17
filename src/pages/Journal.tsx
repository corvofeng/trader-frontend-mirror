import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, LayoutGrid, RefreshCw } from 'lucide-react';
import { TradeForm, TradeList, StockSearch } from '../features/trading';
import { Portfolio } from '../features/portfolio';

import { Theme, themes } from '../lib/theme';
import { portfolioService, accountService, stockService } from '../lib/services';
import { AccountSelector } from '../shared/components/AccountSelector';
import type { Account, Stock, Holding, Trade, StockOrder, User } from '../lib/services/types';
import { TabNavigation } from './Journal/components/TabNavigation';
import { getAccountAliasFromSearch, getPreferredAccountAlias } from '../shared/utils/accountSelection';

interface JournalProps {
  selectedStock: Stock | null;
  theme: Theme;
  onStockSelect: (stock: Stock) => void;
  user: User | null;
}

type Tab = 'portfolio' | 'trades';

const DEMO_USER_ID = 'mock-user-id';

const getOrderStatusBadge = (raw?: string | null) => {
  const s = (raw || '').trim().toUpperCase();
  if (s.includes('FILLED') || s === 'ALLTRADED') return { label: raw || 'FILLED', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' };
  if (s.includes('PART') || s.includes('PARTTRADED')) return { label: raw || 'PART', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' };
  if (s.includes('CANCEL') || s.includes('CANCELED') || s.includes('CANCELLED')) return { label: raw || 'CANCELED', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
  if (s.includes('REJECT') || s.includes('ERROR') || s.includes('FAIL')) return { label: raw || 'REJECTED', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' };
  if (s.includes('REPORT') || s.includes('SUBMIT')) return { label: raw || 'REPORTED', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' };
  if (!raw) return { label: '-', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
  return { label: raw, className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
};

export function Journal({ selectedStock, theme, onStockSelect, user }: JournalProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const canViewTradePlans = Boolean(user);
  const requestedAccountAlias = useMemo(() => getAccountAliasFromSearch(location.search) || '', [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'analysis' || tab === 'history' || tab === 'operations' || tab === 'upload') {
      params.set('tab', tab);
      navigate(`/admin?${params.toString()}`, { replace: true });
    }
  }, [location.search, navigate]);

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') as Tab;
    return tab && ['portfolio', 'trades'].includes(tab) && (tab !== 'trades' || canViewTradePlans)
      ? tab
      : 'portfolio';
  });
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
    if (canViewTradePlans) return;
    const params = new URLSearchParams(location.search);
    if (params.get('tab') !== 'trades') return;
    params.delete('tab');
    navigate(params.toString() ? `/journal?${params.toString()}` : '/journal', { replace: true });
  }, [canViewTradePlans, location.search, navigate]);

  useEffect(() => {
    if (!requestedAccountAlias || requestedAccountAlias === selectedAccountId) return;
    setSelectedAccountId(requestedAccountAlias);
  }, [requestedAccountAlias]);

  useEffect(() => {
    if (portfolioUuid) return;
    const params = new URLSearchParams(location.search);
    const currentAlias = params.get('account_alias');

    if (selectedAccountId) {
      if (currentAlias === selectedAccountId) return;
      params.set('account_alias', selectedAccountId);
    } else {
      if (!currentAlias) return;
      params.delete('account_alias');
    }

    const nextQuery = params.toString();
    navigate(nextQuery ? `/journal?${nextQuery}` : '/journal', { replace: true });
  }, [location.search, navigate, portfolioUuid, selectedAccountId]);

  const handleTabChange = (tabId: string) => {
    const newTab = (['portfolio', 'trades'] as const).includes(tabId as Tab) && (tabId !== 'trades' || canViewTradePlans)
      ? (tabId as Tab)
      : 'portfolio';
    setActiveTab(newTab);
  };

  const [todayOrders, setTodayOrders] = useState<StockOrder[]>([]);
  const [todayOrdersLoading, setTodayOrdersLoading] = useState(false);
  const [todayOrdersError, setTodayOrdersError] = useState<string | null>(null);
  const [todayOrdersLastUpdatedAt, setTodayOrdersLastUpdatedAt] = useState<number | null>(null);

  const sortedTodayOrders = useMemo(() => {
    const next = [...todayOrders];
    next.sort((a, b) => {
      const at = a.order_time ? Date.parse(a.order_time.replace(' ', 'T')) : NaN;
      const bt = b.order_time ? Date.parse(b.order_time.replace(' ', 'T')) : NaN;
      if (Number.isFinite(at) && Number.isFinite(bt)) return bt - at;
      if (Number.isFinite(bt)) return 1;
      if (Number.isFinite(at)) return -1;
      return String(b.order_time || '').localeCompare(String(a.order_time || ''));
    });
    return next;
  }, [todayOrders]);

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

  const tabs = [
    { id: 'portfolio' as Tab, name: 'Portfolio', icon: Briefcase },
    ...(canViewTradePlans ? [{ id: 'trades' as Tab, name: 'Trade Plans', icon: LayoutGrid }] : []),
  ];

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
        {canViewTradePlans && activeTab === 'trades' && !portfolioUuid && (
          <div className="w-full">
            <StockSearch
              onSelect={onStockSelect}
              selectedStockCode={selectedStock?.stock_code}
            />
          </div>
        )}
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

      {activeTab === 'portfolio' && (
        <Portfolio 
          holdings={holdings} 
          theme={theme} 
          recentTrades={recentTrades}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          isSharedView={!!portfolioUuid}
          userId={DEMO_USER_ID}
          selectedAccountId={selectedAccountId}
          onAccountChange={setSelectedAccountId}
          isSnapshot={isSnapshot}
        />
      )}

      {canViewTradePlans && activeTab === 'trades' && !portfolioUuid && (
        <div className="flex flex-col gap-4 sm:gap-6">
          <TradeForm 
            selectedStock={selectedStock} 
            theme={theme} 
            accountAlias={selectedAccountId}
          />
          <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden transition-colors duration-200`}>
            <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>当日订单</div>
                  <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                    {todayOrdersLastUpdatedAt ? `更新于 ${new Date(todayOrdersLastUpdatedAt).toLocaleTimeString()}` : ' '}
                  </div>
                </div>
                <button
                  onClick={fetchTodayOrders}
                  disabled={todayOrdersLoading}
                  className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${themes[theme].secondary} ${
                    todayOrdersLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${todayOrdersLoading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              {todayOrdersLoading && (
                <div className={`text-sm ${themes[theme].text} opacity-75`}>正在加载当日订单…</div>
              )}
              {!todayOrdersLoading && todayOrdersError && (
                <div className="text-sm text-red-500 break-words">{todayOrdersError}</div>
              )}
              {!todayOrdersLoading && !todayOrdersError && sortedTodayOrders.length === 0 && (
                <div className={`text-sm ${themes[theme].text} opacity-75`}>当日暂无订单。</div>
              )}
              {!todayOrdersLoading && !todayOrdersError && sortedTodayOrders.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">标的</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">动作</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">价格(成/限)</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数量(成/委)</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">系统号</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注/错误</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {sortedTodayOrders.map((order, idx) => {
                        const status = getOrderStatusBadge(order.order_status_name);
                        const timeText = order.order_time?.includes(' ')
                          ? order.order_time.split(' ')[1]?.slice(0, 8)
                          : (order.order_time || '-');
                        const symbol = order.contract_code_full || order.instrument_id || '-';
                        const name = order.instrument_name || '';
                        const traded = Number.isFinite(order.traded_price) ? order.traded_price : null;
                        const limit = Number.isFinite(order.limit_price) ? order.limit_price : null;
                        const priceText = `${traded != null ? traded.toFixed(4) : '-'} / ${limit != null ? limit.toFixed(4) : '-'}`;
                        const qtyText = `${order.volume_traded ?? 0}/${order.volume_total_original ?? 0}`;
                        const note = order.error_msg || order.remark || '-';

                        return (
                          <tr key={`${order.order_sys_id || symbol || order.order_time || 'na'}-${idx}`}>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{timeText}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <div className="font-mono">{symbol}</div>
                              {name ? <div className="opacity-75">{name}</div> : null}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.op_type_name_zh || order.op_type_name || '-'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`} title={order.order_status_name || undefined}>
                                {status.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{priceText}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{qtyText}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{order.order_sys_id || '-'}</td>
                            <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-200 break-words">{note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <TradeList
            selectedStockCode={selectedStock?.stock_code}
            theme={theme}
            selectedAccountId={selectedAccountId}
          />
        </div>
      )}
      {/* Show message for restricted tabs in shared view */}
      {portfolioUuid && activeTab !== 'portfolio' && (
        <div className={`${themes[theme].card} rounded-lg p-8 text-center`}>
          <div className={`${themes[theme].text} opacity-70`}>
            <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">This feature is not available in shared portfolio view</p>
            <p className="text-sm">Switch to Portfolio tab to view shared data</p>
          </div>
        </div>
      )}
    </main>
  );
}
