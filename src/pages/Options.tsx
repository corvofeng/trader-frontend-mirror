import React, { useCallback, useRef, useState } from 'react';
import { logger } from '../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, TrendingUp, Briefcase, Calculator, RefreshCw, Shield, Activity, BookOpen, Hourglass } from 'lucide-react';
import { Theme, themes } from '../lib/theme';
import { OptionsChain } from '../features/options/components/OptionsChain';
import { TimeValueChart } from '../features/options/components/TimeValueChart';
import { VerticalSpreadMonthlyPricesChart } from '../features/options/components/VerticalSpreadMonthlyPricesChart';
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
import type { OptionsData } from '../lib/services/types';
import { OptionPriceWebSocketProvider } from '../features/options/context/OptionPriceWebSocketContext';
import { useAutoRefresh, useOptionPriceWebSocket } from '../features/options/hooks/useOptionPriceWebSocket';
import { TabNavigation } from './Journal/components/TabNavigation';

interface OptionsProps {
  theme: Theme;
}

type OptionsTab = 'data' | 'portfolio' | 'analysis' | 'trading' | 'management' | 'whitelist' | 'risk';

function OptionsContent({ theme }: OptionsProps) {
  const location = useLocation();
  const navigate = useNavigate();

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
    const tab = params.get('tab') as OptionsTab;
    return tab && ['data', 'portfolio', 'analysis', 'trading', 'management', 'whitelist', 'risk'].includes(tab) ? tab : 'data';
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
  const { isConnected, queryOptionsData, optionsDataSnapshots } = useOptionPriceWebSocket();
  const pendingFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabChange = (newTab: string) => {
    const nextTab = newTab as OptionsTab;
    setActiveTab(nextTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', nextTab);
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
    { id: 'portfolio' as OptionsTab, name: 'Portfolio', icon: Briefcase },
    { id: 'analysis' as OptionsTab, name: 'Analysis', icon: BookOpen },
    { id: 'trading' as OptionsTab, name: 'Plans', icon: TrendingUp },
    { id: 'management' as OptionsTab, name: 'Manage', icon: Calculator },
    { id: 'whitelist' as OptionsTab, name: 'Whitelist', icon: Shield },
    { id: 'risk' as OptionsTab, name: 'Risk', icon: Activity },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="space-y-6">
        <div className={`${themes[theme].card} rounded-lg p-4`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className={`text-2xl font-bold ${themes[theme].text}`}>
                Options Trading Analysis
              </h1>
              <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                Advanced options analysis and trading tools
              </p>
            </div>
            <div className="w-full min-w-0 flex flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-4">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
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
                  onClick={() => {
                    if (activeTab === 'data' && selectedSymbol) {
                      if (wsCountdownEnabled) {
                        triggerWsNow();
                      } else if (isConnected) {
                        queryOptionsData(selectedSymbol);
                      }
                    }
                    setRefreshKey((k) => k + 1);
                  }}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap ${themes[theme].secondary}`}
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  Symbol:
                </label>
                {availableSymbols.length > 0 ? (
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    disabled={isLoading || isLoadingSymbols}
                    className={`max-w-full px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text} ${
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
                {activeTab === 'data' && (
                  <div className={`flex items-center gap-1 px-2 py-1 rounded border ${themes[theme].border} shrink-0`}>
                    <Hourglass className={`w-4 h-4 ${themes[theme].text} opacity-60`} />
                    <div className="w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div className="h-1 bg-blue-500" style={{ width: `${Math.round(wsProgress * 100)}%` }} />
                    </div>
                    <div className={`text-[10px] ${themes[theme].text} opacity-60 w-8 text-right`}>
                      {wsCountdownEnabled ? `${Math.ceil(wsRemainingMs / 1000)}s` : '--'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (wsCountdownEnabled) {
                          triggerWsNow();
                          return;
                        }
                        setRefreshKey((k) => k + 1);
                      }}
                      disabled={!selectedSymbol}
                      className={`${themes[theme].secondary} rounded-md p-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                      title="刷新行情"
                      aria-label="刷新行情"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
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

                <VerticalSpreadMonthlyPricesChart
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
  );
}

export function Options({ theme }: OptionsProps) {
  return (
    <OptionPriceWebSocketProvider>
      <OptionsContent theme={theme} />
    </OptionPriceWebSocketProvider>
  );
}
