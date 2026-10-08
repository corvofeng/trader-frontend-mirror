import { RefreshCw, Camera, Calendar, ArrowRight } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { isCloudflareEnv } from '../../../lib/services';

interface OverviewControlsProps {
  theme: Theme;
  userId?: string;
  selectedAccountId?: string | null;
  onAccountChange?: (accountId: string) => void;
  dateRange: { startDate: string; endDate: string };
  onDateRangeChange?: (range: { startDate: string; endDate: string }) => void;
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
  // 时间胶囊容器的适配主题样式
  const dateCapsuleBg =
    theme === 'dark'
      ? 'bg-gray-800/70 border-gray-700/80 text-gray-200'
      : theme === 'blue'
      ? 'bg-blue-900/40 border-blue-800/80 text-blue-100'
      : 'bg-slate-100/90 border-slate-200/90 text-slate-700';

  const dateInputStyle =
    theme === 'dark'
      ? 'text-gray-100 focus:text-white'
      : theme === 'blue'
      ? 'text-blue-50 focus:text-white'
      : 'text-slate-800 focus:text-slate-900';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-5">
      {/* 顶部主行：标题与副标题 */}
      <div className="flex items-center gap-2.5">
        <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${themes[theme].text}`}>
          资产概览
        </h2>
        <span className="hidden sm:inline-block text-xs font-mono font-medium opacity-50 px-2 py-0.5 rounded-full border border-current">
          Portfolio Overview
        </span>
      </div>

      {/* 右侧操作群组：时间范围胶囊 + 刷新 + 分享截图 (桌面端单行整齐呈现，移动端自然换行) */}
      {!isCloudflareEnv && isLoggedIn && (!isSharedView || portfolioUuid) && (
        <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
          {/* 紧凑优雅的时间胶囊 */}
          {onDateRangeChange && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border shadow-2xs transition-all w-full sm:w-auto ${dateCapsuleBg}`}
            >
              <Calendar className="w-3.5 h-3.5 opacity-50 shrink-0 ml-0.5" />
              
              {/* 开始日期 */}
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
                className={`bg-transparent border-0 p-0 text-xs sm:text-sm font-medium font-mono focus:ring-0 focus:outline-none cursor-pointer flex-1 sm:flex-none text-center sm:text-left ${dateInputStyle}`}
                title="开始日期"
              />

              <span className="opacity-40 text-xs px-0.5 shrink-0 select-none flex items-center">
                <ArrowRight className="w-3 h-3 opacity-60 hidden xs:inline" />
                <span className="xs:hidden">至</span>
              </span>

              {/* 结束日期 */}
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
                className={`bg-transparent border-0 p-0 text-xs sm:text-sm font-medium font-mono focus:ring-0 focus:outline-none cursor-pointer flex-1 sm:flex-none text-center sm:text-left ${dateInputStyle}`}
                title="结束日期"
              />
            </div>
          )}

          {/* 快捷按钮 */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap btn-tactile ${themes[theme].secondary} hide-in-screenshot hover:opacity-90 active:scale-95 transition-all shadow-2xs`}
                title="刷新数据"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">刷新</span>
              </button>
            )}
            {onScreenshot && (
              <button
                type="button"
                onClick={onScreenshot}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap btn-tactile ${themes[theme].secondary} hide-in-screenshot hover:opacity-90 active:scale-95 transition-all shadow-2xs`}
                title="生成持仓截图"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>分享截图</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
