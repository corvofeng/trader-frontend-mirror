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
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex space-x-2 min-w-max sm:min-w-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex items-center px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                activeTab === tab.id
                  ? themes[theme].primary
                  : themes[theme].secondary
              }`}
            >
              <Icon className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{tab.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}