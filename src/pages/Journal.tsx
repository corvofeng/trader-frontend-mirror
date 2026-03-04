import React, { useState, useEffect } from 'react';
import { logger } from '../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, LayoutGrid, History, Upload, Activity, BookOpen, Settings } from 'lucide-react';
import { TradeForm, TradeList, StockSearch } from '../features/trading';
import DailyTradeHistory from '../features/trading/components/DailyTradeHistory';
import HistoryTradesChart from '../features/trading/components/HistoryTradesChart';
import { Portfolio } from '../features/portfolio';
import { OperationsView, UploadPage } from './Journal/features';
import { } from '../shared/components';
import { Theme, themes } from '../lib/theme';
import { portfolioService, accountService } from '../lib/services';
import { StockChart } from '../features/trading/components/StockChart';
import { AccountSelector } from '../shared/components/AccountSelector';
import type { Stock, Holding, Trade } from '../lib/services/types';
import { TabNavigation } from './Journal/components/TabNavigation';
import { TabContent } from './Journal/components/TabContent';

interface JournalProps {
  selectedStock: Stock | null;
  theme: Theme;
  onStockSelect: (stock: Stock) => void;
}

type Tab = 'portfolio' | 'trades' | 'history' | 'analysis' | 'settings' | 'operations' | 'upload';

const DEMO_USER_ID = 'mock-user-id';

export function Journal({ selectedStock, theme, onStockSelect }: JournalProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') as Tab;
    return tab && ['portfolio', 'trades', 'history', 'analysis', 'settings', 'operations', 'upload'].includes(tab)
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
    const alias =
      localStorage.getItem('journalSelectedAccountAlias') ||
      localStorage.getItem('selectedAccountAlias');
    const cookie = typeof document !== 'undefined'
      ? (document.cookie
          ? (document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('journalAccountId='))?.split('=')[1] ?? null)
          : null)
      : null;
    return alias || cookie || localStorage.getItem('journalAccountId') || localStorage.getItem('selectedAccountId') || null;
  });

  // Get UUID from URL params for portfolio sharing
  const portfolioUuid = new URLSearchParams(location.search).get('uuid');

  const handleTabChange = (newTab: Tab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', newTab);
    navigate(`/journal?${params.toString()}`, { replace: true });
  };

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

  const tabs = [
    { id: 'portfolio' as Tab, name: 'Portfolio', icon: Briefcase },
    { id: 'trades' as Tab, name: 'Trade Plans', icon: LayoutGrid },
    { id: 'history' as Tab, name: 'Trade History', icon: History },
    { id: 'upload' as Tab, name: 'Upload', icon: Upload },
    { id: 'operations' as Tab, name: 'Operations', icon: Activity },
    { id: 'analysis' as Tab, name: 'Analysis', icon: BookOpen },
    { id: 'settings' as Tab, name: 'Settings', icon: Settings },
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
        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          theme={theme}
          onTabChange={handleTabChange}
        />
        {activeTab === 'trades' && !portfolioUuid && (
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

      {activeTab === 'trades' && !portfolioUuid && (
        <div className="flex flex-col gap-4 sm:gap-6">
          <TradeForm 
            selectedStock={selectedStock} 
            theme={theme} 
            accountAlias={selectedAccountId}
          />
          <TradeList
            selectedStockCode={selectedStock?.stock_code}
            theme={theme}
            selectedAccountId={selectedAccountId}
          />
        </div>
      )}

      {activeTab === 'history' && !portfolioUuid && (
        <div className="space-y-4 sm:space-y-6">
          {selectedStock?.stock_code && (
            <StockChart stockCode={selectedStock.stock_code} theme={theme} />
          )}
          <HistoryTradesChart
            theme={theme}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            selectedAccountId={selectedAccountId}
            selectedStockCode={selectedStock?.stock_code}
          />
          <DailyTradeHistory 
            theme={theme}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            selectedStockCode={selectedStock?.stock_code}
            selectedAccountId={selectedAccountId}
          />
        </div>
      )}

      {activeTab === 'upload' && !portfolioUuid && (
        <UploadPage theme={theme} />
      )}

      {activeTab === 'operations' && !portfolioUuid && (
        <OperationsView theme={theme} accountAlias={selectedAccountId} />
      )}

      {activeTab === 'analysis' && (
        <TabContent
          activeTab={activeTab}
          selectedStock={selectedStock}
          theme={theme}
          holdings={holdings}
          recentTrades={recentTrades}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          portfolioUuid={portfolioUuid}
          userId={DEMO_USER_ID}
          selectedAccountId={selectedAccountId}
          onAccountChange={(accountId) => {
            setSelectedAccountId(accountId);
          }}
        />
      )}

      {activeTab === 'settings' && !portfolioUuid && (
        <div className={`${themes[theme].card} rounded-lg p-3 sm:p-4 lg:p-6`}>
          <h2 className={`text-lg sm:text-xl lg:text-2xl font-bold mb-3 sm:mb-4 ${themes[theme].text}`}>Account Settings</h2>
          <p className={`${themes[theme].text} opacity-70 text-sm sm:text-base`}>
            Account and preferences settings coming soon...
          </p>
        </div>
      )}

      {/* Show message for restricted tabs in shared view */}
      {portfolioUuid && !['portfolio', 'analysis'].includes(activeTab) && (
        <div className={`${themes[theme].card} rounded-lg p-8 text-center`}>
          <div className={`${themes[theme].text} opacity-70`}>
            <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">This feature is not available in shared portfolio view</p>
            <p className="text-sm">Switch to Portfolio or Analysis tab to view shared data</p>
          </div>
        </div>
      )}
    </main>
  );
}
