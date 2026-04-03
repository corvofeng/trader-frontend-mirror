import React from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { CustomOptionsStrategy, OptionsPosition } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types';

interface CustomStrategiesPanelProps {
  theme: Theme;
  currencyConfig: CurrencyConfig;
  strategies: CustomOptionsStrategy[];
  expandedStrategyIds: string[];
  onToggleExpanded: (strategyId: string) => void;
  getTypeIcon: (type: OptionsPosition['type']) => React.ReactNode;
  getPositionTypeInfo2: (
    positionType: string,
    optionType: string,
    positionTypeZh?: string,
    isCovered?: boolean
  ) => { icon: React.ReactNode; label: string; color: string; description?: string; borderColor: string };
}

export function CustomStrategiesPanel({
  theme,
  currencyConfig,
  strategies,
  expandedStrategyIds,
  onToggleExpanded,
  getTypeIcon,
  getPositionTypeInfo2
}: CustomStrategiesPanelProps) {
  if (!strategies || strategies.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4 flex items-center gap-2`}>
        <Layers className="w-5 h-5 text-purple-500" />
        自定义策略 ({strategies.length})
      </h3>
      <div className="space-y-4">
        {strategies.map((strategy) => {
          const isExpanded = expandedStrategyIds.includes(strategy.id);
          const totalCost = strategy.positions.reduce((sum, pos) => sum + (pos.premium * (pos.selectedQuantity || pos.quantity) * 100), 0);
          const currentValue = strategy.positions.reduce((sum, pos) => sum + (pos.currentValue * (pos.selectedQuantity || pos.quantity) * 100), 0);
          const profitLoss = currentValue - totalCost;
          const profitLossPercentage = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;

          return (
            <div key={strategy.id} className={`${themes[theme].background} rounded-lg border ${themes[theme].border}`}>
              <div className={`p-4 cursor-pointer ${themes[theme].cardHover}`} onClick={() => onToggleExpanded(strategy.id)}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {strategy.strategyCategory && (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            strategy.strategyCategory === 'bullish'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                              : strategy.strategyCategory === 'bearish'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                                : strategy.strategyCategory === 'volatility'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                          }`}
                        >
                          {strategy.strategyCategory === 'bullish'
                            ? '看涨'
                            : strategy.strategyCategory === 'bearish'
                              ? '看跌'
                              : strategy.strategyCategory === 'volatility'
                                ? '波动率'
                                : '中性'}
                        </span>
                      )}
                      {strategy.riskLevel && (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            strategy.riskLevel === 'low'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                              : strategy.riskLevel === 'medium'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                          }`}
                        >
                          {strategy.riskLevel === 'low' ? '低风险' : strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className={`text-lg font-semibold ${themes[theme].text}`}>{strategy.name}</h4>
                      <p className={`text-sm ${themes[theme].text} opacity-75`}>{strategy.description}</p>
                      <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                        {strategy.positions.length} 个期权 • 创建于 {format(new Date(strategy.createdAt), 'yyyy-MM-dd')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {profitLoss >= 0 ? '+' : ''}
                        {formatCurrency(Math.abs(profitLoss), currencyConfig, 4)}
                      </p>
                      <p className={`text-xs ${themes[theme].text} opacity-75`}>
                        ({profitLossPercentage >= 0 ? '+' : ''}
                        {profitLossPercentage.toFixed(2)}%)
                      </p>
                      <p className={`text-xs ${themes[theme].text} opacity-60`}>成本: {formatCurrency(totalCost, currencyConfig, 4)}</p>
                    </div>
                    {isExpanded ? <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} /> : <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4">
                  <div className="space-y-2">
                    <h5 className={`text-sm font-medium ${themes[theme].text} mb-3`}>包含的期权持仓</h5>
                    {strategy.positions.map((position) => {
                      const adjustedCost = position.premium * (position.selectedQuantity || position.quantity) * 100;
                      const adjustedValue = position.currentValue * (position.selectedQuantity || position.quantity) * 100;
                      const adjustedProfitLoss = adjustedValue - adjustedCost;
                      const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);

                      return (
                        <div key={position.id} className={`${themes[theme].card} rounded p-3 border ${themes[theme].border}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getTypeIcon(position.type)}
                              <div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {position.symbol} {position.strike} {position.type.toUpperCase()}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex items-center gap-1">
                                    {positionInfo.icon}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>{positionInfo.label}</span>
                                  </div>
                                  <span className={`text-xs ${themes[theme].text} opacity-75`}>到期: {format(new Date(position.expiry), 'MM-dd')}</span>
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                                  数量: {position.selectedQuantity || position.quantity}
                                  {position.selectedQuantity && position.selectedQuantity !== position.quantity && (
                                    <span className="text-blue-600 ml-1">(原始: {position.quantity})</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-sm font-medium ${adjustedProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {adjustedProfitLoss >= 0 ? '+' : ''}
                                {formatCurrency(Math.abs(adjustedProfitLoss), currencyConfig, 4)}
                              </div>
                              <div className={`text-xs ${themes[theme].text} opacity-60`}>成本: {formatCurrency(adjustedCost, currencyConfig, 4)}</div>
                              <div className={`text-xs ${themes[theme].text} opacity-60`}>当前: {formatCurrency(adjustedValue, currencyConfig, 4)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

