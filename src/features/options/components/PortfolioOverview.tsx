import { useMemo, useState, useEffect, useRef } from 'react';
import { Activity, ChevronDown, ChevronUp, Dot } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPortfolioData } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types/ui';

interface PortfolioOverviewProps {
  theme: Theme;
  portfolioData: OptionsPortfolioData;
  currencyConfig: CurrencyConfig;
  activityLogsCount: number;
  onOpenLog: () => void;
  currentUnderlyingPrice?: number | null;
}

export function PortfolioOverview({
  theme,
  portfolioData,
  currencyConfig,
  activityLogsCount,
  onOpenLog,
  currentUnderlyingPrice
}: PortfolioOverviewProps) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [pricePulse, setPricePulse] = useState(false);
  const prevPriceRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (currentUnderlyingPrice != null && currentUnderlyingPrice !== prevPriceRef.current) {
      setPricePulse(true);
      const t = setTimeout(() => setPricePulse(false), 1200);
      prevPriceRef.current = currentUnderlyingPrice;
      return () => clearTimeout(t);
    }
  }, [currentUnderlyingPrice]);

  const cardShadow = useMemo(() => {
    if (theme === 'dark') return 'shadow-[0_1px_2px_rgba(0,0,0,0.25),0_12px_28px_-16px_rgba(0,0,0,0.45)]';
    if (theme === 'blue') return 'shadow-[0_1px_2px_rgba(30,64,175,0.04),0_10px_28px_-16px_rgba(37,99,235,0.10)]';
    return 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.08)]';
  }, [theme]);

  const tileDivider = useMemo(() => {
    if (theme === 'dark') return 'border-zinc-800/80';
    if (theme === 'blue') return 'border-blue-100/80';
    return 'border-slate-200/70';
  }, [theme]);

  const bgHighlight = useMemo(() => {
    if (theme === 'dark') return 'from-zinc-800/60 via-zinc-900/20 to-transparent';
    if (theme === 'blue') return 'from-blue-50/90 via-blue-50/40 to-transparent';
    return 'from-slate-50/90 via-slate-50/40 to-transparent';
  }, [theme]);

  const stats = useMemo(() => {
    const positionProfit = portfolioData.position_profit ?? 0;

    return [
      {
        label: '总金额 balance',
        value: formatCurrency(portfolioData.balance ?? 0, currencyConfig, 4),
        valueClassName: themes[theme].text,
        mono: true,
      },
      {
        label: '可用金额 available',
        value: formatCurrency(portfolioData.available ?? 0, currencyConfig, 4),
        valueClassName: themes[theme].text,
        mono: true,
      },
      {
        label: '当前仓位盈亏 position_profit',
        value: `${positionProfit >= 0 ? '+' : ''}${formatCurrency(Math.abs(positionProfit), currencyConfig, 4)}`,
        valueClassName: positionProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        mono: true,
      },
      {
        label: '当前使用保证金 real_used_margin',
        value: formatCurrency(portfolioData.real_used_margin ?? 0, currencyConfig, 4),
        valueClassName: themes[theme].text,
        mono: true,
      },
    ];
  }, [currencyConfig, portfolioData.available, portfolioData.balance, portfolioData.position_profit, portfolioData.real_used_margin, theme]);

  return (
    <div className={`${themes[theme].card} rounded-xl ${cardShadow} overflow-hidden relative isolate border ${themes[theme].border}`}>
      <div className={`absolute inset-x-0 top-0 h-px z-10 bg-gradient-to-r ${bgHighlight}`} aria-hidden="true" />
      <div className="px-3 py-3 sm:px-5 sm:py-4 border-b ${tileDivider}">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className={`text-[15px] sm:text-[17px] font-semibold tracking-tight ${themes[theme].text}`}>期权投资组合概览</h2>
            <button
              onClick={onOpenLog}
              className={`p-1.5 rounded-lg transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-zinc-800/80 text-zinc-300'
                  : theme === 'blue'
                    ? 'hover:bg-blue-50 text-slate-700'
                    : 'hover:bg-slate-100 text-slate-700'
              } relative shrink-0`}
              title="查看持仓变动日志"
            >
              <Activity className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={1.75} />
              {activityLogsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400/80 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 ring-1 ring-white/40 dark:ring-zinc-900/40"></span>
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            {currentUnderlyingPrice != null && (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                    theme === 'dark'
                      ? 'bg-zinc-800/60 text-zinc-200'
                      : theme === 'blue'
                        ? 'bg-blue-50/90 text-blue-900'
                        : 'bg-slate-50 text-slate-800'
                  } ${pricePulse ? 'ring-1 ring-blue-400/40 scale-[1.02]' : ''}`}
                >
                  <Dot
                    className={`w-3 h-3 -ml-0.5 ${
                      theme === 'dark' ? 'text-emerald-400' : 'text-emerald-500'
                    } ${pricePulse ? 'animate-pulse' : ''}`}
                    fill="currentColor"
                    strokeWidth={0}
                  />
                  <span className="font-mono tabular-nums">
                    现价 {currentUnderlyingPrice.toFixed(4)}
                  </span>
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsMobileExpanded((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium sm:hidden ${themes[theme].secondary}`}
              aria-expanded={isMobileExpanded}
              aria-label={isMobileExpanded ? '收起概览' : '展开概览'}
            >
              {isMobileExpanded ? '收起' : '展开'}
              {isMobileExpanded ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={2} /> : <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />}
            </button>
          </div>
        </div>
        <div className={`mt-2.5 grid grid-cols-2 gap-2 sm:hidden ${tileDivider}`}>
          <div className={`rounded-lg px-2.5 py-2 ${
            theme === 'dark'
              ? 'bg-zinc-800/40'
              : theme === 'blue'
                ? 'bg-blue-50/70'
                : 'bg-slate-50'
          }`}>
            <p className={`text-[10.5px] font-medium ${themes[theme].text} opacity-65`}>总金额</p>
            <p className={`text-sm font-semibold font-mono tabular-nums ${themes[theme].text} truncate`}>{stats[0].value}</p>
          </div>
          <div className={`rounded-lg px-2.5 py-2 ${
            theme === 'dark'
              ? 'bg-zinc-800/40'
              : theme === 'blue'
                ? 'bg-blue-50/70'
                : 'bg-slate-50'
          }`}>
            <p className={`text-[10.5px] font-medium ${themes[theme].text} opacity-65`}>仓位盈亏</p>
            <p className={`text-sm font-semibold font-mono tabular-nums truncate ${stats[2].valueClassName}`}>{stats[2].value}</p>
          </div>
        </div>
      </div>
      <div className={`${isMobileExpanded ? 'block' : 'hidden'} sm:block px-3 pb-3 pt-2 sm:px-5 sm:pb-5 sm:pt-3`}>
        <div className={`grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 ${tileDivider} rounded-lg overflow-hidden border ${tileDivider}`}>
          {stats.map((stat, idx) => (
            <div key={stat.label} className={`px-3 py-2.5 sm:px-4 sm:py-3 ${
              theme === 'dark'
                ? 'bg-zinc-900/30 hover:bg-zinc-800/40'
                : theme === 'blue'
                  ? 'bg-white/60 hover:bg-blue-50/60'
                  : 'bg-white/60 hover:bg-slate-50/80'
            } transition-colors duration-150`}>
              <h3 className={`text-[10.5px] sm:text-[11.5px] font-medium ${themes[theme].text} opacity-65 tracking-wide`}>{stat.label}</h3>
              <p className={`text-[15px] sm:text-[22px] font-semibold mt-0.5 sm:mt-1 tracking-tight break-all ${stat.valueClassName} ${stat.mono ? 'font-mono tabular-nums' : ''}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
