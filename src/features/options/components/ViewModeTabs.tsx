export type OptionsViewMode = 'expiry' | 'strategy' | 'grouped';

interface ViewModeTabsProps {
  viewMode: OptionsViewMode;
  onChange: (mode: OptionsViewMode) => void;
}

export function ViewModeTabs({ viewMode, onChange }: ViewModeTabsProps) {
  return (
    <div className="flex items-center space-x-1 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
      <button
        onClick={() => onChange('expiry')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
          viewMode === 'expiry'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
        }`}
      >
        按到期日
      </button>
      <button
        onClick={() => onChange('strategy')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
          viewMode === 'strategy'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
        }`}
      >
        按策略
      </button>
      <button
        onClick={() => onChange('grouped')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
          viewMode === 'grouped'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
        }`}
      >
        按策略组合
      </button>
    </div>
  );
}
