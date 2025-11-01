import React, { useState, useEffect } from 'react';
import { logger } from '../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, LayoutGrid, History, Upload, Activity, BookOpen, Settings } from 'lucide-react';
import { TradeForm, TradeList, StockSearch } from '../features/trading';
import { Portfolio } from '../features/portfolio';
import { OperationsView, UploadPage } from './Journal/features';
import { RelatedLinks } from '../shared/components';
import { Theme, themes } from '../lib/theme';
import { portfolioService, accountService } from '../lib/services';
import { StockChart } from '../features/trading/components/StockChart';
import type { Stock, Holding, Trade, Account } from '../lib/services/types';

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
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

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
          
          if (holdingsResponse.data) setHoldings(holdingsResponse.data);
          if (tradesResponse.data) setRecentTrades(tradesResponse.data);
        } else {
          // Fetch regular user portfolio data and accounts
  if (!selectedAccountId) {
    logger.debug('[Journal] Guard: selectedAccountId missing');
    return;
  }

          const [holdingsResponse, tradesResponse, accountsResponse] = await Promise.all([
            portfolioService.getHoldings(selectedAccountId),
            portfolioService.getRecentTrades(DEMO_USER_ID, dateRange.startDate, dateRange.endDate, selectedAccountId),
            accountService.getAccounts(DEMO_USER_ID)
          ]);
          
          if (holdingsResponse.data) setHoldings(holdingsResponse.data);
          if (tradesResponse.data) setRecentTrades(tradesResponse.data);
          if (accountsResponse.data) {
            setAccounts(accountsResponse.data);
            // Set default account if none selected
            if (!selectedAccountId && accountsResponse.data.length > 0) {
              setSelectedAccountId(accountsResponse.data[0].id);
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
      <div className="mb-6">
        <div className="flex flex-col gap-4">
          {/* Only show stock search if not viewing shared portfolio */}
          {!portfolioUuid && (
            <div className="w-full">
              <StockSearch
                onSelect={onStockSelect}
                selectedStockCode={selectedStock?.stock_code}
              />
            </div>
          )}
          
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex space-x-2 min-w-max sm:min-w-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`inline-flex items-center px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                      activeTab === tab.id
                        ? themes[theme].primary
                        : themes[theme].secondary
                    }`}
                  >
                    <Icon className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">{tab.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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
          onAccountChange={(accountId) => setSelectedAccountId(accountId)}
        />
      )}

      {activeTab === 'trades' && !portfolioUuid && (
        <div className="flex flex-col gap-4 sm:gap-6">
          <TradeForm selectedStock={selectedStock} theme={theme} />
          <TradeList selectedStockCode={selectedStock?.stock_code} theme={theme} />
        </div>
      )}

      {activeTab === 'history' && !portfolioUuid && (
        <div className="space-y-4 sm:space-y-6">
          {selectedStock?.stock_code && (
            <StockChart stockCode={selectedStock.stock_code} theme={theme} />
          )}
          <div className={`${themes[theme].card} rounded-lg p-3 sm:p-4 lg:p-6`}>
            <h2 className={`text-lg sm:text-xl lg:text-2xl font-bold mb-3 sm:mb-4 ${themes[theme].text}`}>Completed Trades</h2>
            <TradeList selectedStockCode={selectedStock?.stock_code} theme={theme} showCompleted={true} />
          </div>
        </div>
      )}

      {activeTab === 'upload' && !portfolioUuid && (
        <UploadPage theme={theme} />
      )}

      {activeTab === 'operations' && !portfolioUuid && (
        <OperationsView theme={theme} />
      )}

      {activeTab === 'analysis' && (
        <div className={`${themes[theme].card} rounded-lg p-3 sm:p-4 lg:p-6`}>
          <h2 className={`text-lg sm:text-xl lg:text-2xl font-bold mb-3 sm:mb-4 ${themes[theme].text}`}>Performance Analysis</h2>
          <p className={`${themes[theme].text} opacity-70 text-sm sm:text-base`}>
            Trading performance analysis features coming soon...
          </p>
        </div>
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