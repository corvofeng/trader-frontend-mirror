import React from 'react';
import { Briefcase, BarChart2, TrendingUp, History, Settings } from 'lucide-react';
import { type Theme, themes } from '../../../lib/theme';

export type TerminalTab = 'portfolio' | 'options' | 'trade' | 'history' | 'settings';

interface M3BottomNavProps {
  activeTab: TerminalTab;
  onTabChange: (tab: TerminalTab) => void;
  theme: Theme;
  badges?: Partial<Record<TerminalTab, number | string>>;
}

interface NavItem {
  id: TerminalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'portfolio', label: '资产', icon: Briefcase },
  { id: 'options', label: '期权', icon: BarChart2 },
  { id: 'trade', label: '交易', icon: TrendingUp },
  { id: 'history', label: '记录', icon: History },
  { id: 'settings', label: '设置', icon: Settings },
];

export const M3BottomNav: React.FC<M3BottomNavProps> = ({
  activeTab,
  onTabChange,
  theme,
  badges = {},
}) => {
  return (
    <nav
      aria-label="终端底部导航"
      className={`md:hidden fixed bottom-0 left-0 right-0 z-50 ${themes[theme].card} backdrop-blur-xl border-t ${themes[theme].border} transition-colors duration-200 safe-bottom`}
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const badge = badges[item.id];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className="group relative flex flex-1 flex-col items-center justify-center py-1 select-none active:scale-95 transition-all duration-150 focus:outline-none"
            >
              {/* M3 Active Indicator (Pill) */}
              <div
                className={`relative flex items-center justify-center w-14 h-8 rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600/15 dark:bg-blue-500/25 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 dark:text-zinc-400 group-hover:text-slate-800 dark:group-hover:text-zinc-200 group-hover:bg-slate-100/60 dark:group-hover:bg-zinc-900/60'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110 stroke-[2.3]' : 'stroke-[1.8]'}`} />
                
                {/* Badge if present */}
                {badge && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-xs">
                    {badge}
                  </span>
                )}
              </div>

              {/* M3 Label */}
              <span
                className={`text-[11px] font-medium tracking-tight mt-0.5 transition-colors duration-200 ${
                  isActive
                    ? 'font-bold text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-zinc-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
