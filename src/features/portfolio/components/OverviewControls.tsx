import { RefreshCw, Camera } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';

interface OverviewControlsProps {
  theme: Theme;
  userId?: string;
  selectedAccountId?: string | null;
  onAccountChange?: (accountId: string) => void;
  dateRange: { startDate: string; endDate: string };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  isSharedView?: boolean;
  portfolioUuid?: string | null;
  onRefresh?: () => void;
  isLoggedIn?: boolean;
  onScreenshot?: () => void;
}

export function OverviewControls({
  theme,
  dateRange,
  onDateRangeChange,
  isSharedView,
  portfolioUuid,
  onRefresh,
  isLoggedIn = true,
  onScreenshot,
}: OverviewControlsProps) {
  return (
    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6">
      <div className="flex items-center gap-4">
        <h2 className={`text-xl font-semibold ${themes[theme].text}`}>Portfolio Overview</h2>
      </div>

      {isLoggedIn && (!isSharedView || portfolioUuid) && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full md:w-auto">
          <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            
            <div className="flex gap-2 ml-auto sm:ml-0">
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className={`inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 rounded-md text-sm sm:text-base whitespace-nowrap ${themes[theme].secondary} hide-in-screenshot hover:opacity-80 transition-opacity`}
                >
                  <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden xs:inline">刷新</span>
                </button>
              )}
              {onScreenshot && (
                <button
                  onClick={onScreenshot}
                  className={`inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 rounded-md text-sm sm:text-base whitespace-nowrap ${themes[theme].secondary} hide-in-screenshot hover:opacity-80 transition-opacity`}
                  title="生成持仓截图"
                >
                  <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>分享截图</span>
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
              className={`flex-1 sm:flex-none px-2 py-1 rounded-md text-sm sm:text-base ${themes[theme].input} ${themes[theme].text}`}
            />
            <span className={`text-sm sm:text-base ${themes[theme].text}`}>to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
              className={`flex-1 sm:flex-none px-2 py-1 rounded-md text-sm sm:text-base ${themes[theme].input} ${themes[theme].text}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

