import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPosition, OptionsStrategy } from '../../../lib/services/types';
import { optionsService } from '../../../lib/services';
import { stockService } from '../../../lib/services';
import { logger } from '../../../shared/utils/logger';

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
  selectedSymbol: string;
  underlyingPrice: number | null;
  onClosePositions: (ids: string[], meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string }, overrides?: Record<string, number>) => Promise<void>;
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
  selectedSymbol,
  underlyingPrice,
  onClosePositions,
}: ExpiryGroupCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ ids: string[]; meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string; defaultComboCount?: number; perLegMaxQty?: Record<string, number> }; title: string; description: string } | null>(null);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const basePositions = filterAndSortPositions(group.single);
  const filteredPositions = selectedSymbol
    ? basePositions.filter(p => p.opt_undl_code_full === selectedSymbol)
    : basePositions;
  if (filteredPositions.length === 0) return null;

  const isSelectedPosition = (p: OptionsPosition) => {
    return !!selectedSymbol && (p.opt_undl_code_full === selectedSymbol);
  };

  const getHighlightClass = (p: OptionsPosition) => {
    if (!isSelectedPosition(p) || underlyingPrice == null) return '';
    const isCall = (p.type === 'call' || (p.contract_type_zh as any) === 'call');
    const thr = 0.005;
    const diffRatio = Math.abs(underlyingPrice - p.strike) / Math.max(p.strike, 1);
    const isATM = diffRatio <= thr;
    const isITM = isCall ? (underlyingPrice > p.strike) : (underlyingPrice < p.strike);
    if (isATM) return 'bg-blue-50 dark:bg-blue-900/30 border-blue-300';
    if (p.position_type === 'sell' && isITM) return 'bg-red-50 dark:bg-red-900/30 border-red-300';
    if (p.position_type === 'buy' && !isITM) return 'bg-amber-50 dark:bg-amber-900/30 border-amber-300';
    return 'bg-green-50 dark:bg-green-900/30 border-green-300';
  };

  const collectIdsForCategory = (
    category: 'call_normal' | 'put_normal' | 'call_right' | 'put_right' | 'call_covered' | 'put_covered',
    strike: number
  ): string[] => {
    const isCallLeg = (p: OptionsPosition) => {
      const t = String(p.type || '').toLowerCase();
      const zh = String((p as any).contract_type_zh || '');
      return t === 'call' || zh.toLowerCase() === 'call' || zh.includes('认购') || zh.includes('购');
    };
    const isPutLeg = (p: OptionsPosition) => {
      const t = String(p.type || '').toLowerCase();
      const zh = String((p as any).contract_type_zh || '');
      return t === 'put' || zh.toLowerCase() === 'put' || zh.includes('认沽') || zh.includes('沽');
    };
    const ids = (filteredPositions || [])
      .filter(p => {
        const isCall = isCallLeg(p);
        const isPut = isPutLeg(p);
        const isSell = p.position_type === 'sell';
        const isBuy = p.position_type === 'buy';
        const isCovered = p.position_type_zh === '备兑';
        const sameStrike = p.strike === strike;
        const sameExpiry = p.expiry === group.expiry;
        if (!sameStrike || !sameExpiry) return false;
        if (category === 'call_normal') return isCall && isSell && !isCovered;
        if (category === 'put_normal') return isPut && isSell && !isCovered;
        if (category === 'call_right') return isCall && isBuy;
        if (category === 'put_right') return isPut && isBuy;
        if (category === 'call_covered') return isCall && isSell && isCovered;
        if (category === 'put_covered') return isPut && isSell && isCovered;
        return false;
      })
      .map(p => p.id);
    logger.debug('[ExpiryGroupCard] collectIdsForCategory', { category, strike, count: ids.length });
    return ids;
  };

  const openConfirmFor = (
    category: 'call_normal' | 'put_normal' | 'call_right' | 'put_right' | 'call_covered' | 'put_covered',
    strike: number,
    title: string,
    descriptionPrefix: string
  ) => {
    const ids = collectIdsForCategory(category, strike);
    const description = `${descriptionPrefix} @${strike}（到期 ${format(new Date(group.expiry), 'yyyy-MM-dd')}），数量 ${ids.length}`;
    logger.info('[ExpiryGroupCard] openConfirmFor: setConfirmData', { category, strike, ids });
    setConfirmData({
      ids,
      meta: { action: 'close_category', category, strike, expiry: group.expiry },
      title,
      description
    });
  };

  useEffect(() => {
    if (!confirmData) {
      setQtyOverrides({});
      return;
    }
    if (confirmData.meta?.action === 'unwind_combo') {
      const defaultCount = Number(confirmData.meta?.defaultComboCount || 0);
      const next: Record<string, number> = {};
      confirmData.ids.forEach(id => {
        next[id] = defaultCount;
      });
      setQtyOverrides(next);
      logger.info('[ExpiryGroupCard] init combo overrides', { defaultCount, ids: confirmData.ids });
    } else {
      const map: Record<string, number> = {};
      confirmData.ids.forEach(id => {
        const pos = filteredPositions.find(x => x.id === id);
        const qty = Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity);
        map[id] = qty;
      });
      setQtyOverrides(map);
    }
  }, [confirmData]);

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
              {selectedSymbol && underlyingPrice != null && (
                <div className={`text-sm ${themes[theme].text}`}>标的价 {underlyingPrice.toFixed(2)}</div>
              )}
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
                                  <th className="text-center py-2">Call 组合</th>
                                  <th className="text-center py-2">Call 备兑</th>
                                  <th className="text-center py-2">Call 义务</th>
                                  <th className={`text-center py-2 px-3 border-r ${themes[theme].border}`}>Call 权利</th>
                                  <th className="text-center py-2 px-4">行权价</th>
                                  <th className={`text-center py-2 px-3 border-l ${themes[theme].border}`}>Put 权利</th>
                                  <th className="text-center py-2">Put 义务</th>
                                  <th className="text-center py-2">Put 备兑</th>
                                  <th className="text-center py-2">Put 组合</th>
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
                                  const metrics = rows.map(row => {
                                    const s = row.strike;
                                    const getM = () => {
                                      if (underlyingPrice == null) return '';
                                      const thr = 0.005;
                                      const diffRatio = Math.abs(underlyingPrice - s) / Math.max(s, 1);
                                      if (diffRatio <= thr) return 'ATM';
                                      const isCallITM = underlyingPrice > s;
                                      const isPutITM = underlyingPrice < s;
                                      return `${isCallITM ? 'Call:ITM' : 'Call:OTM'} | ${isPutITM ? 'Put:ITM' : 'Put:OTM'}`;
                                    };
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
                                    let risk = 0;
                                    if (underlyingPrice != null) {
                                      const up = underlyingPrice;
                                      const cr = Math.max(0, (up - s) / Math.max(s, 1));
                                      const pr = Math.max(0, (s - up) / Math.max(s, 1));
                                      const wCovered = 0.3;
                                      const wCombo = 0.2;
                                      const shortCall = callNormal + callCovered * wCovered + comboCallQty * wCombo;
                                      const shortPut = putNormal + putCovered * wCovered + comboPutQty * wCombo;
                                      risk = shortCall * cr + shortPut * pr;
                                      const near = Math.max(0, 0.02 - Math.abs(up - s) / Math.max(s, 1)) / 0.02;
                                      risk += near * (callNormal + putNormal) * 0.5;
                                    }
                                    return { s, getM, callRight, callNormal, callCovered, comboCallQty, putRight, putNormal, putCovered, comboPutQty, risk };
                                  });
                                  const maxRisk = Math.max(1, ...metrics.map(m => m.risk));
                                  return metrics.map(m => {
                                    const intensity = Math.min(1, m.risk / maxRisk);
                                    const h = Math.round(0 + 120 * (1 - intensity));
                                    const c = theme === 'dark' ? `hsla(${h},70%,30%,0.35)` : `hsla(${h},85%,85%,0.65)`;
                                    const bg = `linear-gradient(to right, ${c} 0%, transparent 100%)`;
                                    return (
                                      <tr key={`trow-top-${group.expiry}-${m.s}`} className={themes[theme].cardHover} style={{ backgroundImage: bg }}>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          {m.comboCallQty}
                                          {m.comboCallQty > 0 && (
                                            <div className="mt-1">
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => {
                                                  const ids: string[] = [];
                                                  const strategyIds: string[] = [];
                                                  let defaultComboCountSum = 0;
                                                  const perLegMaxQty: Record<string, number> = {};
                                                  (allExpiryBuckets || []).forEach(bucket => {
                                                    bucket.complex.forEach(s => {
                                                      if (
                                                        s.positions.some(p => p.expiry === group.expiry) &&
                                                        s.name.includes('认购牛市价差策略') &&
                                                        (s.positions[0]?.type === 'call' || (s.positions[0]?.contract_type_zh as any) === 'call')
                                                      ) {
                                                        const buyLeg = s.positions.find(p => p.position_type === 'buy');
                                                        const buyStrike = Number((buyLeg as any)?.contract_strike_price ?? buyLeg?.strike);
                                                        if (buyLeg && buyStrike === m.s) {
                                                          ids.push(
                                                            ...s.positions
                                                              .filter(p => p.expiry === group.expiry)
                                                              .map(p => p.id)
                                                          );
                                                          strategyIds.push(s.id as any);
                                                          const comboMap = computeCombosForPositions(s, 'call');
                                                          defaultComboCountSum += comboMap.get(m.s) || 0;
                                                          s.positions
                                                            .filter(p => p.expiry === group.expiry)
                                                            .forEach(p => { perLegMaxQty[p.id] = p.quantity; });
                                                        }
                                                      }
                                                    });
                                                  });
                                                  const uniqueIds = Array.from(new Set(ids));
                                                  const uniqueStrategyIds = Array.from(new Set(strategyIds));
                                                  if (uniqueIds.length > 0) {
                                                    setConfirmData({
                                                      ids: uniqueIds,
                                                      meta: { action: 'unwind_combo', comboType: 'call', strike: m.s, expiry: group.expiry, strategyIds: uniqueStrategyIds, defaultComboCount: defaultComboCountSum, perLegMaxQty },
                                                      title: '确认解除组合',
                                                      description: `将解除组合：CALL 组合 @${m.s}（到期 ${format(new Date(group.expiry), 'yyyy-MM-dd')}），涉及腿数 ${uniqueIds.length}`
                                                    });
                                                  }
                                                }}
                                              >解除组合</button>
                                            </div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          {m.callCovered}
                                          {m.callCovered > 0 && (
                                            <div className="mt-1">
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openConfirmFor('call_covered', m.s, '确认平仓', '将平仓：Call 备兑')}
                                              >调平</button>
                                            </div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          {m.callNormal}
                                          {m.callNormal > 0 && (
                                            <div className="mt-1">
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openConfirmFor('call_normal', m.s, '确认平仓', '将平仓：Call 义务')}
                                              >调平</button>
                                            </div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 px-3 w-20 border-r ${themes[theme].border} ${themes[theme].text}`}>
                                          {m.callRight}
                                          {m.callRight > 0 && (
                                            <div className="mt-1">
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openConfirmFor('call_right', m.s, '确认平仓', '将平仓：Call 权利')}
                                              >调平</button>
                                            </div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 px-4 w-24 ${themes[theme].text}`}>{m.s}
                                          {underlyingPrice != null && (
                                            <div className={`mt-1 text-[10px] opacity-75`}>{m.getM()}</div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 px-3 w-20 border-l ${themes[theme].border} ${themes[theme].text}`}>
                                          {m.putRight}
                                          {m.putRight > 0 && (
                                            <div className="mt-1">
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openConfirmFor('put_right', m.s, '确认平仓', '将平仓：Put 权利')}
                                              >调平</button>
                                            </div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          {m.putNormal}
                                          {m.putNormal > 0 && (
                                            <div className="mt-1">
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openConfirmFor('put_normal', m.s, '确认平仓', '将平仓：Put 义务')}
                                              >调平</button>
                                            </div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          {m.putCovered}
                                          {m.putCovered > 0 && (
                                            <div className="mt-1">
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openConfirmFor('put_covered', m.s, '确认平仓', '将平仓：Put 备兑')}
                                              >调平</button>
                                            </div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          {m.comboPutQty}
                                          {m.comboPutQty > 0 && (
                                            <div className="mt-1">
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => {
                                                  const ids: string[] = [];
                                                  const strategyIds: string[] = [];
                                                  let defaultComboCountSum = 0;
                                                  const perLegMaxQty: Record<string, number> = {};
                                                  (allExpiryBuckets || []).forEach(bucket => {
                                                    bucket.complex.forEach(s => {
                                                      if (
                                                        s.positions.some(p => p.expiry === group.expiry) &&
                                                        s.name.includes('认沽熊市价差策略') &&
                                                        (s.positions[0]?.type === 'put' || (s.positions[0]?.contract_type_zh as any) === 'put')
                                                      ) {
                                                        const buyLeg = s.positions.find(p => p.position_type === 'buy');
                                                        const buyStrike = Number((buyLeg as any)?.contract_strike_price ?? buyLeg?.strike);
                                                        if (buyLeg && buyStrike === m.s) {
                                                          ids.push(
                                                            ...s.positions
                                                              .filter(p => p.expiry === group.expiry)
                                                              .map(p => p.id)
                                                          );
                                                          strategyIds.push(s.id as any);
                                                          const comboMap = computeCombosForPositions(s, 'put');
                                                          defaultComboCountSum += comboMap.get(m.s) || 0;
                                                          s.positions
                                                            .filter(p => p.expiry === group.expiry)
                                                            .forEach(p => { perLegMaxQty[p.id] = p.quantity; });
                                                        }
                                                      }
                                                    });
                                                  });
                                                  const uniqueIds = Array.from(new Set(ids));
                                                  const uniqueStrategyIds = Array.from(new Set(strategyIds));
                                                  if (uniqueIds.length > 0) {
                                                    setConfirmData({
                                                      ids: uniqueIds,
                                                      meta: { action: 'unwind_combo', comboType: 'put', strike: m.s, expiry: group.expiry, strategyIds: uniqueStrategyIds, defaultComboCount: defaultComboCountSum, perLegMaxQty },
                                                      title: '确认解除组合',
                                                      description: `将解除组合：PUT 组合 @${m.s}（到期 ${format(new Date(group.expiry), 'yyyy-MM-dd')}），涉及腿数 ${uniqueIds.length}`
                                                    });
                                                  }
                                                }}
                                              >解除组合</button>
                                            </div>
                                          )}
                                        </td>
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
                              className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} border-l-4 ${positionInfo.borderColor} ${getHighlightClass(position)}`}
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
                              className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} border-l-4 ${positionInfo.borderColor} ${getHighlightClass(position)}`}
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

                
              </div>
            );
          })()}
        </div>
      </div>
  {confirmData && (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmData(null)}></div>
      <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md rounded-lg border ${themes[theme].card} ${themes[theme].border} p-6`}>
        <div className={`text-lg font-semibold ${themes[theme].text}`}>{confirmData.title}</div>
        <div className={`mt-2 text-sm ${themes[theme].text}`}>{confirmData.description}</div>
        <div className="mt-4 max-h-56 overflow-auto space-y-2">
          {confirmData.meta?.action === 'unwind_combo' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className={`text-sm ${themes[theme].text}`}>组合数</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={Object.values(qtyOverrides).reduce((m, v) => Math.max(m, v || 1), 1)}
                    value={Object.values(qtyOverrides)[0] || 1}
                    onChange={(e) => {
                      const n = parseInt(e.target.value) || 1;
                      const maxAll = Object.values(qtyOverrides).reduce((m, v) => Math.max(m, v || 1), 1);
                      const clamped = Math.max(1, Math.min(n, maxAll));
                      setQtyOverrides(() => {
                        const next: Record<string, number> = {};
                        confirmData.ids.forEach(id => {
                          const pos = filteredPositions.find(x => x.id === id);
                          const maxQty = pos?.quantity ?? 1;
                          next[id] = Math.max(1, Math.min(clamped, maxQty));
                        });
                        return next;
                      });
                      logger.info('[ExpiryGroupCard] combo change', { count: clamped });
                    }}
                    className={`w-24 px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                  />
                  <span className={`text-[10px] ${themes[theme].text} opacity-60`}>最大 {Object.values(qtyOverrides).reduce((m, v) => Math.max(m, v || 1), 1)}</span>
                </div>
              </div>
              <div className="space-y-2">
                {confirmData.ids.map(id => {
                  const pos = filteredPositions.find(x => x.id === id);
                  const maxQty = pos?.quantity ?? 1;
                  const val = qtyOverrides[id] ?? 1;
                  return (
                    <div key={`confirm-pos-${id}`} className="flex items-center justify-between">
                      <div className={`text-xs ${themes[theme].text}`}>
                        {pos ? `${pos.symbol} ${pos.strike} ${pos.type.toUpperCase()} ${pos.position_type === 'buy' ? '权利' : (pos.position_type_zh === '备兑' ? '备兑' : '义务')}` : id}
                      </div>
                      <div className={`text-xs ${themes[theme].text} opacity-60`}>数量 {val}（最大 {maxQty}）</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            (() => {
              const items = confirmData.ids.map(id => {
                const pos = filteredPositions.find(x => x.id === id);
                const val = qtyOverrides[id] ?? Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity);
                return (
                  <div key={`confirm-pos-${id}`} className="flex items-center justify-between gap-2">
                    <div className={`text-xs ${themes[theme].text}`}>
                      {pos ? `${pos.symbol} ${pos.strike} ${pos.type.toUpperCase()} ${pos.position_type === 'buy' ? '权利' : (pos.position_type_zh === '备兑' ? '备兑' : '义务')}` : id}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={val}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          setQtyOverrides(prev => ({ ...prev, [id]: n }));
                        }}
                        className={`w-20 px-2 py-1 rounded text-xs ${themes[theme].input} ${themes[theme].text}`}
                      />
                    </div>
                  </div>
                );
              });
              return <div className="space-y-2">{items}</div>;
            })()
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className={`px-3 py-2 rounded-md text-sm ${themes[theme].secondary}`}
            onClick={() => setConfirmData(null)}
          >取消</button>
          <button
            className={`px-3 py-2 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700`}
            onClick={async () => {
              await onClosePositions(confirmData.ids, confirmData.meta, qtyOverrides);
              setConfirmData(null);
            }}
          >确认执行</button>
        </div>
      </div>
    </div>
  )}
</div>
);
}
