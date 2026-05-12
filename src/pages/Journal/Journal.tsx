import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, LayoutGrid, History, Upload, Activity, BookOpen, Settings } from 'lucide-react';
import { TabNavigation } from './components/TabNavigation';
import { StockSearchSection } from './components/StockSearchSection';
import { SharedPortfolioInfo } from './components/SharedPortfolioInfo';
import { TabContent } from './components/TabContent';
import { portfolioService, accountService, stockConfigService, tradeService, stockService, operationService } from '../../lib/services';
import type { Stock, Holding, Trade } from '../../lib/services/types';
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
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try {
      const uuid = new URLSearchParams(window.location.search).get('uuid');
      const key =
        (uuid && `uuid:${uuid}`) ||
        localStorage.getItem('journalSelectedAccountAlias') ||
        localStorage.getItem('journalAccountId') ||
        localStorage.getItem('selectedAccountAlias') ||
        localStorage.getItem('selectedAccountId') ||
        '';
      if (!key) return [];
      const raw = localStorage.getItem(`journal:holdings:${key}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { data?: Holding[]; ts?: number } | Holding[];
      if (Array.isArray(parsed)) return parsed;
      return Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      return [];
    }
  });
  const [recentTrades, setRecentTrades] = useState<Trade[]>(() => {
    try {
      const uuid = new URLSearchParams(window.location.search).get('uuid');
      const key =
        (uuid && `uuid:${uuid}`) ||
        localStorage.getItem('journalSelectedAccountAlias') ||
        localStorage.getItem('journalAccountId') ||
        localStorage.getItem('selectedAccountAlias') ||
        localStorage.getItem('selectedAccountId') ||
        '';
      if (!key) return [];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];
      const raw = localStorage.getItem(`journal:recentTrades:${key}:${startDate}:${endDate}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { data?: Trade[]; ts?: number } | Trade[];
      if (Array.isArray(parsed)) return parsed;
      return Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      return [];
    }
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    const alias =
      localStorage.getItem('journalSelectedAccountAlias') ||
      localStorage.getItem('journalAccountId') ||
      localStorage.getItem('selectedAccountAlias');
    const legacy = localStorage.getItem('selectedAccountId');
    return alias || legacy || null;
  });
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // Get UUID from URL params for portfolio sharing
  const portfolioUuid = new URLSearchParams(location.search).get('uuid');

  useEffect(() => {
    const key = portfolioUuid ? `uuid:${portfolioUuid}` : selectedAccountId || '';
    if (!key) return;

    try {
      const cachedHoldingsRaw = localStorage.getItem(`journal:holdings:${key}`);
      if (cachedHoldingsRaw) {
        const parsed = JSON.parse(cachedHoldingsRaw) as { data?: Holding[]; ts?: number } | Holding[];
        const data = Array.isArray(parsed) ? parsed : parsed.data;
        if (Array.isArray(data)) setHoldings(data);
      }
    } catch {}

    try {
      const cachedTradesRaw = localStorage.getItem(`journal:recentTrades:${key}:${dateRange.startDate}:${dateRange.endDate}`);
      if (cachedTradesRaw) {
        const parsed = JSON.parse(cachedTradesRaw) as { data?: Trade[]; ts?: number } | Trade[];
        const data = Array.isArray(parsed) ? parsed : parsed.data;
        if (Array.isArray(data)) setRecentTrades(data);
      }
    } catch {}
  }, [dateRange.endDate, dateRange.startDate, portfolioUuid, selectedAccountId]);

  const handleTabChange = (newTab: Tab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', newTab);
    navigate(`/journal?${params.toString()}`, { replace: true });
  };

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!portfolioUuid) {
        const resp = await accountService.getAccounts(DEMO_USER_ID);
        if (resp?.data) {
          const stored = localStorage.getItem('selectedAccountAlias') || localStorage.getItem('selectedAccountId');
          const storedExists = stored && resp.data.some(acc => (acc.alias || acc.id) === stored);
          if (storedExists) {
            setSelectedAccountId(stored);
          } else {
            const defaultAccount = resp.data.find(acc => acc.is_default) || resp.data[0];
            if (defaultAccount) {
              const key = defaultAccount.alias || defaultAccount.id;
              setSelectedAccountId(key);
              localStorage.setItem('selectedAccountId', key);
              localStorage.setItem('selectedAccountAlias', key);
            }
          }
        }
      }
    };
    fetchAccounts();
  }, [portfolioUuid]);

  useEffect(() => {
    const fetchData = async () => {
      setPortfolioLoading(true);
      if (portfolioUuid) {
        const [holdingsResponse, tradesResponse] = await Promise.all([
          portfolioService.getHoldingsByUuid(portfolioUuid),
          portfolioService.getRecentTradesByUuid(portfolioUuid, dateRange.startDate, dateRange.endDate)
        ]);

        if (holdingsResponse.data) {
          setHoldings(holdingsResponse.data);
          try {
            localStorage.setItem(
              `journal:holdings:uuid:${portfolioUuid}`,
              JSON.stringify({ ts: Date.now(), data: holdingsResponse.data })
            );
          } catch {}
        }
        if (tradesResponse.data) {
          setRecentTrades(tradesResponse.data);
          try {
            localStorage.setItem(
              `journal:recentTrades:uuid:${portfolioUuid}:${dateRange.startDate}:${dateRange.endDate}`,
              JSON.stringify({ ts: Date.now(), data: tradesResponse.data })
            );
          } catch {}
        }
        setPortfolioLoading(false);
        return;
      }

      if (!selectedAccountId) {
        return;
      }

      const [holdingsResponse, tradesResponse] = await Promise.all([
        portfolioService.getHoldings(DEMO_USER_ID, selectedAccountId),
        portfolioService.getRecentTrades(DEMO_USER_ID, dateRange.startDate, dateRange.endDate, selectedAccountId)
      ]);

      if (holdingsResponse.data) {
        setHoldings(holdingsResponse.data);
        try {
          localStorage.setItem(
            `journal:holdings:${selectedAccountId}`,
            JSON.stringify({ ts: Date.now(), data: holdingsResponse.data })
          );
        } catch {}
      }
      if (tradesResponse.data) {
        setRecentTrades(tradesResponse.data);
        try {
          localStorage.setItem(
            `journal:recentTrades:${selectedAccountId}:${dateRange.startDate}:${dateRange.endDate}`,
            JSON.stringify({ ts: Date.now(), data: tradesResponse.data })
          );
        } catch {}
      }
      setPortfolioLoading(false);
    };

    fetchData();
  }, [dateRange, portfolioUuid, selectedAccountId]);

  useEffect(() => {
    const prefetch = async () => {
      await Promise.allSettled([stockConfigService.getStockConfigs()]);

      if (portfolioUuid) {
        await Promise.allSettled([
          portfolioService.getTrendDataByUuid(portfolioUuid, dateRange.startDate, dateRange.endDate),
        ]);
        return;
      }

      if (!selectedAccountId) return;

      await Promise.allSettled([
        portfolioService.getTrendData(DEMO_USER_ID, dateRange.startDate, dateRange.endDate, selectedAccountId),
        tradeService.getTrades(DEMO_USER_ID, undefined, 'all', selectedAccountId),
        tradeService.getTrades(DEMO_USER_ID, undefined, 'completed', selectedAccountId),
        stockService.getTodayOrders(selectedAccountId),
        operationService.getOperations(dateRange.startDate, dateRange.endDate),
      ]);
    };

    prefetch();
  }, [dateRange.startDate, dateRange.endDate, portfolioUuid, selectedAccountId]);

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
          {activeTab === 'trades' && (
            <StockSearchSection 
              portfolioUuid={portfolioUuid}
              onStockSelect={onStockSelect}
              selectedStockCode={selectedStock?.stock_code}
            />
          )}
          
          <TabNavigation 
            tabs={tabs}
            activeTab={activeTab}
            theme={theme}
            onTabChange={(tab) => handleTabChange(tab as Tab)}
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
        portfolioLoading={portfolioLoading}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        portfolioUuid={portfolioUuid}
        userId={DEMO_USER_ID}
        selectedAccountId={selectedAccountId}
        onAccountChange={setSelectedAccountId}
      />
    </main>
  );
}
