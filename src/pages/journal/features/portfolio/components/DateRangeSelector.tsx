import React from 'react';
import { Filter } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';

interface DateRangeSelectorProps {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  onQuickRangeSelect: (days: number) => void;
  onToggleVisibility: () => void;
  theme: Theme;
}

export function DateRangeSelector({
  dateRange,
  onDateRangeChange,
  onQuickRangeSelect,
  onToggleVisibility,
  theme
}: DateRangeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="flex gap-2">
        <button
          onClick={() => onQuickRangeSelect(30)}
          className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
        >
          1M
        </button>
        <button
          onClick={() => onQuickRangeSelect(90)}
          className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
        >
          3M
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
      <button
        onClick={onToggleVisibility}
        className={`p-2 rounded-md ${themes[theme].secondary}`}
      >
        <Filter className="w-4 h-4" />
      </button>
    </div>
  );
}