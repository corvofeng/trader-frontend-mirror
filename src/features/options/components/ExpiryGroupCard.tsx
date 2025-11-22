import React, { useState } from 'react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPosition, OptionsStrategy } from '../../../lib/services/types';

interface ExpiryGroupCardProps {
  theme: Theme;
  group: { expiry: string; daysToExpiry: number; single: OptionsPosition[]; complex: OptionsStrategy[] };
  statusFilter: 'all' | 'open' | 'closed' | 'expired';
  filterAndSortPositions: (positions: OptionsPosition[]) => OptionsPosition[];
  isSelectingExpiry: (expiry: string) => boolean;
  toggleExpirySelection: (expiry: string) => void;
  openSaveModal: (expiry: string) => void;
  selectedLegs: Record<string, number>;
  setPositionSelected: (positionId: string, checked: boolean) => void;
  updateSelectedQuantity: (positionId: string, qty: number) => void;
  currencyConfig: any;
  getDaysToExpiryColor: (days: number) => string;
  getTypeIcon: (type: OptionsPosition['type']) => React.ReactNode;
  getStatusColor: (status: OptionsPosition['status']) => string;
  getPositionTypeInfo2: (positionType: string, optionType: string, positionTypeZh?: string) => { icon: React.ReactNode; label: string; color: string; description?: string; borderColor: string };
  computeCombosForPositions: (strategy: OptionsStrategy, type: 'call' | 'put') => Map<number, number>;
  allExpiryBuckets: Array<{ expiry: string; daysToExpiry: number; single: OptionsPosition[]; complex: OptionsStrategy[] }>;
}

