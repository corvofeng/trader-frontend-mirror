import { useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  const stats = useMemo(() => {
    const positionProfit = portfolioData.position_profit ?? 0;

    return [
      {
        label: '总金额 balance',
        value: formatCurrency(portfolioData.balance ?? 0, currencyConfig, 4),
        valueClassName: themes[theme].text,
      },
      {
        label: '可用金额 available',
        value: formatCurrency(portfolioData.available ?? 0, currencyConfig, 4),
        valueClassName: themes[theme].text,
      },
      {
        label: '当前仓位盈亏 position_profit',
        value: `${positionProfit >= 0 ? '+' : ''}${formatCurrency(Math.abs(positionProfit), currencyConfig, 4)}`,
        valueClassName: positionProfit >= 0 ? 'text-green-600' : 'text-red-600',
      },
      {
        label: '当前使用保证金 real_used_margin',
        value: formatCurrency(portfolioData.real_used_margin ?? 0, currencyConfig, 4),
        valueClassName: themes[theme].text,
      },
    ];
  }, [currencyConfig, portfolioData.available, portfolioData.balance, portfolioData.position_profit, portfolioData.real_used_margin, theme]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-3 sm:p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className={`text-base sm:text-xl font-bold ${themes[theme].text}`}>期权投资组合概览</h2>
            <button
              onClick={onOpenLog}
              className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${themes[theme].text} relative shrink-0`}
              title="查看持仓变动日志"
            >
              <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
              {activityLogsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {currentUnderlyingPrice != null && (
              <div className="flex items-center gap-3 sm:justify-end">
                <span className={`text-xs sm:text-sm ${themes[theme].text}`}>当前价 {currentUnderlyingPrice.toFixed(4)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsMobileExpanded((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium sm:hidden ${themes[theme].secondary}`}
              aria-expanded={isMobileExpanded}
              aria-label={isMobileExpanded ? '收起概览' : '展开概览'}
            >
              {isMobileExpanded ? '收起' : '展开'}
              {isMobileExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
          <div className={`${themes[theme].background} rounded-md px-2.5 py-2`}>
            <p className={`text-[11px] ${themes[theme].text} opacity-70`}>总金额</p>
            <p className={`text-sm font-semibold ${themes[theme].text} truncate`}>{stats[0].value}</p>
          </div>
          <div className={`${themes[theme].background} rounded-md px-2.5 py-2`}>
            <p className={`text-[11px] ${themes[theme].text} opacity-70`}>仓位盈亏</p>
            <p className={`text-sm font-semibold truncate ${stats[2].valueClassName}`}>{stats[2].value}</p>
          </div>
        </div>
      </div>
      <div className={`${isMobileExpanded ? 'block' : 'hidden'} p-3 pt-0 sm:block sm:p-6`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className={`${themes[theme].background} rounded-md sm:rounded-lg p-3 sm:p-4`}>
              <h3 className={`text-[11px] sm:text-sm font-medium ${themes[theme].text} opacity-75`}>{stat.label}</h3>
              <p className={`text-sm sm:text-2xl font-bold mt-1 break-all ${stat.valueClassName}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
