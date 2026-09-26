import React from 'react';
import { themes, Theme } from '../../../lib/theme';

interface Tab {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  theme: Theme;
  onTabChange: (tab: string) => void;
}

export function TabNavigation({ tabs, activeTab, theme, onTabChange }: TabNavigationProps) {
  return (
    <div className="w-full max-w-full overflow-x-auto py-1 custom-scrollbar">
      <div className="flex space-x-1.5 sm:space-x-2 min-w-max px-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium btn-tactile whitespace-nowrap select-none transition-all ${
                isActive
                  ? `${themes[theme].primary} shadow-sm font-semibold`
                  : `${themes[theme].secondary} opacity-80 hover:opacity-100`
              }`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className={isActive ? 'inline' : 'hidden sm:inline'}>{tab.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}