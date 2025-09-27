import React from 'react';
import { Briefcase } from 'lucide-react';
import { TradeForm, TradeList, StockChart } from '../../../features/trading';
import { Portfolio } from '../../../features/portfolio';
import { OperationsView, UploadPage } from '../features';
import { RelatedLinks } from '../../../shared/components';
import { themes, Theme } from '../../../lib/theme';
import type { Stock, Holding, Trade } from '../../../lib/services/types';

interface TabContentProps {
  activeTab: string;
  selectedStock: Stock | null;
  theme: Theme;
  holdings: Holding[];
  recentTrades: Trade[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  portfolioUuid: string | null;
}

export function TabContent({
  activeTab,
  selectedStock,
  theme,
  holdings,
  recentTrades,
  dateRange,
  onDateRangeChange,
  portfolioUuid
}: TabContentProps) {
  const isSharedView = !!portfolioUuid;

  if (activeTab === 'portfolio') {
    return (
      <Portfolio 
        holdings={holdings} 
        theme={theme} 
        recentTrades={recentTrades}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        isSharedView={isSharedView}
      />
    );
  }

  if (activeTab === 'trades' && !portfolioUuid) {
    return (
      <div className="flex flex-col gap-6">
        <TradeForm selectedStock={selectedStock} theme={theme} />
        <TradeList selectedStockCode={selectedStock?.stock_code} theme={theme} />
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=trades" 
          maxItems={3}
        />
      </div>
    );
  }

  if (activeTab === 'history' && !portfolioUuid) {
    return (
      <div className="space-y-6">
        {selectedStock?.stock_code && (
          <StockChart stockCode={selectedStock.stock_code} theme={theme} />
        )}
        <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
          <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Completed Trades</h2>
          <TradeList selectedStockCode={selectedStock?.stock_code} theme={theme} showCompleted={true} />
        </div>
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=history" 
          maxItems={3}
        />
      </div>
    );
  }

  if (activeTab === 'upload' && !portfolioUuid) {
    return (
      <div className="space-y-6">
        <UploadPage theme={theme} />
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=upload" 
          maxItems={3}
        />
      </div>
    );
  }

  if (activeTab === 'operations' && !portfolioUuid) {
    return (
      <div className="space-y-6">
        <OperationsView theme={theme} />
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=operations" 
          maxItems={3}
        />
      </div>
    );
  }

  if (activeTab === 'analysis') {
    return (
      <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
        <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Performance Analysis</h2>
        <p className={`${themes[theme].text} opacity-70`}>
          Trading performance analysis features coming soon...
        </p>
        <div className="mt-6">
          <RelatedLinks 
            theme={theme} 
            currentPath="/journal?tab=analysis" 
            maxItems={3}
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'settings' && !portfolioUuid) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
        <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Account Settings</h2>
        <p className={`${themes[theme].text} opacity-70`}>
          Account and preferences settings coming soon...
        </p>
        <div className="mt-6">
          <RelatedLinks 
            theme={theme} 
            currentPath="/journal?tab=settings" 
            maxItems={3}
          />
        </div>
      </div>
    );
  }

  // Show message for restricted tabs in shared view
  if (portfolioUuid && !['portfolio', 'analysis'].includes(activeTab)) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-8 text-center`}>
        <div className={`${themes[theme].text} opacity-70`}>
          <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">This feature is not available in shared portfolio view</p>
          <p className="text-sm">Switch to Portfolio or Analysis tab to view shared data</p>
        </div>
      </div>
    );
  }

  return null;
}