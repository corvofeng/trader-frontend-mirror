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
    <div className="w-full max-w-full overflow-x-auto py-1">
      <div className="flex space-x-2 min-w-max">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium btn-tactile whitespace-nowrap select-none ${
                activeTab === tab.id
                  ? `${themes[theme].primary} shadow-sm font-semibold`
                  : `${themes[theme].secondary} opacity-85 hover:opacity-100`
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{tab.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}