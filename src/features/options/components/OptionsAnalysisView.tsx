import React, { useState } from 'react';
import { Theme, themes } from '../../../lib/theme';
import { OptionsPortfolioData } from '../../../lib/services/types';
import { renderMarkdown } from '../../../shared/utils/markdown';
import { ChevronDown, ChevronUp, Activity, AlertTriangle, Shield, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { OptionPayoffCalculatorChart } from './OptionPayoffCalculatorChart';

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

  const toDateTs = (value: string) => {
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
  };

  const formatExpiry = (expiry: string, fmt: string) => {
    const ts = new Date(expiry).getTime();
    if (!Number.isFinite(ts)) return expiry;
    return format(new Date(ts), fmt);
  };

  const riskReport = portfolioData.expiry_risk_report as any;
  const riskExpiriesRaw = Array.isArray(riskReport?.expiries)
    ? riskReport.expiries
    : Array.isArray(riskReport?.items)
      ? riskReport.items
      : Array.isArray(riskReport?.report?.expiries)
        ? riskReport.report.expiries
        : [];

  const liveSlices = riskExpiriesRaw
    .filter((x: any) => x && typeof x === 'object' && typeof x.expiry_date === 'string')
    .map((x: any) => x as any);

  const analysisMap = portfolioData.expiry_analysis || {};
  const expiryKeys = new Set<string>(Object.keys(analysisMap));
  for (const slice of liveSlices) {
    if (typeof slice?.expiry_date === 'string' && slice.expiry_date) expiryKeys.add(slice.expiry_date);
  }

  const sortedExpiries = Array.from(expiryKeys).sort((a, b) => toDateTs(a) - toDateTs(b));

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
       <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6 border-l-4 border-blue-500`}>
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
        const analysis = analysisMap[expiry] as any;
        const underlyingsFromAnalysis = Array.isArray(analysis?.underlyings)
          ? analysis.underlyings
          : Array.isArray(analysis?.underlying)
            ? analysis.underlying
            : [];
        const underlyings = underlyingsFromAnalysis.length > 0
          ? underlyingsFromAnalysis
          : liveSlices.filter((x: any) => x?.expiry_date === expiry);

        const isExpanded = expandedExpiries[expiry] ?? true; // Default to expanded in this view
        const phase = typeof analysis?.phase === 'string'
          ? analysis.phase
          : (typeof underlyings[0]?.phase === 'string' ? underlyings[0].phase : '');

        const riskCount = typeof analysis?.risk_positions_count === 'number'
          ? analysis.risk_positions_count
          : underlyings.reduce((sum: number, item: any) => sum + (typeof item?.risk_positions_count === 'number' ? item.risk_positions_count : 0), 0);
        const safeCount = typeof analysis?.safe_positions_count === 'number'
          ? analysis.safe_positions_count
          : underlyings.reduce((sum: number, item: any) => sum + (typeof item?.safe_positions_count === 'number' ? item.safe_positions_count : 0), 0);
        const strategyCount = typeof analysis?.strategies_count === 'number'
          ? analysis.strategies_count
          : underlyings.reduce((sum: number, item: any) => sum + (typeof item?.strategies_count === 'number' ? item.strategies_count : 0), 0);

        return (
          <div key={expiry} className={`${themes[theme].card} rounded-lg shadow-sm border ${themes[theme].border} overflow-hidden`}>
            <div 
              className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b ${themes[theme].border}`}
              onClick={() => toggleExpiry(expiry)}
            >
              <div className="flex items-center gap-4">
                <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg border ${themes[theme].border} ${themes[theme].background}`}>
                   <span className="text-xs opacity-60 uppercase">{formatExpiry(expiry, 'MMM')}</span>
                   <span className="text-lg font-bold">{formatExpiry(expiry, 'dd')}</span>
                </div>
                
                <div>
                   <div className="flex items-center gap-3 mb-1">
                      <h3 className={`text-lg font-bold ${themes[theme].text}`}>
                        {formatExpiry(expiry, 'yyyy-MM-dd')} 到期
                      </h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${getPhaseColor(phase)}`}>
                        {getPhaseLabel(phase)}
                      </span>
                   </div>
                   <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm opacity-70">
                      <div className="flex items-center gap-1">
                         <AlertTriangle className="w-3 h-3 text-red-500" />
                         <span>风险: {riskCount}</span>
                      </div>
                      <div className="flex items-center gap-1">
                         <Shield className="w-3 h-3 text-green-500" />
                         <span>安全: {safeCount}</span>
                      </div>
                      <div className="flex items-center gap-1">
                         <TrendingUp className="w-3 h-3 text-blue-500" />
                         <span>策略: {strategyCount}</span>
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
              <div className="p-3 sm:p-6 bg-white dark:bg-gray-900/20">
                 {typeof analysis?.report === 'string' && analysis.report.trim() ? (
                   <>
                     <div className="hidden sm:block mb-6">
                       <div className="prose prose-sm max-w-none overflow-x-auto prose-table:w-max prose-table:max-w-none prose-th:whitespace-nowrap prose-td:whitespace-nowrap">
                         <div dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis.report, theme) }} />
                       </div>
                     </div>
                     <details className={`sm:hidden mb-5 rounded-lg border ${themes[theme].border} bg-white dark:bg-gray-900/20`}>
                       <summary className={`cursor-pointer select-none px-3 py-2 text-sm font-semibold ${themes[theme].text}`}>
                         查看到期日摘要
                       </summary>
                       <div className="px-3 pb-3">
                         <div className="prose prose-sm max-w-none overflow-x-auto prose-table:w-max prose-table:max-w-none prose-th:whitespace-nowrap prose-td:whitespace-nowrap">
                           <div dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis.report, theme) }} />
                         </div>
                       </div>
                     </details>
                   </>
                 ) : null}

                 {Array.isArray(underlyings) && underlyings.length > 0 ? (
                   <div className="space-y-4">
                     {underlyings.map((item: any, index: number) => {
                       const code = typeof item?.underlying_code === 'string' ? item.underlying_code : '';
                       const name = typeof item?.underlying_name === 'string' ? item.underlying_name : '';
                       const title = [code, name].filter(Boolean).join(' ');
                       const itemPhase = typeof item?.phase === 'string' ? item.phase : '';
                       const key = `${expiry}:${code || 'underlying'}:${index}`;
                       return (
                         <div key={key} className={`border rounded-lg ${themes[theme].border} bg-white p-3 dark:bg-gray-900/20 sm:p-4`}>
                           <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                             <div className={`font-semibold ${themes[theme].text}`}>{title || '标的组合'}</div>
                             {itemPhase ? (
                               <div className={`w-fit text-xs px-2 py-1 rounded ${themes[theme].secondary}`}>
                                 {itemPhase}
                               </div>
                             ) : null}
                           </div>

                           <div className={`text-xs ${themes[theme].text} opacity-70 mb-3 flex flex-wrap gap-x-3 gap-y-1`}>
                             {typeof item?.days_to_expiry === 'number' ? <span>剩余天数: {item.days_to_expiry}</span> : null}
                             {typeof item?.risk_positions_count === 'number' ? <span>风险: {item.risk_positions_count}</span> : null}
                             {typeof item?.safe_positions_count === 'number' ? <span>安全: {item.safe_positions_count}</span> : null}
                             {typeof item?.strategies_count === 'number' ? <span>策略: {item.strategies_count}</span> : null}
                           </div>

                          <div className="hidden sm:block mb-4">
                             <OptionPayoffCalculatorChart theme={theme} payload={item} />
                           </div>

                          <details className={`sm:hidden mb-4 rounded-lg border ${themes[theme].border} bg-white dark:bg-gray-900/10`}>
                            <summary className={`cursor-pointer select-none px-3 py-2 text-sm font-semibold ${themes[theme].text}`}>
                              查看 PnL 曲面
                            </summary>
                            <div className="px-2 pb-2">
                              <OptionPayoffCalculatorChart theme={theme} payload={item} />
                            </div>
                          </details>

                           {typeof item?.report === 'string' && item.report.trim() ? (
                            <>
                              <div className="hidden sm:block">
                                <div className="prose prose-sm max-w-none overflow-x-auto prose-table:w-max prose-table:max-w-none prose-th:whitespace-nowrap prose-td:whitespace-nowrap">
                                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(item.report, theme) }} />
                                </div>
                              </div>
                              <details className={`sm:hidden rounded-lg border ${themes[theme].border} bg-white dark:bg-gray-900/10`}>
                                <summary className={`cursor-pointer select-none px-3 py-2 text-sm font-semibold ${themes[theme].text}`}>
                                  查看分析内容
                                </summary>
                                <div className="px-3 pb-3">
                                  <div className="prose prose-sm max-w-none overflow-x-auto prose-table:w-max prose-table:max-w-none prose-th:whitespace-nowrap prose-td:whitespace-nowrap">
                                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(item.report, theme) }} />
                                  </div>
                                </div>
                              </details>
                            </>
                           ) : (
                             <div className={`text-sm ${themes[theme].text} opacity-70`}>暂无分析内容</div>
                           )}
                         </div>
                       );
                     })}
                   </div>
                 ) : (
                   <div className={`text-sm ${themes[theme].text} opacity-70`}>暂无到期风险切片数据</div>
                 )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
