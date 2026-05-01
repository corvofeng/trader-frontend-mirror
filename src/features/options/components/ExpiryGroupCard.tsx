import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Hourglass, RefreshCw } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPosition, OptionsStrategy, AdvisedCombination, OptionsData, OptionQuote, OptionWhitelist } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types';
import { optionsService } from '../../../lib/services';
import { logger } from '../../../shared/utils/logger';
import toast from 'react-hot-toast';
import { useAutoRefresh, useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { AnimatedFlash } from './AnimatedFlash';



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
  currencyConfig: CurrencyConfig;
  getDaysToExpiryColor: (days: number) => string;
  getTypeIcon: (type: OptionsPosition['type']) => React.ReactNode;
  getStatusColor: (status: OptionsPosition['status']) => string;
  getPositionTypeInfo2: (positionType: string, optionType: string, positionTypeZh?: string, isCovered?: boolean) => { icon: React.ReactNode; label: string; color: string; description?: string; borderColor: string };
  computeCombosForPositions: (strategy: OptionsStrategy, type: 'call' | 'put') => Map<number, number>;
  allExpiryBuckets: Array<{ expiry: string; daysToExpiry: number; single: OptionsPosition[]; complex: OptionsStrategy[] }>;
  selectedSymbol: string;
  underlyingPrice: number | null;
  onClosePositions: (ids: string[], meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string; quote?: OptionQuote; contract_code?: string; contract_code_full?: string }, overrides?: Record<string, number>) => Promise<void>;
  advisedCombinations?: AdvisedCombination[];
  onLoadAdvised?: (combo: AdvisedCombination) => void;
  onExecuteAdvised?: (combo: AdvisedCombination) => void;
  selectedAccountId?: string | null;
  userId?: string | null;
  optionsData?: OptionsData | null;
  optionsDataMap?: Record<string, OptionsData>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isTBoardExpanded: boolean;
  onToggleTBoard: () => void;
  analysis?: {
    phase: string;
    days_to_expiry: number;
    risk_positions_count: number;
    safe_positions_count: number;
    strategies_count: number;
    exercise_analysis?: {
      call_obligation_count_worst: number;
      put_obligation_count_worst: number;
    };
    report: string;
  };
  whitelists?: OptionWhitelist[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
  wsRefreshNonce?: number;
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
  isExpanded,
  onToggleExpand,
  isTBoardExpanded,
  onToggleTBoard,
  analysis,
  whitelists = [],
  isRefreshing,
  onRefresh,
  wsRefreshNonce = 0
}: ExpiryGroupCardProps) {
  const { queryPrice, prices, isConnected, connect } = useOptionPriceWebSocket();
  const [localState, setLocalState] = useState<{ data: OptionsData | null; symbol: string | null }>({ data: null, symbol: null });
  const { data: localOptionsData, symbol: localDataSymbol } = localState;

  const normalizeCodeList = useCallback((codes: Array<string | undefined | null>) => {
    const cleaned = codes.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean);
    return Array.from(new Set(cleaned));
  }, []);

  const resolvePriceUpdate = useCallback(
    (codes: Array<string | undefined | null>) => {
      const list = normalizeCodeList(codes);
      for (const c of list) {
        const p = prices[c];
        if (p) return p;
      }
      return null;
    },
    [normalizeCodeList, prices]
  );

  const getCounterpartyTopPrice = useCallback((p: ReturnType<typeof resolvePriceUpdate>, side: 'buy' | 'sell') => {
    if (!p) return null;
    if (side === 'buy') {
      const v = p.ask_price?.[0] ?? p.ask;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    const v = p.bid_price?.[0] ?? p.bid;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, []);

  const getQuoteStrike = (q: OptionQuote): number => {
    const record = q as unknown as { strike_price?: unknown };
    const value = record.strike_price ?? q.strike;
    return typeof value === 'number' ? value : Number(value);
  };

  const [advisedModal, setAdvisedModal] = useState<{ combo: AdvisedCombination; quantity: number; mode: 'advised' | 't_board_create' } | null>(null);
  const [confirmData, setConfirmData] = useState<{ ids: string[]; meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string; defaultComboCount?: number; perLegMaxQty?: Record<string, number>; quote?: OptionQuote; contract_code?: string; contract_code_full?: string; strategies?: Array<{ strategy: OptionsStrategy; qty: number }> }; title: string; description: string } | null>(null);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [syncPrice, setSyncPrice] = useState<number | null>(null);
  const [isPageLocked, setIsPageLocked] = useState(false);
  const pageLockRef = useRef(false);
  const basePositions = useMemo(() => filterAndSortPositions(group.single), [filterAndSortPositions, group.single]);

  const filteredPositions = useMemo(() => selectedSymbol
    ? basePositions.filter(p => p.opt_undl_code_full === selectedSymbol)
    : basePositions, [selectedSymbol, basePositions]);

  // Use worst-case exercise quantities from analysis report
  const totalShortCalls = analysis?.exercise_analysis?.call_obligation_count_worst ?? 0;
  const totalShortPuts = analysis?.exercise_analysis?.put_obligation_count_worst ?? 0;

  // Calculate total margin for the group
  const totalMargin = useMemo(() => {
    return group.single.reduce((sum, p) => sum + (p.margin || 0), 0) +
           group.complex.reduce((sum, s) => sum + s.positions.reduce((pSum, p) => pSum + (p.margin || 0), 0), 0);
  }, [group]);

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
    const dataSources = [optionsData, localOptionsData, ...(optionsDataMap ? Object.values(optionsDataMap) : [])]
      .filter((d): d is OptionsData => !!d)
      .filter(d => !selectedSymbol || d.opt_undl_code_full === selectedSymbol);
    
    const allOptionCodes = dataSources.flatMap(data => 
      (data?.quotes || [])
        .filter(q => q.expiry === group.expiry)
        .flatMap(q => [
          q.call_contract_code_full,
          q.put_contract_code_full
        ])
    ).filter(Boolean) as string[];
    
    // Include selected underlying symbol if available
    const underlyingCode = selectedSymbol ? [selectedSymbol] : [];
    
    return Array.from(new Set([...positionCodes, ...allOptionCodes, ...underlyingCode])).sort();
  }, [filteredPositions, optionsData, localOptionsData, optionsDataMap, group.expiry, selectedSymbol]);

  const quoteIntervalMs = (isExpanded || confirmData) ? 5000 : 10000;
  const { remainingMs: quoteRemainingMs, progress: quoteProgress, triggerNow: triggerQuoteNow } = useAutoRefresh(
    () => {
      if (codes.length === 0) return;
      queryPrice(codes);
    },
    {
      enabled: isConnected && codes.length > 0,
      intervalMs: quoteIntervalMs,
      immediate: true,
      tickMs: 1000,
    }
  );

  const prevWsRefreshNonceRef = useRef<number>(wsRefreshNonce);
  useEffect(() => {
    if (prevWsRefreshNonceRef.current === wsRefreshNonce) return;
    prevWsRefreshNonceRef.current = wsRefreshNonce;
    triggerQuoteNow();
  }, [wsRefreshNonce, triggerQuoteNow]);

  useEffect(() => {
    if (!isPageLocked) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isPageLocked]);

  const isSelectedPosition = (p: OptionsPosition) => {
    return !!selectedSymbol && (p.opt_undl_code_full === selectedSymbol);
  };

  const getHighlightClass = (p: OptionsPosition) => {
    if (!isSelectedPosition(p) || underlyingPrice == null) return '';
    const isCall = (p.type === 'call' || p.contract_type_zh === 'call');
    const thr = 0.005;
    const diffRatio = Math.abs(underlyingPrice - p.strike) / Math.max(p.strike, 1);
    const isATM = diffRatio <= thr;
    const isITM = isCall ? (underlyingPrice > p.strike) : (underlyingPrice < p.strike);
    if (isATM) return 'bg-blue-50 dark:bg-blue-900/30 border-blue-300';
    if (p.position_type === 'sell' && isITM) return 'bg-red-50 dark:bg-red-900/30 border-red-300';
    if (p.position_type === 'buy' && !isITM) return 'bg-amber-50 dark:bg-amber-900/30 border-amber-300';
    return 'bg-green-50 dark:bg-green-900/30 border-green-300';
  };

  const collectIdsForCategory = React.useCallback((
    category: 'call_obligation' | 'put_obligation' | 'call_right' | 'put_right' | 'call_covered' | 'put_covered',
    strike: number
  ): string[] => {
    const isCallLeg = (p: OptionsPosition) => {
      const t = String(p.type || '').toLowerCase();
      const zh = String(p.contract_type_zh || '');
      return t === 'call' || zh.toLowerCase() === 'call' || zh.includes('认购') || zh.includes('购');
    };
    const isPutLeg = (p: OptionsPosition) => {
      const t = String(p.type || '').toLowerCase();
      const zh = String(p.contract_type_zh || '');
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
        if (category === 'call_obligation') return isCall && isSell && !isCovered;
        if (category === 'put_obligation') return isPut && isSell && !isCovered;
        if (category === 'call_right') return isCall && isBuy;
        if (category === 'put_right') return isPut && isBuy;
        if (category === 'call_covered') return isCall && isSell && isCovered;
        if (category === 'put_covered') return isPut && isSell && isCovered;
        return false;
      })
      .map(p => p.id);
    logger.debug('[ExpiryGroupCard] collectIdsForCategory', { category, strike, count: ids.length });
    return ids;
  }, [filteredPositions, group.expiry]);

  const initializedConfirmRef = useRef<string | null>(null);
  const lastWsQuoteRequestAtRef = useRef<Record<string, number>>({});

  const throttledQueryPrice = useCallback(
    (codesInput: Array<string | undefined | null>, minIntervalMs: number = 1500) => {
      const list = normalizeCodeList(codesInput);
      if (list.length === 0) return;
      const now = Date.now();
      const send = list.filter((c) => now - (lastWsQuoteRequestAtRef.current[c] ?? 0) > minIntervalMs);
      if (send.length === 0) return;
      send.forEach((c) => {
        lastWsQuoteRequestAtRef.current[c] = now;
      });
      queryPrice(send);
    },
    [normalizeCodeList, queryPrice]
  );

  useEffect(() => {
    if (!confirmData) {
      setQtyOverrides({});
      setSyncPrice(null);
      initializedConfirmRef.current = null;
      return;
    }

    const currentKey = `${confirmData.meta?.action || 'default'}-${confirmData.ids.join(',')}`;
    if (initializedConfirmRef.current === currentKey) {
      return;
    }
    initializedConfirmRef.current = currentKey;

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
      const category = String(confirmData.meta?.category || '') as 'call_right' | 'call_obligation' | 'put_right' | 'put_obligation' | 'call_covered' | 'put_covered';
      const ids = collectIdsForCategory(category, strike);
      const sum = ids.reduce((acc, id) => {
        const pos = filteredPositions.find(x => x.id === id);
        const base = Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity) || 0;
        const avail = Number(pos?.available ?? base) || 0;
        return acc + avail;
      }, 0);
      setQtyOverrides({ [key]: sum });
    } else {
      const map: Record<string, number> = {};
      confirmData.ids.forEach(id => {
        const pos = filteredPositions.find(x => x.id === id);
        const base = Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity) || 0;
        const avail = Number(pos?.available ?? base) || 0;
        map[id] = avail;
      });
      setQtyOverrides(map);
    }
  }, [confirmData, collectIdsForCategory, filteredPositions]);

  useEffect(() => {
    if (confirmData?.meta?.action === 'sync_category' && isConnected) {
      const codes: string[] = [];
      if (confirmData.meta.contract_code_full) {
        codes.push(confirmData.meta.contract_code_full);
      } else {
        const s = Number(confirmData.meta.strike);
        const c = confirmData.meta.category as 'call_obligation' | 'put_obligation' | 'call_right' | 'put_right' | 'call_covered' | 'put_covered';
        const ids = collectIdsForCategory(c, s);
        ids.forEach(id => {
          const p = filteredPositions.find(x => x.id === id);
          if (p?.contract_code_full) codes.push(p.contract_code_full);
        });
      }
      
      const unique = Array.from(new Set(codes));
      if (unique.length > 0) {
        queryPrice(unique);
      }
    }
  }, [confirmData, isConnected, collectIdsForCategory, filteredPositions, queryPrice]);

  useEffect(() => {
    if (!confirmData) return;
    if (confirmData.meta?.action !== 'unwind_combo_selection') return;
    const strategies = confirmData.meta?.strategies || [];
    const codes = normalizeCodeList(
      strategies.flatMap((s) => {
        const legs = s.strategy?.positions || [];
        return legs.flatMap((p) => [p.contract_code_full || p.contract_code]);
      })
    );
    if (codes.length === 0) return;
    if (!isConnected) {
      connect();
      return;
    }
    throttledQueryPrice(codes, 0);
    const timer = window.setInterval(() => {
      throttledQueryPrice(codes);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [confirmData, connect, isConnected, normalizeCodeList, throttledQueryPrice]);

  useEffect(() => {
    if (!advisedModal) return;
    const buyPos = advisedModal.combo.buy_position?.position;
    const sellPos = advisedModal.combo.sell_position?.position;
    const codes = normalizeCodeList([
      buyPos?.contract_code_full || buyPos?.contract_code,
      sellPos?.contract_code_full || sellPos?.contract_code,
    ]);
    if (codes.length === 0) return;
    if (!isConnected) {
      connect();
      return;
    }
    throttledQueryPrice(codes, 0);
    const timer = window.setInterval(() => {
      throttledQueryPrice(codes);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [advisedModal, connect, isConnected, normalizeCodeList, throttledQueryPrice]);

  const advisedPricePreview = useMemo(() => {
    if (!advisedModal) return null;
    const qty = Math.max(1, Number(advisedModal.quantity) || 1);
    const buyPos = advisedModal.combo.buy_position?.position;
    const sellPos = advisedModal.combo.sell_position?.position;
    if (!buyPos || !sellPos) return null;

    const buyUpdate = resolvePriceUpdate([buyPos.contract_code_full, buyPos.contract_code, buyPos.symbol]);
    const sellUpdate = resolvePriceUpdate([sellPos.contract_code_full, sellPos.contract_code, sellPos.symbol]);

    const buyPx = getCounterpartyTopPrice(buyUpdate, 'buy');
    const sellPx = getCounterpartyTopPrice(sellUpdate, 'sell');

    const buyLegQty = Math.max(1, Number(buyPos.quantity || 1)) * qty;
    const sellLegQty = Math.max(1, Number(sellPos.quantity || 1)) * qty;

    const buyAmt = buyPx != null ? -buyPx * buyLegQty : null;
    const sellAmt = sellPx != null ? sellPx * sellLegQty : null;
    const net = buyAmt != null && sellAmt != null ? buyAmt + sellAmt : null;

    return {
      qty,
      buy: { px: buyPx, qty: buyLegQty, amt: buyAmt },
      sell: { px: sellPx, qty: sellLegQty, amt: sellAmt },
      net,
      ts: Math.max(buyUpdate?.timestamp || 0, sellUpdate?.timestamp || 0),
    };
  }, [advisedModal, getCounterpartyTopPrice, resolvePriceUpdate]);

  const estimateCloseForStrategy = useCallback(
    (strategy: OptionsStrategy) => {
      const legs = strategy?.positions || [];
      const legEstimates = legs.map((p) => {
        const closeSide: 'buy' | 'sell' = p.position_type === 'buy' ? 'sell' : 'buy';
        const update = resolvePriceUpdate([p.contract_code_full, p.contract_code, p.symbol]);
        const px = getCounterpartyTopPrice(update, closeSide);
        const qty = Math.max(0, Number(p.available ?? p.quantity ?? 0) || 0);
        const amt = px != null ? (closeSide === 'sell' ? px * qty : -px * qty) : null;
        return { pos: p, closeSide, px, qty, amt, ts: update?.timestamp || 0 };
      });
      const net = legEstimates.every((l) => l.amt != null) ? legEstimates.reduce((s, l) => s + (l.amt as number), 0) : null;
      const ts = Math.max(0, ...legEstimates.map((l) => l.ts || 0));
      return { legs: legEstimates, net, ts };
    },
    [getCounterpartyTopPrice, resolvePriceUpdate]
  );

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
              {totalMargin > 0 && (
                <span className={`text-sm opacity-75 text-amber-600 dark:text-amber-400 font-mono`}>
                  保证金: {formatCurrency(totalMargin, currencyConfig, 0)}
                </span>
              )}
              {(totalShortCalls > 0 || totalShortPuts > 0) && (
                <div className={`flex items-center gap-2 px-2 py-0.5 rounded text-xs border ${theme === 'dark' ? 'bg-red-900/20 border-red-800/30' : 'bg-red-50 border-red-200'}`}>
                  <span className={`font-medium ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>最大义务:</span>
                  <div className="flex items-center gap-2">
                    <span className={`${themes[theme].text} font-mono`}>
                      <span className="opacity-70 mr-0.5">C</span>
                      <span className="font-bold">{totalShortCalls}</span>
                    </span>
                    <span className={`w-px h-3 ${theme === 'dark' ? 'bg-red-800' : 'bg-red-200'}`}></span>
                    <span className={`${themes[theme].text} font-mono`}>
                      <span className="opacity-70 mr-0.5">P</span>
                      <span className="font-bold">{totalShortPuts}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="mt-2 flex items-center justify-end gap-2">
              {selectedSymbol && underlyingPrice != null && (
                <div className={`text-sm ${themes[theme].text}`}>标的价 {underlyingPrice.toFixed(4)}</div>
              )}

              <div className="flex items-center gap-1">
                <Hourglass className={`w-4 h-4 ${themes[theme].text} opacity-60`} />
                <div className="w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div className="h-1 bg-blue-500" style={{ width: `${Math.round(quoteProgress * 100)}%` }} />
                </div>
                <div className={`text-[10px] ${themes[theme].text} opacity-60 w-8 text-right`}>
                  {isConnected && codes.length > 0 ? `${Math.ceil(quoteRemainingMs / 1000)}s` : '--'}
                </div>
                <button
                  type="button"
                  onClick={triggerQuoteNow}
                  disabled={!isConnected || codes.length === 0}
                  className={`${themes[theme].secondary} rounded-md p-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="刷新行情"
                  aria-label="刷新行情"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={onToggleExpand}
                className={`px-3 py-1 rounded text-xs ${themes[theme].secondary}`}
              >
                {isExpanded ? '收起详情' : '展开详情'}
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
            const callPositions = filteredPositions.filter(pos => (pos.type === 'call' || pos.contract_type_zh === 'call'));
            const putPositions = filteredPositions.filter(pos => (pos.type === 'put' || pos.contract_type_zh === 'put'));

            return (
              <div className="space-y-6">
                <div className="mt-0">
                    <div 
                      className="flex items-center gap-2 mb-3 cursor-pointer select-none hover:opacity-80 transition-opacity"
                      onClick={onToggleTBoard}
                    >
                      <div className="w-4 h-4 bg-gray-500 rounded"></div>
                      <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                        {filteredPositions.length > 0 ? '持仓T型数量看板' : 'T型报价'}
                      </h4>
                      {isTBoardExpanded ? (
                        <ChevronUp className={`w-4 h-4 ${themes[theme].text} opacity-50`} />
                      ) : (
                        <ChevronDown className={`w-4 h-4 ${themes[theme].text} opacity-50`} />
                      )}
                    </div>
                    {isTBoardExpanded && (
                    <div className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} relative`}>
                      {isRefreshing && (
                        <div className="absolute inset-0 z-10 bg-white/50 dark:bg-black/50 flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 rounded-lg">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                      )}
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
                          // Filter by selected symbol if available
                          if (!selectedSymbol || activeData.opt_undl_code_full === selectedSymbol) {
                            activeData.quotes.forEach(q => {
                              if (q.expiry === group.expiry) {
                                dataStrikes.add(getQuoteStrike(q));
                              }
                            });
                          }
                        }
                        
                        // From optionsDataMap (if available via context or prop - assuming it was passed as prop in previous step)
                        if (optionsDataMap) {
                          Object.values(optionsDataMap).forEach(data => {
                             // Filter by selected symbol if available
                             if (selectedSymbol && data.opt_undl_code_full !== selectedSymbol) {
                               return;
                             }
                             if (data.quotes) {
                               data.quotes.forEach(q => {
                                 if (q.expiry === group.expiry) {
                                   dataStrikes.add(getQuoteStrike(q));
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
                        const displayVal = (_c: string, _s: number, d: number) => d;
                        const openAdjustConfirm = (c: 'call_right' | 'call_obligation' | 'put_right' | 'put_obligation' | 'call_covered' | 'put_covered', s: number) => {
                          const title = '确认调整持仓数量';
                          const categoryLabel: Record<string, string> = {
                            call_right: 'Call 权利',
                            call_obligation: 'Call 义务',
                            call_covered: 'Call 备兑',
                            put_right: 'Put 权利',
                            put_obligation: 'Put 义务',
                            put_covered: 'Put 备兑'
                          };
                          const ids = collectIdsForCategory(c, s);
                          const currentSum = ids.reduce((acc, id) => {
                            const pos = filteredPositions.find(x => x.id === id);
                            const qty = Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity) || 0;
                            return acc + qty;
                          }, 0);
                          const desc = `${categoryLabel[c]} @${s}（到期 ${format(new Date(group.expiry), 'yyyy-MM-dd')}），当前数量 ${currentSum}`;
                          const syntheticId = `sync-${c}-${s}`;

                          // Find quote logic
                        const findQuote = (data: OptionsData) => {
                          return data.quotes?.find(q => q.expiry === group.expiry && getQuoteStrike(q) === s);
                        };
                          let quote: OptionQuote | undefined;
                          if (optionsData) quote = findQuote(optionsData);
                          if (!quote && optionsDataMap) {
                            for (const data of Object.values(optionsDataMap)) {
                              quote = findQuote(data);
                              if (quote) break;
                            }
                          }
                          if (!quote && localOptionsData) quote = findQuote(localOptionsData);

                          const isCall = c.startsWith('call');
                          const contract_code = isCall ? quote?.call_contract_code : quote?.put_contract_code;
                          const contract_code_full = isCall ? quote?.call_contract_code_full : quote?.put_contract_code_full;

          // 触发价格查询
          const codes: string[] = [];
          if (contract_code_full) {
            codes.push(contract_code_full);
          } else {
            const posCodes = ids.map(id => filteredPositions.find(p => p.id === id)?.contract_code_full).filter(Boolean) as string[];
            codes.push(...posCodes);
          }
          const uniqueCodes = Array.from(new Set(codes));
          
          if (uniqueCodes.length > 0) {
            if (!isConnected) {
              connect();
            }
            queryPrice(uniqueCodes);
          }
          setConfirmData({
            ids: [syntheticId],
            meta: { 
              action: 'sync_category', 
              category: c, 
              strike: s, 
              expiry: group.expiry, 
              quote,
              contract_code,
              contract_code_full
            },
                            title,
                            description: desc
                          });
                        };
                        return (
                          <div className="space-y-3">
                            <div className="overflow-x-auto hidden md:block">
                            <table className="w-full text-sm min-w-[980px]">
                              <thead>
                                <tr className={`${themes[theme].text} opacity-75`}>
                                  <th className="text-center py-2" colSpan={6}>Calls</th>
                                  <th className={`text-center py-2 border-l border-r ${themes[theme].border}`}></th>
                                  <th className="text-center py-2" colSpan={6}>Puts</th>
                                </tr>
                                <tr className={`text-xs ${themes[theme].text} opacity-70`}>
                                  <th className="text-center py-2">Call 组合</th>
                                  <th className="text-center py-2">Call 备兑</th>
                                  <th className="text-center py-2">Call 义务</th>
                                  <th className="text-center py-2 px-3">Call 权利</th>
                                  <th className="text-center py-2 px-3">Call 时间价值</th>
                                  <th className={`text-center py-2 px-3 border-r ${themes[theme].border}`}>Call 现价</th>
                                  <th className="text-center py-2 px-4">行权价</th>
                                  <th className={`text-center py-2 px-3 border-l ${themes[theme].border}`}>Put 现价</th>
                                  <th className="text-center py-2 px-3">Put 时间价值</th>
                                  <th className="text-center py-2 px-3">Put 权利</th>
                                  <th className="text-center py-2">Put 义务</th>
                                  <th className="text-center py-2">Put 备兑</th>
                                  <th className="text-center py-2">Put 组合</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${themes[theme].border}`}>
                                {(() => {
                                  const callStrategiesMap = new Map<number, { strategy: OptionsStrategy, qty: number }[]>();
                                  const putStrategiesMap = new Map<number, { strategy: OptionsStrategy, qty: number }[]>();
                                  (allExpiryBuckets || []).forEach(bucket => {
                                    bucket.complex.forEach(s => {
                                      if (s.positions.some(p => p.expiry === group.expiry)) {
                                        const c = computeCombosForPositions(s, 'call');
                                        const p = computeCombosForPositions(s, 'put');
                                        
                                        const relevantPositions = s.positions.filter(pos => pos.expiry === group.expiry);
                                        const strategyQty = relevantPositions.find(pos => pos.position_type === 'buy')?.quantity || relevantPositions[0]?.quantity || 0;

                                        c.forEach((_, k) => {
                                           const list = callStrategiesMap.get(k) || [];
                                           list.push({ strategy: s, qty: strategyQty });
                                           callStrategiesMap.set(k, list);
                                        });
                                        p.forEach((_, k) => {
                                           const list = putStrategiesMap.get(k) || [];
                                           list.push({ strategy: s, qty: strategyQty });
                                           putStrategiesMap.set(k, list);
                                        });
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
                                    const callRightAvail = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'buy')
                                      .reduce((sum, p) => {
                                        const base = p.selectedQuantity ?? p.quantity;
                                        const avail = Number(p.available ?? base) || 0;
                                        return sum + avail;
                                      }, 0);
                                    const callCovered = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const callCoveredAvail = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                      .reduce((sum, p) => {
                                        const base = p.selectedQuantity ?? p.quantity;
                                        const avail = Number(p.available ?? base) || 0;
                                        return sum + avail;
                                      }, 0);
                                    const callObligation = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const callObligationAvail = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                      .reduce((sum, p) => {
                                        const base = p.selectedQuantity ?? p.quantity;
                                        const avail = Number(p.available ?? base) || 0;
                                        return sum + avail;
                                      }, 0);
                                    const putObligation = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putObligationAvail = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                      .reduce((sum, p) => {
                                        const base = p.selectedQuantity ?? p.quantity;
                                        const avail = Number(p.available ?? base) || 0;
                                        return sum + avail;
                                      }, 0);
                                    const putCovered = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putCoveredAvail = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                      .reduce((sum, p) => {
                                        const base = p.selectedQuantity ?? p.quantity;
                                        const avail = Number(p.available ?? base) || 0;
                                        return sum + avail;
                                      }, 0);
                                    const putRight = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'buy')
                                      .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                    const putRightAvail = filteredPositions
                                      .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'buy')
                                      .reduce((sum, p) => {
                                        const base = p.selectedQuantity ?? p.quantity;
                                        const avail = Number(p.available ?? base) || 0;
                                        return sum + avail;
                                      }, 0);
                                    
                                    const comboCallStrategies = callStrategiesMap.get(s) || [];
                                    const comboPutStrategies = putStrategiesMap.get(s) || [];
                                    const comboCallQty = comboCallStrategies.reduce((acc, item) => acc + item.qty, 0);
                                    const comboPutQty = comboPutStrategies.reduce((acc, item) => acc + item.qty, 0);

                                    let risk = 0;
                                    if (underlyingPrice != null) {
                                      const up = underlyingPrice;
                                      const cr = Math.max(0, (up - s) / Math.max(s, 1));
                                      const pr = Math.max(0, (s - up) / Math.max(s, 1));
                                      const wCovered = 0.3;
                                      const wCombo = 0.2;
                                      const shortCall = callObligation + callCovered * wCovered + comboCallQty * wCombo;
                                      const shortPut = putObligation + putCovered * wCovered + comboPutQty * wCombo;
                                      risk = shortCall * cr + shortPut * pr;
                                      const near = Math.max(0, 0.02 - Math.abs(up - s) / Math.max(s, 1)) / 0.02;
                                      risk += near * (callObligation + putObligation) * 0.5;
                                    }
                                    return { 
                                      s, 
                                      getM, 
                                      callRight, 
                                      callRightAvail,
                                      callObligation, 
                                      callObligationAvail,
                                      callCovered, 
                                      callCoveredAvail,
                                      comboCallQty, 
                                      putRight, 
                                      putRightAvail,
                                      putObligation, 
                                      putObligationAvail,
                                      putCovered, 
                                      putCoveredAvail,
                                      comboPutQty, 
                                      comboCallStrategies,
                                      comboPutStrategies,
                                      risk 
                                    };
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
                                      return data.quotes?.find(q => q.expiry === group.expiry && getQuoteStrike(q) === m.s);
                                    };

                                    let quote: OptionQuote | undefined;
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
                                      callCode = quote.call_contract_code || '';
                                      callFullCode = quote.call_contract_code_full || '';
                                      putCode = quote.put_contract_code || '';
                                      putFullCode = quote.put_contract_code_full || '';
                                      
                                      const getPrice = (code: string, fullCode: string, last?: number) => {
                                        const p = (code && prices[code]) || (fullCode && prices[fullCode]);
                                        if (p) return p.price.toFixed(4);
                                        return typeof last === 'number' && last ? last.toFixed(4) : '-';
                                      };
                                      
                                      callPrice = getPrice(callCode, callFullCode, quote.call_last_price);
                                      putPrice = getPrice(putCode, putFullCode, quote.put_last_price);
                                    }

                                    // Time Value Highlight
                                    let timeValueColor = 'transparent';
                                    let displayCallTV = '-';
                                    let displayPutTV = '-';

                                    if (underlyingPrice != null) {
                                      const cp = parseFloat(callPrice);
                                      const pp = parseFloat(putPrice);
                                      
                                      const callTV = !isNaN(cp) ? Math.max(0, cp - Math.max(0, underlyingPrice - m.s)) : null;
                                      const putTV = !isNaN(pp) ? Math.max(0, pp - Math.max(0, m.s - underlyingPrice)) : null;

                                      if (callTV !== null) displayCallTV = callTV.toFixed(4);
                                      if (putTV !== null) displayPutTV = putTV.toFixed(4);

                                      if (callTV !== null || putTV !== null) {
                                        const maxTV = Math.max(callTV || 0, putTV || 0);
                                        const tvRatio = maxTV / underlyingPrice;
                                        // Intensity logic: High TV (e.g. ATM) -> Vivid Color
                                        const intensity = Math.min(1, tvRatio * 25); // 4% TV = 100% intensity
                                        if (intensity > 0.01) {
                                          // Gold/Orange for time value
                                          const alpha = theme === 'dark' ? 0.3 : 0.5;
                                          timeValueColor = `rgba(255, 170, 0, ${intensity * alpha})`;
                                        }
                                      }
                                    }

                                    const openComboAdjustModal = (comboType: 'call' | 'put') => {
                                      const pickStrategy = comboType === 'call' ? m.comboCallStrategies?.[0]?.strategy : m.comboPutStrategies?.[0]?.strategy;
                                      const buyStrike = Number(m.s);

                                      let sellStrike: number | null = null;
                                      if (pickStrategy) {
                                        const sellLeg = pickStrategy.positions.find(p => {
                                          const t = String(p.type || p.contract_type_zh);
                                          return t === comboType && p.position_type === 'sell';
                                        });
                                        if (sellLeg) sellStrike = Number(sellLeg.contract_strike_price ?? sellLeg.strike);
                                      }

                                      if (sellStrike == null) {
                                        if (comboType === 'call') {
                                          const higher = strikes.find(s => s > buyStrike);
                                          if (higher != null) sellStrike = higher;
                                        } else {
                                          const lower = [...strikes].reverse().find(s => s < buyStrike);
                                          if (lower != null) sellStrike = lower;
                                        }
                                      }

                                      if (sellStrike == null) {
                                        toast.error('找不到可用的另一腿行权价，无法生成组合');
                                        return;
                                      }

                                      const findQuote = (data: OptionsData, strike: number) => {
                                        return data.quotes?.find(q => q.expiry === group.expiry && getQuoteStrike(q) === strike);
                                      };

                                      const getQuoteByStrike = (strike: number) => {
                                        if (optionsData) {
                                          const q = findQuote(optionsData, strike);
                                          if (q) return q;
                                        }
                                        if (optionsDataMap) {
                                          for (const data of Object.values(optionsDataMap)) {
                                            const q = findQuote(data, strike);
                                            if (q) return q;
                                          }
                                        }
                                        if (localOptionsData) {
                                          const q = findQuote(localOptionsData, strike);
                                          if (q) return q;
                                        }
                                        return undefined;
                                      };

                                      const buyQuote = getQuoteByStrike(buyStrike);
                                      const sellQuote = getQuoteByStrike(sellStrike);
                                      if (!buyQuote || !sellQuote) {
                                        toast.error('缺少期权链数据，无法生成组合');
                                        return;
                                      }

                                      const buyFullCode = comboType === 'call' ? buyQuote.call_contract_code_full : buyQuote.put_contract_code_full;
                                      const buyCode = comboType === 'call' ? buyQuote.call_contract_code : buyQuote.put_contract_code;
                                      const sellFullCode = comboType === 'call' ? sellQuote.call_contract_code_full : sellQuote.put_contract_code_full;
                                      const sellCode = comboType === 'call' ? sellQuote.call_contract_code : sellQuote.put_contract_code;

                                      if ((!buyFullCode && !buyCode) || (!sellFullCode && !sellCode)) {
                                        toast.error('缺少合约代码，无法生成组合');
                                        return;
                                      }

                                      const now = new Date().toISOString();
                                      const undl = selectedSymbol || optionsData?.opt_undl_code_full || localOptionsData?.opt_undl_code_full || '';

                                      const makeLegPosition = (positionType: 'buy' | 'sell', strike: number, code: string, fullCode: string | undefined) => {
                                        const pos: OptionsPosition = {
                                          id: `combo-manual-${comboType}-${positionType}-${group.expiry}-${strike}`,
                                          symbol: fullCode || code,
                                          opt_undl_code_full: undl || undefined,
                                          strategy: '组合购买',
                                          type: comboType,
                                          option_type: comboType,
                                          position_type: positionType,
                                          strike,
                                          strike_price: String(strike),
                                          expiry: group.expiry,
                                          quantity: 1,
                                          premium: 0,
                                          currentValue: 0,
                                          profitLoss: 0,
                                          profitLossPercentage: 0,
                                          impliedVolatility: 0,
                                          delta: 0,
                                          gamma: 0,
                                          theta: 0,
                                          vega: 0,
                                          status: 'open',
                                          openDate: now,
                                          contract_code: code || undefined,
                                          contract_code_full: fullCode || undefined,
                                          contract_strike_price: strike,
                                          contract_type_zh: comboType,
                                          position_type_zh: positionType === 'buy' ? '权利' : '义务',
                                          leg_quantity: 1,
                                        };
                                        return pos;
                                      };

                                      const buyLeg = makeLegPosition('buy', buyStrike, buyCode || buyFullCode || '', buyFullCode);
                                      const sellLeg = makeLegPosition('sell', sellStrike, sellCode || sellFullCode || '', sellFullCode);

                                      const isBullish = comboType === 'call' ? sellStrike > buyStrike : sellStrike < buyStrike;
                                      const description = comboType === 'call'
                                        ? `${isBullish ? '认购牛市价差' : '认购熊市价差'} ${buyStrike}-${sellStrike}`
                                        : `${isBullish ? '认沽熊市价差' : '认沽牛市价差'} ${buyStrike}-${sellStrike}`;

                                      const volume = comboType === 'call' ? buyQuote.callVolume : buyQuote.putVolume;
                                      const sellVolume = comboType === 'call' ? sellQuote.callVolume : sellQuote.putVolume;

                                      const combo: AdvisedCombination = {
                                        type: comboType === 'call'
                                          ? (isBullish ? 'bull_call_spread' : 'bear_call_spread')
                                          : (isBullish ? 'bear_put_spread' : 'bull_put_spread'),
                                        description,
                                        expiry: group.expiry,
                                        quantity: 1,
                                        buy_position: {
                                          code: buyFullCode || buyCode || '',
                                          name: buyFullCode || buyCode || '',
                                          position: buyLeg,
                                          strike: buyStrike,
                                          volume: Number(volume || 0),
                                        },
                                        sell_position: {
                                          code: sellFullCode || sellCode || '',
                                          name: sellFullCode || sellCode || '',
                                          position: sellLeg,
                                          strike: sellStrike,
                                          volume: Number(sellVolume || 0),
                                        },
                                        buy_strike: buyStrike,
                                        sell_strike: sellStrike,
                                      };

                                      setAdvisedModal({ combo, quantity: 1, mode: 't_board_create' });
                                    };

                                  return (
                                      <tr key={`trow-top-${group.expiry}-${m.s}`} className={themes[theme].cardHover} style={{ backgroundImage: bg, backgroundColor: timeValueColor }}>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex flex-col items-center gap-1">
                                            {m.comboCallStrategies.length > 0 ? (
                                              <>
                                                <span
                                                  className={`inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded bg-gray-100/80 dark:bg-gray-800/60 text-xs font-semibold ${themes[theme].text} cursor-help`}
                                                  title={m.comboCallStrategies.map(s => `${s.strategy.name} (${s.qty})`).join('\n')}
                                                >
                                                  {m.comboCallStrategies.reduce((sum, s) => sum + s.qty, 0)}
                                                </span>
                                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                  <button
                                                    className={`px-2 py-0.5 rounded text-xs whitespace-nowrap shrink-0 ${themes[theme].secondary}`}
                                                    onClick={() => openComboAdjustModal('call')}
                                                  >
                                                    调整
                                                  </button>
                                                  <button
                                                    className={`px-2 py-0.5 rounded text-xs whitespace-nowrap shrink-0 ${themes[theme].secondary}`}
                                                    onClick={() => {
                                                      setConfirmData({
                                                        ids: m.comboCallStrategies.flatMap(s => s.strategy.positions.map(p => p.id)),
                                                        meta: { 
                                                          action: 'unwind_combo_selection', 
                                                          comboType: 'call', 
                                                          strike: m.s, 
                                                          expiry: group.expiry, 
                                                          strategies: m.comboCallStrategies,
                                                          strategyIds: m.comboCallStrategies.map(s => s.strategy.id),
                                                          quote, 
                                                          contract_code: quote?.call_contract_code, 
                                                          contract_code_full: quote?.call_contract_code_full 
                                                        },
                                                        title: '组合操作',
                                                        description: `管理 ${m.s} ${group.expiry} 的 Call 组合`
                                                      });
                                                    }}
                                                  >
                                                    解除
                                                  </button>
                                                </div>
                                              </>
                                            ) : (
                                              <>
                                                <span className={`inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded bg-gray-100/80 dark:bg-gray-800/60 text-xs font-semibold ${themes[theme].text}`}>
                                                  0
                                                </span>
                                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                  <button
                                                    className={`px-2 py-0.5 rounded text-xs whitespace-nowrap shrink-0 ${themes[theme].secondary}`}
                                                    onClick={() => openComboAdjustModal('call')}
                                                  >
                                                    调整
                                                  </button>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>
                                                {displayVal('call_covered', m.s, m.callCovered)}
                                                {m.callCoveredAvail !== m.callCovered ? `（${m.callCoveredAvail}）` : ''}
                                              </span>
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
                                              <span className={`${themes[theme].text}`}>
                                                {displayVal('call_obligation', m.s, m.callObligation)}
                                                {m.callObligationAvail !== m.callObligation ? `（${m.callObligationAvail}）` : ''}
                                              </span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('call_obligation', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 px-3 w-20 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>
                                                {displayVal('call_right', m.s, m.callRight)}
                                                {m.callRightAvail !== m.callRight ? `（${m.callRightAvail}）` : ''}
                                              </span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('call_right', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 px-3 w-24 ${themes[theme].text}`}>
                                            <AnimatedFlash value={displayCallTV} className="font-mono text-gray-500" />
                                        </td>
                                        <td className={`text-center py-2 px-3 w-24 border-r ${themes[theme].border} ${themes[theme].text}`}>
                                            <AnimatedFlash value={callPrice || '-'} className="font-mono" type="price" />
                                        </td>
                                        <td className={`text-center py-2 px-4 w-24 ${themes[theme].text}`}>{m.s}
                                          {underlyingPrice != null && (
                                            <div className={`mt-1 text-[10px] opacity-75`}>{m.getM()}</div>
                                          )}
                                        </td>
                                        <td className={`text-center py-2 px-3 w-24 border-l ${themes[theme].border} ${themes[theme].text}`}>
                                            <AnimatedFlash value={putPrice || '-'} className="font-mono" type="price" />
                                        </td>
                                        <td className={`text-center py-2 px-3 w-24 ${themes[theme].text}`}>
                                            <AnimatedFlash value={displayPutTV} className="font-mono text-gray-500" />
                                        </td>
                                        <td className={`text-center py-2 px-3 w-20 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>
                                                {displayVal('put_right', m.s, m.putRight)}
                                                {m.putRightAvail !== m.putRight ? `（${m.putRightAvail}）` : ''}
                                              </span>
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
                                              <span className={`${themes[theme].text}`}>
                                                {displayVal('put_obligation', m.s, m.putObligation)}
                                                {m.putObligationAvail !== m.putObligation ? `（${m.putObligationAvail}）` : ''}
                                              </span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('put_obligation', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex items-center justify-center gap-1">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={`${themes[theme].text}`}>
                                                {displayVal('put_covered', m.s, m.putCovered)}
                                                {m.putCoveredAvail !== m.putCovered ? `（${m.putCoveredAvail}）` : ''}
                                              </span>
                                              <button
                                                className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}
                                                onClick={() => openAdjustConfirm('put_covered', m.s)}
                                              >调整</button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`text-center py-2 ${themes[theme].text}`}>
                                          <div className="flex flex-col items-center gap-1">
                                            {m.comboPutStrategies.length > 0 ? (
                                              <>
                                                <span
                                                  className={`inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded bg-gray-100/80 dark:bg-gray-800/60 text-xs font-semibold ${themes[theme].text} cursor-help`}
                                                  title={m.comboPutStrategies.map(s => `${s.strategy.name} (${s.qty})`).join('\n')}
                                                >
                                                  {m.comboPutStrategies.reduce((sum, s) => sum + s.qty, 0)}
                                                </span>
                                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                  <button
                                                    className={`px-2 py-0.5 rounded text-xs whitespace-nowrap shrink-0 ${themes[theme].secondary}`}
                                                    onClick={() => openComboAdjustModal('put')}
                                                  >
                                                    调整
                                                  </button>
                                                  <button
                                                    className={`px-2 py-0.5 rounded text-xs whitespace-nowrap shrink-0 ${themes[theme].secondary}`}
                                                    onClick={() => {
                                                      setConfirmData({
                                                        ids: m.comboPutStrategies.flatMap(s => s.strategy.positions.map(p => p.id)),
                                                        meta: { 
                                                          action: 'unwind_combo_selection', 
                                                          comboType: 'put', 
                                                          strike: m.s, 
                                                          expiry: group.expiry, 
                                                          strategies: m.comboPutStrategies,
                                                          strategyIds: m.comboPutStrategies.map(s => s.strategy.id),
                                                          quote, 
                                                          contract_code: quote?.put_contract_code, 
                                                          contract_code_full: quote?.put_contract_code_full 
                                                        },
                                                        title: '组合操作',
                                                        description: `管理 ${m.s} ${group.expiry} 的 Put 组合`
                                                      });
                                                    }}
                                                  >
                                                    解除
                                                  </button>
                                                </div>
                                              </>
                                            ) : (
                                              <>
                                                <span className={`inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded bg-gray-100/80 dark:bg-gray-800/60 text-xs font-semibold ${themes[theme].text}`}>
                                                  0
                                                </span>
                                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                  <button
                                                    className={`px-2 py-0.5 rounded text-xs whitespace-nowrap shrink-0 ${themes[theme].secondary}`}
                                                    onClick={() => openComboAdjustModal('put')}
                                                  >
                                                    调整
                                                  </button>
                                                </div>
                                              </>
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
                          <div className="md:hidden space-y-3">
                            {(() => {
                              const callStrategiesMap = new Map<number, { strategy: OptionsStrategy, qty: number }[]>();
                              const putStrategiesMap = new Map<number, { strategy: OptionsStrategy, qty: number }[]>();

                              (allExpiryBuckets || []).forEach(bucket => {
                                bucket.complex.forEach(s => {
                                  if (s.positions.some(p => p.expiry === group.expiry)) {
                                    const c = computeCombosForPositions(s, 'call');
                                    const p = computeCombosForPositions(s, 'put');

                                    const relevantPositions = s.positions.filter(pos => pos.expiry === group.expiry);
                                    const strategyQty = relevantPositions.find(pos => pos.position_type === 'buy')?.quantity || relevantPositions[0]?.quantity || 0;

                                    c.forEach((_, k) => {
                                      const list = callStrategiesMap.get(k) || [];
                                      list.push({ strategy: s, qty: strategyQty });
                                      callStrategiesMap.set(k, list);
                                    });
                                    p.forEach((_, k) => {
                                      const list = putStrategiesMap.get(k) || [];
                                      list.push({ strategy: s, qty: strategyQty });
                                      putStrategiesMap.set(k, list);
                                    });
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
                                const callRightAvail = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'buy')
                                  .reduce((sum, p) => {
                                    const base = p.selectedQuantity ?? p.quantity;
                                    const avail = Number(p.available ?? base) || 0;
                                    return sum + avail;
                                  }, 0);
                                const callCovered = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                  .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                const callCoveredAvail = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                  .reduce((sum, p) => {
                                    const base = p.selectedQuantity ?? p.quantity;
                                    const avail = Number(p.available ?? base) || 0;
                                    return sum + avail;
                                  }, 0);
                                const callObligation = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                  .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                const callObligationAvail = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                  .reduce((sum, p) => {
                                    const base = p.selectedQuantity ?? p.quantity;
                                    const avail = Number(p.available ?? base) || 0;
                                    return sum + avail;
                                  }, 0);

                                const putRight = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'buy')
                                  .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                const putRightAvail = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'buy')
                                  .reduce((sum, p) => {
                                    const base = p.selectedQuantity ?? p.quantity;
                                    const avail = Number(p.available ?? base) || 0;
                                    return sum + avail;
                                  }, 0);
                                const putCovered = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                  .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                const putCoveredAvail = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh === '备兑')
                                  .reduce((sum, p) => {
                                    const base = p.selectedQuantity ?? p.quantity;
                                    const avail = Number(p.available ?? base) || 0;
                                    return sum + avail;
                                  }, 0);
                                const putObligation = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                  .reduce((sum, p) => sum + (p.selectedQuantity ?? p.quantity), 0);
                                const putObligationAvail = filteredPositions
                                  .filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh !== '备兑')
                                  .reduce((sum, p) => {
                                    const base = p.selectedQuantity ?? p.quantity;
                                    const avail = Number(p.available ?? base) || 0;
                                    return sum + avail;
                                  }, 0);

                                const comboCallStrategies = callStrategiesMap.get(s) || [];
                                const comboPutStrategies = putStrategiesMap.get(s) || [];
                                const comboCallQty = comboCallStrategies.reduce((acc, item) => acc + item.qty, 0);
                                const comboPutQty = comboPutStrategies.reduce((acc, item) => acc + item.qty, 0);

                                let risk = 0;
                                if (underlyingPrice != null) {
                                  const up = underlyingPrice;
                                  const cr = Math.max(0, (up - s) / Math.max(s, 1));
                                  const pr = Math.max(0, (s - up) / Math.max(s, 1));
                                  const wCovered = 0.3;
                                  const wCombo = 0.2;
                                  const shortCall = callObligation + callCovered * wCovered + comboCallQty * wCombo;
                                  const shortPut = putObligation + putCovered * wCovered + comboPutQty * wCombo;
                                  risk = shortCall * cr + shortPut * pr;
                                  const near = Math.max(0, 0.02 - Math.abs(up - s) / Math.max(s, 1)) / 0.02;
                                  risk += near * (callObligation + putObligation) * 0.5;
                                }

                                return {
                                  s,
                                  getM,
                                  callRight,
                                  callRightAvail,
                                  callCovered,
                                  callCoveredAvail,
                                  callObligation,
                                  callObligationAvail,
                                  putRight,
                                  putRightAvail,
                                  putCovered,
                                  putCoveredAvail,
                                  putObligation,
                                  putObligationAvail,
                                  comboCallQty,
                                  comboPutQty,
                                  risk
                                };
                              });

                              const maxRisk = Math.max(1, ...metrics.map(m => m.risk));

                              return metrics.map(m => {
                                const intensity = Math.min(1, m.risk / maxRisk);
                                const h = Math.round(0 + 120 * (1 - intensity));
                                const c = theme === 'dark' ? `hsla(${h},70%,30%,0.35)` : `hsla(${h},85%,85%,0.65)`;
                                const bg = `linear-gradient(to right, ${c} 0%, transparent 100%)`;

                                const activeData = optionsData || localOptionsData;
                                let callPrice = '';
                                let putPrice = '';
                                let quote: OptionQuote | undefined;

                                const findQuote = (data: OptionsData) => {
                                  return data.quotes?.find(q => q.expiry === group.expiry && getQuoteStrike(q) === m.s);
                                };

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
                                  const callCode = quote.call_contract_code || '';
                                  const callFullCode = quote.call_contract_code_full || '';
                                  const putCode = quote.put_contract_code || '';
                                  const putFullCode = quote.put_contract_code_full || '';

                                  const getPrice = (code: string, fullCode: string, last?: number) => {
                                    const p = (code && prices[code]) || (fullCode && prices[fullCode]);
                                    if (p) return p.price.toFixed(4);
                                    return typeof last === 'number' && last ? last.toFixed(4) : '-';
                                  };

                                  callPrice = getPrice(callCode, callFullCode, quote.call_last_price);
                                  putPrice = getPrice(putCode, putFullCode, quote.put_last_price);
                                }

                                let timeValueColor = 'transparent';
                                let displayCallTV = '-';
                                let displayPutTV = '-';

                                if (underlyingPrice != null) {
                                  const cp = parseFloat(callPrice);
                                  const pp = parseFloat(putPrice);

                                  const callTV = !isNaN(cp) ? Math.max(0, cp - Math.max(0, underlyingPrice - m.s)) : null;
                                  const putTV = !isNaN(pp) ? Math.max(0, pp - Math.max(0, m.s - underlyingPrice)) : null;

                                  if (callTV !== null) displayCallTV = callTV.toFixed(4);
                                  if (putTV !== null) displayPutTV = putTV.toFixed(4);

                                  if (callTV !== null || putTV !== null) {
                                    const maxTV = Math.max(callTV || 0, putTV || 0);
                                    const tvRatio = maxTV / underlyingPrice;
                                    const intensity = Math.min(1, tvRatio * 25);
                                    if (intensity > 0.01) {
                                      const alpha = theme === 'dark' ? 0.3 : 0.5;
                                      timeValueColor = `rgba(255, 170, 0, ${intensity * alpha})`;
                                    }
                                  }
                                }

                                return (
                                  <div
                                    key={`tcard-${group.expiry}-${m.s}`}
                                    className={`${themes[theme].background} rounded-lg p-3 border ${themes[theme].border}`}
                                    style={{ backgroundImage: bg, backgroundColor: timeValueColor }}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className={`text-base font-semibold ${themes[theme].text}`}>行权价 {m.s}</div>
                                        {underlyingPrice != null && (
                                          <div className={`text-xs ${themes[theme].text} opacity-70 mt-0.5`}>{m.getM()}</div>
                                        )}
                                      </div>
                                      <div className="text-right shrink-0">
                                        <div className={`text-xs ${themes[theme].text} opacity-70`}>Call / Put</div>
                                        <div className={`text-xs ${themes[theme].text} font-mono`}>
                                          <AnimatedFlash value={callPrice || '-'} type="price" /> / <AnimatedFlash value={putPrice || '-'} type="price" />
                                        </div>
                                        <div className={`text-[11px] ${themes[theme].text} opacity-70 font-mono`}>
                                          TV <AnimatedFlash value={displayCallTV} /> / <AnimatedFlash value={displayPutTV} />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                      <div className={`${themes[theme].card} rounded-lg p-2`}>
                                        <div className={`text-xs font-semibold ${themes[theme].text} opacity-80 mb-2`}>Calls</div>
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${themes[theme].text} opacity-75`}>组合</span>
                                            <span className={`text-xs ${themes[theme].text}`}>{m.comboCallQty}</span>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${themes[theme].text} opacity-75`}>备兑</span>
                                            <div className="flex items-center gap-2">
                                              <span className={`text-xs ${themes[theme].text}`}>{m.callCovered}{m.callCoveredAvail !== m.callCovered ? `（${m.callCoveredAvail}）` : ''}</span>
                                              <button className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`} onClick={() => openAdjustConfirm('call_covered', m.s)}>调整</button>
                                            </div>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${themes[theme].text} opacity-75`}>义务</span>
                                            <div className="flex items-center gap-2">
                                              <span className={`text-xs ${themes[theme].text}`}>{m.callObligation}{m.callObligationAvail !== m.callObligation ? `（${m.callObligationAvail}）` : ''}</span>
                                              <button className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`} onClick={() => openAdjustConfirm('call_obligation', m.s)}>调整</button>
                                            </div>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${themes[theme].text} opacity-75`}>权利</span>
                                            <div className="flex items-center gap-2">
                                              <span className={`text-xs ${themes[theme].text}`}>{m.callRight}{m.callRightAvail !== m.callRight ? `（${m.callRightAvail}）` : ''}</span>
                                              <button className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`} onClick={() => openAdjustConfirm('call_right', m.s)}>调整</button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      <div className={`${themes[theme].card} rounded-lg p-2`}>
                                        <div className={`text-xs font-semibold ${themes[theme].text} opacity-80 mb-2`}>Puts</div>
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${themes[theme].text} opacity-75`}>权利</span>
                                            <div className="flex items-center gap-2">
                                              <span className={`text-xs ${themes[theme].text}`}>{m.putRight}{m.putRightAvail !== m.putRight ? `（${m.putRightAvail}）` : ''}</span>
                                              <button className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`} onClick={() => openAdjustConfirm('put_right', m.s)}>调整</button>
                                            </div>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${themes[theme].text} opacity-75`}>义务</span>
                                            <div className="flex items-center gap-2">
                                              <span className={`text-xs ${themes[theme].text}`}>{m.putObligation}{m.putObligationAvail !== m.putObligation ? `（${m.putObligationAvail}）` : ''}</span>
                                              <button className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`} onClick={() => openAdjustConfirm('put_obligation', m.s)}>调整</button>
                                            </div>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${themes[theme].text} opacity-75`}>备兑</span>
                                            <div className="flex items-center gap-2">
                                              <span className={`text-xs ${themes[theme].text}`}>{m.putCovered}{m.putCoveredAvail !== m.putCovered ? `（${m.putCoveredAvail}）` : ''}</span>
                                              <button className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`} onClick={() => openAdjustConfirm('put_covered', m.s)}>调整</button>
                                            </div>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${themes[theme].text} opacity-75`}>组合</span>
                                            <span className={`text-xs ${themes[theme].text}`}>{m.comboPutQty}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          </div>
                        );
                      })()}
                    </div>
                    )}
                  </div>
                {advisedCombinations.length > 0 && (
                  <div className="mt-0">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 bg-purple-500 rounded"></div>
                      <h4 className={`text-lg font-semibold ${themes[theme].text}`}>组合建议</h4>
                    </div>
                    <div className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} space-y-2`}>
                      {advisedCombinations.map((c, i) => (
                        <div key={`advised-${group.expiry}-${c.type}-${c.buy_strike}-${c.sell_strike}-${i}`} className="flex items-center justify-between gap-2">
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
                                onClick={() => setAdvisedModal({ combo: c, quantity: Math.max(1, c.quantity || 1), mode: 'advised' })}
                            >查看详情</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isExpanded && (callPositions.length > 0 || putPositions.length > 0) && (
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
                                        {(() => {
                                          const base = position.quantity;
                                          const avail = Number(position.available ?? base) || 0;
                                          return <>数量: {base}{avail !== base ? `（${avail}）` : ''}</>;
                                        })()}
                                      </span>
                                      <span className={`${themes[theme].text} opacity-75`}>
                                        权利金: {formatCurrency(position.premium, currencyConfig, 4)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {position.profitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
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
                                        {(() => {
                                          const base = position.quantity;
                                          const avail = Number(position.available ?? base) || 0;
                                          return <>数量: {base}{avail !== base ? `（${avail}）` : ''}</>;
                                        })()}
                                      </span>
                                      <span className={`${themes[theme].text} opacity-75`}>
                                        权利金: {formatCurrency(position.premium, currencyConfig, 4)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {position.profitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
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

                {isExpanded && (group.complex && group.complex.length > 0) && (
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
                                  总成本: {formatCurrency(strategy.totalCost, currencyConfig, 4)}
                                </div>
                                <div className={`text-sm ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  盈亏: {strategy.profitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(strategy.profitLoss), currencyConfig, 4)}
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
                                          {position.profitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                        </div>
                                        <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                          {(() => {
                                            const base = position.quantity;
                                            const avail = Number(position.available ?? base) || 0;
                                            return (
                                              <>
                                                数量: {base}
                                                {avail !== base ? `（${avail}）` : ''}
                                                {' | '}
                                                成本: {formatCurrency(position.premium * position.quantity * 100, currencyConfig, 4)}
                                              </>
                                            );
                                          })()}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!isPageLocked) setConfirmData(null);
        }}
      ></div>
      <div className={`relative w-full rounded-t-xl border-t border-l border-r p-6 max-h-[85vh] flex flex-col md:w-auto md:min-w-[600px] md:max-w-2xl md:rounded-lg md:border md:max-h-[85vh] ${themes[theme].card} ${themes[theme].border}`}>
        <div className={`text-lg font-semibold ${themes[theme].text}`}>{confirmData.title}</div>
        <div className={`mt-2 text-sm ${themes[theme].text}`}>{confirmData.description}</div>
        <div className="mt-4 overflow-y-auto min-h-0 flex-1 space-y-2">
          {confirmData.meta?.action === 'unwind_combo_selection' ? (
            <div className="space-y-4">
              {(confirmData.meta.strategies || []).map((item, idx) => (
                <div key={`strat-select-${idx}`} className={`p-3 rounded border ${themes[theme].border} flex items-center justify-between`}>
                  <div>
                    <div className={`font-semibold ${themes[theme].text}`}>
                      {item.strategy.name}
                      <span className="ml-2 text-xs font-normal opacity-50">{item.strategy.id}</span>
                    </div>
                    <div className={`text-sm opacity-75 ${themes[theme].text}`}>数量: {item.qty}</div>
                    <div className={`text-xs opacity-50 ${themes[theme].text}`}>
                      {item.strategy.positions.map(p => `${p.contract_code || p.symbol} x ${p.quantity}`).join(', ')}
                    </div>
                    {(() => {
                      const est = estimateCloseForStrategy(item.strategy);
                      const net = est.net;
                      const label = net == null ? '对手方一档价未就绪' : (net >= 0 ? '预计收到' : '预计支付');
                      const amountText = net == null ? '--' : formatCurrency(Math.abs(net), currencyConfig, 4);
                      const tsText = est.ts ? format(new Date(est.ts), 'HH:mm:ss') : '--';
                      return (
                        <div className={`mt-2 text-xs ${themes[theme].text} opacity-80`}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{label}</span>
                            <AnimatedFlash value={amountText} className="font-mono" type="price" />
                            <span className="opacity-60">（WS {tsText}）</span>
                          </div>
                          <div className="mt-1 grid grid-cols-1 gap-1">
                            {est.legs.slice(0, 2).map((l, i) => (
                              <div key={`leg-est-${idx}-${i}`} className="flex items-center justify-between gap-3">
                                <div className="truncate opacity-80">
                                  {l.pos.contract_code || l.pos.contract_code_full || l.pos.symbol} • {l.closeSide === 'buy' ? '买入' : '卖出'} • x{l.qty}
                                </div>
                                <div className="font-mono">
                                  <AnimatedFlash value={l.px == null ? '--' : l.px.toFixed(4)} type="price" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={isPageLocked}
                      className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={async () => {
                         if (!selectedAccountId) {
                            toast.error('未选择账户');
                            return;
                         }
                         const { error } = await optionsService.clearCombination(selectedAccountId, item.strategy.id);
                         if (error) {
                           toast.error('清仓失败: ' + error.message);
                         } else {
                           toast.success('已启动清仓任务');
                           setConfirmData(null);
                           onRefresh?.();
                         }
                      }}
                    >清仓</button>
                    <button
                      disabled={isPageLocked}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={async () => {
                        if (pageLockRef.current) return;
                        if (!selectedAccountId) {
                          toast.error('未选择账户');
                          return;
                        }

                        const payload = {
                          strategy_id: item.strategy.id,
                          comb_id: item.strategy.id,
                          positions: item.strategy.positions,
                          meta: {
                            ...(confirmData.meta || {}),
                            action: 'release_combination',
                            strategyIds: [item.strategy.id],
                          },
                          overrides: {},
                        };

                        pageLockRef.current = true;
                        setIsPageLocked(true);
                        try {
                          const resp = await optionsService.closeCombination(payload, selectedAccountId || null, userId || null);
                          if (resp.error) {
                            toast.error('解除组合失败: ' + resp.error.message);
                          } else {
                            toast.success('解除组合成功');
                            setConfirmData(null);
                            onRefresh?.();
                          }
                        } finally {
                          pageLockRef.current = false;
                          setIsPageLocked(false);
                        }
                      }}
                    >解除组合</button>

                  </div>
                </div>
              ))}
            </div>
          ) : confirmData.meta?.action === 'unwind_combo' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className={`text-sm ${themes[theme].text}`}>组合数</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={Number(confirmData.meta?.defaultComboCount || 1)}
                    value={Object.values(qtyOverrides)[0] || 1}
                    onChange={(e) => {
                      const n = parseInt(e.target.value) || 0;
                      const maxCombo = Number(confirmData.meta?.defaultComboCount || 1);
                      const clamped = Math.max(1, Math.min(n, maxCombo));
                      setQtyOverrides(() => {
                      const next: Record<string, number> = {};
                      confirmData.ids.forEach(id => {
                        // Use perLegMaxQty which contains the correct position quantity for strategy legs
                        const maxQty = confirmData.meta?.perLegMaxQty?.[id] ?? 1;
                        next[id] = Math.max(1, Math.min(clamped, maxQty));
                      });
                      return next;
                    });
                      logger.info('[ExpiryGroupCard] combo change', { count: clamped });
                    }}
                    className={`w-24 px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                  />
                  <span className={`text-[10px] ${themes[theme].text} opacity-60`}>最大 {Number(confirmData.meta?.defaultComboCount || 1)}</span>
                </div>
              </div>
              <div className="space-y-2">
                {confirmData.ids.map(id => {
                  let pos = filteredPositions.find(x => x.id === id);
                  if (!pos) {
                    // Fallback search in complex strategies across all buckets
                    for (const bucket of allExpiryBuckets || []) {
                      for (const s of bucket.complex) {
                        const found = s.positions.find(p => p.id === id);
                        if (found) {
                          pos = found;
                          break;
                        }
                      }
                      if (pos) break;
                    }
                  }
                  
                  const maxQty = pos?.quantity ?? confirmData.meta?.perLegMaxQty?.[id] ?? 1;
                  const val = qtyOverrides[id] ?? 1;
                  const avail = Number(pos?.available ?? maxQty) || 0;
                  return (
                    <div key={`confirm-pos-${id}`} className="flex items-center justify-between">
                      <div className={`text-xs ${themes[theme].text}`}>
                        {pos ? `${pos.symbol} ${pos.strike} ${pos.type.toUpperCase()} ${pos.position_type === 'buy' ? '权利' : (pos.position_type_zh === '备兑' ? '备兑' : '义务')}` : id}
                      </div>
                      <div className={`text-xs ${themes[theme].text} opacity-60`}>
                        数量 {val}（总数 {maxQty}{avail !== maxQty ? `，${avail}` : ''}）
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : confirmData.meta?.action === 'sync_category' ? (
            <div className="space-y-2">
              {(() => {
                  const s = Number(confirmData.meta?.strike || 0);
                  const c = String(confirmData.meta?.category || '') as
                    | 'call_right'
                    | 'call_obligation'
                    | 'put_right'
                    | 'put_obligation'
                    | 'call_covered'
                    | 'put_covered';
                  const ids = collectIdsForCategory(c, s);
                  const pos = filteredPositions.find(p => p.id === ids[0]);
                  let code = pos?.contract_code;
                  let fullCode = pos?.contract_code_full;

                  if (!fullCode) {
                    if (confirmData.meta?.contract_code_full) {
                        fullCode = confirmData.meta.contract_code_full;
                        code = confirmData.meta.contract_code;
                    } else {
                        const type = c.startsWith('call') ? 'call' : 'put';
                        const activeData = optionsData || localOptionsData;
                        
                        if (activeData && activeData.quotes) {
                           const quote = activeData.quotes.find(q => q.expiry === group.expiry && getQuoteStrike(q) === s);
                           if (quote) {
                              fullCode = type === 'call' ? quote.call_contract_code_full : quote.put_contract_code_full;
                              code = type === 'call' ? quote.call_contract_code : quote.put_contract_code;
                           }
                        } else if (optionsDataMap) {
                           for (const data of Object.values(optionsDataMap)) {
                              const quote = data.quotes?.find(q => q.expiry === group.expiry && getQuoteStrike(q) === s);
                              if (quote) {
                                 fullCode = type === 'call' ? quote.call_contract_code_full : quote.put_contract_code_full;
                                 code = type === 'call' ? quote.call_contract_code : quote.put_contract_code;
                                 break;
                              }
                           }
                        }
                    }
                  }

                  const priceData = (code && prices[code]) || (fullCode && prices[fullCode]) || null;
                  if (!priceData) return null;
                  
                  return (
                    <div className={`flex flex-col gap-2 mb-2 p-2 rounded border ${themes[theme].border}`}>
                      <div className={`text-xs ${themes[theme].text} flex items-center justify-between`}>
                        <span className="font-medium">最新价: {priceData.price}</span>
                        <span className="opacity-50 text-[10px]">{format(new Date(priceData.timestamp), 'HH:mm:ss')}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex flex-col">
                          <div className={`text-center font-medium border-b ${themes[theme].border} mb-1 text-red-500`}>买盘</div>
                          <div className="grid grid-cols-3 gap-1 px-1 opacity-70 mb-1">
                            <div className="text-left">档位</div>
                            <div className="text-right">价格</div>
                            <div className="text-right">量</div>
                          </div>
                          <div className="overflow-y-auto max-h-[200px] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                            {Array.from({ length: Math.max(priceData.bid_price?.length ?? 0, priceData.bid_vol?.length ?? 0, 5) }).map((_, i) => {
                               const price = priceData.bid_price?.[i] ?? (i === 0 ? priceData.bid : undefined);
                               const vol = priceData.bid_vol?.[i];
                               if (price === undefined && vol === undefined && i >= 5) return null;
                               const isSelected = syncPrice != null && typeof price === 'number' && Math.abs(price - syncPrice) < 1e-8;
                               return (
                                 <div
                                   key={`bid-${i}`}
                                   className={`grid grid-cols-3 gap-1 px-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer ${isSelected ? 'bg-red-100 dark:bg-red-900/40' : ''}`}
                                   onClick={() => {
                                     if (typeof price === 'number') {
                                       setSyncPrice(price);
                                     }
                                   }}
                                 >
                                   <div className="text-left opacity-75">{i + 1}</div>
                                   <div className="text-right text-red-500 font-medium">{price != null ? price.toFixed(4) : '-'}</div>
                                   <div className="text-right opacity-90">{vol ?? '-'}</div>
                                 </div>
                               );
                            })}
                          </div>
                        </div>
                        
                        <div className="flex flex-col">
                          <div className={`text-center font-medium border-b ${themes[theme].border} mb-1 text-green-500`}>卖盘</div>
                          <div className="grid grid-cols-3 gap-1 px-1 opacity-70 mb-1">
                            <div className="text-left">档位</div>
                            <div className="text-right">价格</div>
                            <div className="text-right">量</div>
                          </div>
                          <div className="overflow-y-auto max-h-[200px] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                            {Array.from({ length: Math.max(priceData.ask_price?.length ?? 0, priceData.ask_vol?.length ?? 0, 5) }).map((_, i) => {
                               const price = priceData.ask_price?.[i] ?? (i === 0 ? priceData.ask : undefined);
                               const vol = priceData.ask_vol?.[i];
                               if (price === undefined && vol === undefined && i >= 5) return null;
                               const isSelected = syncPrice != null && typeof price === 'number' && Math.abs(price - syncPrice) < 1e-8;
                               return (
                                 <div
                                   key={`ask-${i}`}
                                   className={`grid grid-cols-3 gap-1 px-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer ${isSelected ? 'bg-green-100 dark:bg-green-900/40' : ''}`}
                                   onClick={() => {
                                     if (typeof price === 'number') {
                                       setSyncPrice(price);
                                     }
                                   }}
                                 >
                                   <div className="text-left opacity-75">{i + 1}</div>
                                   <div className="text-right text-green-500 font-medium">{price != null ? price.toFixed(4) : '-'}</div>
                                   <div className="text-right opacity-90">{vol ?? '-'}</div>
                                 </div>
                               );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                        <div className="flex items-center gap-1">
                          <span className={themes[theme].text}>目标价格</span>
                          <input
                            type="number"
                            step="0.0001"
                            value={syncPrice != null ? syncPrice : ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') {
                                setSyncPrice(null);
                              } else {
                                const n = parseFloat(v);
                                if (!Number.isNaN(n)) {
                                  setSyncPrice(n);
                                }
                              }
                            }}
                            className={`w-24 px-2 py-1 rounded ${themes[theme].input} ${themes[theme].text}`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-[10px]"
                            onClick={() => {
                              if (typeof priceData.price === 'number') {
                                setSyncPrice(priceData.price);
                              }
                            }}
                          >
                            用最新价
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-[10px]"
                            onClick={() => {
                              if (typeof priceData.bid === 'number') {
                                setSyncPrice(priceData.bid);
                              }
                            }}
                          >
                            用买一
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-[10px]"
                            onClick={() => {
                              if (typeof priceData.ask === 'number') {
                                setSyncPrice(priceData.ask);
                              }
                            }}
                          >
                            用卖一
                          </button>
                        </div>
                      </div>
                    </div>
                  );
              })()}
              {(() => {
                  const s = Number(confirmData.meta?.strike || 0);
                  const c = String(confirmData.meta?.category || '') as
                    | 'call_right'
                    | 'call_obligation'
                    | 'put_right'
                    | 'put_obligation'
                    | 'call_covered'
                    | 'put_covered';
                  const ids = collectIdsForCategory(c, s);
                  const pos = filteredPositions.find(p => p.id === ids[0]);
                  if (pos?.contract_code || pos?.contract_code_full) {
                    const code = pos.contract_code_full || pos.contract_code;
                    const wl = whitelists.find(w => w.contract_code === pos.contract_code || (pos.contract_code_full && w.contract_code === pos.contract_code_full));
                    return (
                      <div className={`text-xs ${themes[theme].text} mb-2 flex items-center gap-2`}>
                        <span className="opacity-75">Code: {code}</span>
                        {wl && (
                           <span className="text-amber-500 font-medium text-[10px] border border-amber-500/30 px-1 rounded bg-amber-500/10">
                             ⚠️ 计划执行: {wl.reason} {wl.quantity ? `(${wl.quantity})` : ''}
                           </span>
                        )}
                      </div>
                    );
                  }
                  return null;
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
                  {syncPrice != null && (
                    <span className={`text-[10px] ${themes[theme].text} opacity-70`}>
                      目标价格 {syncPrice.toFixed(4)}
                    </span>
                  )}
                  {(() => {
                    const targetQty = Object.values(qtyOverrides)[0] ?? 0;
                    if (targetQty !== 0) {
                      return (
                        <button
                          className="ml-2 px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
                          title="添加到白名单"
                          onClick={async () => {
                             const s = Number(confirmData.meta?.strike || 0);
                             const c = String(confirmData.meta?.category || '') as
                               | 'call_right'
                               | 'call_obligation'
                               | 'put_right'
                               | 'put_obligation'
                               | 'call_covered'
                               | 'put_covered';
                             
                             const ids = collectIdsForCategory(c, s);
                             const pos = filteredPositions.find(p => p.id === ids[0]);
                             
                             let holdType = 'obligation';
                             if (pos?.hold_type) {
                               holdType = pos.hold_type;
                             } else {
                               if (c.includes('right')) holdType = 'right';
                               else if (c.includes('covered')) holdType = 'covered';
                             }
                             let code = pos?.contract_code;
                             let fullCode = pos?.contract_code_full;
                             
                             if (!fullCode) {
                                if (confirmData.meta?.contract_code_full) {
                                    fullCode = confirmData.meta.contract_code_full;
                                    code = confirmData.meta.contract_code;
                                } else {
                                    const type = c.startsWith('call') ? 'call' : 'put';
                                    const activeData = optionsData || localOptionsData;
                                    if (activeData && activeData.quotes) {
                                       const quote = activeData.quotes.find(q => q.expiry === group.expiry && getQuoteStrike(q) === s);
                                       if (quote) {
                                          fullCode = type === 'call' ? quote.call_contract_code_full : quote.put_contract_code_full;
                                          code = type === 'call' ? quote.call_contract_code : quote.put_contract_code;
                                       }
                                    } else if (optionsDataMap) {
                                       for (const data of Object.values(optionsDataMap)) {
                                          const quote = data.quotes?.find(q => q.expiry === group.expiry && getQuoteStrike(q) === s);
                                          if (quote) {
                                             fullCode = type === 'call' ? quote.call_contract_code_full : quote.put_contract_code_full;
                                             code = type === 'call' ? quote.call_contract_code : quote.put_contract_code;
                                             break;
                                          }
                                       }
                                    }
                                }
                             }

                             if (code) {
                                try {
                                    await optionsService.addWhitelist({
                                        account_id: selectedAccountId || '',
                                        contract_code: code,
                                        contract_code_full: fullCode,
                                        reason: 'Manual adjustment',
                                        quantity: targetQty,
                                        expiry_month: group.expiry.slice(0, 7).replace('-', ''),
                                        option_type: c.startsWith('call') ? 'call' : 'put',
                                        strike_price: s,
                                        hold_type: holdType
                                        ,
                                        is_active: true
                                    }, userId || '', selectedAccountId);
                                    toast.success(`已添加到白名单: ${fullCode || code}`);
                                } catch (err) {
                                    console.error(err);
                                    toast.error('添加白名单失败');
                                }
                             } else {
                                toast.error('无法获取合约代码');
                             }
                          }}
                        >
                          <span>📋</span>
                          <span>加入白名单</span>
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          ) : (
            (() => {
              const items = confirmData.ids.map(id => {
                const pos = filteredPositions.find(x => x.id === id);
                const raw = (allExpiryBuckets || []).flatMap(b => b.single).find(x => x.id === id) || pos;
                const val = qtyOverrides[id] ?? Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity);
                return (
                  <div key={`confirm-pos-${id}`} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-xs ${themes[theme].text}`}>
                        <div>{pos ? `${pos.symbol} ${pos.strike} ${pos.type.toUpperCase()} ${pos.position_type === 'buy' ? '权利' : (pos.position_type_zh === '备兑' ? '备兑' : '义务')}` : id}</div>
                        {(pos?.contract_code || pos?.contract_code_full) && (
                          <div className="mt-0.5 flex items-center gap-2">
                             <span className="opacity-75">Code: {pos.contract_code_full || pos.contract_code}</span>
                             {(() => {
                               const wl = whitelists.find(w => w.contract_code === pos.contract_code || (pos.contract_code_full && w.contract_code === pos.contract_code_full));
                               if (wl) {
                                 return (
                                   <span className="text-amber-500 font-medium text-[10px] border border-amber-500/30 px-1 rounded bg-amber-500/10">
                                     ⚠️ 计划执行: {wl.reason} {wl.quantity ? `(${wl.quantity})` : ''}
                                   </span>
                                 );
                               }
                               return null;
                             })()}
                          </div>
                        )}
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
                            const base = Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity) || 0;
                            setQtyOverrides(prev => ({ ...prev, [id]: base }));
                          }}
                        >全平</button>
                        <span className={`text-[11px] ${themes[theme].text} opacity-60`}>
                          {(() => {
                            const base = Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity) || 0;
                            const avail = Number(pos?.available ?? base) || 0;
                            return `总数 ${base}${avail !== base ? `（${avail}）` : ''}`;
                          })()}
                        </span>
                      </div>
                    </div>
                    <div className={`${themes[theme].background} rounded p-2 border ${themes[theme].border}`}>
                      {(() => {
                        const base = Number(raw?.selectedQuantity ?? raw?.leg_quantity ?? raw?.quantity) || 0;
                        const avail = raw?.available ?? base;
                        const strikeVal = Number(raw?.contract_strike_price ?? raw?.strike);
                        const typeLabel = String(raw?.type || '').toUpperCase();
                        const posLabel = raw?.position_type === 'buy' ? '权利' : (raw?.position_type_zh === '备兑' ? '备兑' : '义务');
                        return (
                          <div className={`text-[11px] ${themes[theme].text}`}>
                            <div>标的 {raw?.symbol}</div>
                            <div>类型 {typeLabel} • {posLabel}</div>
                            <div>行权价 {strikeVal}</div>
                            <div>到期 {raw?.expiry}</div>
                            <div>总数 {base}{avail !== base ? `（${avail}）` : ''}</div>
                            <div>合约名称 {raw?.contract_name ?? ''}</div>
                            <div>合约代码 {raw?.contract_code ?? ''}</div>
                            <div>标的代码 {raw?.opt_undl_code_full ?? ''}</div>
                            <div>类型中文 {raw?.contract_type_zh ?? ''}</div>
                            <div>仓位中文 {raw?.position_type_zh ?? ''}</div>
                            <div>成本价 {typeof raw?.cost_price === 'number' ? raw?.cost_price : String(raw?.cost_price || '')}</div>
                            <div>权利金 {typeof raw?.premium === 'number' ? raw?.premium : String(raw?.premium || '')}</div>
                            <div>当前价值 {typeof raw?.currentValue === 'number' ? raw?.currentValue : String(raw?.currentValue || '')}</div>
                            <div>盈亏 {typeof raw?.profitLoss === 'number' ? raw?.profitLoss : String(raw?.profitLoss || '')}</div>
                            <div>隐含波动率 {typeof raw?.impliedVolatility === 'number' ? raw?.impliedVolatility : String(raw?.impliedVolatility || '')}</div>
                            <div>Greeks Δ {String(raw?.delta ?? '')} • Γ {String(raw?.gamma ?? '')} • Θ {String(raw?.theta ?? '')} • ν {String(raw?.vega ?? '')}</div>
                            <div>原始数量 {String(raw?.quantity ?? '')} • 组合腿数量 {String(raw?.leg_quantity ?? '')}</div>
                            <div>状态 {String(raw?.status ?? '')}</div>
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
                const category = String(confirmData.meta?.category || '') as 'call_right' | 'call_obligation' | 'put_right' | 'put_obligation' | 'call_covered' | 'put_covered';
                const allSingles = (allExpiryBuckets || []).flatMap(b => b.single);
                return allSingles.filter(p => {
                  const sameStrike = Number(p.contract_strike_price ?? p.strike) === strike;
                  const sameExpiry = p.expiry === (confirmData?.meta?.expiry || group.expiry);
                  const isCovered = p.position_type_zh === '备兑' || !!p.is_covered;
                  const isCall = (p.type === 'call' || p.contract_type_zh === 'call');
                  const isPut = (p.type === 'put' || p.contract_type_zh === 'put');
                  const isSell = p.position_type === 'sell';
                  const isBuy = p.position_type === 'buy';
                  if (!sameStrike || !sameExpiry) return false;
                  if (category === 'call_obligation') return isCall && isSell && !isCovered;
                  if (category === 'put_obligation') return isPut && isSell && !isCovered;
                  if (category === 'call_right') return isCall && isBuy;
                  if (category === 'put_right') return isPut && isBuy;
                  if (category === 'call_covered') return isCall && isSell && isCovered;
                  if (category === 'put_covered') return isPut && isSell && isCovered;
                  return false;
                });
              }
              const allSingles = (allExpiryBuckets || []).flatMap(b => b.single);
              return (confirmData?.ids || [])
                .map(id => allSingles.find(x => x.id === id))
                .filter((p): p is OptionsPosition => Boolean(p));
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
                const category = String(confirmData.meta?.category || '') as 'call_right' | 'call_obligation' | 'put_right' | 'put_obligation' | 'call_covered' | 'put_covered';
                const ids = collectIdsForCategory(category, strike);
                const sum = ids.reduce((acc, id) => {
                  const pos = filteredPositions.find(x => x.id === id);
                  const qty = Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity) || 0;
                  return acc + qty;
                }, 0);
                const map: Record<string, { type: 'call' | 'put'; position_type: 'buy' | 'sell' }> = {
                  call_right: { type: 'call', position_type: 'buy' },
                  call_obligation: { type: 'call', position_type: 'sell' },
                  call_covered: { type: 'call', position_type: 'sell' },
                  put_right: { type: 'put', position_type: 'buy' },
                  put_obligation: { type: 'put', position_type: 'sell' },
                  put_covered: { type: 'put', position_type: 'sell' }
                };
                const p = map[category];
                const resp = await optionsService.updatePositions({ updates: [{ type: p.type, position_type: p.position_type, strike, expiry: String(confirmData.meta?.expiry || group.expiry), quantity: sum, option_type: p.type, strike_price: String(strike), price: syncPrice != null ? syncPrice : undefined }], accountId: selectedAccountId || null, userId: userId || null });
                if (resp.error) {
                  toast.error('同步失败');
                } else {
                  toast.success('同步成功');
                }
                setConfirmData(null);
              } else if ((confirmData?.meta?.strategyIds || []).length > 0) {
                if (!selectedAccountId) {
                  toast.error('未选择账户');
                  return;
                }
                const strategyIds = confirmData.meta?.strategyIds || [];
                
                let successCount = 0;
                let failCount = 0;
                
                for (const id of strategyIds) {
                  const { error } = await optionsService.clearCombination(selectedAccountId, id);
                  if (error) {
                    console.error(`Failed to clear combo ${id}:`, error);
                    failCount++;
                  } else {
                    successCount++;
                  }
                }
                
                if (failCount > 0) {
                  toast.error(`清仓任务启动完成: 成功 ${successCount}, 失败 ${failCount}`);
                } else {
                  toast.success(`已启动清仓任务 (共 ${successCount} 个)`);
                }
                setConfirmData(null);
              } else {
                const localOverrides: Record<string, number> = {};
                (confirmData?.ids || []).forEach(id => {
                  const pos = filteredPositions.find(x => x.id === id);
                  const base = Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity) || 0;
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
                const category = String(confirmData.meta?.category || '') as 'call_right' | 'call_obligation' | 'put_right' | 'put_obligation' | 'call_covered' | 'put_covered';
                const map: Record<string, { type: 'call' | 'put'; position_type: 'buy' | 'sell' }> = {
                  call_right: { type: 'call', position_type: 'buy' },
                  call_obligation: { type: 'call', position_type: 'sell' },
                  call_covered: { type: 'call', position_type: 'sell' },
                  put_right: { type: 'put', position_type: 'buy' },
                  put_obligation: { type: 'put', position_type: 'sell' },
                  put_covered: { type: 'put', position_type: 'sell' }
                };
                const p = map[category];
                const strike = Number(confirmData.meta?.strike || 0);
                const allSingles = (allExpiryBuckets || []).flatMap(b => b.single);
                const matches = allSingles.filter(x => {
                  const sameStrike = Number(x.contract_strike_price ?? x.strike) === strike;
                  const sameExpiry = x.expiry === (confirmData?.meta?.expiry || group.expiry);
                  const isCovered = x.position_type_zh === '备兑' || !!x.is_covered;
                  const isCall = (x.type === 'call' || x.contract_type_zh === 'call');
                  const isPut = (x.type === 'put' || x.contract_type_zh === 'put');
                  const isSell = x.position_type === 'sell';
                  const isBuy = x.position_type === 'buy';
                  if (!sameStrike || !sameExpiry) return false;
                  if (category === 'call_obligation') return isCall && isSell && !isCovered;
                  if (category === 'put_obligation') return isPut && isSell && !isCovered;
                  if (category === 'call_right') return isCall && isBuy;
                  if (category === 'put_right') return isPut && isBuy;
                  if (category === 'call_covered') return isCall && isSell && isCovered;
                  if (category === 'put_covered') return isPut && isSell && isCovered;
                  return false;
                });
                const origAvailSum = matches.reduce((acc, x) => acc + (Number(x.available ?? (Number(x.selectedQuantity ?? x.leg_quantity ?? x.quantity) || 0)) || 0), 0);
                const change = q - origAvailSum;
                const foundSymbol = selectedSymbol || filteredPositions.find(pos => Number(pos.contract_strike_price ?? pos.strike) === strike)?.symbol;
                
                // Try to find a reference position to supply contract details
                let referencePos = matches.length > 0 ? matches[0] : undefined;
                if (!referencePos) {
                  // If no direct matches, look for any position with same expiry, strike and type (Call/Put)
                  // to get the contract details (contract_code, etc.)
                  referencePos = filteredPositions.find(pos => 
                    pos.expiry === group.expiry && 
                    Number(pos.contract_strike_price ?? pos.strike) === strike &&
                    (pos.type === p.type || pos.contract_type_zh === p.type)
                  );
                }

                // If still no referencePos, create a synthetic one from quote if available
                if (!referencePos && confirmData.meta?.quote) {
                    const q = confirmData.meta.quote;
                    const isCall = p.type === 'call';
                    const code = isCall ? q.call_contract_code : q.put_contract_code;
                    const fullCode = isCall ? q.call_contract_code_full : q.put_contract_code_full;
                    const val = isCall ? q.call_current_value : q.put_current_value;
                    
                    referencePos = {
                        id: '',
                        symbol: selectedSymbol || '',
                        type: p.type,
                        position_type: p.position_type,
                        strike: strike,
                        expiry: group.expiry,
                        quantity: 0,
                        premium: 0,
                        currentValue: Number(val || 0),
                        profitLoss: 0,
                        profitLossPercentage: 0,
                        impliedVolatility: 0,
                        delta: 0,
                        gamma: 0,
                        theta: 0,
                        vega: 0,
                        status: 'open',
                        openDate: new Date().toISOString(),
                        contract_code: code,
                        contract_code_full: fullCode,
                        is_covered: category === 'call_covered' || category === 'put_covered',
                        position_type_zh: (category === 'call_covered' || category === 'put_covered') ? '备兑' : ((p.position_type === 'sell') ? '义务' : '权利')
                    } as OptionsPosition;
                }

                const positionsToSend = (matches.length > 0 ? matches.map(m => ({ ...m })) : (referencePos ? [{
                  ...referencePos,
                  id: '', // Clear ID to avoid updating the reference position
                  type: p.type,
                  position_type: p.position_type,
                  is_covered: category === 'call_covered' || category === 'put_covered',
                  position_type_zh: (category === 'call_covered' || category === 'put_covered') ? '备兑' : ((p.position_type === 'sell') ? '义务' : '权利')
                } as OptionsPosition] : [])).map(pos => {
                  const isCall = pos.type === 'call';
                  const q = confirmData.meta?.quote;
                  const val = q ? (isCall ? q.call_current_value : q.put_current_value) : pos.currentValue;
                  const code = q ? (isCall ? q.call_contract_code : q.put_contract_code) : pos.contract_code;
                  const fullCode = q ? (isCall ? q.call_contract_code_full : q.put_contract_code_full) : pos.contract_code_full;

                  return {
                    ...pos,
                    option_type: pos.type,
                    strike_price: String(pos.strike),
                    currentValue: Number(val || 0),
                    contract_code: code,
                    contract_code_full: fullCode,
                    is_covered: category === 'call_covered' || category === 'put_covered'
                  };
                });

                const resp = await optionsService.updatePositions({ updates: [{ type: p.type, position_type: p.position_type, strike, expiry: String(confirmData.meta?.expiry || group.expiry), quantity: q, original_quantity: origAvailSum, change_quantity: change, is_covered: category === 'call_covered' || category === 'put_covered', symbol: foundSymbol, option_type: p.type, strike_price: String(strike), price: syncPrice != null ? syncPrice : undefined }], positions: positionsToSend, accountId: selectedAccountId || null, userId: userId || null });
                if (resp.error) {
                  toast.error(resp.error.message || '同步失败');
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
                  toast.error(resp.error.message || '解除组合失败');
                } else {
                  toast.success('解除组合成功');
                  onRefresh?.();
                }
                setConfirmData(null);
              } else if (confirmData.meta?.action === 'clear_combination') {
                if (!selectedAccountId) {
                  toast.error('未选择账户');
                  return;
                }
                const strategyIds = confirmData.meta?.strategyIds || [];
                if (strategyIds.length === 0) {
                  toast.error('未找到组合ID');
                  setConfirmData(null);
                  return;
                }
                
                let successCount = 0;
                let failCount = 0;
                
                for (const id of strategyIds) {
                  const { error } = await optionsService.clearCombination(selectedAccountId, id);
                  if (error) {
                    console.error(`Failed to clear combo ${id}:`, error);
                    failCount++;
                  } else {
                    successCount++;
                  }
                }
                
                if (failCount > 0) {
                  toast.error(`清仓任务启动完成: 成功 ${successCount}, 失败 ${failCount}`);
                } else {
                  toast.success(`已启动清仓任务 (共 ${successCount} 个)`);
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
        {(() => {
          const p = advisedPricePreview;
          if (!p) return null;
          const net = p.net;
          const label = net == null ? '对手方一档价未就绪' : (net >= 0 ? '预计收到' : '预计支付');
          const amountText = net == null ? '--' : formatCurrency(Math.abs(net), currencyConfig, 4);
          const tsText = p.ts ? format(new Date(p.ts), 'HH:mm:ss') : '--';
          return (
            <div className={`mt-3 rounded border p-3 ${themes[theme].border} ${themes[theme].background}`}>
              <div className={`text-sm ${themes[theme].text} flex items-center justify-between gap-3`}>
                <div className="font-semibold">{label}</div>
                <AnimatedFlash value={amountText} className="font-mono" type="price" />
              </div>
              <div className={`mt-1 text-[11px] ${themes[theme].text} opacity-60`}>按 WS 对手方一档价估算（{tsText}）</div>
              <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className={`${themes[theme].text} opacity-80`}>买入腿（ASK1）x{p.buy.qty}</div>
                  <div className={`font-mono ${themes[theme].text}`}>
                    <AnimatedFlash value={p.buy.px == null ? '--' : p.buy.px.toFixed(4)} type="price" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className={`${themes[theme].text} opacity-80`}>卖出腿（BID1）x{p.sell.qty}</div>
                  <div className={`font-mono ${themes[theme].text}`}>
                    <AnimatedFlash value={p.sell.px == null ? '--' : p.sell.px.toFixed(4)} type="price" />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
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
              {(() => {
                const p = advisedModal.combo.buy_position.position;
                const avail = p.available;
                const qty = p.quantity;
                return <>数量 {qty}{avail !== qty ? `（${avail}）` : ''}</>;
              })()}
            </div>
          </div>
          <div className={`${themes[theme].background} rounded p-3 border ${themes[theme].border}`}>
            <div className={`text-sm font-medium ${themes[theme].text}`}>卖出腿</div>
            <div className={`text-xs ${themes[theme].text} opacity-75 mt-1`}>
              {advisedModal.combo.sell_position.position.symbol} {advisedModal.combo.sell_position.position.strike} {String(advisedModal.combo.sell_position.position.type).toUpperCase()} • {advisedModal.combo.sell_position.position.position_type === 'buy' ? '买入' : '卖出'}
            </div>
            <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
              {(() => {
                const p = advisedModal.combo.sell_position.position;
                const avail = p.available;
                const qty = p.quantity;
                return <>数量 {qty}{avail !== qty ? `（${avail}）` : ''}</>;
              })()}
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
            onClick={async () => {
              if (advisedModal.mode === 't_board_create') {
                try {
                  const { error } = await optionsService.createOptionCombination(
                    { ...advisedModal.combo, quantity: advisedModal.quantity },
                    selectedAccountId || null,
                    userId || null
                  );
                  if (error) throw error;
                  toast.success('已创建组合');
                  onRefresh?.();
                  setAdvisedModal(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : '创建失败');
                }
              } else {
                if (onExecuteAdvised) onExecuteAdvised({ ...advisedModal.combo, quantity: advisedModal.quantity });
                setAdvisedModal(null);
              }
            }}
          >执行组合</button>
        </div>
      </div>
    </div>
  )}
  {isPageLocked && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className={`relative w-[92%] max-w-md rounded-lg border p-5 ${themes[theme].card} ${themes[theme].border}`}>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
          <div className={`text-sm font-semibold ${themes[theme].text}`}>解除组合处理中…</div>
        </div>
        <div className={`mt-2 text-xs ${themes[theme].text} opacity-75`}>
          接口返回前已临时锁定页面操作，请耐心等待，不要关闭页面或重复点击。
        </div>
      </div>
    </div>
  )}
</div>
);
}
