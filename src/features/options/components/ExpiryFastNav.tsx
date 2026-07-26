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

  const months = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; label: string; firstExpiry: string }[] = [];

    groups.forEach((group) => {
      const parts = group.expiry.split('-');
      if (parts.length >= 2) {
        const yearMonth = `${parts[0]}-${parts[1]}`;
        if (!seen.has(yearMonth)) {
          seen.add(yearMonth);
          const shortYear = parts[0].slice(-2);
          const cleanMonth = parseInt(parts[1], 10);
          list.push({
            key: yearMonth,
            label: `${shortYear}年${cleanMonth}月`,
            firstExpiry: group.expiry,
          });
        }
      }
    });
    return list;
  }, [groups]);

  const activeMonthKey = useMemo(() => {
    if (!activeExpiry) return null;
    const parts = activeExpiry.split('-');
    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : null;
  }, [activeExpiry]);

  return (
    <div className={`${themes[theme].card} ${themes[theme].border} mb-5 rounded-xl border px-3 py-3 sm:mb-6 sm:px-4 sticky top-16 z-40 shadow-sm bg-opacity-95 backdrop-blur-sm transition-all duration-200`}>
      <div className="flex flex-col md:flex-row md:items-stretch gap-4">
        {/* Left main content */}
        <div className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className={`flex items-center text-sm font-semibold ${themes[theme].text}`}>
              <Layers className="w-4 h-4 mr-1.5" />
              快速导航
            </div>
            {isMobile ? (
              <button
                type="button"
                onClick={() => setIsCollapsed((prev) => !prev)}
                className={`${themes[theme].secondary} inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium`}
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
              className={`${themes[theme].background} ${themes[theme].border} w-full rounded-xl border px-3 py-2.5 text-left transition-opacity hover:opacity-100`}
            >
              <div className={`text-[11px] ${themes[theme].text} opacity-50`}>
                当前到期日
              </div>
              <div className={`mt-1 text-sm font-semibold ${themes[theme].text}`}>
                {summaryGroup.expiry}
              </div>
            </button>
          )}

          <div className={`${isMobile && isCollapsed ? 'hidden' : 'flex'} gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible`}>
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
                  className={`min-w-[132px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 sm:min-w-0
                    ${isActive
                      ? 'border-blue-400 bg-blue-50 text-blue-900 shadow-sm dark:border-blue-500/70 dark:bg-blue-900/30 dark:text-blue-100'
                      : isExpanded
                        ? 'border-blue-200 bg-blue-50/70 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                        : `${themes[theme].background} ${themes[theme].border} ${themes[theme].text} hover:opacity-100 opacity-90`
                    }`}
                  aria-pressed={isActive}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{group.expiry}</div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      group.daysToExpiry > 0
                        ? 'bg-black/5 text-current dark:bg-white/10'
                        : 'bg-red-500/10 text-red-500'
                    }`}>
                      {group.daysToExpiry > 0 ? `${group.daysToExpiry}天` : '已到期'}
                    </span>
                  </div>
                  <div className={`mt-2 text-base font-semibold leading-none ${isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {isProfitable ? '+' : '-'}{formatCurrency(Math.abs(totalPL), currencyConfig, 0)}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="opacity-55">{isActive ? '当前位置' : isExpanded ? '已展开' : '点击定位'}</span>
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

        {/* Right Section: Month TOC */}
        {!(isMobile && isCollapsed) && months.length > 0 && (
          <>
            <div className={`hidden md:block w-[1px] ${themes[theme].border} self-stretch opacity-60 my-1`} />
            <div className="flex flex-col justify-start md:pl-2 md:min-w-[100px] mt-3 md:mt-0">
              <div className={`mb-1.5 text-[10px] uppercase tracking-wider font-semibold opacity-40 ${themes[theme].text} hidden md:block`}>
                月份目录
              </div>
              <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto max-h-[140px] pr-1 pb-1 md:pb-0 scrollbar-none md:scrollbar-thin">
                {months.map((m) => {
                  const isActive = activeMonthKey === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(`expiry-group-${m.firstExpiry}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`text-left text-[11px] py-1 px-2.5 rounded-md transition-all duration-150 font-medium whitespace-nowrap shrink-0 ${
                        isActive
                          ? theme === 'dark'
                            ? 'bg-blue-500/20 text-blue-400 font-semibold'
                            : 'bg-blue-50 text-blue-600 border border-blue-100/50 font-semibold'
                          : theme === 'dark'
                            ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                            : theme === 'blue'
                              ? 'text-slate-600 hover:bg-blue-50/50 hover:text-blue-900'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
