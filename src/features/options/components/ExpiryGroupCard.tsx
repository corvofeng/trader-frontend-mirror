import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPosition, OptionsStrategy, AdvisedCombination, OptionsData, OptionQuote } from '../../../lib/services/types';
import { optionsService } from '../../../lib/services';
import { stockService } from '../../../lib/services';
import { logger } from '../../../shared/utils/logger';
import toast from 'react-hot-toast';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';

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
  getPositionTypeInfo2: (positionType: string, optionType: string, positionTypeZh?: string, isCovered?: boolean) => { icon: React.ReactNode; label: string; color: string; description?: string; borderColor: string };
  computeCombosForPositions: (strategy: OptionsStrategy, type: 'call' | 'put') => Map<number, number>;
  allExpiryBuckets: Array<{ expiry: string; daysToExpiry: number; single: OptionsPosition[]; complex: OptionsStrategy[] }>;
  selectedSymbol: string;
  underlyingPrice: number | null;
  onClosePositions: (ids: string[], meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string; quote?: OptionQuote }, overrides?: Record<string, number>) => Promise<void>;
  advisedCombinations?: AdvisedCombination[];
  onLoadAdvised?: (combo: AdvisedCombination) => void;
  onExecuteAdvised?: (combo: AdvisedCombination) => void;
  selectedAccountId?: string | null;
  userId?: string | null;
  optionsData?: OptionsData | null;
  optionsDataMap?: Record<string, OptionsData>;
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
  advisedCombinations = [],
  onLoadAdvised,
  onExecuteAdvised,
  selectedAccountId,
  userId,
  optionsData,
  optionsDataMap,
}: ExpiryGroupCardProps) {
  const { queryPrice, prices, isConnected } = useOptionPriceWebSocket();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [localState, setLocalState] = useState<{ data: OptionsData | null; symbol: string | null }>({ data: null, symbol: null });
  const { data: localOptionsData, symbol: localDataSymbol } = localState;

  const [advisedModal, setAdvisedModal] = useState<{ combo: AdvisedCombination; quantity: number } | null>(null);
  const [confirmData, setConfirmData] = useState<{ ids: string[]; meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string; defaultComboCount?: number; perLegMaxQty?: Record<string, number>; quote?: OptionQuote }; title: string; description: string } | null>(null);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const basePositions = filterAndSortPositions(group.single);
  const filteredPositions = selectedSymbol
    ? basePositions.filter(p => p.opt_undl_code_full === selectedSymbol)
    : basePositions;
  const hasPositions = filteredPositions.length > 0;

  // Ensure options data is available when needed (especially for adjust dialog)
  useEffect(() => {
    if (confirmData && !optionsData) {
      const posId = confirmData.ids[0];
      const pos = filteredPositions.find(p => p.id === posId);
      // Use full underlying code if available, otherwise selectedSymbol or fallback
      const symbol = pos?.opt_undl_code_full || selectedSymbol;
      
      if (symbol && (!localOptionsData || localDataSymbol !== symbol)) {
        logger.info('[ExpiryGroupCard] Fetching missing options data for', symbol);
        optionsService.getOptionsData(symbol).then(({ data }) => {
          if (data) {
            setLocalState({ data, symbol });
          }
        }).catch(err => {
          logger.error('[ExpiryGroupCard] Failed to fetch local options data', err);
        });
      }
    }
  }, [confirmData, optionsData, filteredPositions, selectedSymbol, localOptionsData, localDataSymbol]);

  // Calculate codes for pricing
  const codes = useMemo(() => {
    const positionCodes = filteredPositions.map(p => p.contract_code_full).filter(Boolean) as string[];
    
    // Collect codes from all available data sources
    const dataSources = [optionsData, localOptionsData, ...(optionsDataMap ? Object.values(optionsDataMap) : [])].filter(Boolean);
    
    const allOptionCodes = dataSources.flatMap(data => 
      (data?.quotes || [])
        .filter(q => q.expiry === group.expiry)
        .flatMap(q => [
          q.call_contract_code_full,
          q.put_contract_code_full
        ])
    ).filter(Boolean) as string[];
    
    return Array.from(new Set([...positionCodes, ...allOptionCodes])).sort();
  }, [filteredPositions, optionsData, localOptionsData, optionsDataMap, group.expiry]);
  const codesKey = JSON.stringify(codes);

  useEffect(() => {
    if (isConnected && codes.length > 0) {
      const runQuery = () => {
        queryPrice(codes);
      };

      // Initial query to ensure data is displayed
      runQuery();

      // Only poll when details are open or confirmation dialog is active
      if (detailsOpen || confirmData) {
        const interval = setInterval(runQuery, 1000);
        return () => clearInterval(interval);
      }
    }
  }, [isConnected, codesKey, queryPrice, detailsOpen, confirmData]);

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
        const isCovered = p.position_type_zh === '备兑' || !!p.is_covered;
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
    } else if (confirmData.meta?.action === 'sync_category') {
      const key = confirmData.ids[0];
      const strike = Number(confirmData.meta?.strike || 0);
      const category = String(confirmData.meta?.category || '') as 'call_right' | 'call_normal' | 'put_right' | 'put_normal' | 'call_covered' | 'put_covered';
      const ids = collectIdsForCategory(category, strike);
      const sum = ids.reduce((acc, id) => {
        const pos = filteredPositions.find(x => x.id === id);
        const base = Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity) || 0;
        const avail = Number((pos as any)?.available ?? base) || 0;
        return acc + avail;
      }, 0);
      setQtyOverrides({ [key]: sum });
    } else {
      const map: Record<string, number> = {};
      confirmData.ids.forEach(id => {
        const pos = filteredPositions.find(x => x.id === id);
        const base = Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity) || 0;
        const avail = Number((pos as any)?.available ?? base) || 0;
        map[id] = avail;
      });
      setQtyOverrides(map);
    }
  }, [confirmData]);

  if (!hasPositions) return null;

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
                        const complexStrikes = (group.complex || []).flatMap(s => 
                          s.positions
                            .filter(p => p.expiry === group.expiry && (!selectedSymbol || p.opt_undl_code_full === selectedSymbol))
                            .map(p => Number(p.contract_strike_price ?? p.strike))
                        );
                        const singleStrikes = filteredPositions.map(p => p.strike);
                        
                        // Collect all strikes from options data
                        const activeData = optionsData || localOptionsData;
                        const dataStrikes = new Set<number>();
                        
                        // From main optionsData
                        if (activeData?.quotes) {
                          activeData.quotes.forEach(q => {
                            if (q.expiry === group.expiry) {
                              dataStrikes.add(Number(q.strike_price));
                            }
                          });
                        }
                        
                        // From optionsDataMap (if available via context or prop - assuming it was passed as prop in previous step)
                        if (optionsDataMap) {
                          Object.values(optionsDataMap).forEach(data => {
                             if (data.quotes) {
                               data.quotes.forEach(q => {
                                 if (q.expiry === group.expiry) {
                                   dataStrikes.add(Number(q.strike_price));
                                 }
                               });
                             }
                          });
                        }

                        const strikes = Array.from(new Set([...singleStrikes, ...complexStrikes, ...dataStrikes])).sort((a, b) => a - b);
                        const rows = strikes.map(strike => {
                          const callSell = filteredPositions
                            .filter(p => p.strike === strike && p.type === 'call' && p.position_type === 'sell')
                            .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                          const putSell = filteredPositions
                            .filter(p => p.strike === strike && p.type === 'put' && p.position_type === 'sell')
                            .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                          return { strike, callSell, putSell };
                        });

                        const hasData = strikes.length > 0;
                        if (!hasData) {
                          return (
                            <div className={`text-center text-sm ${themes[theme].text} opacity-75`}>暂无数据</div>
                          );
                        }
                        const keyOf = (c: string, s: number) => `${c}-${s}`;
                        const displayVal = (c: string, s: number, d: number) => (editValues[keyOf(c, s)] ?? d);
                        const setDisplayVal = (c: 'call_right' | 'call_normal' | 'put_right' | 'put_normal' | 'call_covered' | 'put_covered', s: number, v: number) => {
                          setEditValues(prev => ({ ...prev, [keyOf(c, s)]: Math.max(0, v) }));
                        };
                        const openAdjustConfirm = (c: 'call_right' | 'call_normal' | 'put_right' | 'put_normal' | 'call_covered' | 'put_covered', s: number) => {
                          const title = '确认调整持仓数量';
                          const categoryLabel: Record<string, string> = {
                            call_right: 'Call 权利',
                            call_normal: 'Call 义务',
                            call_covered: 'Call 备兑',
                            put_right: 'Put 权利',
                            put_normal: 'Put 义务',
                            put_covered: 'Put 备兑'
                          };
                          const ids = collectIdsForCategory(c, s);
                          const currentSum = ids.reduce((acc, id) => {
                            const pos = filteredPositions.find(x => x.id === id);
                            const qty = Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity) || 0;
                            return acc + qty;
                          }, 0);
                          const desc = `${categoryLabel[c]} @${s}（到期 ${format(new Date(group.expiry), 'yyyy-MM-dd')}），当前数量 ${currentSum}`;
                          const syntheticId = `sync-${c}-${s}`;
          // 触发价格查询
          const codes = ids.map(id => filteredPositions.find(p => p.id === id)?.contract_code_full).filter(Boolean) as string[];
          if (codes.length > 0) {
            queryPrice(codes);
          }
          setConfirmData({
            ids: [syntheticId],
            meta: { action: 'sync_category', category: c, strike: s, expiry: group.expiry },
                            title,
                            description: desc
                          });
                        };
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className={`${themes[theme].text} opacity-75`}>
                                  <th className="text-center py-2" colSpan={5}>Calls</th>
                                  <th className={`text-center py-2 border-l border-r ${themes[theme].border}`}></th>
                                  <th className="text-center py-2" colSpan={5}>Puts</th>
                                </tr>
                                <tr className={`text-xs ${themes[theme].text} opacity-70`}>
                                  <th className="text-center py-2">Call 组合</th>
                                  <th className="text-center py-2">Call 备兑</th>
                                  <th className="text-center py-2">Call 义务</th>
                                  <th className="text-center py-2 px-3">Call 权利</th>
                                  <th className={`text-center py-2 px-3 border-r ${themes[theme].border}`}>Call 现价</th>
                                  <th className="text-center py-2 px-4">行权价</th>
                                  <th className={`text-center py-2 px-3 border-l ${themes[theme].border}`}>Put 现价</th>
                                  <th className="text-center py-2 px-3">Put 权利</th>
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

                                    // Determine prices for Call and Put at this strike
                                    const activeData = optionsData || localOptionsData;
                                    let callPrice = '';
                                    let putPrice = '';
                                    
                                    let callCode = '';
                                    let putCode = '';
                                    let callFullCode = '';
                                    let putFullCode = '';
                                    
                                    // Helper to find quote
                                    const findQuote = (data: OptionsData) => {
                                      return data.quotes?.find(q => q.expiry === group.expiry && Number(q.strike_price) === m.s);
                                    };

                                    let quote;
                                    if (activeData) {
                                      quote = findQuote(activeData);
                                    }

                                    if (!quote && optionsDataMap) {
                                      for (const data of Object.values(optionsDataMap)) {
                                        quote = findQuote(data);
                                        if (quote) break;
                                      }
                                    }

                                    if (quote) {
                                      callCode = quote.call_contract_code;
                                      callFullCode = quote.call_contract_code_full;
                                      putCode = quote.put_contract_code;
                                      putFullCode = quote.put_contract_code_full;
                                      
                                      const getPrice = (code: string, fullCode: string, last: number) => {
                                        const p = (code && prices[code]) || (fullCode && prices[fullCode]);
                                        if (p) return p.price.toFixed(4);
                                        return last ? last.toFixed(4) : '-';
                                      };
                                      
                                      callPrice = getPrice(callCode, callFullCode, quote.call_last_price);
                                      putPrice = getPrice(putCode, putFullCode, quote.put_last_price);
                                    }

                                  return (
                                      <tr key={`trow-top-${group.expiry}-${m.s}`} className={themes[theme].cardHover} style={{ backgroundImage: bg }}>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex flex-col items-center gap-1">
                                            <span className={`${themes[theme].text}`}>{m.comboCallQty}</span>
                                            {m.comboCallQty > 0 && (
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => {
                                                  const ids: string[] = [];
                                                  const strategyIds: string[] = [];
                                                  let defaultComboCountSum = 0;
                                                  const perLegMaxQty: Record<string, number> = {};
                                                  (allExpiryBuckets || []).forEach(bucket => {
                                                    bucket.complex.forEach(s => {
                                                      if (s.positions.some(p => p.expiry === group.expiry)) {
                                                        const comboMap = computeCombosForPositions(s, 'call');
                                                        const count = comboMap.get(m.s) || 0;
                                                        if (count > 0) {
                                                          ids.push(
                                                            ...s.positions
                                                              .filter(p => p.expiry === group.expiry)
                                                              .map(p => p.id)
                                                          );
                                                          strategyIds.push(s.id as any);
                                                          defaultComboCountSum += count;
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
                                                      meta: { action: 'unwind_combo', comboType: 'call', strike: m.s, expiry: group.expiry, strategyIds: uniqueStrategyIds, defaultComboCount: defaultComboCountSum, perLegMaxQty, quote },
                                                      title: '确认解除组合',
                                                      description: `将解除组合：CALL 组合 @${m.s}（到期 ${format(new Date(group.expiry), 'yyyy-MM-dd')}），涉及腿数 ${uniqueIds.length}`
                                                    });
                                                  }
                                                }}
                                              >解除组合</button>
                                            )}
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>{displayVal('call_covered', m.s, m.callCovered)}</span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('call_covered', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>{displayVal('call_normal', m.s, m.callNormal)}</span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('call_normal', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 px-3 w-20 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>{displayVal('call_right', m.s, m.callRight)}</span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('call_right', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 px-3 w-24 border-r ${themes[theme].border} ${themes[theme].text}`}>
                                            <span className="font-mono">{callPrice || '-'}</span>
                                        </td>
                                        <td className={`text-center py-2 px-4 w-24 ${themes[theme].text}`}>{m.s}
                                          {underlyingPrice != null && (
                                            <div className={`mt-1 text-[10px] opacity-75`}>{m.getM()}</div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 px-3 w-24 border-l ${themes[theme].border} ${themes[theme].text}`}>
                                            <span className="font-mono">{putPrice || '-'}</span>
                                        </td>
                                        <td className={`text-center py-2 px-3 w-20 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>{displayVal('put_right', m.s, m.putRight)}</span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('put_right', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>{displayVal('put_normal', m.s, m.putNormal)}</span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('put_normal', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>{displayVal('put_covered', m.s, m.putCovered)}</span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('put_covered', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex flex-col items-center gap-1">
                                            <span className={`${themes[theme].text}`}>{m.comboPutQty}</span>
                                            {m.comboPutQty > 0 && (
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => {
                                                  const ids: string[] = [];
                                                  const strategyIds: string[] = [];
                                                  let defaultComboCountSum = 0;
                                                  const perLegMaxQty: Record<string, number> = {};
                                                  (allExpiryBuckets || []).forEach(bucket => {
                                                    bucket.complex.forEach(s => {
                                                      if (s.positions.some(p => p.expiry === group.expiry)) {
                                                        const comboMap = computeCombosForPositions(s, 'put');
                                                        const count = comboMap.get(m.s) || 0;
                                                        if (count > 0) {
                                                          ids.push(
                                                            ...s.positions
                                                              .filter(p => p.expiry === group.expiry)
                                                              .map(p => p.id)
                                                          );
                                                          strategyIds.push(s.id as any);
                                                          defaultComboCountSum += count;
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
                                                      meta: { action: 'unwind_combo', comboType: 'put', strike: m.s, expiry: group.expiry, strategyIds: uniqueStrategyIds, defaultComboCount: defaultComboCountSum, perLegMaxQty, quote },
                                                      title: '确认解除组合',
                                                      description: `将解除组合：PUT 组合 @${m.s}（到期 ${format(new Date(group.expiry), 'yyyy-MM-dd')}），涉及腿数 ${uniqueIds.length}`
                                                    });
                                                  }
                                                }}
                                              >解除组合</button>
                                            )}
                                          </div>
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
                {advisedCombinations.length > 0 && (
                  <div className="mt-0">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 bg-purple-500 rounded"></div>
                      <h4 className={`text-lg font-semibold ${themes[theme].text}`}>组合建议</h4>
                    </div>
                    <div className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} space-y-2`}>
                      {advisedCombinations.map((c) => (
                        <div key={`advised-${group.expiry}-${c.type}-${c.buy_strike}-${c.sell_strike}`} className="flex items-center justify-between gap-2">
                          <div className={`text-sm ${themes[theme].text}`}>{c.description}</div>
                          <div className="flex items-center gap-2">
                            {!!onLoadAdvised && (
                              <button
                                className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                                onClick={() => onLoadAdvised(c)}
                              >加载建议</button>
                            )}
                            <button
                              className={`px-2 py-1 rounded text-xs bg-purple-600 text-white`}
                              onClick={() => setAdvisedModal({ combo: c, quantity: Math.max(1, c.quantity || 1) })}
                            >查看详情</button>
                          </div>
                        </div>
                      ))}
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
                          const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
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
                          const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
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
                                const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
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
                      <div className={`text-xs ${themes[theme].text} opacity-60`}>数量 {val}（总数 {maxQty}，可执行 {pos?.available ?? maxQty}）</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : confirmData.meta?.action === 'sync_category' ? (
            <div className="space-y-2">
              {(() => {
                  const s = Number(confirmData.meta?.strike || 0);
                  const c = String(confirmData.meta?.category || '') as any;
                  const ids = collectIdsForCategory(c, s);
                  const pos = filteredPositions.find(p => p.id === ids[0]);
                  let code = pos?.contract_code;
                  let fullCode = pos?.contract_code_full;

                  if (!fullCode) {
                    const type = c.startsWith('call') ? 'call' : 'put';
                    const activeData = optionsData || localOptionsData;
                    
                    if (activeData && activeData.quotes) {
                       const quote = activeData.quotes.find(q => q.expiry === group.expiry && Number(q.strike_price) === s);
                       if (quote) {
                          fullCode = type === 'call' ? quote.call_contract_code_full : quote.put_contract_code_full;
                          code = type === 'call' ? quote.call_contract_code : quote.put_contract_code;
                       }
                    } else if (optionsDataMap) {
                       for (const data of Object.values(optionsDataMap)) {
                          const quote = data.quotes?.find(q => q.expiry === group.expiry && Number(q.strike_price) === s);
                          if (quote) {
                             fullCode = type === 'call' ? quote.call_contract_code_full : quote.put_contract_code_full;
                             code = type === 'call' ? quote.call_contract_code : quote.put_contract_code;
                             break;
                          }
                       }
                    }
                  }

                  const priceData = (code && prices[code]) || (fullCode && prices[fullCode]) || null;
                  if (!priceData) return null;
                  return (
                    <div className={`text-xs ${themes[theme].text} flex items-center gap-2 mb-2 p-2 rounded border ${themes[theme].border}`}>
                        <span className="font-medium">最新价: {priceData.price}</span>
                        {priceData.bid && <span className="text-red-500">买: {priceData.bid}</span>}
                        {priceData.ask && <span className="text-green-500">卖: {priceData.ask}</span>}
                        <span className="opacity-50 text-[10px] ml-auto">{format(new Date(priceData.timestamp), 'HH:mm:ss')}</span>
                    </div>
                  );
              })()}
              <div className="flex items-center justify-between gap-2">
                <div className={`text-xs ${themes[theme].text}`}>目标数量</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={Object.values(qtyOverrides)[0] ?? 0}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value) || 0;
                      const key = confirmData.ids[0];
                      setQtyOverrides(prev => ({ ...prev, [key]: n }));
                    }}
                    className={`w-24 px-2 py-1 rounded text-xs ${themes[theme].input} ${themes[theme].text}`}
                  />
                </div>
              </div>
            </div>
          ) : (
            (() => {
              const items = confirmData.ids.map(id => {
                const pos = filteredPositions.find(x => x.id === id);
                const raw = (allExpiryBuckets || []).flatMap(b => b.single).find(x => x.id === id) || pos;
                const val = qtyOverrides[id] ?? Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity);
                return (
                  <div key={`confirm-pos-${id}`} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
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
                        <button
                          className="px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700"
                          onClick={() => {
                            const base = Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity) || 0;
                            setQtyOverrides(prev => ({ ...prev, [id]: base }));
                          }}
                        >全平</button>
                      <span className={`text-[11px] ${themes[theme].text} opacity-60`}>总数 {Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity) || 0}，可执行 {Number((pos as any)?.available ?? (Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity) || 0))}</span>
                    </div>
                    </div>
                    <div className={`${themes[theme].background} rounded p-2 border ${themes[theme].border}`}>
                      {(() => {
                        const base = Number((raw as any)?.selectedQuantity ?? (raw as any)?.leg_quantity ?? raw?.quantity) || 0;
                        const avail = (raw as any)?.available ?? base;
                        const strikeVal = Number((raw as any)?.contract_strike_price ?? raw?.strike);
                        const typeLabel = String(raw?.type || '').toUpperCase();
                        const posLabel = raw?.position_type === 'buy' ? '权利' : ((raw as any)?.position_type_zh === '备兑' ? '备兑' : '义务');
                        return (
                          <div className={`text-[11px] ${themes[theme].text}`}>
                            <div>标的 {raw?.symbol}</div>
                            <div>类型 {typeLabel} • {posLabel}</div>
                            <div>行权价 {strikeVal}</div>
                            <div>到期 {raw?.expiry}</div>
                            <div>总数 {base}</div>
                            <div>可执行 {avail}</div>
                            <div>合约名称 {(raw as any)?.contract_name ?? ''}</div>
                            <div>合约代码 {(raw as any)?.contract_code ?? ''}</div>
                            <div>标的代码 {(raw as any)?.opt_undl_code_full ?? ''}</div>
                            <div>类型中文 {(raw as any)?.contract_type_zh ?? ''}</div>
                            <div>仓位中文 {(raw as any)?.position_type_zh ?? ''}</div>
                            <div>成本价 {typeof (raw as any)?.cost_price === 'number' ? (raw as any)?.cost_price : String((raw as any)?.cost_price || '')}</div>
                            <div>权利金 {typeof (raw as any)?.premium === 'number' ? (raw as any)?.premium : String((raw as any)?.premium || '')}</div>
                            <div>当前价值 {typeof (raw as any)?.currentValue === 'number' ? (raw as any)?.currentValue : String((raw as any)?.currentValue || '')}</div>
                            <div>盈亏 {typeof (raw as any)?.profitLoss === 'number' ? (raw as any)?.profitLoss : String((raw as any)?.profitLoss || '')}</div>
                            <div>隐含波动率 {typeof (raw as any)?.impliedVolatility === 'number' ? (raw as any)?.impliedVolatility : String((raw as any)?.impliedVolatility || '')}</div>
                            <div>Greeks Δ {String((raw as any)?.delta ?? '')} • Γ {String((raw as any)?.gamma ?? '')} • Θ {String((raw as any)?.theta ?? '')} • ν {String((raw as any)?.vega ?? '')}</div>
                            <div>原始数量 {String((raw as any)?.quantity ?? '')} • 组合腿数量 {String((raw as any)?.leg_quantity ?? '')}</div>
                            <div>状态 {String((raw as any)?.status ?? '')}</div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className={`${themes[theme].background} rounded p-2 border ${themes[theme].border}`}>
                      <pre className={`text-[11px] ${themes[theme].text} overflow-auto max-h-40`}>{JSON.stringify(raw, null, 2)}</pre>
                    </div>
                  </div>
                );
              });
              return <div className="space-y-2">{items}</div>;
            })()
          )}
        <div className={`mt-4 ${themes[theme].background} rounded p-3 border ${themes[theme].border}`}>
          {(() => {
            const positions = (() => {
              if (confirmData?.meta?.action === 'sync_category') {
                const strike = Number(confirmData.meta?.strike || 0);
                const category = String(confirmData.meta?.category || '') as 'call_right' | 'call_normal' | 'put_right' | 'put_normal' | 'call_covered' | 'put_covered';
                const allSingles = (allExpiryBuckets || []).flatMap(b => b.single);
                return allSingles.filter(p => {
                  const sameStrike = Number((p as any)?.contract_strike_price ?? p.strike) === strike;
                  const sameExpiry = p.expiry === (confirmData?.meta?.expiry || group.expiry);
                  const isCovered = (p as any)?.position_type_zh === '备兑' || !!(p as any)?.is_covered;
                  const isCall = (p.type === 'call' || (p as any).contract_type_zh === 'call');
                  const isPut = (p.type === 'put' || (p as any).contract_type_zh === 'put');
                  const isSell = p.position_type === 'sell';
                  const isBuy = p.position_type === 'buy';
                  if (!sameStrike || !sameExpiry) return false;
                  if (category === 'call_normal') return isCall && isSell && !isCovered;
                  if (category === 'put_normal') return isPut && isSell && !isCovered;
                  if (category === 'call_right') return isCall && isBuy;
                  if (category === 'put_right') return isPut && isBuy;
                  if (category === 'call_covered') return isCall && isSell && isCovered;
                  if (category === 'put_covered') return isPut && isSell && isCovered;
                  return false;
                });
              }
              const allSingles = (allExpiryBuckets || []).flatMap(b => b.single);
              return (confirmData?.ids || []).map(id => allSingles.find(x => x.id === id)).filter(Boolean) as any[];
            })();
            const data = {
              ids: confirmData?.ids || [],
              meta: confirmData?.meta || {},
              overrides: qtyOverrides,
              positions
            };
            return (
              <pre className={`text-xs ${themes[theme].text} overflow-auto max-h-60`}>{JSON.stringify(data, null, 2)}</pre>
            );
          })()}
        </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className={`px-3 py-2 rounded-md text-sm ${themes[theme].secondary}`}
            onClick={() => setConfirmData(null)}
          >取消</button>
          <button
            className={`px-3 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700`}
            onClick={async () => {
              if (confirmData?.meta?.action === 'sync_category') {
                const strike = Number(confirmData.meta?.strike || 0);
                const category = String(confirmData.meta?.category || '') as 'call_right' | 'call_normal' | 'put_right' | 'put_normal' | 'call_covered' | 'put_covered';
                const ids = collectIdsForCategory(category, strike);
                const sum = ids.reduce((acc, id) => {
                  const pos = filteredPositions.find(x => x.id === id);
                  const qty = Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity) || 0;
                  return acc + qty;
                }, 0);
                const map: Record<string, { type: 'call' | 'put'; position_type: 'buy' | 'sell' }> = {
                  call_right: { type: 'call', position_type: 'buy' },
                  call_normal: { type: 'call', position_type: 'sell' },
                  call_covered: { type: 'call', position_type: 'sell' },
                  put_right: { type: 'put', position_type: 'buy' },
                  put_normal: { type: 'put', position_type: 'sell' },
                  put_covered: { type: 'put', position_type: 'sell' }
                };
                const p = map[category];
                const resp = await optionsService.updatePositions({ updates: [{ type: p.type, position_type: p.position_type, strike, expiry: String(confirmData.meta?.expiry || group.expiry), quantity: sum, option_type: p.type, strike_price: String(strike) }], accountId: selectedAccountId || null, userId: userId || null });
                if (resp.error) {
                  toast.error('同步失败');
                } else {
                  toast.success('同步成功');
                }
                setConfirmData(null);
              } else {
                const localOverrides: Record<string, number> = {};
                (confirmData?.ids || []).forEach(id => {
                  const pos = filteredPositions.find(x => x.id === id);
                  const base = Number((pos as any)?.selectedQuantity ?? (pos as any)?.leg_quantity ?? pos?.quantity) || 0;
                  localOverrides[id] = base;
                });
                await onClosePositions(confirmData?.ids || [], confirmData?.meta, localOverrides);
                setConfirmData(null);
              }
            }}
          >清仓</button>
          <button
            className={`px-3 py-2 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700`}
            onClick={async () => {
              if (confirmData.meta?.action === 'sync_category') {
                const key = confirmData.ids[0];
                const q = qtyOverrides[key] ?? 0;
                const category = String(confirmData.meta?.category || '') as 'call_right' | 'call_normal' | 'put_right' | 'put_normal' | 'call_covered' | 'put_covered';
                const map: Record<string, { type: 'call' | 'put'; position_type: 'buy' | 'sell' }> = {
                  call_right: { type: 'call', position_type: 'buy' },
                  call_normal: { type: 'call', position_type: 'sell' },
                  call_covered: { type: 'call', position_type: 'sell' },
                  put_right: { type: 'put', position_type: 'buy' },
                  put_normal: { type: 'put', position_type: 'sell' },
                  put_covered: { type: 'put', position_type: 'sell' }
                };
                const p = map[category];
                const strike = Number(confirmData.meta?.strike || 0);
                const allSingles = (allExpiryBuckets || []).flatMap(b => b.single);
                const matches = allSingles.filter(x => {
                  const sameStrike = Number((x as any)?.contract_strike_price ?? x.strike) === strike;
                  const sameExpiry = x.expiry === (confirmData?.meta?.expiry || group.expiry);
                  const isCovered = (x as any)?.position_type_zh === '备兑' || !!(x as any)?.is_covered;
                  const isCall = (x.type === 'call' || (x as any).contract_type_zh === 'call');
                  const isPut = (x.type === 'put' || (x as any).contract_type_zh === 'put');
                  const isSell = x.position_type === 'sell';
                  const isBuy = x.position_type === 'buy';
                  if (!sameStrike || !sameExpiry) return false;
                  if (category === 'call_normal') return isCall && isSell && !isCovered;
                  if (category === 'put_normal') return isPut && isSell && !isCovered;
                  if (category === 'call_right') return isCall && isBuy;
                  if (category === 'put_right') return isPut && isBuy;
                  if (category === 'call_covered') return isCall && isSell && isCovered;
                  if (category === 'put_covered') return isPut && isSell && isCovered;
                  return false;
                });
                const origAvailSum = matches.reduce((acc, x) => acc + (Number((x as any)?.available ?? (Number((x as any)?.selectedQuantity ?? (x as any)?.leg_quantity ?? x.quantity) || 0)) || 0), 0);
                const change = q - origAvailSum;
                const foundSymbol = selectedSymbol || filteredPositions.find(pos => Number((pos as any)?.contract_strike_price ?? pos.strike) === strike)?.symbol;
                
                // Try to find a reference position to supply contract details
                let referencePos = matches.length > 0 ? matches[0] : undefined;
                if (!referencePos) {
                  // If no direct matches, look for any position with same expiry, strike and type (Call/Put)
                  // to get the contract details (contract_code, etc.)
                  referencePos = filteredPositions.find(pos => 
                    pos.expiry === group.expiry && 
                    Number((pos as any)?.contract_strike_price ?? pos.strike) === strike &&
                    (pos.type === p.type || (pos as any).contract_type_zh === p.type)
                  );
                }

                const positionsToSend = (matches.length > 0 ? matches.map(m => ({ ...m })) : (referencePos ? [{
                  ...referencePos,
                  id: '', // Clear ID to avoid updating the reference position
                  type: p.type,
                  position_type: p.position_type,
                  is_covered: category === 'call_covered' || category === 'put_covered',
                  position_type_zh: (category === 'call_covered' || category === 'put_covered') ? '备兑' : ((p.position_type === 'sell') ? '义务' : '权利')
                } as OptionsPosition] : [])).map(pos => ({
                  ...pos,
                  option_type: pos.type,
                  strike_price: String(pos.strike)
                }));

                const resp = await optionsService.updatePositions({ updates: [{ type: p.type, position_type: p.position_type, strike, expiry: String(confirmData.meta?.expiry || group.expiry), quantity: q, original_quantity: origAvailSum, change_quantity: change, is_covered: category === 'call_covered' || category === 'put_covered', symbol: foundSymbol, option_type: p.type, strike_price: String(strike) }], positions: positionsToSend, accountId: selectedAccountId || null, userId: userId || null });
                if (resp.error) {
                  toast.error('同步失败');
                } else {
                  toast.success('已同步持仓数量');
                }
                setConfirmData(null);
              } else if (confirmData.meta?.action === 'unwind_combo') {
                const rawSingles = (allExpiryBuckets || []).flatMap(b => b.single);
                const legs = confirmData.ids
                  .map(id => rawSingles.find(x => x.id === id))
                  .filter(Boolean) as typeof rawSingles;
                const payload = {
                  positions: legs,
                  meta: confirmData.meta,
                  overrides: qtyOverrides
                };
                const resp = await optionsService.closeCombination(payload, selectedAccountId || null, userId || null);
                if (resp.error) {
                  toast.error('解除组合失败');
                } else {
                  toast.success('解除组合成功');
                }
                setConfirmData(null);
              } else {
                await onClosePositions(confirmData.ids, confirmData.meta, qtyOverrides);
                setConfirmData(null);
              }
            }}
          >确认执行</button>
        </div>
      </div>
    </div>
  )}
  {advisedModal && (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => setAdvisedModal(null)}></div>
      <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md rounded-lg border ${themes[theme].card} ${themes[theme].border} p-6`}>
        <div className={`text-lg font-semibold ${themes[theme].text}`}>{advisedModal.combo.description}</div>
        <div className={`mt-1 text-xs ${themes[theme].text} opacity-75`}>到期 {format(new Date(advisedModal.combo.expiry), 'yyyy-MM-dd')}</div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className={`text-sm ${themes[theme].text}`}>数量</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={advisedModal.quantity}
                onChange={(e) => {
                  const n = parseInt(e.target.value) || 1;
                  setAdvisedModal(prev => prev ? { ...prev, quantity: Math.max(1, n) } : prev);
                }}
                className={`w-24 px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              />
            </div>
          </div>
          <div className={`${themes[theme].background} rounded p-3 border ${themes[theme].border}`}>
            <div className={`text-sm font-medium ${themes[theme].text}`}>买入腿</div>
            <div className={`text-xs ${themes[theme].text} opacity-75 mt-1`}>
              {advisedModal.combo.buy_position.position.symbol} {advisedModal.combo.buy_position.position.strike} {String(advisedModal.combo.buy_position.position.type).toUpperCase()} • {advisedModal.combo.buy_position.position.position_type === 'buy' ? '买入' : '卖出'}
            </div>
            <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
              可用 {advisedModal.combo.buy_position.position.available} • 数量 {advisedModal.combo.buy_position.position.quantity}
            </div>
          </div>
          <div className={`${themes[theme].background} rounded p-3 border ${themes[theme].border}`}>
            <div className={`text-sm font-medium ${themes[theme].text}`}>卖出腿</div>
            <div className={`text-xs ${themes[theme].text} opacity-75 mt-1`}>
              {advisedModal.combo.sell_position.position.symbol} {advisedModal.combo.sell_position.position.strike} {String(advisedModal.combo.sell_position.position.type).toUpperCase()} • {advisedModal.combo.sell_position.position.position_type === 'buy' ? '买入' : '卖出'}
            </div>
            <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
              可用 {advisedModal.combo.sell_position.position.available} • 数量 {advisedModal.combo.sell_position.position.quantity}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className={`px-3 py-1 rounded text-sm ${themes[theme].secondary}`}
            onClick={() => {
              if (onLoadAdvised) onLoadAdvised({ ...advisedModal.combo, quantity: advisedModal.quantity });
              setAdvisedModal(null);
            }}
          >加载到构建器</button>
          <button
            className={`px-3 py-1 rounded text-sm bg-purple-600 text-white`}
            onClick={() => {
              if (onExecuteAdvised) onExecuteAdvised({ ...advisedModal.combo, quantity: advisedModal.quantity });
              setAdvisedModal(null);
            }}
          >执行组合</button>
        </div>
      </div>
    </div>
  )}
</div>
);
}
