import React, { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { PortfolioHeader } from './components/PortfolioHeader';
import { PortfolioMetrics } from './components/PortfolioMetrics';
import { PortfolioTrend } from '../PortfolioTrend';
import { PortfolioHeatmap } from '../PortfolioHeatmap';
import { PortfolioHoldings } from './components/PortfolioHoldings';
import { PortfolioTrades } from './components/PortfolioTrades';
import { StockAnalysisModal } from '../StockAnalysisModal';
import { PortfolioAnalysisPanel } from '../PortfolioAnalysisPanel';
import { AccountSelector } from '../AccountSelector';
import { Theme, themes } from '../../../../lib/theme';
import { portfolioService } from '../../../../lib/services';
import type { Holding, Trade, TrendData, Account } from '../../../../lib/services/types';

interface PortfolioProps {
  holdings: Holding[];
  theme: Theme;
  recentTrades?: Trade[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  isSharedView?: boolean;
}

const DEMO_USER_ID = 'mock-user-id';

export function Portfolio({
  holdings,
  theme,
  recentTrades = [],
  dateRange,
  onDateRangeChange,
  isSharedView = false
}: PortfolioProps) {
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [selectedStockForAnalysis, setSelectedStockForAnalysis] = useState<{ code: string; name: string } | null>(null);
  const [showPortfolioAnalysis, setShowPortfolioAnalysis] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Get UUID from URL params for portfolio sharing
  const portfolioUuid = new URLSearchParams(window.location.search).get('uuid');

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!isSharedView && !portfolioUuid) {
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
  }, [isSharedView, portfolioUuid]);

  useEffect(() => {
    const fetchTrendData = async () => {
      try {
        let response;
        if (portfolioUuid) {
          // Use UUID-based API for shared portfolios
          response = await portfolioService.getTrendDataByUuid(
            portfolioUuid,
            dateRange.startDate,
            dateRange.endDate
          );
        } else if (!isSharedView) {
          // Use regular user-based API
          response = await portfolioService.getTrendData(
            DEMO_USER_ID,
            dateRange.startDate,
            dateRange.endDate,
            selectedAccountId || undefined
          );
        }
        
        if (response?.data) {
          setTrendData(response.data);
        }
      } catch (error) {
        console.error('Error fetching trend data:', error);
      }
    };

    fetchTrendData();
  }, [dateRange, isSharedView, portfolioUuid, selectedAccountId]);

  return (
    <div className="space-y-6">
      {isSharedView && (
        <div className={`${themes[theme].card} rounded-lg p-4 border-l-4 border-blue-500`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ExternalLink className="w-5 h-5 text-blue-500" />
              <span className={`text-sm font-medium ${themes[theme].text}`}>
                This is a shared portfolio view
              </span>
            </div>
            <span className={`text-xs ${themes[theme].text} opacity-60`}>
              Read-only access
            </span>
          </div>
        </div>
      )}

      {!isSharedView && !portfolioUuid && accounts.length > 0 && (
        <AccountSelector
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onAccountChange={setSelectedAccountId}
          theme={theme}
        />
      )}

      {/* Portfolio Analysis Panel */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>智能分析</h3>
          <button
            onClick={() => setShowPortfolioAnalysis(!showPortfolioAnalysis)}
            className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
          >
            {showPortfolioAnalysis ? '隐藏分析' : '查看分析'}
          </button>
        </div>
        {showPortfolioAnalysis && <PortfolioAnalysisPanel theme={theme} portfolioUuid={portfolioUuid} />}
      </div>

      {/* Stock Analysis Modal */}
      {selectedStockForAnalysis && (
        <StockAnalysisModal
          stockCode={selectedStockForAnalysis.code}
          stockName={selectedStockForAnalysis.name}
          theme={theme}
          onClose={() => setSelectedStockForAnalysis(null)}
        />
      )}

      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <PortfolioHeader
          theme={theme}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          isSharedView={isSharedView}
          portfolioUuid={portfolioUuid}
        />

        <PortfolioMetrics
          holdings={holdings}
          trendData={trendData}
          theme={theme}
        />

        {trendData.length > 0 && (
          <PortfolioTrend 
            trendData={trendData}
            theme={theme}
            dateRange={dateRange}
          />
        )}

        <PortfolioHeatmap 
          holdings={holdings}
          theme={theme}
        />

        <div className="grid md:grid-cols-2 gap-6 p-6">
          <PortfolioHoldings
            holdings={holdings}
            theme={theme}
            onAnalyzeStock={setSelectedStockForAnalysis}
          />

          <PortfolioTrades
            recentTrades={recentTrades}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}