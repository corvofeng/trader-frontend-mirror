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
  if (!positions || positions.length === 0) return null;
  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6 border-b border-gray-200">
        <h2 className={`text-xl font-bold ${themes[theme].text}`}>标的物持仓</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {positions.map((pos, idx) => (
            <div key={idx} className={`${themes[theme].background} rounded-lg p-4 border border-gray-200 dark:border-gray-700`}>
              <div className="flex justify-between items-start mb-3">
                <h3 className={`text-lg font-bold ${themes[theme].text}`}>{pos.stock_code}</h3>
                <span className={`text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100`}>标的</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>当前价格</span>
                  <span className={`text-sm font-medium ${themes[theme].text}`}>{pos.stock_price != null ? formatCurrency(pos.stock_price, currencyConfig, 4) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>持仓市值</span>
                  <span className={`text-sm font-medium ${themes[theme].text}`}>{pos.total_stock_price != null ? formatCurrency(pos.total_stock_price, currencyConfig, 4) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>总持仓</span>
                  <span className={`text-sm font-bold ${themes[theme].text}`}>{pos.total_volume.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>备兑锁定</span>
                  <span className={`text-sm font-medium ${themes[theme].text}`}>{pos.covered_volume.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>其他锁定</span>
                  <span className={`text-sm font-medium ${themes[theme].text}`}>{pos.lock_volume.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
