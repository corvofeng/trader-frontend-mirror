import React from 'react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPosition, OptionsStrategy } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types';

interface ExtendedOptionsPosition extends OptionsPosition {
  strategy_id?: string;
  is_single_leg?: boolean;
}

interface OptionsPortfolioStrategyViewProps {
  theme: Theme;
  currencyConfig: CurrencyConfig;
  strategies: OptionsStrategy[];
  filterAndSortPositions: (positions: OptionsPosition[]) => OptionsPosition[];
  getTypeIcon: (type: OptionsPosition['type']) => React.ReactNode;
  getStatusColor: (status: OptionsPosition['status']) => string;
  getRowHighlightClass: (position: OptionsPosition) => string;
  getMoneynessTag: (position: OptionsPosition) => { label: string; className: string } | null;
  isSelectingExpiry: (expiry: string) => boolean;
  selectedLegs: Record<string, number>;
  setPositionSelected: (positionId: string, checked: boolean) => void;
  updateSelectedQuantity: (positionId: string, qty: number) => void;
  getPositionTypeInfo2: (
    positionType: string,
    optionType: string,
    positionTypeZh?: string,
    isCovered?: boolean
  ) => { icon: React.ReactNode; label: string; color: string; description?: string; borderColor: string };
  onEditComplexPosition?: (position: ExtendedOptionsPosition) => void;
}

