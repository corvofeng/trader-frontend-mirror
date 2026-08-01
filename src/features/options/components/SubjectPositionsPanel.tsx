import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { CurrencyConfig } from '../../../shared/types/ui';

const SUBJECT_POSITIONS_COLLAPSED_KEY = 'options_portfolio_subject_positions_collapsed';

interface SubjectPosition {
  stock_code: string;
  stock_price?: number | null;
  total_stock_price?: number | null;
  total_volume: number;
  covered_volume: number;
  lock_volume: number;
}

interface SubjectPositionsPanelProps {
  theme: Theme;
  positions: SubjectPosition[];
  currencyConfig: CurrencyConfig;
}

export function SubjectPositionsPanel({ theme, positions, currencyConfig }: SubjectPositionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;

    const saved = localStorage.getItem(SUBJECT_POSITIONS_COLLAPSED_KEY);
    if (saved === '1') return false;
    if (saved === '0') return true;

    return window.innerWidth >= 640;
  });

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

  const chipBg = useMemo(() => {
    if (theme === 'dark') return 'bg-zinc-800/50 text-zinc-200';
    if (theme === 'blue') return 'bg-blue-50/80 text-blue-900';
    return 'bg-slate-50 text-slate-800';
  }, [theme]);

  const bgHighlight = useMemo(() => {
    if (theme === 'dark') return 'from-zinc-800/60 via-zinc-900/20 to-transparent';
    if (theme === 'blue') return 'from-blue-50/90 via-blue-50/40 to-transparent';
    return 'from-slate-50/90 via-slate-50/40 to-transparent';
  }, [theme]);

  const summary = useMemo(() => {
    const totalVolume = positions.reduce((sum, pos) => sum + (pos.total_volume || 0), 0);
    const totalCovered = positions.reduce((sum, pos) => sum + (pos.covered_volume || 0), 0);
    const totalLocked = positions.reduce((sum, pos) => sum + (pos.lock_volume || 0), 0);
    const totalMarketValue = positions.reduce((sum, pos) => sum + (pos.total_stock_price ?? 0), 0);
    const totalAvailable = positions.reduce(
      (sum, pos) => sum + Math.max(0, pos.total_volume - pos.covered_volume - pos.lock_volume),
      0
    );

    return {
      totalVolume,
      totalCovered,
      totalLocked,
      totalMarketValue,
      totalAvailable,
    };
  }, [positions]);

  if (!positions || positions.length === 0) return null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SUBJECT_POSITIONS_COLLAPSED_KEY, isExpanded ? '0' : '1');
  }, [isExpanded]);

  return (
    <div className={`${themes[theme].card} rounded-xl ${cardShadow} overflow-hidden relative isolate border ${themes[theme].border}`}>
      <div className={`absolute inset-x-0 top-0 h-px z-10 bg-gradient-to-r ${bgHighlight}`} aria-hidden="true" />
      <div className={`${isExpanded ? 'border-b' : ''} ${tileDivider} px-3 py-3 sm:px-5 sm:py-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-[14px] sm:text-[16px] font-semibold tracking-tight ${themes[theme].text}`}>标的物持仓</h2>
            <p className={`mt-0.5 text-[11px] sm:text-[12px] ${themes[theme].text} opacity-65`}>
              {positions.length} 个标的 · 总持仓 <span className="font-mono tabular-nums font-semibold">{summary.totalVolume.toLocaleString()}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${themes[theme].secondary}`}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? '收起标的物持仓' : '展开标的物持仓'}
          >
            {isExpanded ? '收起' : '展开'}
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={2} /> : <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />}
          </button>
        </div>
        {isExpanded && (
          <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
            <span className={`${chipBg} rounded-lg px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1.5`}>
              <span className="opacity-65">可用</span>
              <span className="font-mono tabular-nums font-semibold">{summary.totalAvailable.toLocaleString()}</span>
            </span>
            <span className={`${chipBg} rounded-lg px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1.5`}>
              <span className="opacity-65">备兑</span>
              <span className="font-mono tabular-nums font-semibold">{summary.totalCovered.toLocaleString()}</span>
            </span>
            <span className={`${chipBg} rounded-lg px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1.5`}>
              <span className="opacity-65">锁定</span>
              <span className="font-mono tabular-nums font-semibold">{summary.totalLocked.toLocaleString()}</span>
            </span>
            <span className={`${chipBg} rounded-lg px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1.5 max-w-full`}>
              <span className="opacity-65 shrink-0">市值</span>
              <span className="font-mono tabular-nums font-semibold truncate">{formatCurrency(summary.totalMarketValue, currencyConfig, 4)}</span>
            </span>
          </div>
        )}
      </div>
      <div className={isExpanded ? 'block' : 'hidden'}>
        <div className={`sm:hidden divide-y ${tileDivider}`}>
          {positions.map((pos, idx) => {
            const availableVolume = Math.max(0, pos.total_volume - pos.covered_volume - pos.lock_volume);

            return (
              <div key={idx} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${themes[theme].text} truncate font-mono`}>{pos.stock_code}</div>
                    <div className={`mt-0.5 text-[11px] ${themes[theme].text} opacity-65`}>
                      现价 {pos.stock_price != null ? <span className="font-mono tabular-nums">{formatCurrency(pos.stock_price, currencyConfig, 4)}</span> : '-'} · 市值 {pos.total_stock_price != null ? <span className="font-mono tabular-nums">{formatCurrency(pos.total_stock_price, currencyConfig, 4)}</span> : '-'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${themes[theme].text} font-mono tabular-nums`}>{pos.total_volume.toLocaleString()}</div>
                    <div className={`text-[11px] ${themes[theme].text} opacity-65`}>总持仓</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`${chipBg} rounded-md px-1.5 py-1 text-[11px] font-mono tabular-nums`}>
                    可用 {availableVolume.toLocaleString()}
                  </span>
                  <span className={`${chipBg} rounded-md px-1.5 py-1 text-[11px] font-mono tabular-nums`}>
                    备兑 {pos.covered_volume.toLocaleString()}
                  </span>
                  <span className={`${chipBg} rounded-md px-1.5 py-1 text-[11px] font-mono tabular-nums`}>
                    锁定 {pos.lock_volume.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={`${
              theme === 'dark'
                ? 'bg-zinc-900/40'
                : theme === 'blue'
                  ? 'bg-blue-50/70'
                  : 'bg-slate-50'
            } border-b ${tileDivider}`}>
              <tr className={`text-left text-[11px] font-medium tracking-wide ${themes[theme].text} opacity-65`}>
                <th className="px-4 py-2.5 font-semibold">标的</th>
                <th className="px-4 py-2.5 font-semibold text-right">现价</th>
                <th className="px-4 py-2.5 font-semibold text-right">总持仓</th>
                <th className="px-4 py-2.5 font-semibold text-right">可用</th>
                <th className="px-4 py-2.5 font-semibold text-right">备兑</th>
                <th className="px-4 py-2.5 font-semibold text-right">锁定</th>
                <th className="px-4 py-2.5 font-semibold text-right">持仓市值</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${tileDivider}`}>
              {positions.map((pos, idx) => {
                const availableVolume = Math.max(0, pos.total_volume - pos.covered_volume - pos.lock_volume);

                return (
                  <tr key={idx} className={`${themes[theme].text} ${
                    theme === 'dark'
                      ? 'hover:bg-zinc-800/30'
                      : theme === 'blue'
                        ? 'hover:bg-blue-50/40'
                        : 'hover:bg-slate-50/60'
                  } transition-colors duration-100`}>
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap font-mono">{pos.stock_code}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono tabular-nums">
                      {pos.stock_price != null ? formatCurrency(pos.stock_price, currencyConfig, 4) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap font-mono tabular-nums">{pos.total_volume.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono tabular-nums">{availableVolume.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono tabular-nums">{pos.covered_volume.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono tabular-nums">{pos.lock_volume.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono tabular-nums">
                      {pos.total_stock_price != null ? formatCurrency(pos.total_stock_price, currencyConfig, 4) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
