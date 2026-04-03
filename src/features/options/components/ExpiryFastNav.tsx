import { Layers } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { CurrencyConfig } from '../../../shared/types/ui';
import type { OptionsPosition, OptionsStrategy } from '../../../lib/services/types';

interface ExpiryGroup {
  expiry: string;
  daysToExpiry: number;
  single: OptionsPosition[];
  complex: OptionsStrategy[];
}

interface Analysis {
  exercise_analysis?: {
    call_obligation_count_worst: number;
    put_obligation_count_worst: number;
  };
}

interface ExpiryFastNavProps {
  theme: Theme;
  groups: ExpiryGroup[];
  currencyConfig: CurrencyConfig;
  activeExpiry: string | null;
  expandedExpiryGroups: Record<string, boolean>;
  analysisMap?: Record<string, Analysis>;
}

export function ExpiryFastNav({
  theme,
  groups,
  currencyConfig,
  activeExpiry,
  expandedExpiryGroups,
  analysisMap = {}
}: ExpiryFastNavProps) {
  return (
    <div className={`${themes[theme].card} rounded-lg p-4 mb-6 flex flex-wrap gap-3 sticky top-16 z-40 shadow-md bg-opacity-95 backdrop-blur-sm transition-all duration-200`}>
      <div className={`text-sm font-medium ${themes[theme].text} flex items-center mr-2`}>
        <Layers className="w-4 h-4 mr-1" />
        快速导航:
      </div>
      {groups.map(group => {
        const singlePL = group.single.reduce((sum, p) => sum + p.profitLoss, 0);
        const complexPL = group.complex.reduce((sum, s) => sum + s.profitLoss, 0);
        const totalPL = singlePL + complexPL;
        const isProfitable = totalPL >= 0;
        const analysis = analysisMap[group.expiry];
        const worstCalls = analysis?.exercise_analysis?.call_obligation_count_worst ?? 0;
        const worstPuts = analysis?.exercise_analysis?.put_obligation_count_worst ?? 0;
        const hasObligations = worstCalls > 0 || worstPuts > 0;
        const totalMargin = group.single.reduce((sum, p) => sum + (p.margin || 0), 0) +
          group.complex.reduce((sum, s) => sum + s.positions.reduce((pSum, p) => pSum + (p.margin || 0), 0), 0);

        return (
          <button
            key={group.expiry}
            onClick={() => {
              const el = document.getElementById(`expiry-group-${group.expiry}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all flex items-center gap-2
              ${activeExpiry === group.expiry ? 'ring-2 ring-blue-500 shadow-sm scale-105' : ''}
              ${expandedExpiryGroups[group.expiry] 
                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300' 
                : `${themes[theme].background} ${themes[theme].border} ${themes[theme].text} opacity-75 hover:opacity-100`
              }`}
          >
            <span>{group.expiry}</span>
            <div className="flex flex-col items-end leading-tight">
              <span className={isProfitable ? 'text-green-600' : 'text-red-600'}>
                {isProfitable ? '+' : ''}{formatCurrency(Math.abs(totalPL), currencyConfig, 4)}
              </span>
              {totalMargin > 0 && (
                <span className="text-[10px] opacity-75 text-amber-600 dark:text-amber-400 font-mono">
                  保:{formatCurrency(totalMargin, currencyConfig, 0)}
                </span>
              )}
            </div>
            {hasObligations && (
              <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${theme === 'dark' ? 'bg-red-900/30 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-600'}`}>
                {worstCalls > 0 && <span>C:{worstCalls}</span>}
                {worstPuts > 0 && <span>P:{worstPuts}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
