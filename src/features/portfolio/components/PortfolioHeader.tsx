import React from 'react';
import { ChevronUp, ChevronDown, Camera } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';

interface PortfolioHeaderProps {
  theme: Theme;
  title?: string;
  showPortfolioAnalysis: boolean;
  onToggle: () => void;
  onScreenshot: () => void;
}

export function PortfolioHeader({
  theme,
  title = '投资组合分析',
  showPortfolioAnalysis,
  onToggle,
  onScreenshot,
}: PortfolioHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4 px-6">
      <div className="flex items-center gap-2">
        <h2 className={`text-2xl font-semibold leading-tight whitespace-nowrap flex-shrink-0 ${themes[theme].text}`}>{title}</h2>
        <button 
          onClick={onToggle}
          className={`${themes[theme].secondary} rounded-full p-1 no-print`}
        >
          {showPortfolioAnalysis ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </button>
      </div>

      <button
        onClick={onScreenshot}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-base whitespace-nowrap ${themes[theme].secondary} hover:opacity-80 transition-opacity no-print`}
        title="生成持仓截图"
      >
        <Camera className="w-5 h-5" />
        <span>分享截图</span>
      </button>
    </div>
  );
}