export function OptionsPortfolioStrategyView({
  theme,
  currencyConfig,
  strategies,
  filterAndSortPositions,
  getTypeIcon,
  getStatusColor,
  getRowHighlightClass,
  getMoneynessTag,
  isSelectingExpiry,
  selectedLegs,
  setPositionSelected,
  updateSelectedQuantity,
  getPositionTypeInfo2,
  onEditComplexPosition
}: OptionsPortfolioStrategyViewProps) {
  return (
    <div className="space-y-6">
      {(strategies || []).map((strategy) => {
        const filteredPositions = filterAndSortPositions(strategy.positions);
        if (filteredPositions.length === 0) return null;

        return (
          <div key={strategy.id} className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className={`text-lg font-semibold ${themes[theme].text}`}>{strategy.name}</h3>
                  <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>{strategy.description}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        strategy.category === 'bullish'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                          : strategy.category === 'bearish'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                            : strategy.category === 'neutral'
                              ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100'
                      }`}
                    >
                      {strategy.category === 'bullish'
                        ? '看涨'
                        : strategy.category === 'bearish'
                          ? '看跌'
                          : strategy.category === 'neutral'
                            ? '中性'
                            : '波动'}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        strategy.riskLevel === 'low'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                          : strategy.riskLevel === 'medium'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                      }`}
                    >
                      {strategy.riskLevel === 'low' ? '低风险' : strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                    </span>
                    <span className={`text-sm ${themes[theme].text} opacity-75`}>{filteredPositions.length} 个持仓</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {strategy.profitLoss >= 0 ? '+' : ''}
                    {formatCurrency(Math.abs(strategy.profitLoss), currencyConfig, 4)}
                  </p>
                  <p className={`text-sm ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({strategy.profitLossPercentage >= 0 ? '+' : ''}
                    {strategy.profitLossPercentage.toFixed(2)}%)
                  </p>
                  <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>当前价值: {formatCurrency(strategy.currentValue, currencyConfig, 4)}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                {(() => {
                  const callPositions = filteredPositions.filter(pos => (pos.type === 'call' || pos.contract_type_zh === 'call'));
                  const putPositions = filteredPositions.filter(pos => (pos.type === 'put' || pos.contract_type_zh === 'put'));
                  const spreadPositions = filteredPositions.filter(pos => !['call', 'put'].includes(pos.type));

                  return (
                    <div className="space-y-6">
                      {(callPositions.length > 0 || putPositions.length > 0) && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-4 h-4 bg-green-500 rounded"></div>
                              <h4 className={`text-lg font-semibold ${themes[theme].text}`}>Call期权 ({callPositions.length})</h4>
                            </div>
                            <div className="space-y-3">
                              {callPositions.map((position) => {
                                const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);

                                return (
                                  <div
                                    key={position.id}
                                    className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor} ${getRowHighlightClass(position)}`}
                                  >
                                    <div className="flex justify-between items-start">
                                      <div className="flex items-start space-x-3">
                                        {getTypeIcon(position.type)}
                                        <div>
                                          <div className="flex items-center gap-2 mb-1">
                                            <div className={`text-sm font-medium ${themes[theme].text}`}>{position.symbol} {position.strike}</div>
                                            <div className="flex items-center gap-1">
                                              {positionInfo.icon}
                                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>{positionInfo.label}</span>
                                              {(() => {
                                                const tag = getMoneynessTag(position);
                                                return tag ? (
                                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.className}`}>{tag.label}</span>
                                                ) : null;
                                              })()}
                                            </div>
                                          </div>
                                          <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                            到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                          </div>
                                          <div className="flex items-center gap-3 mt-2 text-xs">
                                            <span className={`${themes[theme].text} opacity-75`}>数量: {position.quantity}</span>
                                            <span className={`${themes[theme].text} opacity-75`}>权利金: {formatCurrency(position.premium, currencyConfig, 4)}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {position.profitLoss >= 0 ? '+' : ''}
                                          {formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                        </div>
                                        <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          ({position.profitLossPercentage >= 0 ? '+' : ''}
                                          {position.profitLossPercentage.toFixed(2)}%)
                                        </div>
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                          {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                        </span>
                                        {isSelectingExpiry(position.expiry) && (
                                          <div className="mt-2 flex items-center justify-end gap-2">
                                            <label className={`text-xs ${themes[theme].text} opacity-75 flex items-center gap-1`}>
                                              <input
                                                type="checkbox"
                                                checked={!!selectedLegs[position.id]}
                                                onChange={(e) => setPositionSelected(position.id, e.target.checked)}
                                              />
                                              选择
                                            </label>
                                            {!!selectedLegs[position.id] && (
                                              <input
                                                type="number"
                                                min={1}
                                                max={position.quantity}
                                                value={selectedLegs[position.id]}
                                                onChange={(e) => {
                                                  const val = parseInt(e.target.value) || 1;
                                                  const clamped = Math.max(1, Math.min(val, position.quantity));
                                                  updateSelectedQuantity(position.id, clamped);
                                                }}
                                                className={`w-20 px-2 py-1 rounded text-xs ${themes[theme].input} ${themes[theme].text}`}
                                              />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {callPositions.length === 0 && (
                                <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                                  <p className={`${themes[theme].text} opacity-75`}>暂无Call期权持仓</p>
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-4 h-4 bg-red-500 rounded"></div>
                              <h4 className={`text-lg font-semibold ${themes[theme].text}`}>Put期权 ({putPositions.length})</h4>
                            </div>
                            <div className="space-y-3">
                              {putPositions.map((position) => {
                                const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);

                                return (
                                  <div
                                    key={position.id}
                                    className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor} ${getRowHighlightClass(position)}`}
                                  >
                                    <div className="flex justify-between items-start">
                                      <div className="flex items-start space-x-3">
                                        {getTypeIcon(position.type)}
                                        <div>
                                          <div className="flex items-center gap-2 mb-1">
                                            <div className={`text-sm font-medium ${themes[theme].text}`}>{position.symbol} {position.strike}</div>
                                            <div className="flex items-center gap-1">
                                              {positionInfo.icon}
                                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>{positionInfo.label}</span>
                                              {(() => {
                                                const tag = getMoneynessTag(position);
                                                return tag ? (
                                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.className}`}>{tag.label}</span>
                                                ) : null;
                                              })()}
                                            </div>
                                          </div>
                                          <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                            到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                          </div>
                                          <div className="flex items-center gap-3 mt-2 text-xs">
                                            <span className={`${themes[theme].text} opacity-75`}>数量: {position.quantity}</span>
                                            <span className={`${themes[theme].text} opacity-75`}>权利金: {formatCurrency(position.premium, currencyConfig, 4)}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {position.profitLoss >= 0 ? '+' : ''}
                                          {formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                        </div>
                                        <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          ({position.profitLossPercentage >= 0 ? '+' : ''}
                                          {position.profitLossPercentage.toFixed(2)}%)
                                        </div>
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                          {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                        </span>
                                        {isSelectingExpiry(position.expiry) && (
                                          <div className="mt-2 flex items-center justify-end gap-2">
                                            <label className={`text-xs ${themes[theme].text} opacity-75 flex items-center gap-1`}>
                                              <input
                                                type="checkbox"
                                                checked={!!selectedLegs[position.id]}
                                                onChange={(e) => setPositionSelected(position.id, e.target.checked)}
                                              />
                                              选择
                                            </label>
                                            {!!selectedLegs[position.id] && (
                                              <input
                                                type="number"
                                                min={1}
                                                max={position.quantity}
                                                value={selectedLegs[position.id]}
                                                onChange={(e) => {
                                                  const val = parseInt(e.target.value) || 1;
                                                  const clamped = Math.max(1, Math.min(val, position.quantity));
                                                  updateSelectedQuantity(position.id, clamped);
                                                }}
                                                className={`w-20 px-2 py-1 rounded text-xs ${themes[theme].input} ${themes[theme].text}`}
                                              />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {putPositions.length === 0 && (
                                <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                                  <p className={`${themes[theme].text} opacity-75`}>暂无Put期权持仓</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {spreadPositions.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-4 h-4 bg-purple-500 rounded"></div>
                            <h4 className={`text-lg font-semibold ${themes[theme].text}`}>复杂策略 ({spreadPositions.length})</h4>
                          </div>
                          <div className="space-y-3">
                            {spreadPositions.map((position) => {
                              const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);

                              return (
                                <div
                                  key={`${position.id ?? 'noid'}-${position.symbol}-${position.strike}-${position.type}-${position.expiry}`}
                                  className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex items-start space-x-3">
                                      {getTypeIcon(position.type)}
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <div className={`text-sm font-medium ${themes[theme].text}`}>
                                            {position.symbol} {position.strike} {position.type.toUpperCase()}
                                          </div>
                                          <div className="flex items-center gap-1">
                                            {positionInfo.icon}
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>{positionInfo.label}</span>
                                          </div>
                                        </div>
                                        <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                          到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                        </div>
                                        <div className="flex items-center gap-3 mt-2 text-xs">
                                          <span className={`${themes[theme].text} opacity-75`}>数量: {position.quantity}</span>
                                          <span className={`${themes[theme].text} opacity-75`}>权利金: {formatCurrency(position.premium, currencyConfig, 4)}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {position.profitLoss >= 0 ? '+' : ''}
                                        {formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                      </div>
                                      <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        ({position.profitLossPercentage >= 0 ? '+' : ''}
                                        {position.profitLossPercentage.toFixed(2)}%)
                                      </div>
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                        {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                      </span>
                                      {!isSelectingExpiry(position.expiry) && !!onEditComplexPosition && (
                                        <button
                                          type="button"
                                          onClick={() => onEditComplexPosition(position as ExtendedOptionsPosition)}
                                          className="inline-flex items-center px-2 py-1 rounded text-xs bg-purple-600 text-white hover:bg-purple-700"
                                          aria-label="编辑策略"
                                        >
                                          编辑策略
                                        </button>
                                      )}
                                      {isSelectingExpiry(position.expiry) && (
                                        <div className="mt-2 flex items-center justify-end gap-2">
                                          <label className={`text-xs ${themes[theme].text} opacity-75 flex items-center gap-1`}>
                                            <input
                                              type="checkbox"
                                              checked={!!selectedLegs[position.id]}
                                              onChange={(e) => setPositionSelected(position.id, e.target.checked)}
                                            />
                                            选择
                                          </label>
                                          {!!selectedLegs[position.id] && (
                                            <input
                                              type="number"
                                              min={1}
                                              max={position.quantity}
                                              value={selectedLegs[position.id]}
                                              onChange={(e) => {
                                                const val = parseInt(e.target.value) || 1;
                                                const clamped = Math.max(1, Math.min(val, position.quantity));
                                                updateSelectedQuantity(position.id, clamped);
                                              }}
                                              className={`w-20 px-2 py-1 rounded text-xs ${themes[theme].input} ${themes[theme].text}`}
                                            />
                                          )}
                                        </div>
                                      )}
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
                })()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

