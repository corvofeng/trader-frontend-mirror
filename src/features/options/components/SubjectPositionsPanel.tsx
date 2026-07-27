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
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className={`${isExpanded ? 'border-b border-gray-200' : ''} p-3 sm:p-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-sm sm:text-lg font-bold ${themes[theme].text}`}>标的物持仓</h2>
            <p className={`mt-0.5 text-[11px] sm:text-sm ${themes[theme].text} opacity-70`}>
              {positions.length} 个标的 · 总持仓 {summary.totalVolume.toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] sm:text-xs font-medium ${themes[theme].secondary}`}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? '收起标的物持仓' : '展开标的物持仓'}
          >
            {isExpanded ? '收起' : '展开'}
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
        {isExpanded && (
          <div className="mt-2 flex flex-wrap gap-1.5 sm:gap-2">
            <span className={`${themes[theme].background} rounded-md px-2 py-1 text-[11px] sm:text-xs ${themes[theme].text}`}>
              可用 {summary.totalAvailable.toLocaleString()}
            </span>
            <span className={`${themes[theme].background} rounded-md px-2 py-1 text-[11px] sm:text-xs ${themes[theme].text}`}>
              备兑 {summary.totalCovered.toLocaleString()}
            </span>
            <span className={`${themes[theme].background} rounded-md px-2 py-1 text-[11px] sm:text-xs ${themes[theme].text}`}>
              其他锁定 {summary.totalLocked.toLocaleString()}
            </span>
            <span className={`${themes[theme].background} rounded-md px-2 py-1 text-[11px] sm:text-xs ${themes[theme].text} max-w-full truncate`}>
              市值 {formatCurrency(summary.totalMarketValue, currencyConfig, 4)}
            </span>
          </div>
        )}
      </div>
      <div className={isExpanded ? 'block' : 'hidden'}>
        <div className="sm:hidden divide-y divide-gray-200 dark:divide-gray-700">
          {positions.map((pos, idx) => {
            const availableVolume = Math.max(0, pos.total_volume - pos.covered_volume - pos.lock_volume);

            return (
              <div key={idx} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${themes[theme].text} truncate`}>{pos.stock_code}</div>
                    <div className={`mt-0.5 text-[11px] ${themes[theme].text} opacity-70`}>
                      现价 {pos.stock_price != null ? formatCurrency(pos.stock_price, currencyConfig, 4) : '-'} · 市值 {pos.total_stock_price != null ? formatCurrency(pos.total_stock_price, currencyConfig, 4) : '-'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${themes[theme].text}`}>{pos.total_volume.toLocaleString()}</div>
                    <div className={`text-[11px] ${themes[theme].text} opacity-70`}>总持仓</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`${themes[theme].background} rounded px-1.5 py-1 text-[11px] ${themes[theme].text}`}>
                    可用 {availableVolume.toLocaleString()}
                  </span>
                  <span className={`${themes[theme].background} rounded px-1.5 py-1 text-[11px] ${themes[theme].text}`}>
                    备兑 {pos.covered_volume.toLocaleString()}
                  </span>
                  <span className={`${themes[theme].background} rounded px-1.5 py-1 text-[11px] ${themes[theme].text}`}>
                    锁定 {pos.lock_volume.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={`${themes[theme].background} border-b border-gray-200 dark:border-gray-700`}>
              <tr className={`text-left text-xs uppercase tracking-wide ${themes[theme].text} opacity-65`}>
                <th className="px-4 py-2.5 font-medium">标的</th>
                <th className="px-4 py-2.5 font-medium text-right">现价</th>
                <th className="px-4 py-2.5 font-medium text-right">总持仓</th>
                <th className="px-4 py-2.5 font-medium text-right">可用</th>
                <th className="px-4 py-2.5 font-medium text-right">备兑</th>
                <th className="px-4 py-2.5 font-medium text-right">其他锁定</th>
                <th className="px-4 py-2.5 font-medium text-right">持仓市值</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {positions.map((pos, idx) => {
                const availableVolume = Math.max(0, pos.total_volume - pos.covered_volume - pos.lock_volume);

                return (
                  <tr key={idx} className={`${themes[theme].text}`}>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">{pos.stock_code}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {pos.stock_price != null ? formatCurrency(pos.stock_price, currencyConfig, 4) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{pos.total_volume.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{availableVolume.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{pos.covered_volume.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{pos.lock_volume.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
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
