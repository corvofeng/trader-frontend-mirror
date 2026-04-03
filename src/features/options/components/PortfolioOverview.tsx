import { Activity } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPortfolioData } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types/ui';

interface PortfolioOverviewProps {
  theme: Theme;
  portfolioData: OptionsPortfolioData;
  currencyConfig: CurrencyConfig;
  activityLogsCount: number;
  onOpenLog: () => void;
  currentUnderlyingPrice?: number | null;
}

export function PortfolioOverview({
  theme,
  portfolioData,
  currencyConfig,
  activityLogsCount,
  onOpenLog,
  currentUnderlyingPrice
}: PortfolioOverviewProps) {
  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>期权投资组合概览</h2>
            <button
              onClick={onOpenLog}
              className={`ml-2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${themes[theme].text} relative`}
              title="查看持仓变动日志"
            >
              <Activity className="w-5 h-5" />
              {activityLogsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </button>
          </div>
          {currentUnderlyingPrice != null && (
            <div className="flex items-center gap-3">
              <span className={`text-sm ${themes[theme].text}`}>当前价 {currentUnderlyingPrice.toFixed(4)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总金额 balance</h3>
            <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
              {formatCurrency(portfolioData.balance ?? 0, currencyConfig, 4)}
            </p>
          </div>
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>可用金额 available</h3>
            <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
              {formatCurrency(portfolioData.available ?? 0, currencyConfig, 4)}
            </p>
          </div>
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>当前仓位盈亏 position_profit</h3>
            <p className={`text-2xl font-bold mt-1 ${(portfolioData.position_profit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {(portfolioData.position_profit ?? 0) >= 0 ? '+' : ''}{formatCurrency(Math.abs(portfolioData.position_profit ?? 0), currencyConfig, 4)}
            </p>
          </div>
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>当前使用保证金 real_used_margin</h3>
            <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
              {formatCurrency(portfolioData.real_used_margin ?? 0, currencyConfig, 4)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
