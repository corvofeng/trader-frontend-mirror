import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../lib/types';
import { useCurrency } from '../../../lib/context/CurrencyContext';

export interface Position {
  id: string;
  type: 'call' | 'put';
  action: 'buy' | 'sell';
  strike: number;
  premium: number;
  quantity: number;
  expiry: string;
}

interface PositionManagerProps {
  theme: Theme;
  positions: Position[];
  onAddPosition: () => void;
  onRemovePosition: (id: string) => void;
  onUpdatePosition: (id: string, field: keyof Position, value: any) => void;
}

export function PositionManager({
  theme,
  positions,
  onAddPosition,
  onRemovePosition,
  onUpdatePosition
}: PositionManagerProps) {
  const { currencyConfig } = useCurrency();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
          期权仓位
        </h3>
        <button
          onClick={onAddPosition}
          className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].primary}`}
        >
          <Plus className="w-4 h-4 mr-2" />
          添加仓位
        </button>
      </div>

      <div className="space-y-3">
        {positions.map((position) => (
          <div
            key={position.id}
            className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                  类型
                </label>
                <select
                  value={position.type}
                  onChange={(e) => onUpdatePosition(position.id, 'type', e.target.value)}
                  className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                  操作
                </label>
                <select
                  value={position.action}
                  onChange={(e) => onUpdatePosition(position.id, 'action', e.target.value)}
                  className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="buy">买入</option>
                  <option value="sell">卖出</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                  行权价
                </label>
                <input
                  type="number"
                  value={position.strike}
                  onChange={(e) => onUpdatePosition(position.id, 'strike', parseFloat(e.target.value) || 0)}
                  className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                  step="0.01"
                />
              </div>

              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                  权利金
                </label>
                <input
                  type="number"
                  value={position.premium}
                  onChange={(e) => onUpdatePosition(position.id, 'premium', parseFloat(e.target.value) || 0)}
                  className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                  step="0.01"
                />
              </div>

              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                  数量
                </label>
                <input
                  type="number"
                  value={position.quantity}
                  onChange={(e) => onUpdatePosition(position.id, 'quantity', parseInt(e.target.value) || 0)}
                  className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                  到期日
                </label>
                <input
                  type="date"
                  value={position.expiry}
                  onChange={(e) => onUpdatePosition(position.id, 'expiry', e.target.value)}
                  className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => onRemovePosition(position.id)}
                  className={`p-2 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>成本: </span>
                  <span className={`font-medium ${themes[theme].text}`}>
                    {formatCurrency(position.premium * position.quantity * 100, currencyConfig)}
                  </span>
                </div>
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>方向: </span>
                  <span className={`font-medium ${
                    position.action === 'buy' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {position.action === 'buy' ? '做多' : '做空'} {position.type.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {positions.length === 0 && (
          <div className={`${themes[theme].background} rounded-lg p-8 text-center border-2 border-dashed ${themes[theme].border}`}>
            <p className={`${themes[theme].text} opacity-75`}>
              暂无期权仓位，点击"添加仓位"开始构建策略
            </p>
          </div>
        )}
      </div>
    </div>
  );
}