export function ExpiryGroupCard({
  theme,
  group,
  statusFilter,
  filterAndSortPositions,
  isSelectingExpiry,
  toggleExpirySelection,
  openSaveModal,
  selectedLegs,
  setPositionSelected,
  updateSelectedQuantity,
  currencyConfig,
  getDaysToExpiryColor,
  getTypeIcon,
  getStatusColor,
  getPositionTypeInfo2,
  computeCombosForPositions,
  allExpiryBuckets,
}: ExpiryGroupCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const filteredPositions = filterAndSortPositions(group.single);
  if (filteredPositions.length === 0) return null;

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
              到期日: {format(new Date(group.expiry), 'yyyy年MM月dd日')}
            </h3>
            <div className="flex items-center gap-4 mt-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDaysToExpiryColor(group.daysToExpiry)}`}>
                {group.daysToExpiry > 0 ? `${group.daysToExpiry}天后到期` : '已到期'}
              </span>
              <span className={`text-sm ${themes[theme].text} opacity-75`}>
                {filteredPositions.length} 个持仓
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setDetailsOpen(!detailsOpen)}
                className={`px-3 py-1 rounded text-xs ${themes[theme].secondary}`}
              >
                {detailsOpen ? '收起详情' : '展开详情'}
              </button>
              <button
                onClick={() => toggleExpirySelection(group.expiry)}
                className={`px-3 py-1 rounded text-xs ${themes[theme].secondary}`}
              >
                {isSelectingExpiry(group.expiry) ? '退出选择' : '选择此到期日'}
              </button>
              {isSelectingExpiry(group.expiry) && (
                <button
                  onClick={() => openSaveModal(group.expiry)}
                  className="px-3 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700"
                >
                  构建组合并保存
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          {(() => {
            const callPositions = filteredPositions.filter(pos => (pos.type === 'call' || (pos.contract_type_zh as any) === 'call'));
            const putPositions = filteredPositions.filter(pos => (pos.type === 'put' || (pos.contract_type_zh as any) === 'put'));

            return (
              <div className="space-y-6">
                {filteredPositions.length > 0 && (
                  <div className="mt-0">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 bg-gray-500 rounded"></div>
                      <h4 className={`text-lg font-semibold ${themes[theme].text}`}>持仓T型数量看板</h4>
                    </div>
                    <div className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
                      {(() => {
                        const strikes = Array.from(new Set(filteredPositions.map(p => p.strike))).sort((a, b) => a - b);
                        const rows = strikes.map(strike => {
                          const callSell = filteredPositions
                            .filter(p => p.strike === strike && p.type === 'call' && p.position_type === 'sell')
                            .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                          const putSell = filteredPositions
                            .filter(p => p.strike === strike && p.type === 'put' && p.position_type === 'sell')
                            .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                          return { strike, callSell, putSell };
                        });
                        const hasData = filteredPositions.length > 0;
                        if (!hasData) {
                          return (
                            <div className={`text-center text-sm ${themes[theme].text} opacity-75`}>暂无数据</div>
                          );
                        }
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className={`${themes[theme].text} opacity-75`}>
                                  <th className="text-center py-2" colSpan={4}>Calls</th>
                                  <th className={`text-center py-2 border-l border-r ${themes[theme].border}`}></th>
                                  <th className="text-center py-2" colSpan={4}>Puts</th>
                                </tr>
                                <tr className={`text-xs ${themes[theme].text} opacity-70`}>
                                  <th className="text-center py-2">Call 权利</th>
                                  <th className="text-center py-2">Call 备兑</th>
                                  <th className="text-center py-2">Call 义务</th>
                                  <th className={`text-center py-2 px-3 border-r ${themes[theme].border}`}>Call 组合</th>
                                  <th className="text-center py-2 px-4">行权价</th>
                                  <th className={`text-center py-2 px-3 border-l ${themes[theme].border}`}>Put 组合</th>
                                  <th className="text-center py-2">Put 权利</th>
                                  <th className="text-center py-2">Put 备兑</th>
                                  <th className="text-center py-2">Put 义务</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${themes[theme].border}`}>
                                {(() => {
                                  const callCombos = new Map<number, number>();
                                  const putCombos = new Map<number, number>();
                                  (allExpiryBuckets || []).forEach(bucket => {
                                    bucket.complex.forEach(s => {
                                      if (s.positions.some(p => p.expiry === group.expiry)) {
                                        const c = computeCombosForPositions(s, 'call');
                                        const p = computeCombosForPositions(s, 'put');
                                        c.forEach((v, k) => callCombos.set(k, (callCombos.get(k) ?? 0) + v));
                                        p.forEach((v, k) => putCombos.set(k, (putCombos.get(k) ?? 0) + v));
                                      }
                                    });
                                  });
                                  return rows.map(row => {
                                    const s = row.strike;
                                    const callRight = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'buy')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const callCovered = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const callNormal = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putNormal = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putCovered = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putRight = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'buy')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const comboCallQty = callCombos.get(s) ?? 0;
                                    const comboPutQty = putCombos.get(s) ?? 0;
                                    return (
                                      <tr key={`trow-top-${group.expiry}-${s}`} className={themes[theme].cardHover}>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{callRight}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{callCovered}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{callNormal}</td>
                                        <td className={`text-center py-2 px-3 w-20 border-r ${themes[theme].border} ${themes[theme].text}`}>{comboCallQty}</td>
                                        <td className={`text-center py-2 px-4 w-24 ${themes[theme].text}`}>{s}</td>
                                        <td className={`text-center py-2 px-3 w-20 border-l ${themes[theme].border} ${themes[theme].text}`}>{comboPutQty}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{putRight}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{putCovered}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{putNormal}</td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {detailsOpen && (callPositions.length > 0 || putPositions.length > 0) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-4 h-4 bg-green-500 rounded"></div>
                        <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                          Call期权 ({callPositions.length})
                        </h4>
                      </div>
                      <div className="space-y-3">
                        {callPositions.map((position) => {
                          const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                          return (
                            <div 
                              key={position.id}
                              className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex items-start space-x-3">
                                  {getTypeIcon(position.type)}
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <div className={`text-sm font-medium ${themes[theme].text}`}>
                                        {position.symbol} {position.strike}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {positionInfo.icon}
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                          {positionInfo.label}
                                        </span>
                                      </div>
                                    </div>
                                    <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                      {position.strategy} • {positionInfo.description}
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-xs">
                                      <span className={`${themes[theme].text} opacity-75`}>
                                        数量: {position.quantity}
                                      </span>
                                      <span className={`${themes[theme].text} opacity-75`}>
                                        权利金: {formatCurrency(position.premium, currencyConfig)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                  </div>
                                  <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                  </div>
                                  <div className="flex items-center justify-end gap-2 mt-1">
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                                      {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                    </span>
                                    {!isSelectingExpiry(position.expiry) && (
                                      <button
                                        type="button"
                                        onClick={() => setPositionSelected(position.id, true)}
                                        className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700"
                                        aria-label="加入策略"
                                      >
                                        加入策略
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
                            </div>
                          );
                        })}
                        {callPositions.length === 0 && (
                          <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                            <p className={`${themes[theme].text} opacity-75`}>
                              暂无Call期权持仓
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-4 h-4 bg-red-500 rounded"></div>
                        <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                          Put期权 ({putPositions.length})
                        </h4>
                      </div>
                      <div className="space-y-3">
                        {putPositions.map((position) => {
                          const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                          return (
                            <div 
                              key={position.id}
                              className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex items-start space-x-3">
                                  {getTypeIcon(position.type)}
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <div className={`text-sm font-medium ${themes[theme].text}`}>
                                        {position.symbol} {position.strike}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {positionInfo.icon}
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                          {positionInfo.label}
                                        </span>
                                      </div>
                                    </div>
                                    <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                      {position.strategy} • {positionInfo.description}
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-xs">
                                      <span className={`${themes[theme].text} opacity-75`}>
                                        数量: {position.quantity}
                                      </span>
                                      <span className={`${themes[theme].text} opacity-75`}>
                                        权利金: {formatCurrency(position.premium, currencyConfig)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                  </div>
                                  <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                  </div>
                                  <div className="flex items-center justify-end gap-2 mt-1">
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                                      {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                    </span>
                                    {!isSelectingExpiry(position.expiry) && (
                                      <button
                                        type="button"
                                        onClick={() => setPositionSelected(position.id, true)}
                                        className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700"
                                        aria-label="加入策略"
                                      >
                                        加入策略
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
                            </div>
                          );
                        })}
                        {putPositions.length === 0 && (
                          <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                            <p className={`${themes[theme].text} opacity-75`}>
                              暂无Put期权持仓
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detailsOpen && (group.complex && group.complex.length > 0) && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-4 h-4 bg-purple-500 rounded"></div>
                      <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                        复杂策略 ({group.complex.length})
                      </h4>
                    </div>
                    <div className="space-y-3">
                      {group.complex.map((strategy) => {
                        const positions = filterAndSortPositions(strategy.positions)
                          .filter(position => statusFilter === 'all' || position.status === statusFilter);
                        if (positions.length === 0) return null;
                        const legCount = positions.length;
                        const callCombosByStrike = computeCombosForPositions(strategy, 'call');
                        const putCombosByStrike = computeCombosForPositions(strategy, 'put');
                        const comboCount = Array.from(callCombosByStrike.values()).reduce((sum, v) => sum + v, 0) +
                          Array.from(putCombosByStrike.values()).reduce((sum, v) => sum + v, 0);
                        return (
                          <div key={strategy.id} className={`${themes[theme].background} rounded-lg p-4 border-l-4 border-purple-500`}>
                            <div className="flex items-center justify-between mb-3">
                              <div className={`text-sm ${themes[theme].text} opacity-75`}>
                                {strategy.name} （{legCount} 腿，组合数 {comboCount}）
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  总成本: {formatCurrency(strategy.totalCost, currencyConfig)}
                                </div>
                                <div className={`text-sm ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  盈亏: {strategy.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(strategy.profitLoss), currencyConfig)}
                                </div>
                              </div>
                            </div>
                            <div className="grid gap-3">
                              {positions.map((position) => {
                                const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                                return (
                                  <div key={`${position.id ?? 'noid'}-${position.symbol}-${position.strike}-${position.type}-${position.expiry}`} className={`${themes[theme].card} rounded-lg p-3 border ${themes[theme].border}`}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                          {positionInfo.icon}
                                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                            {positionInfo.label}
                                          </span>
                                        </div>
                                        <div>
                                          <div className={`text-sm font-medium ${themes[theme].text}`}>
                                            {position.symbol} {position.strike} {position.type.toUpperCase()}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className={`text-sm font-medium ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                        </div>
                                        <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                          数量: {position.quantity} | 成本: {formatCurrency(position.premium * position.quantity * 100, currencyConfig)}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detailsOpen && filteredPositions.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 bg-gray-500 rounded"></div>
                      <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                        T型报价（权利/义务/备兑/组合数量）
                      </h4>
                    </div>
                    <div className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
                      {(() => {
                        const strikes = Array.from(new Set(filteredPositions.map(p => p.strike))).sort((a, b) => a - b);
                        const rows = strikes.map(strike => {
                          const callSell = filteredPositions
                            .filter(p => p.strike === strike && p.type === 'call' && p.position_type === 'sell')
                            .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                          const putSell = filteredPositions
                            .filter(p => p.strike === strike && p.type === 'put' && p.position_type === 'sell')
                            .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                          return { strike, callSell, putSell };
                        });
                        const hasData = filteredPositions.length > 0;
                        if (!hasData) {
                          return (
                            <div className={`text-center text-sm ${themes[theme].text} opacity-75`}>
                              暂无数据
                            </div>
                          );
                        }
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className={`${themes[theme].text} opacity-75`}>
                                  <th className="text-center py-2" colSpan={4}>Calls</th>
                                  <th className={`text-center py-2 border-l border-r ${themes[theme].border}`}></th>
                                  <th className="text-center py-2" colSpan={4}>Puts</th>
                                </tr>
                                <tr className={`text-xs ${themes[theme].text} opacity-70`}>
                                  <th className="text-center py-2">Call 权利</th>
                                  <th className="text-center py-2">Call 备兑</th>
                                  <th className="text-center py-2">Call 义务</th>
                                  <th className={`text-center py-2 px-3 border-r ${themes[theme].border}`}>Call 组合</th>
                                  <th className="text-center py-2 px-4">行权价</th>
                                  <th className={`text-center py-2 px-3 border-l ${themes[theme].border}`}>Put 组合</th>
                                  <th className="text-center py-2">Put 权利</th>
                                  <th className="text-center py-2">Put 备兑</th>
                                  <th className="text-center py-2">Put 义务</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${themes[theme].border}`}>
                                {(() => {
                                  const callCombos = new Map<number, number>();
                                  const putCombos = new Map<number, number>();
                                  (allExpiryBuckets || []).forEach(bucket => {
                                    bucket.complex.forEach(s => {
                                      if (s.positions.some(p => p.expiry === group.expiry)) {
                                        const c = computeCombosForPositions(s, 'call');
                                        const p = computeCombosForPositions(s, 'put');
                                        c.forEach((v, k) => callCombos.set(k, (callCombos.get(k) ?? 0) + v));
                                        p.forEach((v, k) => putCombos.set(k, (putCombos.get(k) ?? 0) + v));
                                      }
                                    });
                                  });
                                  return rows.map(row => {
                                    const s = row.strike;
                                    const callRight = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'buy')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const callCovered = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const callNormal = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putNormal = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putCovered = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putRight = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'buy')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const comboCallQty = callCombos.get(s) ?? 0;
                                    const comboPutQty = putCombos.get(s) ?? 0;
                                    return (
                                      <tr key={`trow-${group.expiry}-${s}`} className={themes[theme].cardHover}>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{callRight}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{callCovered}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{callNormal}</td>
                                        <td className={`text-center py-2 px-3 w-20 border-r ${themes[theme].border} ${themes[theme].text}`}>{comboCallQty}</td>
                                        <td className={`text-center py-2 px-4 w-24 ${themes[theme].text}`}>{s}</td>
                                        <td className={`text-center py-2 px-3 w-20 border-l ${themes[theme].border} ${themes[theme].text}`}>{comboPutQty}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{putRight}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{putCovered}</td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>{putNormal}</td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
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
}