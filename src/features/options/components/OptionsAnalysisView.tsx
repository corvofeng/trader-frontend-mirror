import React, { useState } from 'react';
import { Theme, themes } from '../../../lib/theme';
import { OptionsPortfolioData } from '../../../lib/services/types';
import { renderMarkdown } from '../../../shared/utils/markdown';
import { ChevronDown, ChevronUp, Activity, AlertTriangle, Shield, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface OptionsAnalysisViewProps {
  portfolioData: OptionsPortfolioData;
  theme: Theme;
}

export function OptionsAnalysisView({ portfolioData, theme }: OptionsAnalysisViewProps) {
  const [expandedExpiries, setExpandedExpiries] = useState<Record<string, boolean>>({});

  const toggleExpiry = (expiry: string) => {
    setExpandedExpiries(prev => ({
      ...prev,
      [expiry]: !prev[expiry]
    }));
  };

  const getPhaseLabel = (phase: string) => {
    return (phase || 'UNKNOWN').toUpperCase();
  };

  const getPhaseColor = (phase: string) => {
    const normalizedPhase = (phase || '').toLowerCase();
    switch (normalizedPhase) {
      case 'danger':
      case 'critical':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30 border-red-200 dark:border-red-800';
      case 'urgent':
        return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800';
      case 'warning':
        return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
      case 'safe':
      case 'normal':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30 border-green-200 dark:border-green-800';
      case 'recovery':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
      default:
        return `text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800 border-gray-200 dark:border-gray-700`;
    }
  };

  const sortedExpiries = Object.keys(portfolioData.expiry_analysis || {}).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  if (sortedExpiries.length === 0) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-12 text-center`}>
        <Activity className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-30`} />
        <h3 className={`text-lg font-medium ${themes[theme].text} mb-2`}>暂无分析数据</h3>
        <p className={`${themes[theme].text} opacity-70`}>当前没有可用的到期日分析报告。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <div className={`${themes[theme].card} rounded-lg p-6 border-l-4 border-blue-500`}>
          <div className="flex items-start gap-4">
             <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
             </div>
             <div>
                <h2 className={`text-lg font-bold ${themes[theme].text} mb-1`}>期权组合智能分析</h2>
                <p className={`${themes[theme].text} opacity-75 text-sm`}>
                   基于当前持仓风险度、希腊字母敞口及到期日损益模拟生成的智能分析报告。
                </p>
             </div>
          </div>
       </div>

      {sortedExpiries.map(expiry => {
        const analysis = portfolioData.expiry_analysis![expiry];
        const isExpanded = expandedExpiries[expiry] ?? true; // Default to expanded in this view

        return (
          <div key={expiry} className={`${themes[theme].card} rounded-lg shadow-sm border ${themes[theme].border} overflow-hidden`}>
            <div 
              className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b ${themes[theme].border}`}
              onClick={() => toggleExpiry(expiry)}
            >
              <div className="flex items-center gap-4">
                <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg border ${themes[theme].border} ${themes[theme].background}`}>
                   <span className="text-xs opacity-60 uppercase">{format(new Date(expiry), 'MMM')}</span>
                   <span className="text-lg font-bold">{format(new Date(expiry), 'dd')}</span>
                </div>
                
                <div>
                   <div className="flex items-center gap-3 mb-1">
                      <h3 className={`text-lg font-bold ${themes[theme].text}`}>
                        {format(new Date(expiry), 'yyyy-MM-dd')} 到期
                      </h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${getPhaseColor(analysis.phase)}`}>
                        {getPhaseLabel(analysis.phase)}
                      </span>
                   </div>
                   <div className="flex items-center gap-4 text-sm opacity-70">
                      <div className="flex items-center gap-1">
                         <AlertTriangle className="w-3 h-3 text-red-500" />
                         <span>风险: {analysis.risk_positions_count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                         <Shield className="w-3 h-3 text-green-500" />
                         <span>安全: {analysis.safe_positions_count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                         <TrendingUp className="w-3 h-3 text-blue-500" />
                         <span>策略: {analysis.strategies_count}</span>
                      </div>
                   </div>
                </div>
              </div>

              {isExpanded ? (
                <ChevronUp className={`w-5 h-5 ${themes[theme].text} opacity-50`} />
              ) : (
                <ChevronDown className={`w-5 h-5 ${themes[theme].text} opacity-50`} />
              )}
            </div>

            {isExpanded && (
              <div className="p-6 bg-white dark:bg-gray-900/20">
                 <div className="prose prose-sm max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis.report, theme) }} />
                 </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
