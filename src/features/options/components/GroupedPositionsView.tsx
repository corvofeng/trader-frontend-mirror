import type { ReactNode } from 'react';
import { Hash, Layers, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { CurrencyConfig } from '../../../shared/types/ui';
import type { OptionsPosition } from '../../../lib/services/types';

type ExtendedOptionsPosition = OptionsPosition & {
  strategy_id?: string;
  is_single_leg?: boolean;
};

interface GroupedPositionsViewProps {
  theme: Theme;
  currencyConfig: CurrencyConfig;
  groupedStrategies: Map<string, ExtendedOptionsPosition[]>;
  singleLegs: ExtendedOptionsPosition[];
  getPositionTypeInfo2: (positionType: string, optionType: string, positionTypeZh?: string, isCovered?: boolean) => { icon: ReactNode; label: string; color: string; description?: string; borderColor: string };
  getStatusColor: (status: OptionsPosition['status']) => string;
}

export function GroupedPositionsView({
  theme,
  currencyConfig,
  groupedStrategies,
  singleLegs,
  getPositionTypeInfo2,
  getStatusColor
}: GroupedPositionsViewProps) {
  return (
    <div className="space-y-8">
      {groupedStrategies.size > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-purple-500" />
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>策略组合 ({groupedStrategies.size} 个策略)</h3>
          </div>
          <div className="space-y-6">
            {Array.from(groupedStrategies.entries()).map(([strategyId, positions]) => (
              <div key={strategyId} className={`${themes[theme].background} rounded-lg p-4 border-l-4 border-purple-500`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-purple-500" />
                    <span className={`text-sm font-mono ${themes[theme].text} bg-purple-100 dark:bg-purple-900 px-2 py-1 rounded`}>{strategyId}</span>
                    <span className={`text-sm ${themes[theme].text} opacity-75`}>
                      {positions[0].strategy} ({positions.length} 腿)
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${themes[theme].text}`}>
                      总成本: {formatCurrency(positions.reduce((sum, p) => sum + p.premium * p.quantity * 100, 0), currencyConfig)}
                    </div>
                    <div className={`text-sm ${positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      盈亏: {positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? '+' : ''}
                      {formatCurrency(Math.abs(positions.reduce((sum, p) => sum + p.profitLoss, 0)), currencyConfig)}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3">
                  {positions.map((position) => {
                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
                    const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={position.id} className={`${themes[theme].card} rounded-lg p-3 border ${themes[theme].border}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              {positionInfo.icon}
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>{positionInfo.label}</span>
                            </div>
                            <div>
                              <div className={`text-sm font-medium ${themes[theme].text}`}>
                                {position.symbol} {position.strike} {position.type.toUpperCase()}
                              </div>
                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-medium ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                            </div>
                            <div className={`text-xs ${themes[theme].text} opacity-60`}>
                              数量: {position.quantity} | 成本: {formatCurrency(position.premium * position.quantity * 100, currencyConfig, 4)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {singleLegs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-blue-500" />
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>单腿期权 ({singleLegs.length} 个持仓)</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <h4 className={`text-md font-medium ${themes[theme].text}`}>Call期权 ({singleLegs.filter(p => p.type === 'call').length})</h4>
              </div>
              <div className="space-y-3">
                {singleLegs.filter(p => p.type === 'call').map((position) => {
                  const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
                  const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border-l-4 ${position.position_type === 'buy' ? 'border-blue-500' : 'border-orange-500'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-mono ${themes[theme].text} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>{position.strategy_id}</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>{positionInfo.label}</span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                          {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className={`text-sm font-medium ${themes[theme].text}`}>{position.symbol} {position.strike} CALL</div>
                            <div className={`text-xs ${themes[theme].text} opacity-75`}>到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-medium ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                            </div>
                            <div className={`text-xs ${themes[theme].text} opacity-60`}>
                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>数量: </span>
                            <span className={`${themes[theme].text}`}>{position.quantity}</span>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                            <span className={`${themes[theme].text}`}>{formatCurrency(position.premium, currencyConfig, 4)}</span>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>当前值: </span>
                            <span className={`${themes[theme].text}`}>{formatCurrency(position.currentValue, currencyConfig, 4)}</span>
                          </div>
                        </div>
                        {position.notes && (
                          <div className={`text-xs ${themes[theme].text} opacity-75 mt-2 p-2 ${themes[theme].background} rounded`}>{position.notes}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {singleLegs.filter(p => p.type === 'call').length === 0 && (
                  <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                    <TrendingUp className={`w-8 h-8 mx-auto mb-2 ${themes[theme].text} opacity-40`} />
                    <p className={`text-sm ${themes[theme].text} opacity-75`}>暂无Call期权持仓</p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <h4 className={`text-md font-medium ${themes[theme].text}`}>Put期权 ({singleLegs.filter(p => p.type === 'put').length})</h4>
              </div>
              <div className="space-y-3">
                {singleLegs.filter(p => p.type === 'put').map((position) => {
                  const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
                  const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border-l-4 ${position.position_type === 'buy' ? 'border-blue-500' : 'border-orange-500'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-mono ${themes[theme].text} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>{position.strategy_id}</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>{positionInfo.label}</span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                          {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className={`text-sm font-medium ${themes[theme].text}`}>{position.symbol} {position.strike} PUT</div>
                            <div className={`text-xs ${themes[theme].text} opacity-75`}>到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-medium ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                            </div>
                            <div className={`text-xs ${themes[theme].text} opacity-60`}>
                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>数量: </span>
                            <span className={`${themes[theme].text}`}>{position.quantity}</span>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                            <span className={`${themes[theme].text}`}>{formatCurrency(position.premium, currencyConfig, 4)}</span>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>当前值: </span>
                            <span className={`${themes[theme].text}`}>{formatCurrency(position.currentValue, currencyConfig, 4)}</span>
                          </div>
                        </div>
                        {position.notes && (
                          <div className={`text-xs ${themes[theme].text} opacity-75 mt-2 p-2 ${themes[theme].background} rounded`}>{position.notes}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {singleLegs.filter(p => p.type === 'put').length === 0 && (
                  <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                    <TrendingDown className={`w-8 h-8 mx-auto mb-2 ${themes[theme].text} opacity-40`} />
                    <p className={`text-sm ${themes[theme].text} opacity-75`}>暂无Put期权持仓</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
