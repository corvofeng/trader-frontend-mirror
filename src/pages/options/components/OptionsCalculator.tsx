import React, { useState, useEffect } from 'react';
import { X, Calculator, Plus, Trash2 } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../lib/types';
import type { OptionsData } from '../../../lib/services/types';
import { PositionManager } from './PositionManager';
import { ProfitLossChart } from './ProfitLossChart';

interface OptionsCalculatorProps {
  theme: Theme;
  optionsData: OptionsData | null;
  selectedSymbol: string;
  onClose: () => void;
}

export interface Position {
  id: string;
  type: 'call' | 'put';
  action: 'buy' | 'sell';
  strike: number;
  premium: number;
  quantity: number;
  expiry: string;
}

export function OptionsCalculator({ theme, optionsData, selectedSymbol, onClose }: OptionsCalculatorProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [currentStockPrice, setCurrentStockPrice] = useState<number>(450);
  const { currencyConfig } = useCurrency();

  // 获取当前股价（基于期权数据估算）
  useEffect(() => {
    if (optionsData && optionsData.quotes.length > 0) {
      // 找到时间价值最大的期权合约作为平值合约
      let maxTimeValue = 0;
      let atmStrike = 0;
      
      optionsData.quotes.forEach(quote => {
        const callTimeValue = quote.callTimeValue || 0;
        const putTimeValue = quote.putTimeValue || 0;
        const totalTimeValue = callTimeValue + putTimeValue;
        
        if (totalTimeValue > maxTimeValue) {
          maxTimeValue = totalTimeValue;
          atmStrike = quote.strike;
        }
      });
      
      if (atmStrike > 0) {
        setCurrentStockPrice(atmStrike);
      }
    }
  }, [optionsData]);

  const addPosition = () => {
    if (!optionsData || optionsData.quotes.length === 0) return;
    
    const firstQuote = optionsData.quotes[0];
    const newPosition: Position = {
      id: Date.now().toString(),
      type: 'call',
      action: 'buy',
      strike: firstQuote.strike,
      premium: firstQuote.callPrice,
      quantity: 1,
      expiry: firstQuote.expiry
    };
    
    setPositions([...positions, newPosition]);
  };

  const updatePosition = (id: string, updates: Partial<Position>) => {
    setPositions(positions.map(pos => 
      pos.id === id ? { ...pos, ...updates } : pos
    ));
  };

  const removePosition = (id: string) => {
    setPositions(positions.filter(pos => pos.id !== id));
  };

  const calculateTotalCost = () => {
    return positions.reduce((total, pos) => {
      const cost = pos.premium * pos.quantity * 100; // 每份合约100股
      return total + (pos.action === 'buy' ? cost : -cost);
    }, 0);
  };

  const totalCost = calculateTotalCost();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themes[theme].card} rounded-lg max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Calculator className="w-6 h-6 text-purple-500" />
            <div>
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                期权收益计算器 - {selectedSymbol}
              </h2>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                当前股价: {formatCurrency(currentStockPrice, currencyConfig)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-md ${themes[theme].secondary}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Left Panel - Position Management */}
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  期权仓位
                </h3>
                <button
                  onClick={addPosition}
                  disabled={!optionsData}
                  className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].primary} ${
                    !optionsData ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  添加仓位
                </button>
              </div>

              {positions.length === 0 ? (
                <div className={`${themes[theme].background} rounded-lg p-8 text-center`}>
                  <Calculator className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
                  <p className={`${themes[theme].text} opacity-75`}>
                    暂无期权仓位
                  </p>
                  <p className={`text-sm ${themes[theme].text} opacity-60 mt-2`}>
                    点击"添加仓位"开始构建期权策略
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {positions.map((position) => (
                    <PositionManager
                      key={position.id}
                      position={position}
                      optionsData={optionsData}
                      theme={theme}
                      onUpdate={(updates) => updatePosition(position.id, updates)}
                      onRemove={() => removePosition(position.id)}
                    />
                  ))}
                </div>
              )}

              {/* Summary */}
              {positions.length > 0 && (
                <div className={`${themes[theme].background} rounded-lg p-4`}>
                  <h4 className={`text-md font-semibold ${themes[theme].text} mb-3`}>
                    策略汇总
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className={`text-sm ${themes[theme].text} opacity-75`}>
                        总仓位数量:
                      </span>
                      <span className={`text-sm font-medium ${themes[theme].text}`}>
                        {positions.length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${themes[theme].text} opacity-75`}>
                        净权利金:
                      </span>
                      <span className={`text-sm font-medium ${
                        totalCost >= 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {totalCost >= 0 ? '-' : '+'}{formatCurrency(Math.abs(totalCost), currencyConfig)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel - Profit/Loss Chart */}
            <div>
              <ProfitLossChart
                positions={positions}
                currentStockPrice={currentStockPrice}
                theme={theme}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}