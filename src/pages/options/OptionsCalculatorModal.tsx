import React, { useState, useEffect } from 'react';
import { X, Calculator } from 'lucide-react';
import { Theme, themes } from '../../lib/theme';
import { useCurrency } from '../../lib/context/CurrencyContext';
import type { OptionsData } from '../../lib/services/types';
import { PositionManager, type Position } from './components/PositionManager';
import { ProfitLossChart } from './components/ProfitLossChart';
import { CalculatorSummary } from './components/CalculatorSummary';

interface OptionsCalculatorModalProps {
  theme: Theme;
  optionsData: OptionsData | null;
  selectedSymbol: string;
  onClose: () => void;
}

export function OptionsCalculatorModal({
  theme,
  optionsData,
  selectedSymbol,
  onClose
}: OptionsCalculatorModalProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [currentPrice, setCurrentPrice] = useState(450);
  const { currencyConfig } = useCurrency();

  // 估算当前股价（基于期权数据）
  useEffect(() => {
    if (optionsData && optionsData.quotes.length > 0) {
      // 找到时间价值最大的期权合约作为平值合约，其行权价接近当前股价
      let maxTimeValue = 0;
      let estimatedPrice = 450; // 默认值
      
      optionsData.quotes.forEach(quote => {
        const callTimeValue = quote.callTimeValue || 0;
        const putTimeValue = quote.putTimeValue || 0;
        const totalTimeValue = callTimeValue + putTimeValue;
        
        if (totalTimeValue > maxTimeValue) {
          maxTimeValue = totalTimeValue;
          estimatedPrice = quote.strike;
        }
      });
      
      setCurrentPrice(estimatedPrice);
    }
  }, [optionsData]);

  const addPosition = () => {
    const newPosition: Position = {
      id: Date.now().toString(),
      type: 'call',
      action: 'buy',
      strike: currentPrice,
      premium: 5.0,
      quantity: 1,
      expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
    setPositions([...positions, newPosition]);
  };

  const removePosition = (id: string) => {
    setPositions(positions.filter(p => p.id !== id));
  };

  const updatePosition = (id: string, field: keyof Position, value: any) => {
    setPositions(positions.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themes[theme].card} rounded-lg max-w-7xl w-full max-h-[95vh] overflow-y-auto`}>
        <div className="sticky top-0 bg-inherit border-b border-gray-200 p-6 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Calculator className="w-6 h-6 text-purple-500" />
            <div>
              <h2 className={`text-2xl font-bold ${themes[theme].text}`}>
                期权收益计算器 - {selectedSymbol}
              </h2>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                构建期权策略并分析盈亏情况
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

        <div className="p-6 space-y-8">
          {/* 当前股价设置 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                当前股价设置
              </h3>
              <div className="flex items-center space-x-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  股价:
                </label>
                <input
                  type="number"
                  value={currentPrice}
                  onChange={(e) => setCurrentPrice(parseFloat(e.target.value) || 0)}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text} w-24`}
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* 仓位管理 */}
          <PositionManager
            theme={theme}
            positions={positions}
            onAddPosition={addPosition}
            onRemovePosition={removePosition}
            onUpdatePosition={updatePosition}
          />

          {/* 策略摘要 */}
          <CalculatorSummary
            theme={theme}
            positions={positions}
            currentPrice={currentPrice}
          />

          {/* 盈亏图表 */}
          <ProfitLossChart
            theme={theme}
            positions={positions}
            currentPrice={currentPrice}
          />
        </div>
      </div>
    </div>
  );
}