import React from 'react';
import { TrendingUp } from 'lucide-react';
import { AnimatedChart } from './AnimatedChart';
import { InternalLink } from '../../../shared/components';
import { Theme, themes } from '../../../lib/theme';

interface MarketOverviewProps {
  theme: Theme;
}

export function MarketOverview({ theme }: MarketOverviewProps) {
  const isDark = theme === 'dark';

  return (
    <div className={`mb-16 ${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-2xl p-6 shadow-xl border ${
      isDark ? 'border-gray-700' : 'border-gray-200'
    }`}>
      <div className="mb-4 flex justify-between items-center">
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Market Overview
        </h2>
        <InternalLink
          to="/journal"
          className={`text-blue-500 hover:text-blue-600 flex items-center gap-2 transition-colors`}
          title="Access your complete trading dashboard"
        >
          <span>Open Trading View</span>
          <TrendingUp className="w-5 h-5" />
        </InternalLink>
      </div>
      <AnimatedChart theme={theme} />
    </div>
  );
}