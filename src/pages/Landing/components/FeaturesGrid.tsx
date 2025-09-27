import React from 'react';
import { CandlestickChart as ChartCandle, BarChart2, TrendingUp } from 'lucide-react';
import { InternalLink } from '../../../shared/components';
import { Theme } from '../../../lib/theme';

interface FeaturesGridProps {
  theme: Theme;
}

export function FeaturesGrid({ theme }: FeaturesGridProps) {
  const isDark = theme === 'dark';

  return (
    <div className="grid md:grid-cols-3 gap-8 mb-16">
      <div className={`${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-xl p-8 shadow-lg border ${
        isDark ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="text-blue-500 mb-4">
          <ChartCandle className="w-8 h-8" />
        </div>
        <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Real-time Tracking
        </h3>
        <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
          Monitor your trades in real-time with advanced charting and analytics
        </p>
      </div>
      <div className={`${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-xl p-8 shadow-lg border ${
        isDark ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="text-blue-500 mb-4">
          <BarChart2 className="w-8 h-8" />
        </div>
        <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Performance Analytics
        </h3>
        <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
          Gain insights into your trading patterns and improve your strategy
        </p>
      </div>
      <div className={`${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-xl p-8 shadow-lg border ${
        isDark ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <div className="text-blue-500 mb-4">
          <TrendingUp className="w-8 h-8" />
        </div>
        <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Trade Journal
        </h3>
        <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
          Keep detailed records of your trades with notes and analysis
        </p>
        <div className="mt-4">
          <InternalLink
            to="/journal?tab=trades"
            className="text-blue-500 hover:text-blue-600 text-sm font-medium"
            title="Create and manage your trading plans"
          >
            Create Trade Plans →
          </InternalLink>
        </div>
      </div>
    </div>
  );
}