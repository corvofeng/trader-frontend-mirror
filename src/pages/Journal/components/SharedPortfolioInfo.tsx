import React from 'react';
import { Briefcase } from 'lucide-react';
import { themes, Theme } from '../../../lib/theme';

interface SharedPortfolioInfoProps {
  portfolioUuid: string | null;
  activeTab: string;
  theme: Theme;
}

export function SharedPortfolioInfo({ portfolioUuid, activeTab, theme }: SharedPortfolioInfoProps) {
  if (!portfolioUuid || activeTab !== 'portfolio') return null;

  return (
    <div className={`${themes[theme].card} rounded-lg p-4 mb-6 border-l-4 border-blue-500`}>
      <div className="flex items-center space-x-2">
        <Briefcase className="w-5 h-5 text-blue-500" />
        <span className={`text-sm font-medium ${themes[theme].text}`}>
          Viewing shared portfolio: {portfolioUuid}
        </span>
      </div>
    </div>
  );
}