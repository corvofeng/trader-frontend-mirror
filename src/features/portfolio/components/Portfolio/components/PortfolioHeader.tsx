import React from 'react';
import { subDays } from 'date-fns';
import { Theme, themes } from '../../../../../lib/theme';

interface PortfolioHeaderProps {
  theme: Theme;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  isSharedView: boolean;
  portfolioUuid: string | null;
}

export function PortfolioHeader({ 
  theme, 
  dateRange, 
  onDateRangeChange, 
  isSharedView, 
  portfolioUuid 
}: PortfolioHeaderProps) {
  const setQuickDateRange = (days: number) => {
    if (isSharedView && !portfolioUuid) return; // Disable date range changes in shared view without UUID
    
    const endDate = new Date();
    const startDate = subDays(endDate, days);
    onDateRangeChange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
  };

  return (
    <div className="p-6 border-b border-gray-200">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <h2 className={`text-xl font-bold ${themes[theme].text}`}>
          Portfolio Overview
        </h2>
        {(!isSharedView || portfolioUuid) && (
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setQuickDateRange(7)}
                className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
              >
                1W
              </button>
              <button
                onClick={() => setQuickDateRange(30)}
                className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
              >
                1M
              </button>
              <button
                onClick={() => setQuickDateRange(90)}
                className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
              >
                3M
              </button>
              <button
                onClick={() => setQuickDateRange(180)}
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
    </div>
  );
}