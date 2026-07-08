import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { CurrencyConfig } from '../../../shared/types/ui';

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
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  if (!positions || positions.length === 0) return null;

  const summary = useMemo(() => {
    const totalVolume = positions.reduce((sum, pos) => sum + (pos.total_volume || 0), 0);
    const totalCovered = positions.reduce((sum, pos) => sum + (pos.covered_volume || 0), 0);
    const totalLocked = positions.reduce((sum, pos) => sum + (pos.lock_volume || 0), 0);
    const totalMarketValue = positions.reduce((sum, pos) => sum + (pos.total_stock_price ?? 0), 0);

    return {
      totalVolume,
      totalCovered,
      totalLocked,
      totalMarketValue,
    };
  }, [positions]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-3 sm:p-6 border-b border-gray-200">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-base sm:text-xl font-bold ${themes[theme].text}`}>标的物持仓</h2>
            <p className={`mt-1 text-xs sm:text-sm ${themes[theme].text} opacity-70`}>
              {positions.length} 个标的 · 总持仓 {summary.totalVolume.toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileExpanded((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium sm:hidden ${themes[theme].secondary}`}
            aria-expanded={isMobileExpanded}
            aria-label={isMobileExpanded ? '收起标的物持仓' : '展开标的物持仓'}
          >
            {isMobileExpanded ? '收起' : '展开'}
            {isMobileExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
          <div className={`${themes[theme].background} rounded-md px-2.5 py-2`}>
            <p className={`text-[11px] ${themes[theme].text} opacity-70`}>总市值</p>
            <p className={`text-sm font-semibold ${themes[theme].text} truncate`}>
              {formatCurrency(summary.totalMarketValue, currencyConfig, 4)}
            </p>
          </div>
          <div className={`${themes[theme].background} rounded-md px-2.5 py-2`}>
            <p className={`text-[11px] ${themes[theme].text} opacity-70`}>备兑锁定</p>
            <p className={`text-sm font-semibold ${themes[theme].text}`}>
              {summary.totalCovered.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
      <div className={`${isMobileExpanded ? 'block' : 'hidden'} p-3 pt-0 sm:block sm:p-6`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
          {positions.map((pos, idx) => (
            <div key={idx} className={`${themes[theme].background} rounded-md sm:rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700`}>
              <div className="flex justify-between items-start gap-2 mb-2 sm:mb-3">
                <h3 className={`text-sm sm:text-lg font-bold ${themes[theme].text} break-all`}>{pos.stock_code}</h3>
                <span className={`text-[10px] sm:text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 shrink-0`}>标的</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:space-y-2 sm:block">
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] sm:text-sm ${themes[theme].text} opacity-75`}>当前价格</span>
                  <span className={`text-[11px] sm:text-sm font-medium ${themes[theme].text} text-right break-all`}>{pos.stock_price != null ? formatCurrency(pos.stock_price, currencyConfig, 4) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] sm:text-sm ${themes[theme].text} opacity-75`}>持仓市值</span>
                  <span className={`text-[11px] sm:text-sm font-medium ${themes[theme].text} text-right break-all`}>{pos.total_stock_price != null ? formatCurrency(pos.total_stock_price, currencyConfig, 4) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] sm:text-sm ${themes[theme].text} opacity-75`}>总持仓</span>
                  <span className={`text-[11px] sm:text-sm font-bold ${themes[theme].text} text-right`}>{pos.total_volume.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] sm:text-sm ${themes[theme].text} opacity-75`}>备兑锁定</span>
                  <span className={`text-[11px] sm:text-sm font-medium ${themes[theme].text} text-right`}>{pos.covered_volume.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] sm:text-sm ${themes[theme].text} opacity-75`}>其他锁定</span>
                  <span className={`text-[11px] sm:text-sm font-medium ${themes[theme].text} text-right`}>{pos.lock_volume.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center col-span-2 border-t border-gray-200/70 dark:border-gray-700/70 pt-2 mt-1 sm:hidden">
                  <span className={`text-[11px] ${themes[theme].text} opacity-75`}>可用数量</span>
                  <span className={`text-[11px] font-semibold ${themes[theme].text}`}>
                    {Math.max(0, pos.total_volume - pos.covered_volume - pos.lock_volume).toLocaleString()}
                  </span>
                </div>
                <div className="hidden sm:flex justify-between items-center border-t border-gray-200/70 dark:border-gray-700/70 pt-2 mt-2">
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>可用数量</span>
                  <span className={`text-sm font-semibold ${themes[theme].text}`}>
                    {Math.max(0, pos.total_volume - pos.covered_volume - pos.lock_volume).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
