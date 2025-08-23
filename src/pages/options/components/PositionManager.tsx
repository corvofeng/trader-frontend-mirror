import React from 'react';
import { Trash2 } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../lib/types';
import type { OptionsData } from '../../../lib/services/types';
import type { Position } from './OptionsCalculator';

interface PositionManagerProps {
  position: Position;
  optionsData: OptionsData | null;
  theme: Theme;
  onUpdate: (updates: Partial<Position>) => void;
  onRemove: () => void;
}

export function PositionManager({ 
  position, 
  optionsData, 
  theme, 
  onUpdate, 
  onRemove 
}: PositionManagerProps) {
  const { currencyConfig } = useCurrency();

  const getAvailableStrikes = () => {
    if (!optionsData) return [];
    return Array.from(new Set(optionsData.quotes.map(q => q.strike))).sort((a, b) => a - b);
  };

  const getAvailableExpiries = () => {
    if (!optionsData) return [];
    return Array.from(new Set(optionsData.quotes.map(q => q.expiry))).sort();
  };

  const updatePremium = (type: 'call' | 'put', strike: number, expiry: string) => {
    if (!optionsData) return;
    
    const quote = optionsData.quotes.find(q => 
      q.strike === strike && q.expiry === expiry
    );
    
    if (quote) {
      const premium = type === 'call' ? quote.callPrice : quote.putPrice;
      onUpdate({ premium });
    }
  };

  const handleTypeChange = (type: 'call' | 'put') => {
    onUpdate({ type });
    updatePremium(type, position.strike, position.expiry);
  };

  const handleStrikeChange = (strike: number) => {
    onUpdate({ strike });
    updatePremium(position.type, strike, position.expiry);
  };

  const handleExpiryChange = (expiry: string) => {
    onUpdate({ expiry });
    updatePremium(position.type, position.strike, expiry);
  };

  const totalCost = position.premium * position.quantity * 100;
  const isLong = position.action === 'buy';

  return (
    <div className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            position.type === 'call' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
          }`}>
            {position.type.toUpperCase()}
          </span>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            position.action === 'buy'
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100'
          }`}>
            {position.action === 'buy' ? '买入' : '卖出'}
          </span>
        </div>
        <button
          onClick={onRemove}
          className={`p-1 rounded-md ${themes[theme].secondary} text-red-500 hover:text-red-700`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
            期权类型
          </label>
          <select
            value={position.type}
            onChange={(e) => handleTypeChange(e.target.value as 'call' | 'put')}
            className={`w-full px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          >
            <option value="call">看涨期权 (Call)</option>
            <option value="put">看跌期权 (Put)</option>
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
            操作类型
          </label>
          <select
            value={position.action}
            onChange={(e) => onUpdate({ action: e.target.value as 'buy' | 'sell' })}
            className={`w-full px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          >
            <option value="buy">买入</option>
            <option value="sell">卖出</option>
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
            行权价
          </label>
          <select
            value={position.strike}
            onChange={(e) => handleStrikeChange(Number(e.target.value))}
            className={`w-full px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          >
            {getAvailableStrikes().map(strike => (
              <option key={strike} value={strike}>
                {formatCurrency(strike, currencyConfig)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
            到期日
          </label>
          <select
            value={position.expiry}
            onChange={(e) => handleExpiryChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          >
            {getAvailableExpiries().map(expiry => (
              <option key={expiry} value={expiry}>
                {new Date(expiry).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
            权利金
          </label>
          <input
            type="number"
            value={position.premium}
            onChange={(e) => onUpdate({ premium: Number(e.target.value) })}
            step="0.01"
            min="0"
            className={`w-full px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          />
        </div>

        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
            合约数量
          </label>
          <input
            type="number"
            value={position.quantity}
            onChange={(e) => onUpdate({ quantity: Number(e.target.value) })}
            min="1"
            className={`w-full px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm">
          <span className={`${themes[theme].text} opacity-75`}>
            总成本:
          </span>
          <span className={`font-medium ${
            isLong ? 'text-red-600' : 'text-green-600'
          }`}>
            {isLong ? '-' : '+'}{formatCurrency(Math.abs(totalCost), currencyConfig)}
          </span>
        </div>
      </div>
    </div>
  );
}