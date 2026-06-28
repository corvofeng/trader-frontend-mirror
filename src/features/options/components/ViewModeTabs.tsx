export type OptionsViewMode = 'expiry' | 'strategy' | 'grouped';

interface ViewModeTabsProps {
  viewMode: OptionsViewMode;
  onChange: (mode: OptionsViewMode) => void;
}

export function ViewModeTabs({ viewMode, onChange }: ViewModeTabsProps) {
  const tabItems: Array<{ id: OptionsViewMode; label: string; hint: string }> = [
    { id: 'expiry', label: '按到期日', hint: '看每个到期月' },
    { id: 'strategy', label: '按策略', hint: '看策略拆分' },
    { id: 'grouped', label: '按策略组合', hint: '看组合汇总' },
  ];

  return (
    <div className="mb-5 sm:mb-6">
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-gray-200 bg-gray-50/90 p-1.5 shadow-sm dark:border-gray-700 dark:bg-gray-800/80">
        {tabItems.map((tab) => {
          const isActive = viewMode === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`rounded-xl px-2 py-2.5 text-center transition-all sm:px-4 sm:py-3 ${
                isActive
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-blue-100 dark:bg-gray-900 dark:text-blue-300 dark:ring-blue-500/30'
                  : 'text-gray-500 hover:bg-white/80 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/70 dark:hover:text-gray-200'
              }`}
            >
              <div className="text-xs font-semibold leading-tight sm:text-sm">{tab.label}</div>
              <div className={`mt-1 text-[10px] leading-tight sm:text-xs ${isActive ? 'opacity-80' : 'opacity-60'}`}>
                {tab.hint}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
