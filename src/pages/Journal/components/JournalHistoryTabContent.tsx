import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { History as HistoryIcon, Calendar } from 'lucide-react';
import { themes, type Theme } from '../../../lib/theme';
import { HistoryTradesChart } from '../../../features/trading/components/HistoryTradesChart';
import { DailyTradeHistory } from '../../../features/trading/components/DailyTradeHistory';

interface JournalHistoryTabContentProps {
  theme: Theme;
  selectedAccountId: string | null;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  selectedStockCode?: string;
}

export function JournalHistoryTabContent({
  theme,
  selectedAccountId,
  dateRange,
  onDateRangeChange,
  selectedStockCode,
}: JournalHistoryTabContentProps) {
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const handleRangePreset = (days: number) => {
    onDateRangeChange({
      startDate: format(subDays(new Date(), days), 'yyyy-MM-dd'),
      endDate: todayStr,
    });
  };

  const isPresetActive = (days: number) => {
    const targetStart = format(subDays(new Date(), days), 'yyyy-MM-dd');
    return dateRange.startDate === targetStart && dateRange.endDate === todayStr;
  };

  if (!selectedAccountId) {
    return (
      <div className={`${themes[theme].card} rounded-xl border ${themes[theme].border} card-subtle-ring p-8 text-center`}>
        <HistoryIcon className="w-12 h-12 mx-auto mb-3 opacity-40 text-blue-500" />
        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>请选择账户</h3>
        <p className={`text-sm ${themes[theme].text} opacity-70 mt-1`}>
          请在上方账户选择器中选择一个交易账户以查看其历史交易记录。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Selector Toolbar */}
      <div className={`${themes[theme].card} rounded-xl border ${themes[theme].border} card-subtle-ring p-4 sm:p-5 transition-colors duration-150`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>
              交易历史记录
            </h3>
            <p className={`text-xs ${themes[theme].text} opacity-60 mt-0.5`}>
              账户: <span className="font-mono font-medium">{selectedAccountId}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-medium ${themes[theme].text} opacity-75 mr-1`}>快捷范围:</span>
            {[
              { label: '7天', days: 7 },
              { label: '30天', days: 30 },
              { label: '90天', days: 90 },
              { label: '半年', days: 180 },
            ].map(({ label, days }) => (
              <button
                key={days}
                type="button"
                onClick={() => handleRangePreset(days)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md btn-tactile ${
                  isPresetActive(days)
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : `${themes[theme].secondary} opacity-80 hover:opacity-100`
                }`}
              >
                {label}
              </button>
            ))}

            <div className="flex items-center gap-1.5 ml-1">
              <Calendar className="w-3.5 h-3.5 opacity-50" />
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => {
                  if (e.target.value) {
                    onDateRangeChange({ ...dateRange, startDate: e.target.value });
                  }
                }}
                className={`text-xs px-2 py-1 rounded-md border ${themes[theme].border} bg-transparent ${themes[theme].text} focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-[border-color,box-shadow] duration-150`}
              />
              <span className={`text-xs ${themes[theme].text} opacity-50`}>至</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => {
                  if (e.target.value) {
                    onDateRangeChange({ ...dateRange, endDate: e.target.value });
                  }
                }}
                className={`text-xs px-2 py-1 rounded-md border ${themes[theme].border} bg-transparent ${themes[theme].text} focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-[border-color,box-shadow] duration-150`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <HistoryTradesChart
        theme={theme}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        selectedAccountId={selectedAccountId}
      />

      {/* Daily Breakdown */}
      <DailyTradeHistory
        theme={theme}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        selectedAccountId={selectedAccountId}
        selectedStockCode={selectedStockCode}
      />
    </div>
  );
}
