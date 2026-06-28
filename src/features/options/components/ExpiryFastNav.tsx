import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
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

interface ExpiryFastNavProps {
  theme: Theme;
  groups: ExpiryGroup[];
  currencyConfig: CurrencyConfig;
  activeExpiry: string | null;
  expandedExpiryGroups: Record<string, boolean>;
}

export function ExpiryFastNav({
  theme,
  groups,
  currencyConfig,
  activeExpiry,
  expandedExpiryGroups
}: ExpiryFastNavProps) {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  ));
  const [isCollapsed, setIsCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncViewport = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      if (!mobile) {
        setIsCollapsed(false);
      }
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const summaryGroup = useMemo(() => {
    return groups.find((group) => group.expiry === activeExpiry) ?? groups[0] ?? null;
  }, [activeExpiry, groups]);

  return (
    <div className={`${themes[theme].card} ${themes[theme].border} rounded-2xl border p-3 sm:p-4 mb-5 sm:mb-6 sticky top-16 z-40 shadow-md bg-opacity-95 backdrop-blur-sm transition-all duration-200`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={`text-sm font-semibold ${themes[theme].text} flex items-center`}>
          <Layers className="w-4 h-4 mr-1.5" />
          快速导航
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className={`${themes[theme].secondary} inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium`}
            aria-label={isCollapsed ? '展开快速导航' : '收起快速导航'}
          >
            {isCollapsed ? '展开' : '收起'}
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <div className={`text-[11px] sm:text-xs ${themes[theme].text} opacity-55`}>
            {groups.length} 个到期日
          </div>
        )}
      </div>

      {isMobile && isCollapsed && summaryGroup && (
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className={`${themes[theme].background} ${themes[theme].border} w-full rounded-2xl border px-3 py-3 text-left transition-opacity hover:opacity-100`}
        >
          <div className={`text-[11px] ${themes[theme].text} opacity-50`}>
            当前到期日
          </div>
          <div className={`mt-1 text-sm font-semibold ${themes[theme].text}`}>
            {summaryGroup.expiry}
          </div>
        </button>
      )}

      <div className={`${isMobile && isCollapsed ? 'hidden' : 'flex'} gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible`}>
        {groups.map(group => {
        const singlePL = group.single.reduce((sum, p) => sum + p.profitLoss, 0);
        const complexPL = group.complex.reduce((sum, s) => sum + s.profitLoss, 0);
        const totalPL = singlePL + complexPL;
        const isProfitable = totalPL >= 0;
        const totalMargin = group.single.reduce((sum, p) => sum + (p.margin || 0), 0) +
          group.complex.reduce((sum, s) => sum + s.positions.reduce((pSum, p) => pSum + (p.margin || 0), 0), 0);
        const isExpanded = !!expandedExpiryGroups[group.expiry];
        const isActive = activeExpiry === group.expiry;

        return (
          <button
            key={group.expiry}
            onClick={() => {
              const el = document.getElementById(`expiry-group-${group.expiry}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              if (isMobile) setIsCollapsed(true);
            }}
            className={`min-w-[148px] shrink-0 rounded-2xl border p-3 text-left transition-all duration-200 sm:min-w-0
              ${isActive ? 'ring-2 ring-blue-500/70 shadow-md -translate-y-0.5' : 'shadow-sm'}
              ${isExpanded
                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
                : `${themes[theme].background} ${themes[theme].border} ${themes[theme].text} opacity-80 hover:opacity-100`
              }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] opacity-55">到期日</div>
                <div className="mt-1 text-sm font-semibold">{group.expiry}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                group.daysToExpiry > 0
                  ? 'bg-black/5 text-current dark:bg-white/10'
                  : 'bg-red-500/10 text-red-500'
              }`}>
                {group.daysToExpiry > 0 ? `${group.daysToExpiry}天` : '已到期'}
              </span>
            </div>
            <div className={`mt-3 text-lg font-semibold leading-none ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
              {isProfitable ? '+' : ''}{formatCurrency(Math.abs(totalPL), currencyConfig, 4)}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="opacity-60">{isExpanded ? '详情已展开' : '点击查看'}</span>
              {totalMargin > 0 ? (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-amber-600 dark:text-amber-300">
                  保 {formatCurrency(totalMargin, currencyConfig, 0)}
                </span>
              ) : (
                <span className="opacity-45">无保证金</span>
              )}
            </div>
          </button>
        );
        })}
      </div>
    </div>
  );
}
