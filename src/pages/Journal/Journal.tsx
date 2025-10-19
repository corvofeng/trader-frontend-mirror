import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, LayoutGrid, History, Upload, Activity, BookOpen, Settings } from 'lucide-react';
import { TabNavigation } from './components/TabNavigation';
import { StockSearchSection } from './components/StockSearchSection';
import { SharedPortfolioInfo } from './components/SharedPortfolioInfo';
import { TabContent } from './components/TabContent';
import { portfolioService } from '../../lib/services';
import type { Stock, Holding, Trade, Account } from '../../lib/services/types';
import type { Theme } from '../../lib/theme';

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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
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
    const fetchAccounts = async () => {
      if (!portfolioUuid) {
        const response = await portfolioService.getAccounts(DEMO_USER_ID);
        if (response?.data) {
          setAccounts(response.data);
          const defaultAccount = response.data.find(acc => acc.isDefault);
          if (defaultAccount) {
            setSelectedAccountId(defaultAccount.id);
          }
        }
      }
    };
    fetchAccounts();
  }, [portfolioUuid]);

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
          // Fetch regular user portfolio data
          const [holdingsResponse, tradesResponse] = await Promise.all([
            portfolioService.getHoldings(DEMO_USER_ID, selectedAccountId || undefined),
            portfolioService.getRecentTrades(DEMO_USER_ID, dateRange.startDate, dateRange.endDate, selectedAccountId || undefined)
          ]);

          if (holdingsResponse.data) setHoldings(holdingsResponse.data);
          if (tradesResponse.data) setRecentTrades(tradesResponse.data);
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
          <StockSearchSection 
            portfolioUuid={portfolioUuid}
            onStockSelect={onStockSelect}
            selectedStockCode={selectedStock?.stock_code}
          />
          
          <TabNavigation 
            tabs={tabs}
            activeTab={activeTab}
            theme={theme}
            onTabChange={handleTabChange}
          />
        </div>
      </div>

      <SharedPortfolioInfo 
        portfolioUuid={portfolioUuid}
        activeTab={activeTab}
        theme={theme}
      />

      <TabContent
        activeTab={activeTab}
        selectedStock={selectedStock}
        theme={theme}
        holdings={holdings}
        recentTrades={recentTrades}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        portfolioUuid={portfolioUuid}
      />
    </main>
  );
}