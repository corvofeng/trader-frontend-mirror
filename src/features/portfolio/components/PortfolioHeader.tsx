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
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-2">
        <h2 className={`text-xl font-semibold leading-tight whitespace-nowrap flex-shrink-0 ${themes[theme].text}`}>{title}</h2>
        <button 
          onClick={onToggle}
          className={`${themes[theme].secondary} rounded-full p-1`}
        >
          {showPortfolioAnalysis ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      <button
        onClick={onScreenshot}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md whitespace-nowrap ${themes[theme].secondary} hover:opacity-80 transition-opacity`}
        title="生成持仓截图"
      >
        <Camera className="w-4 h-4" />
        <span>分享截图</span>
      </button>
    </div>
  );
}