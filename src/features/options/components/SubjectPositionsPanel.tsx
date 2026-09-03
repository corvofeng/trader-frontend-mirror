import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
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
  className?: string;
  defaultExpanded?: boolean;
}

export function SubjectPositionsPanel({
  theme,
  positions,
  currencyConfig,
  className = '',
  defaultExpanded,
}: SubjectPositionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (defaultExpanded !== undefined) return defaultExpanded;
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
    if (theme === 'dark') return 'bg-zinc-800/60 text-zinc-200';
    if (theme === 'blue') return 'bg-blue-50/80 text-blue-900';
    return 'bg-slate-100/80 text-slate-800';
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SUBJECT_POSITIONS_COLLAPSED_KEY, isExpanded ? '0' : '1');
  }, [isExpanded]);

  if (!positions || positions.length === 0) return null;

  return (
    <div
      className={`${themes[theme].card} ${themes[theme].border} border rounded-2xl ${cardShadow} transition-all duration-300 overflow-hidden ${className}`}
    >
      {/* 栏目头部：整行可点击折叠/展开，保持与历史盈亏走势一致的设计 */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="px-4 sm:px-6 py-4 flex items-center justify-between cursor-pointer select-none hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          >
            <Layers className="w-5 h-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-base font-semibold tracking-tight ${themes[theme].text}`}>
                标的物持仓
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                {positions.length} 个标的
              </span>
            </div>
            <p className={`text-xs ${themes[theme].text} opacity-60 mt-0.5 truncate`}>
              总持仓 {summary.totalVolume.toLocaleString()} · 备兑 {summary.totalCovered.toLocaleString()} · 锁定 {summary.totalLocked.toLocaleString()}
            </p>
          </div>
        </div>

        {/* 右侧：关键指标徽章与展开旋转箭头 */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 ml-3">
          <div className="text-right hidden xs:block">
            <div className="text-[10px] uppercase font-bold tracking-wider opacity-40">
              标的总市值
            </div>
            <div className="text-sm sm:text-base font-bold font-mono text-indigo-600 dark:text-indigo-400">
              {formatCurrency(summary.totalMarketValue, currencyConfig, 4)}
            </div>
          </div>

          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300 ${
              isExpanded ? 'rotate-180 bg-black/5 dark:bg-white/10' : 'bg-transparent'
            } ${themes[theme].text}`}
          >
            <ChevronDown className="w-5 h-5 opacity-70" />
          </div>
        </div>
      </div>

      {/* 展开后的主体内容 */}
      {isExpanded && (
        <div className={`border-t ${themes[theme].border}`}>
          {/* 汇总统计指标栏 */}
          <div className="px-4 sm:px-6 pt-3 pb-3 flex flex-wrap gap-2 sm:gap-3 bg-black/[0.01] dark:bg-white/[0.01]">
            <span className={`${chipBg} rounded-lg px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1.5`}>
              <span className="opacity-65">可用</span>
              <span className="font-mono tabular-nums font-semibold">{summary.totalAvailable.toLocaleString()}</span>
            </span>
            <span className={`${chipBg} rounded-lg px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1.5`}>
              <span className="opacity-65">备兑</span>
              <span className="font-mono tabular-nums font-semibold">{summary.totalCovered.toLocaleString()}</span>
            </span>
            <span className={`${chipBg} rounded-lg px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1.5`}>
              <span className="opacity-65">锁定</span>
              <span className="font-mono tabular-nums font-semibold">{summary.totalLocked.toLocaleString()}</span>
            </span>
            <span className={`${chipBg} rounded-lg px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1.5`}>
              <span className="opacity-65">市值</span>
              <span className="font-mono tabular-nums font-semibold">{formatCurrency(summary.totalMarketValue, currencyConfig, 4)}</span>
            </span>
          </div>

          {/* 移动端卡片视图 */}
          <div className={`sm:hidden divide-y ${tileDivider} border-t ${tileDivider}`}>
            {positions.map((pos, idx) => {
              const availableVolume = Math.max(0, pos.total_volume - pos.covered_volume - pos.lock_volume);

              return (
                <div key={idx} className="px-4 py-3">
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
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className={`${chipBg} rounded-md px-2 py-0.5 text-[11px] font-mono tabular-nums`}>
                      可用 {availableVolume.toLocaleString()}
                    </span>
                    <span className={`${chipBg} rounded-md px-2 py-0.5 text-[11px] font-mono tabular-nums`}>
                      备兑 {pos.covered_volume.toLocaleString()}
                    </span>
                    <span className={`${chipBg} rounded-md px-2 py-0.5 text-[11px] font-mono tabular-nums`}>
                      锁定 {pos.lock_volume.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 桌面端表格 */}
          <div className={`hidden sm:block overflow-x-auto border-t ${tileDivider}`}>
            <table className="min-w-full text-sm">
              <thead className={`${
                theme === 'dark'
                  ? 'bg-zinc-900/40'
                  : theme === 'blue'
                    ? 'bg-blue-50/70'
                    : 'bg-slate-50'
              } border-b ${tileDivider}`}>
                <tr className={`text-left text-[11px] font-medium tracking-wide ${themes[theme].text} opacity-65`}>
                  <th className="px-5 py-3 font-semibold">标的</th>
                  <th className="px-5 py-3 font-semibold text-right">现价</th>
                  <th className="px-5 py-3 font-semibold text-right">总持仓</th>
                  <th className="px-5 py-3 font-semibold text-right">可用</th>
                  <th className="px-5 py-3 font-semibold text-right">备兑</th>
                  <th className="px-5 py-3 font-semibold text-right">锁定</th>
                  <th className="px-5 py-3 font-semibold text-right">持仓市值</th>
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
                      <td className="px-5 py-3 font-semibold whitespace-nowrap font-mono">{pos.stock_code}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap font-mono tabular-nums">
                        {pos.stock_price != null ? formatCurrency(pos.stock_price, currencyConfig, 4) : '-'}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold whitespace-nowrap font-mono tabular-nums">{pos.total_volume.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap font-mono tabular-nums">{availableVolume.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap font-mono tabular-nums">{pos.covered_volume.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap font-mono tabular-nums">{pos.lock_volume.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap font-mono tabular-nums">
                        {pos.total_stock_price != null ? formatCurrency(pos.total_stock_price, currencyConfig, 4) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

