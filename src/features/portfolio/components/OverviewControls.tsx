import React from 'react';
import { Theme, themes } from '../../../lib/theme';
import { AccountSelector } from '../../../shared/components';

interface OverviewControlsProps {
  theme: Theme;
  userId?: string;
  selectedAccountId?: string | null;
  onAccountChange?: (accountId: string) => void;
  dateRange: { startDate: string; endDate: string };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  isSharedView?: boolean;
  portfolioUuid?: string | null;
  onQuickSelect: (days: number) => void;
}

export function OverviewControls({
  theme,
  userId,
  selectedAccountId,
  onAccountChange,
  dateRange,
  onDateRangeChange,
  isSharedView,
  portfolioUuid,
  onQuickSelect,
}: OverviewControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
      <div className="flex items-center gap-4">
        <h2 className={`text-xl font-bold ${themes[theme].text}`}>Portfolio Overview</h2>
        {userId && onAccountChange && (
          <AccountSelector
            userId={userId}
            theme={theme}
            selectedAccountId={selectedAccountId || null}
            onAccountChange={onAccountChange}
          />
        )}
      </div>

      {(!isSharedView || portfolioUuid) && (
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <button
              onClick={() => onQuickSelect(7)}
              className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
            >
              1W
            </button>
            <button
              onClick={() => onQuickSelect(30)}
              className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
            >
              1M
            </button>
            <button
              onClick={() => onQuickSelect(90)}
              className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
            >
              3M
            </button>
            <button
              onClick={() => onQuickSelect(180)}
              className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
            >
              6M
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
              className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
            />
            <span className={`text-sm ${themes[theme].text}`}>to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
              className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}