import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, X, HelpCircle, Maximize2, Minimize2, Crosshair, RefreshCw, ArrowLeft } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPosition, OptionsStrategy, AdvisedCombination, OptionsData, OptionQuote, OptionWhitelist } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types';
import { optionsService } from '../../../lib/services';
import { logger } from '../../../shared/utils/logger';
import toast from 'react-hot-toast';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { AnimatedFlash } from './AnimatedFlash';
import { OptionQuoteSubscription } from './OptionQuoteSubscription';
import { RealTimeSpreadChart } from './RealTimeSpreadChart';
import { OpenInterestOverlay, formatOINumber } from './OpenInterestOverlay';
import { getComboStatus } from '../utils/portfolioUi';

const STANDARD_ETF_OPTION_CONTRACT_UNIT = 10000;
const STANDARD_ETF_OPTION_UNDERLYINGS = new Set([
  '510050',
  '510300',
  '510500',
  '588000',
  '588080',
  '159919',
  '159922',
  '159915',
  '159901',
]);
const invalidPriceLogKeys = new Set<string>();



interface ExpiryGroupCardProps {
  theme: Theme;
  group: { expiry: string; daysToExpiry: number; single: OptionsPosition[]; complex: OptionsStrategy[] };
  statusFilter: 'all' | 'open' | 'closed' | 'expired';
  filterAndSortPositions: (positions: OptionsPosition[]) => OptionsPosition[];
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
  onExecuteAdvised?: (combo: AdvisedCombination) => void;
  selectedAccountId?: string | null;
  userId?: string | null;
  optionsData?: OptionsData | null;
  optionsDataMap?: Record<string, OptionsData>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isTBoardExpanded: boolean;
  onToggleTBoard: () => void;
  whitelists?: OptionWhitelist[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
  wsRefreshNonce?: number;
}

type ComboDraftState = {
  combo: AdvisedCombination;
  quantity: number;
  mode: 'advised' | 't_board_create';
};

type StrategyStrikeGapItem = {
  key: string;
  optionTypeLabel: string;
  buyStrikeText: string | null;
  sellStrikeText: string | null;
  startStrikeText: string;
  endStrikeText: string;
  tickCount: number | null;
  priceDiffText: string;
};



export function ExpiryGroupCard({
  theme,
  group,
  statusFilter,
  filterAndSortPositions,
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
  onExecuteAdvised,
  selectedAccountId,
  userId,
  optionsData,
  optionsDataMap,
  isExpanded,
  onToggleExpand,
  isTBoardExpanded,
  onToggleTBoard,
  whitelists = [],
  isRefreshing,
  onRefresh,
  wsRefreshNonce = 0
}: ExpiryGroupCardProps) {
  const {
    prices,
    reconnect
  } = useOptionPriceWebSocket();
  const [localState, setLocalState] = useState<{ data: OptionsData | null; symbol: string | null }>({ data: null, symbol: null });
  const { data: localOptionsData, symbol: localDataSymbol } = localState;

  const normalizeCodeList = useCallback((codes: Array<string | undefined | null>) => {
    const cleaned = codes.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean);
    return Array.from(new Set(cleaned));
  }, []);

  const priceKeyIndex = useMemo(() => {
    const map = new Map<string, string>();
    Object.keys(prices).forEach((k) => {
      const base = k.split('.')[0];
      if (base && !map.has(base)) map.set(base, k);
    });
    return map;
  }, [prices]);

  const resolvePriceUpdate = useCallback(
    (codes: Array<string | undefined | null>) => {
      const list = normalizeCodeList(codes);
      for (const c of list) {
        const direct = prices[c];
        if (direct) return direct;

        const base = c.split('.')[0];
        if (base && base !== c) {
          const baseHit = prices[base];
          if (baseHit) return baseHit;
        }

        const indexedKey = priceKeyIndex.get(base);
        if (indexedKey) {
          const indexedHit = prices[indexedKey];
          if (indexedHit) return indexedHit;
        }
      }
      return null;
    },
    [normalizeCodeList, priceKeyIndex, prices]
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

  const [advisedModal, setAdvisedModal] = useState<ComboDraftState | null>(null);
  const [confirmData, setConfirmData] = useState<{ ids: string[]; meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string; defaultComboCount?: number; perLegMaxQty?: Record<string, number>; quote?: OptionQuote; contract_code?: string; contract_code_full?: string; strategies?: Array<{ strategy: OptionsStrategy; qty: number }>; comboCandidate?: AdvisedCombination }; title: string; description: string } | null>(null);
  const [comboManageQuantity, setComboManageQuantity] = useState(1);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [syncPrice, setSyncPrice] = useState<number | null>(null);
  const [spreadHistory, setSpreadHistory] = useState<{ time: string; price: number | null; ts: number }[]>([]);
  const [spreadStatus, setSpreadStatus] = useState<{ ts: number; source: 'snapshot' | 'last_known' | 'empty' } | null>(null);
  const [comboSpreadHistories, setComboSpreadHistories] = useState<Record<string, { time: string; price: number | null; ts: number }[]>>({});
  const [comboSpreadStatuses, setComboSpreadStatuses] = useState<Record<string, { ts: number; source: 'snapshot' | 'last_known' | 'empty' }>>({});
  const [contractUnitMap, setContractUnitMap] = useState<Record<string, number>>({});
  const [contractNameMap, setContractNameMap] = useState<Record<string, string>>({});
  const [isPageLocked, setIsPageLocked] = useState(false);
  const [isDetailsSectionExpanded, setIsDetailsSectionExpanded] = useState(false);
  const [expandedComboIds, setExpandedComboIds] = useState<Record<string, boolean>>({});
  const allSinglePositions = useMemo(() => (allExpiryBuckets || []).flatMap(bucket => bucket.single), [allExpiryBuckets]);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  ));
  const [mobileTBoardScale, setMobileTBoardScale] = useState(0.85);
  const [isTBoardFullscreen, setIsTBoardFullscreen] = useState(false);
  const pageLockRef = useRef(false);
  const requestedContractUnitRef = useRef<Record<string, number>>({});
  const tBoardScrollRef = useRef<HTMLDivElement | null>(null);
  const strikeHeaderRef = useRef<HTMLTableCellElement | null>(null);
  const tBoardTableRef = useRef<HTMLTableElement | null>(null);
  const [showOpenInterestOverlay, setShowOpenInterestOverlay] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tboard_show_oi_overlay');
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tboard_show_oi_overlay', String(showOpenInterestOverlay));
    } catch {}
  }, [showOpenInterestOverlay]);
  const lastLoggedConfirmRef = useRef<string | null>(null);
  


  // Body scroll lock effect
  useEffect(() => {
    if (confirmData || advisedModal) {
      document.body.style.overflow = 'hidden';

      // Debug logging for confirmation dialogs
      const isDebug = import.meta.env.DEV || 
                      new URLSearchParams(window.location.search).get('debug') === 'true' || 
                      localStorage.getItem('options_portfolio_debug') === 'true';
      
      const confirmId = confirmData 
        ? `confirm-${confirmData.title}-${confirmData.ids.join(',')}`
        : (advisedModal ? `advised-${advisedModal.combo.description}-${advisedModal.mode}` : null);

      if (isDebug && confirmId && lastLoggedConfirmRef.current !== confirmId) {
        lastLoggedConfirmRef.current = confirmId;
        console.group('%c[Options Portfolio Debug] Confirmation Dialog Active', 'color: #3b82f6; font-weight: bold;');
        console.log('Title:', confirmData?.title || (advisedModal ? '组合建议/管理' : ''));
        console.log('Action:', confirmData?.meta?.action || advisedModal?.mode);
        
        // Collect all relevant positions for this dialog
        const positions = confirmData 
          ? confirmData.ids.map(id => allSinglePositions.find(p => p.id === id)).filter(Boolean) as OptionsPosition[]
          : [];
        
        if (positions.length > 0) {
           console.log('Affected Positions:');
           console.table(positions.map(p => ({
             code: p.contract_code_full || p.symbol,
             type: p.contract_type_zh || p.type,
             strike: p.contract_strike_price || p.strike,
             expiry: p.expiry,
             qty: p.quantity,
             avail: p.available
           })));
         } else {
           const meta = confirmData?.meta || (advisedModal ? { comboCandidate: advisedModal.combo } : null);

          if (meta?.comboCandidate) {
            const c = meta.comboCandidate;
            const legs = [];
            if (c.buy_position) legs.push(c.buy_position.position);
            if (c.sell_position) legs.push(c.sell_position.position);
            
            if (legs.length > 0) {
              console.log('Combo Legs (Market Data in UI):');
              console.table(legs.map(p => ({
                code: p.contract_code_full || p.symbol,
                type: p.contract_type_zh || p.type,
                strike: p.contract_strike_price || p.strike,
                expiry: p.expiry,
                qty: p.quantity,
                avail: p.available
              })));
            }
          }
           
           if (meta?.strategies && meta.strategies.length > 0) {
             const strategyPositions = meta.strategies.flatMap((s: any) => s.strategy.positions);
             if (strategyPositions.length > 0) {
               console.log('Existing Strategies (Market Data in UI):');
               console.table(strategyPositions.map((p: OptionsPosition) => ({
                 code: p.contract_code_full || p.symbol,
                 type: p.contract_type_zh || p.type,
                 strike: p.contract_strike_price || p.strike,
                 expiry: p.expiry,
                 qty: p.quantity,
                 avail: p.available
               })));
             }
           }

           if (!meta?.comboCandidate && meta?.contract_code_full) {
             console.log('Target Contract:', meta.contract_code_full);
           }
         }
         
         console.groupEnd();
      }
    } else {
      document.body.style.overflow = '';
      lastLoggedConfirmRef.current = null;
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [confirmData, advisedModal, allSinglePositions]);
  const hasUserAdjustedTBoardRef = useRef(false);
  const isProgrammaticTBoardScrollRef = useRef(false);
  const initialCenteredRef = useRef(false);
  const basePositions = useMemo(() => filterAndSortPositions(group.single), [filterAndSortPositions, group.single]);

  const filteredPositions = useMemo(() => selectedSymbol
    ? basePositions.filter(p => p.opt_undl_code_full === selectedSymbol)
    : basePositions, [selectedSymbol, basePositions]);

  // Memoized strike to option quote mapping for O(1) lookups during rendering
  const quotesByStrike = useMemo(() => {
    const map = new Map<number, OptionQuote>();
    const activeData = optionsData || localOptionsData;
    const processQuotes = (quotes?: OptionQuote[]) => {
      if (!quotes) return;
      quotes.forEach(q => {
        if (q.expiry === group.expiry) {
          map.set(getQuoteStrike(q), q);
        }
      });
    };
    if (activeData) processQuotes(activeData.quotes);
    if (optionsDataMap) {
      Object.values(optionsDataMap).forEach(data => processQuotes(data.quotes));
    }
    return map;
  }, [optionsData, localOptionsData, optionsDataMap, group.expiry]);

  // Memoized strikes and metrics for T-board quantity dashboard
  const tBoardStrikesAndMetrics = useMemo(() => {
    const callStrategiesMap = new Map<number, { strategy: OptionsStrategy, qty: number }[]>();
    const putStrategiesMap = new Map<number, { strategy: OptionsStrategy, qty: number }[]>();
    
    (allExpiryBuckets || []).forEach(bucket => {
      bucket.complex.forEach(s => {
        if (s.positions.some(p => p.expiry === group.expiry)) {
          const c = computeCombosForPositions(s, 'call');
          const p = computeCombosForPositions(s, 'put');
          
          const relevantPositions = s.positions.filter(pos => pos.expiry === group.expiry);
          const strategyQty = relevantPositions.find(pos => pos.position_type === 'buy')?.quantity || relevantPositions[0]?.quantity || 0;

          c.forEach((_val: number, k: number) => {
             const list = callStrategiesMap.get(k) || [];
             list.push({ strategy: s, qty: strategyQty });
             callStrategiesMap.set(k, list);
          });
          p.forEach((_val: number, k: number) => {
             const list = putStrategiesMap.get(k) || [];
             list.push({ strategy: s, qty: strategyQty });
             putStrategiesMap.set(k, list);
          });
        }
      });
    });

    const complexStrikes = (group.complex || []).flatMap(s => 
      s.positions
        .filter(p => p.expiry === group.expiry && (!selectedSymbol || p.opt_undl_code_full === selectedSymbol))
        .map(p => Number(p.contract_strike_price ?? p.strike))
    );
    const singleStrikes = filteredPositions.map(p => p.strike);
    
    const activeData = optionsData || localOptionsData;
    const dataStrikes = new Set<number>();
    
    if (activeData?.quotes) {
      if (!selectedSymbol || activeData.opt_undl_code_full === selectedSymbol) {
        activeData.quotes.forEach(q => {
          if (q.expiry === group.expiry) {
            dataStrikes.add(getQuoteStrike(q));
          }
        });
      }
    }
    
    if (optionsDataMap) {
      Object.values(optionsDataMap).forEach(data => {
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

    const metrics = rows.map(row => {
      const s = row.strike;
      const getM = () => {
        if (underlyingPrice == null) return '';
        const thr = 0.005;
        const diffRatio = Math.abs(underlyingPrice - s) / Math.max(s, 1);
        if (diffRatio <= thr) return 'ATM';
        return '';
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

    return { strikes, metrics };
  }, [allExpiryBuckets, group.expiry, group.complex, selectedSymbol, filteredPositions, optionsData, localOptionsData, optionsDataMap, underlyingPrice]);

  const { openInterestByStrike, maxOpenInterest } = useMemo(() => {
    const list = (tBoardStrikesAndMetrics.metrics || []).map((metric) => {
      const quote = quotesByStrike.get(metric.s);
      const rawQuote = quote as (OptionQuote & {
        call_open_interest?: number;
        put_open_interest?: number;
        call_oi?: number;
        put_oi?: number;
        callOi?: number;
        putOi?: number;
      }) | undefined;
      const call = Number(
        rawQuote?.callOpenInterest ??
        rawQuote?.call_open_interest ??
        rawQuote?.call_oi ??
        rawQuote?.callOi ??
        0
      );
      const put = Number(
        rawQuote?.putOpenInterest ??
        rawQuote?.put_open_interest ??
        rawQuote?.put_oi ??
        rawQuote?.putOi ??
        0
      );
      return {
        strike: metric.s,
        call: Number.isFinite(call) && call > 0 ? call : 0,
        put: Number.isFinite(put) && put > 0 ? put : 0,
      };
    });
    const maxOI = Math.max(1, ...list.flatMap(item => [item.call, item.put]));
    return { openInterestByStrike: list, maxOpenInterest: maxOI };
  }, [tBoardStrikesAndMetrics.metrics, quotesByStrike]);

  const oiSummary = useMemo(() => {
    if (!openInterestByStrike || openInterestByStrike.length === 0) return null;
    let maxCall = 0;
    let maxCallStrike = 0;
    let maxPut = 0;
    let maxPutStrike = 0;
    let totalCall = 0;
    let totalPut = 0;

    openInterestByStrike.forEach(item => {
      totalCall += item.call;
      totalPut += item.put;
      if (item.call > maxCall) {
        maxCall = item.call;
        maxCallStrike = item.strike;
      }
      if (item.put > maxPut) {
        maxPut = item.put;
        maxPutStrike = item.strike;
      }
    });

    if (totalCall === 0 && totalPut === 0) return null;

    const pcr = totalCall > 0 ? (totalPut / totalCall).toFixed(2) : '--';

    return {
      maxCall,
      maxCallStrike,
      maxPut,
      maxPutStrike,
      totalCall,
      totalPut,
      pcr,
    };
  }, [openInterestByStrike]);

  const embeddedComboDraft = useMemo<ComboDraftState | null>(() => {
    if (confirmData?.meta?.action !== 'combo_manage' || !confirmData.meta.comboCandidate) return null;
    return {
      combo: confirmData.meta.comboCandidate,
      quantity: Math.max(1, Number(comboManageQuantity) || 1),
      mode: 't_board_create',
    };
  }, [comboManageQuantity, confirmData]);

  const activeComboDraft = confirmData?.meta?.action === 'combo_manage' && confirmData.meta.comboCandidate
    ? embeddedComboDraft
    : advisedModal;

  const resolveDisplayPosition = useCallback((position?: OptionsPosition | null) => {
    if (!position) return null;
    const matchByContract = (item: OptionsPosition) =>
      (position.contract_code_full && item.contract_code_full === position.contract_code_full) ||
      (position.contract_code && item.contract_code === position.contract_code) ||
      (position.contract_code_full && item.contract_code === position.contract_code_full) ||
      (position.contract_code && item.contract_code_full === position.contract_code) ||
      ((position.contract_name || position.symbol) &&
        (item.contract_name === position.contract_name ||
          item.symbol === position.symbol ||
          item.contract_name === position.symbol ||
          item.symbol === position.contract_name) &&
        Math.abs(Number(item.contract_strike_price ?? item.strike) - Number(position.contract_strike_price ?? position.strike)) < 1e-8);

    const matched =
      allSinglePositions.find(matchByContract) ||
      filteredPositions.find(matchByContract) ||
      allSinglePositions.find((item) => item.id === position.id) ||
      filteredPositions.find((item) => item.id === position.id);

    if (!matched) return position;

    const merged: Record<string, unknown> = { ...matched };
    Object.entries(position).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        merged[key] = value;
      }
    });
    return merged as unknown as OptionsPosition;
  }, [allSinglePositions, filteredPositions]);

  const getPositionContractLabel = useCallback((position?: OptionsPosition | null) => {
    const resolved = resolveDisplayPosition(position);
    if (!resolved) return '';
    return resolved.contract_name || resolved.contract_code_full || resolved.contract_code || resolved.symbol || '';
  }, [resolveDisplayPosition]);

  const normalizeContractCodeKey = useCallback((code?: string | null) => {
    return typeof code === 'string' ? code.trim() : '';
  }, []);

  const normalizeUnderlyingCodeKey = useCallback((code?: string | null) => {
    if (typeof code !== 'string') return '';
    return code.trim().toUpperCase().split('.')[0];
  }, []);

  const registerContractUnit = useCallback((code: string | undefined | null, fullCode: string | undefined | null, unit: number) => {
    if (!Number.isFinite(unit) || unit <= 0) return;
    const codeKey = normalizeContractCodeKey(code);
    const fullCodeKey = normalizeContractCodeKey(fullCode);
    const baseFullCodeKey = fullCodeKey ? fullCodeKey.split('.')[0] : '';
    setContractUnitMap((prev) => {
      const next = { ...prev };
      if (codeKey) next[codeKey] = unit;
      if (fullCodeKey) next[fullCodeKey] = unit;
      if (baseFullCodeKey) next[baseFullCodeKey] = unit;
      return next;
    });
  }, [normalizeContractCodeKey]);

  const registerContractName = useCallback((code: string | undefined | null, fullCode: string | undefined | null, name: string | undefined | null) => {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) return;
    const codeKey = normalizeContractCodeKey(code);
    const fullCodeKey = normalizeContractCodeKey(fullCode);
    const baseFullCodeKey = fullCodeKey ? fullCodeKey.split('.')[0] : '';
    setContractNameMap((prev) => {
      const next = { ...prev };
      if (codeKey) next[codeKey] = normalizedName;
      if (fullCodeKey) next[fullCodeKey] = normalizedName;
      if (baseFullCodeKey) next[baseFullCodeKey] = normalizedName;
      return next;
    });
  }, [normalizeContractCodeKey]);

  const getContractNameForPosition = useCallback((position?: OptionsPosition | null) => {
    const resolved = resolveDisplayPosition(position);
    const nameFromPosition = typeof resolved?.contract_name === 'string' ? resolved.contract_name.trim() : '';
    if (nameFromPosition) return nameFromPosition;
    if (!resolved) return '';
    const fullCodeKey = normalizeContractCodeKey(resolved.contract_code_full);
    const codeKey = normalizeContractCodeKey(resolved.contract_code);
    const symbolKey = normalizeContractCodeKey(resolved.symbol);
    const keys = [
      fullCodeKey,
      fullCodeKey ? fullCodeKey.split('.')[0] : '',
      codeKey,
      symbolKey,
      symbolKey ? symbolKey.split('.')[0] : '',
    ].filter(Boolean);
    for (const key of keys) {
      const value = contractNameMap[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return '';
  }, [contractNameMap, normalizeContractCodeKey, resolveDisplayPosition]);

  const getContractUnitForPosition = useCallback((position?: OptionsPosition | null) => {
    if (!position) return null;
    const rawUnit = Number((position as OptionsPosition & { contract_unit?: unknown }).contract_unit);
    if (Number.isFinite(rawUnit) && rawUnit > 0) return rawUnit;
    const fullCodeKey = normalizeContractCodeKey(position.contract_code_full);
    const codeKey = normalizeContractCodeKey(position.contract_code);
    const symbolKey = normalizeContractCodeKey(position.symbol);
    const keys = [
      fullCodeKey,
      fullCodeKey ? fullCodeKey.split('.')[0] : '',
      codeKey,
      symbolKey,
      symbolKey ? symbolKey.split('.')[0] : '',
    ].filter(Boolean);
    for (const key of keys) {
      const value = contractUnitMap[key];
      if (Number.isFinite(value) && value > 0) return value;
    }
    return null;
  }, [contractUnitMap, normalizeContractCodeKey]);

  const getEffectiveContractUnitForPosition = useCallback((position?: OptionsPosition | null) => {
    if (!position) {
      return {
        effectiveUnit: null as number | null,
        rawUnit: null as number | null,
        usedStandardUnit: false,
      };
    }

    const rawUnit = getContractUnitForPosition(position);
    const underlyingKey = normalizeUnderlyingCodeKey(position.opt_undl_code_full);
    const isStandardEtfOption = STANDARD_ETF_OPTION_UNDERLYINGS.has(underlyingKey);

    const codeCandidates = [position.contract_code_full, position.symbol]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().toUpperCase());
    const codeFlag = codeCandidates
      .map((value) => value.match(/[CP]\d{4}([A-Z])\d{4,5}$/)?.[1] ?? null)
      .find((flag): flag is string => !!flag);
    const nameSuffix = (position.contract_name || '').trim().slice(-1).toUpperCase();
    const isAdjustedContract =
      (typeof codeFlag === 'string' && codeFlag !== 'M') ||
      (!!nameSuffix && ['A', 'B', 'C', 'D'].includes(nameSuffix));

    if (isStandardEtfOption && !isAdjustedContract) {
      return {
        effectiveUnit: STANDARD_ETF_OPTION_CONTRACT_UNIT,
        rawUnit,
        usedStandardUnit: rawUnit !== STANDARD_ETF_OPTION_CONTRACT_UNIT,
      };
    }

    return {
      effectiveUnit: rawUnit,
      rawUnit,
      usedStandardUnit: false,
    };
  }, [getContractUnitForPosition, normalizeUnderlyingCodeKey]);

  const normalizeOptionType = useCallback((position?: OptionsPosition | null): 'call' | 'put' | null => {
    if (!position) return null;
    const candidates = [
      position.type,
      position.option_type,
      position.contract_type_zh,
      position.contract_type,
      position.contract_name,
      position.symbol,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    for (const raw of candidates) {
      if (raw === 'call' || raw === 'c' || raw.includes('call') || raw.includes('认购') || raw.includes('购')) {
        return 'call';
      }
      if (raw === 'put' || raw === 'p' || raw.includes('put') || raw.includes('认沽') || raw.includes('沽')) {
        return 'put';
      }
    }
    return null;
  }, []);

  const formatStrikeNumber = useCallback((value: number) => {
    if (!Number.isFinite(value)) return '--';
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(4).replace(/\.?0+$/, '');
  }, []);

  const expiryStrikeLadder = useMemo(() => {
    const sourceQuotes = [optionsData, localOptionsData, ...(optionsDataMap ? Object.values(optionsDataMap) : [])]
      .filter((data): data is OptionsData => !!data)
      .filter(data => !selectedSymbol || data.opt_undl_code_full === selectedSymbol)
      .flatMap(data => data.quotes || [])
      .filter(q => q.expiry === group.expiry);
    const quoteStrikes = sourceQuotes.map(q => getQuoteStrike(q)).filter((strike) => Number.isFinite(strike));
    const positionStrikes = allSinglePositions
      .filter(p => p.expiry === group.expiry)
      .map(p => Number(p.contract_strike_price ?? p.strike))
      .filter((strike) => Number.isFinite(strike));
    return Array.from(new Set([...quoteStrikes, ...positionStrikes])).sort((a, b) => a - b);
  }, [allSinglePositions, getQuoteStrike, group.expiry, localOptionsData, optionsData, optionsDataMap, selectedSymbol]);

  const getStrategyStrikeGapSummary = useCallback((strategy: OptionsStrategy): StrategyStrikeGapItem[] => {
    const legs = (strategy.positions || [])
      .map((position) => resolveDisplayPosition(position))
      .filter((position): position is OptionsPosition => !!position);
    if (legs.length < 2) return [];

    const summaries: StrategyStrikeGapItem[] = [];
    (['call', 'put'] as const).forEach((optionType) => {
      const typedLegs = legs.filter((position) => normalizeOptionType(position) === optionType);
      if (typedLegs.length < 2) return;

      const buys = typedLegs.filter(position => position.position_type === 'buy');
      const sells = typedLegs.filter(position => position.position_type === 'sell');
      const optionTypeLabel = optionType === 'call' ? '认购' : '认沽';

      if (buys.length === 1 && sells.length === 1) {
        const buyStrike = Number(buys[0].contract_strike_price ?? buys[0].strike);
        const sellStrike = Number(sells[0].contract_strike_price ?? sells[0].strike);
        if (Number.isFinite(buyStrike) && Number.isFinite(sellStrike)) {
          const idxA = expiryStrikeLadder.indexOf(buyStrike);
          const idxB = expiryStrikeLadder.indexOf(sellStrike);
          summaries.push({
            key: `${optionType}-${buyStrike}-${sellStrike}`,
            optionTypeLabel,
            buyStrikeText: formatStrikeNumber(buyStrike),
            sellStrikeText: formatStrikeNumber(sellStrike),
            startStrikeText: formatStrikeNumber(Math.min(buyStrike, sellStrike)),
            endStrikeText: formatStrikeNumber(Math.max(buyStrike, sellStrike)),
            tickCount: idxA >= 0 && idxB >= 0 ? Math.abs(idxA - idxB) : null,
            priceDiffText: formatStrikeNumber(Math.abs(buyStrike - sellStrike)),
          });
          return;
        }
      }

      const uniqueStrikes = Array.from(new Set(
        typedLegs
          .map(position => Number(position.contract_strike_price ?? position.strike))
          .filter((strike) => Number.isFinite(strike))
      )).sort((a, b) => a - b);

      if (uniqueStrikes.length >= 2) {
        const firstStrike = uniqueStrikes[0];
        const lastStrike = uniqueStrikes[uniqueStrikes.length - 1];
        const idxA = expiryStrikeLadder.indexOf(firstStrike);
        const idxB = expiryStrikeLadder.indexOf(lastStrike);
        summaries.push({
          key: `${optionType}-${firstStrike}-${lastStrike}`,
          optionTypeLabel,
          buyStrikeText: null,
          sellStrikeText: null,
          startStrikeText: formatStrikeNumber(firstStrike),
          endStrikeText: formatStrikeNumber(lastStrike),
          tickCount: idxA >= 0 && idxB >= 0 ? Math.abs(idxA - idxB) : null,
          priceDiffText: formatStrikeNumber(Math.abs(firstStrike - lastStrike)),
        });
      }
    });

    return summaries;
  }, [expiryStrikeLadder, formatStrikeNumber, normalizeOptionType, resolveDisplayPosition]);

  const getStrategyPerformanceMetrics = useCallback((
    strategy: OptionsStrategy,
    est?: { net: number | null; perHedge: number | null; pairedQty: number }
  ) => {
    const legs = (strategy.positions || [])
      .map((position) => resolveDisplayPosition(position))
      .filter((position): position is OptionsPosition => !!position);

    let hasVerticalCandidate = false;
    let missingUnitForCandidate = false;
    let hasUnknownTypeCandidate = false;

    if (legs.length === 2) {
      const buys = legs.filter((position) => position.position_type === 'buy');
      const sells = legs.filter((position) => position.position_type === 'sell');
      if (buys.length === 1 && sells.length === 1) {
        const t1 = normalizeOptionType(legs[0]);
        const t2 = normalizeOptionType(legs[1]);
        if (t1 == null && t2 == null) {
          hasUnknownTypeCandidate = true;
        }
      }
    }

    for (const optionType of ['call', 'put'] as const) {
      const typedLegs = legs.filter((position) => normalizeOptionType(position) === optionType);
      if (typedLegs.length !== 2) continue;

      const buys = typedLegs.filter((position) => position.position_type === 'buy');
      const sells = typedLegs.filter((position) => position.position_type === 'sell');
      if (buys.length !== 1 || sells.length !== 1) continue;

      hasVerticalCandidate = true;

      const buyLeg = buys[0];
      const sellLeg = sells[0];
      const buyStrike = Number(buyLeg.contract_strike_price ?? buyLeg.strike);
      const sellStrike = Number(sellLeg.contract_strike_price ?? sellLeg.strike);
      const spreadWidth = Math.abs(sellStrike - buyStrike);
      if (!Number.isFinite(spreadWidth) || spreadWidth <= 0) continue;

      const buyLegUnitInfo = getEffectiveContractUnitForPosition(buyLeg);
      const sellLegUnitInfo = getEffectiveContractUnitForPosition(sellLeg);
      const contractUnit = buyLegUnitInfo.effectiveUnit ?? sellLegUnitInfo.effectiveUnit;
      const rawContractUnit = buyLegUnitInfo.rawUnit ?? sellLegUnitInfo.rawUnit;
      const usedStandardContractUnit = buyLegUnitInfo.usedStandardUnit || sellLegUnitInfo.usedStandardUnit;
      if (!contractUnit) {
        missingUnitForCandidate = true;
        continue;
      }

      const findStrikeIndex = (strike: number) => {
        const eps = 1e-8;
        for (let i = 0; i < expiryStrikeLadder.length; i += 1) {
          const v = expiryStrikeLadder[i];
          if (Math.abs(v - strike) <= eps) return i;
        }
        return -1;
      };
      const idxA = findStrikeIndex(buyStrike);
      const idxB = findStrikeIndex(sellStrike);
      const tickCount = idxA >= 0 && idxB >= 0 ? Math.abs(idxA - idxB) : null;
      const tickSize = tickCount != null && tickCount > 0 ? spreadWidth / tickCount : null;

      const comboCount = Math.max(1, est?.pairedQty || 0);
      const avgStrike = (Math.abs(buyStrike) + Math.abs(sellStrike)) / 2;
      const refSpot = underlyingPrice != null ? Math.abs(underlyingPrice) : null;
      const ratio = refSpot != null && refSpot > 0 ? avgStrike / refSpot : null;
      const strikeScale =
        ratio != null && ratio >= 200
          ? (ratio >= 5000 ? 10000 : 1000)
          : 1;
      const normalizedSpreadWidth = spreadWidth / strikeScale;
      const normalizedTickSize = tickSize != null ? tickSize / strikeScale : null;

      const isCall = optionType === 'call';
      const isCredit = isCall ? (sellStrike < buyStrike) : (sellStrike > buyStrike);

      // Keep the dialog on a normalized "single combo" basis.
      const premiumDiff = Number(sellLeg.premium || 0) - Number(buyLeg.premium || 0);
      const maxProfit = isCredit
        ? (premiumDiff > 0 ? premiumDiff * contractUnit : (strategy.maxReward && Number.isFinite(strategy.maxReward) ? (strategy.maxReward / comboCount) : normalizedSpreadWidth * contractUnit))
        : normalizedSpreadWidth * contractUnit;

      const currentSpreadValue = est?.perHedge != null
        ? Math.max(0, (isCredit ? -est.perHedge : est.perHedge) * contractUnit)
        : null;
      const remainingProfit = currentSpreadValue != null
        ? (isCredit ? currentSpreadValue : Math.max(0, maxProfit - currentSpreadValue))
        : null;
      const profitRealizationPct =
        currentSpreadValue != null && maxProfit > 0
          ? (isCredit
              ? Math.max(0, Math.min(100, ((maxProfit - currentSpreadValue) / maxProfit) * 100))
              : Math.max(0, Math.min(100, (currentSpreadValue / maxProfit) * 100)))
          : null;

      return {
        mode: 'spread_value' as const,
        maxProfit,
        currentProfit: currentSpreadValue,
        remainingProfit,
        profitRealizationPct,
        hasInfiniteMaxProfit: false,
        contractUnit,
        rawContractUnit,
        usedStandardContractUnit,
        comboCount,
        currentLabel: '当前价差价值',
        tickCount,
        tickSize: normalizedTickSize,
        strikeDiff: normalizedSpreadWidth,
        strikeScale,
        calcStatus: 'ok' as const,
        calcStatusText: '',
      };
    }

    const rawMaxProfit = strategy.maxReward;
    const currentProfit = Number.isFinite(strategy.profitLoss) ? strategy.profitLoss : null;
    const hasInfiniteMaxProfit = rawMaxProfit === Infinity;
    const maxProfit = Number.isFinite(rawMaxProfit) && rawMaxProfit > 0 ? rawMaxProfit : null;
    const remainingProfit = maxProfit != null && currentProfit != null ? Math.max(0, maxProfit - currentProfit) : null;
    const profitRealizationPct =
      maxProfit != null && currentProfit != null
        ? Math.max(0, Math.min(100, (currentProfit / maxProfit) * 100))
        : null;
    return {
      mode: 'pnl' as const,
      maxProfit,
      currentProfit,
      remainingProfit,
      profitRealizationPct,
      hasInfiniteMaxProfit,
      contractUnit: null,
      comboCount: null,
      currentLabel: '当前盈亏',
      tickCount: null,
      tickSize: null,
      strikeDiff: null,
      strikeScale: null,
      calcStatus: hasVerticalCandidate && missingUnitForCandidate
        ? 'missing_unit' as const
        : hasUnknownTypeCandidate
          ? 'unknown_type' as const
          : 'not_vertical' as const,
      calcStatusText: hasVerticalCandidate && missingUnitForCandidate
        ? '合约乘数未就绪（等待合约详情 API）'
        : hasUnknownTypeCandidate
          ? '腿类型未识别（缺少 Call/Put 标记）'
          : '仅支持标准两腿价差（一买一卖）',
    };
  }, [expiryStrikeLadder, getEffectiveContractUnitForPosition, normalizeOptionType, resolveDisplayPosition, underlyingPrice]);

  // Calculate total margin for the group
  const totalMargin = useMemo(() => {
    return group.single.reduce((sum, p) => sum + (p.margin || 0), 0) +
           group.complex.reduce((sum, s) => sum + s.positions.reduce((pSum, p) => pSum + (p.margin || 0), 0), 0);
  }, [group]);

  const totalProfitLoss = useMemo(() => {
    const singlePL = group.single.reduce((sum, p) => sum + (Number.isFinite(p.profitLoss) ? p.profitLoss : 0), 0);
    const complexPL = group.complex.reduce((sum, s) => sum + (Number.isFinite(s.profitLoss) ? s.profitLoss : 0), 0);
    return singlePL + complexPL;
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

  const prevWsRefreshNonceRef = useRef<number>(wsRefreshNonce);
  useEffect(() => {
    if (prevWsRefreshNonceRef.current === wsRefreshNonce) return;
    prevWsRefreshNonceRef.current = wsRefreshNonce;
    // Manual refresh: trigger a reconnection to reset everything
    reconnect();
  }, [wsRefreshNonce, reconnect]);

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
    const pool = (allExpiryBuckets || []).flatMap(b => b.single).concat(filteredPositions || []);
    const uniquePool = Array.from(new Map(pool.map(p => [p.id, p])).values());

    const ids = uniquePool
      .filter(p => {
        const isCall = isCallLeg(p);
        const isPut = isPutLeg(p);
        const isSell = p.position_type === 'sell';
        const isBuy = p.position_type === 'buy';
        const isCovered = p.position_type_zh === '备兑' || !!p.is_covered;
        const pStrike = Number(p.contract_strike_price ?? p.strike);
        const sameStrike = Math.abs(pStrike - strike) < 1e-4;
        const sameExpiry = p.expiry === group.expiry || (confirmData?.meta?.expiry && p.expiry === confirmData.meta.expiry);
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
  }, [allExpiryBuckets, confirmData?.meta?.expiry, filteredPositions, group.expiry]);

  const initializedConfirmRef = useRef<string | null>(null);

  useEffect(() => {
    if (!confirmData) {
      setQtyOverrides({});
      setSyncPrice(null);
      setComboManageQuantity(1);
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

    const dialogSubscriptionCodes = useMemo(() => {
      const codes: Array<string | undefined> = [];

      if (confirmData) {
        codes.push(
          confirmData.meta?.contract_code_full || confirmData.meta?.contract_code,
        ...confirmData.ids.map((id) => {
          const position = filteredPositions.find((item) => item.id === id);
          return position?.contract_code_full || position?.contract_code || position?.symbol;
          })
        );

        if (confirmData.meta?.action === 'sync_category' && normalizeCodeList(codes).length === 0) {
        const s = Number(confirmData.meta.strike);
        const c = confirmData.meta.category as
          | 'call_obligation'
          | 'put_obligation'
          | 'call_right'
          | 'put_right'
          | 'call_covered'
          | 'put_covered';
        const ids = collectIdsForCategory(c, s);
        ids.forEach((id) => {
          const p = filteredPositions.find((x) => x.id === id);
          if (p?.contract_code_full) codes.push(p.contract_code_full);
        });
      }

        if (
          confirmData.meta?.action === 'unwind_combo_selection' ||
          confirmData.meta?.action === 'combo_manage'
        ) {
          const strategies = confirmData.meta?.strategies || [];
          codes.push(...strategies.flatMap((item) =>
            (item.strategy?.positions || []).map((position) =>
              position.contract_code_full || position.contract_code || position.symbol
            )
          ));
        }
      }

      if (activeComboDraft) {
        const buyPosition = activeComboDraft.combo.buy_position?.position;
        const sellPosition = activeComboDraft.combo.sell_position?.position;
        codes.push(
          buyPosition?.contract_code_full || buyPosition?.contract_code,
          sellPosition?.contract_code_full || sellPosition?.contract_code
        );
      }

      return normalizeCodeList(codes);
    }, [
      activeComboDraft,
      collectIdsForCategory,
      confirmData,
      filteredPositions,
      normalizeCodeList,
    ]);

  const advisedPricePreview = useMemo(() => {
    if (!activeComboDraft) return null;
    const qty = Math.max(1, Number(activeComboDraft.quantity) || 1);
    const buyPos = activeComboDraft.combo.buy_position?.position;
    const sellPos = activeComboDraft.combo.sell_position?.position;
    if (!buyPos || !sellPos) return null;

    const buyUpdate = resolvePriceUpdate([buyPos.contract_code_full, buyPos.contract_code, buyPos.symbol]);
    const sellUpdate = resolvePriceUpdate([sellPos.contract_code_full, sellPos.contract_code, sellPos.symbol]);

    const buyPx = getCounterpartyTopPrice(buyUpdate, 'buy');
    const sellPx = getCounterpartyTopPrice(sellUpdate, 'sell');

    const buyLegQty = Math.max(1, Number(buyPos.leg_quantity ?? buyPos.selectedQuantity ?? buyPos.quantity ?? 1) || 1);
    const sellLegQty = Math.max(1, Number(sellPos.leg_quantity ?? sellPos.selectedQuantity ?? sellPos.quantity ?? 1) || 1);

    const buyAmt = buyPx != null ? -buyPx * buyLegQty : null;
    const sellAmt = sellPx != null ? sellPx * sellLegQty : null;
    const net = buyAmt != null && sellAmt != null ? buyAmt + sellAmt : null;
    const pairedQty = Math.min(buyLegQty, sellLegQty);
    const perHedge = net != null && pairedQty > 0 ? net / pairedQty : null;

    return {
      qty,
      buy: {
        px: buyPx,
        qty: buyLegQty,
        amt: buyAmt,
      },
      sell: {
        px: sellPx,
        qty: sellLegQty,
        amt: sellAmt,
      },
      net,
      pairedQty,
      perHedge,
      ts: Math.max(buyUpdate?.timestamp || 0, sellUpdate?.timestamp || 0),
    };
  }, [activeComboDraft, getCounterpartyTopPrice, resolvePriceUpdate]);

  const estimateCloseForStrategy = useCallback(
    (strategy: OptionsStrategy) => {
      const legs = strategy?.positions || [];
      const legEstimates = legs.map((p) => {
        const closeSide: 'buy' | 'sell' = p.position_type === 'buy' ? 'sell' : 'buy';
        const update = resolvePriceUpdate([p.contract_code_full, p.contract_code, p.symbol]);
        let px = getCounterpartyTopPrice(update, closeSide);
        if (px == null && p.currentValue != null) {
          px = Number(p.currentValue);
        }
        const qty = Math.max(1, Number(p.leg_quantity ?? p.selectedQuantity ?? p.quantity ?? 1) || 1);
        const amt = px != null ? (closeSide === 'sell' ? px * qty : -px * qty) : null;
        return { pos: p, closeSide, px, qty, amt, ts: update?.timestamp || 0 };
      });
      const net = legEstimates.every((l) => l.amt != null) ? legEstimates.reduce((s, l) => s + (l.amt as number), 0) : null;
      const buyQty = legEstimates.reduce((s, l) => s + (l.closeSide === 'buy' ? l.qty : 0), 0);
      const sellQty = legEstimates.reduce((s, l) => s + (l.closeSide === 'sell' ? l.qty : 0), 0);
      const pairedQty = Math.max(1, Math.min(buyQty, sellQty));
      const perHedge = net != null ? net / pairedQty : null;
      const ts = Math.max(0, ...legEstimates.map((l) => l.ts || 0));
      return { legs: legEstimates, net, perHedge, pairedQty, ts };
    },
    [getCounterpartyTopPrice, resolvePriceUpdate]
  );

  const comboStrategyItems = useMemo(
    () => ((confirmData?.meta?.action === 'unwind_combo_selection' || confirmData?.meta?.action === 'combo_manage') ? (confirmData.meta?.strategies || []) : []),
    [confirmData]
  );

  const comboStrategyIdsKey = useMemo(
    () => comboStrategyItems.map((item) => item.strategy.id).join('|'),
    [comboStrategyItems]
  );

  useEffect(() => {
    const now = Date.now();
    const retryAfterMs = 30_000;
    const positions = [
      ...comboStrategyItems.flatMap((item) => item.strategy?.positions || []),
      ...(activeComboDraft
        ? [activeComboDraft.combo.buy_position?.position, activeComboDraft.combo.sell_position?.position].filter(Boolean)
        : []),
    ].filter((position): position is OptionsPosition => !!position);

    const requestTargets = positions
      .map((position) => {
        const contractCode = normalizeContractCodeKey(position.contract_code);
        const fullCode = normalizeContractCodeKey(position.contract_code_full);
        const baseFromFull = fullCode ? fullCode.split('.')[0] : '';
        const candidates = [contractCode, baseFromFull].filter(Boolean);
        return { candidates, contractCode, fullCode, baseFromFull };
      })
      .map((item) => {
        const picked = item.candidates.find((c) => {
          if (contractUnitMap[c] && contractNameMap[c]) return false;
          const lastReqAt = requestedContractUnitRef.current[c] ?? 0;
          if (lastReqAt && now - lastReqAt < retryAfterMs) return false;
          return true;
        }) || '';
        return { requestCode: picked, contractCode: item.contractCode, fullCode: item.fullCode };
      })
      .filter((item) => !!item.requestCode)
      .filter((item) => {
        if (contractUnitMap[item.requestCode] && contractNameMap[item.requestCode]) return false;
        const lastReqAt = requestedContractUnitRef.current[item.requestCode] ?? 0;
        if (lastReqAt && now - lastReqAt < retryAfterMs) return false;
        return true;
      });

    requestTargets.forEach((item) => {
      requestedContractUnitRef.current[item.requestCode] = now;
      void optionsService.getOptionContractDetail(item.requestCode).then(({ data }) => {
        const unit = Number(data?.contract_unit);
        const name = typeof data?.contract_name === 'string' ? data.contract_name : '';
        if (Number.isFinite(unit) && unit > 0) {
          registerContractUnit(item.contractCode || item.requestCode, item.fullCode, unit);
        }
        if (name) {
          registerContractName(item.contractCode || item.requestCode, item.fullCode, name);
        }
      }).catch((error) => {
        logger.warn('[ExpiryGroupCard] Failed to fetch contract unit', { code: item.requestCode, error });
      });
    });
  }, [activeComboDraft, comboStrategyItems, contractNameMap, contractUnitMap, normalizeContractCodeKey, registerContractName, registerContractUnit]);

  const getStrategySpreadSnapshot = useCallback((item: { strategy: OptionsStrategy; qty: number }) => {
    const strategy = item.strategy;
    const qty = Math.max(1, Number(item?.qty || strategy.positions[0]?.quantity || 1));
    const est = estimateCloseForStrategy(strategy);
    if (est.perHedge != null) {
      return { price: est.perHedge, ts: est.ts || Date.now() };
    }
    if (strategy.currentValue != null && Number.isFinite(strategy.currentValue)) {
      return { price: strategy.currentValue / qty / 100, ts: Date.now() };
    }
    return null;
  }, [estimateCloseForStrategy]);

  const comboStrategySnapshotMap = useMemo(() => {
    const map: Record<string, { price: number; ts: number } | null> = {};
    comboStrategyItems.forEach((item) => {
      map[item.strategy.id] = getStrategySpreadSnapshot(item);
    });
    return map;
  }, [comboStrategyItems, getStrategySpreadSnapshot]);

  const comboStrategyItemsRef = useRef(comboStrategyItems);
  comboStrategyItemsRef.current = comboStrategyItems;

  const comboStrategySnapshotMapRef = useRef(comboStrategySnapshotMap);
  comboStrategySnapshotMapRef.current = comboStrategySnapshotMap;

  const currentSpreadSnapshot = useMemo(() => {
    if (activeComboDraft && advisedPricePreview?.perHedge != null) {
      return { price: advisedPricePreview.perHedge, ts: advisedPricePreview.ts || Date.now() };
    }

    return null;
  }, [activeComboDraft, advisedPricePreview]);

  const spreadSnapshotRef = useRef<{ price: number; ts: number } | null>(null);
  spreadSnapshotRef.current = currentSpreadSnapshot;

  const lastKnownSpreadPriceRef = useRef<number | null>(null);
  const comboLastKnownSpreadPriceRef = useRef<Record<string, number>>({});

  const pushSpreadSample = useCallback((sampleTs: number) => {
    const snap = spreadSnapshotRef.current;
    let price: number | null = null;
    let source: 'snapshot' | 'last_known' | 'empty' = 'empty';
    if (snap && Number.isFinite(snap.price)) {
      price = snap.price;
      lastKnownSpreadPriceRef.current = snap.price;
      source = 'snapshot';
    } else if (lastKnownSpreadPriceRef.current != null) {
      price = lastKnownSpreadPriceRef.current;
      source = 'last_known';
    }
    const time = format(new Date(sampleTs), 'HH:mm:ss');
    setSpreadHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last) {
        const recentlyAdded = sampleTs - last.ts < 900;
        if (recentlyAdded) return prev;
      }
      const next = [...prev, { time, price, ts: sampleTs }];
      return next.slice(-60);
    });
    setSpreadStatus({ ts: sampleTs, source });
  }, []);

  const pushComboSpreadSamples = useCallback((sampleTs: number) => {
    const items = comboStrategyItemsRef.current;
    const snapshots = comboStrategySnapshotMapRef.current;
    if (items.length === 0) return;

    const time = format(new Date(sampleTs), 'HH:mm:ss');
    const statusMap: Record<string, { ts: number; source: 'snapshot' | 'last_known' | 'empty' }> = {};

    setComboSpreadHistories((prev) => {
      const next: Record<string, { time: string; price: number | null; ts: number }[]> = {};
      items.forEach((item) => {
        const strategyId = item.strategy.id;
        const snap = snapshots[strategyId];
        let price: number | null = null;
        let source: 'snapshot' | 'last_known' | 'empty' = 'empty';
        if (snap && Number.isFinite(snap.price)) {
          price = snap.price;
          comboLastKnownSpreadPriceRef.current[strategyId] = snap.price;
          source = 'snapshot';
        } else if (typeof comboLastKnownSpreadPriceRef.current[strategyId] === 'number') {
          price = comboLastKnownSpreadPriceRef.current[strategyId];
          source = 'last_known';
        }

        const prevHistory = prev[strategyId] || [];
        const last = prevHistory[prevHistory.length - 1];
        next[strategyId] =
          last && sampleTs - last.ts < 900
            ? prevHistory
            : [...prevHistory, { time, price, ts: sampleTs }].slice(-60);
        statusMap[strategyId] = { ts: sampleTs, source };
      });
      return next;
    });

    setComboSpreadStatuses(statusMap);
  }, []);

  const getStrategyWatchCodes = useCallback((strategy: OptionsStrategy) => {
    return normalizeCodeList((strategy.positions || []).map((p) => p.contract_code_full || p.contract_code || p.symbol));
  }, [normalizeCodeList]);

  const getSpreadWatchStatusText = useCallback((watchCodes: string[]) => {
    if (watchCodes.length === 0) return '';
    const parts = watchCodes.slice(0, 4).map((code) => {
      const direct = prices[code];
      if (direct) return `${code} OK`;
      const base = code.split('.')[0];
      const baseHit = base && prices[base];
      if (baseHit) return `${code} OK(${base})`;
      const indexedKey = base ? priceKeyIndex.get(base) : undefined;
      if (indexedKey && prices[indexedKey]) return `${code} OK(${indexedKey})`;
      return `${code} MISS`;
    });
    const extra = watchCodes.length > 4 ? ` +${watchCodes.length - 4}` : '';
    return `订阅 ${watchCodes.length}: ${parts.join(' • ')}${extra}`;
  }, [priceKeyIndex, prices]);

  const getSpreadWatchQuoteLines = useCallback((positions: OptionsPosition[]) => {
    return positions
      .filter(Boolean)
      .slice(0, 4)
      .map((position, index) => {
        const resolved = resolveDisplayPosition(position) ?? position;
        const update = resolvePriceUpdate([resolved.contract_code_full, resolved.contract_code, resolved.symbol]);
        const bid1 = update?.bid_price?.[0] ?? update?.bid;
        const ask1 = update?.ask_price?.[0] ?? update?.ask;
        const ts = update?.timestamp ? format(new Date(update.timestamp), 'HH:mm:ss') : '--';
        const bidText = typeof bid1 === 'number' && Number.isFinite(bid1) ? bid1.toFixed(4) : '--';
        const askText = typeof ask1 === 'number' && Number.isFinite(ask1) ? ask1.toFixed(4) : '--';
        const keyParts = [
          resolved.position_type || 'unknown',
          resolved.id || 'noid',
          resolved.contract_code_full || resolved.contract_code || resolved.symbol || 'nocode',
          resolved.contract_strike_price ?? resolved.strike ?? 'nostrike',
          resolved.expiry || 'noexpiry',
          index,
        ];
        return {
          key: keyParts.join('-'),
          contractName: getContractNameForPosition(resolved) || getPositionContractLabel(resolved) || '未知合约',
          quoteText: `${resolved.contract_code_full || resolved.contract_code || resolved.symbol || '--'} BID1 ${bidText} ASK1 ${askText} @${ts}`,
        };
      });
  }, [getContractNameForPosition, getPositionContractLabel, resolveDisplayPosition, resolvePriceUpdate]);

  const spreadWatchPositions = useMemo(() => {
    if (activeComboDraft) {
      const buyPos = activeComboDraft.combo.buy_position?.position;
      const sellPos = activeComboDraft.combo.sell_position?.position;
      return [buyPos, sellPos].filter((position): position is OptionsPosition => !!position);
    }
    return [];
  }, [activeComboDraft]);

  const spreadWatchCodes = useMemo(
    () => normalizeCodeList(spreadWatchPositions.map((position) => position.contract_code_full || position.contract_code || position.symbol)),
    [normalizeCodeList, spreadWatchPositions]
  );

  const spreadWatchCodesKey = useMemo(() => spreadWatchCodes.join(','), [spreadWatchCodes]);

  const spreadWatchStatusText = useMemo(
    () => getSpreadWatchStatusText(spreadWatchCodes),
    [getSpreadWatchStatusText, spreadWatchCodes]
  );

  useEffect(() => {
    setSpreadHistory([]);
    lastKnownSpreadPriceRef.current = null;
  }, [spreadWatchCodesKey]);

  useEffect(() => {
    if (!activeComboDraft) return;
    const now = Date.now();
    pushSpreadSample(now);
    const timer = window.setInterval(() => {
      pushSpreadSample(Date.now());
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeComboDraft, pushSpreadSample]);

  useEffect(() => {
    if (!activeComboDraft) return;
    if (!currentSpreadSnapshot) return;
    pushSpreadSample(Date.now());
  }, [activeComboDraft, currentSpreadSnapshot, pushSpreadSample]);

  useEffect(() => {
    if (!comboStrategyIdsKey) {
      setComboSpreadHistories({});
      setComboSpreadStatuses({});
      comboLastKnownSpreadPriceRef.current = {};
      return;
    }
    pushComboSpreadSamples(Date.now());
    const timer = window.setInterval(() => {
      pushComboSpreadSamples(Date.now());
    }, 1500);
    return () => window.clearInterval(timer);
  }, [comboStrategyIdsKey, pushComboSpreadSamples]);

  useEffect(() => {
    if (!comboStrategyIdsKey) return;
    pushComboSpreadSamples(Date.now());
  }, [comboStrategyIdsKey, comboStrategySnapshotMap, pushComboSpreadSamples]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleViewportChange = () => setIsMobileViewport(window.innerWidth < 768);
    handleViewportChange();
    window.addEventListener('resize', handleViewportChange);
    return () => window.removeEventListener('resize', handleViewportChange);
  }, []);

  const scrollToAtm = useCallback((smooth = true) => {
    const container = tBoardScrollRef.current;
    if (!container) return;

    const strikeHeader = strikeHeaderRef.current;
    let desiredScrollLeft = container.scrollLeft;
    if (strikeHeader) {
      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const containerRect = container.getBoundingClientRect();
      const strikeRect = strikeHeader.getBoundingClientRect();
      const deltaX = (strikeRect.left + strikeRect.width / 2) - (containerRect.left + containerRect.width / 2);
      desiredScrollLeft = Math.max(
        0,
        Math.min(container.scrollLeft + deltaX, maxScrollLeft)
      );
    }

    const spotRow = container.querySelector<HTMLElement>('[data-spot-indicator="true"]') ||
                    container.querySelector<HTMLElement>('[data-atm-strike="true"]');
    let desiredScrollTop = container.scrollTop;
    if (spotRow) {
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const containerRect = container.getBoundingClientRect();
      const spotRect = spotRow.getBoundingClientRect();
      const deltaY = (spotRect.top + spotRect.height / 2) - (containerRect.top + containerRect.height / 2);
      desiredScrollTop = Math.max(
        0,
        Math.min(container.scrollTop + deltaY, maxScrollTop)
      );
    }

    isProgrammaticTBoardScrollRef.current = true;
    container.scrollTo({
      left: desiredScrollLeft,
      top: desiredScrollTop,
      behavior: smooth ? 'smooth' : 'auto'
    });
    window.setTimeout(() => {
      isProgrammaticTBoardScrollRef.current = false;
      initialCenteredRef.current = true;
    }, 400);
  }, []);

  const strikesCount = tBoardStrikesAndMetrics.strikes.length;

  useEffect(() => {
    if (!isMobileViewport || !isTBoardExpanded || strikesCount === 0) return;
    if (hasUserAdjustedTBoardRef.current) return;

    let timerId: number | undefined;
    const center = () => {
      scrollToAtm(false);
    };

    const frameId = window.requestAnimationFrame(() => {
      center();
      timerId = window.setTimeout(center, 120);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timerId) window.clearTimeout(timerId);
    };
  }, [isMobileViewport, isTBoardExpanded, strikesCount, group.expiry, scrollToAtm]);

  const handleTBoardScroll = useCallback(() => {
    if (isProgrammaticTBoardScrollRef.current || !initialCenteredRef.current) return;
    hasUserAdjustedTBoardRef.current = true;
  }, []);

  const enterFullscreen = useCallback(() => {
    if (!isTBoardExpanded) {
      onToggleTBoard();
    }
    setIsTBoardFullscreen(true);
  }, [isTBoardExpanded, onToggleTBoard]);

  const exitFullscreen = useCallback(() => {
    setIsTBoardFullscreen(false);
  }, []);

  useEffect(() => {
    if (!isTBoardFullscreen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const timer = window.setTimeout(() => {
      scrollToAtm(false);
    }, 80);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(timer);
    };
  }, [isTBoardFullscreen, exitFullscreen, scrollToAtm]);

  const expiryStatusText = useMemo(() => {
    if (group.daysToExpiry < 0) return `已过期${Math.abs(group.daysToExpiry)}天`;
    if (group.daysToExpiry === 0) return '今日到期';
    if (group.daysToExpiry === 1) return '明日到期';
    return `${group.daysToExpiry}天后到期`;
  }, [group.daysToExpiry]);
  const profitLossBadgeClass = totalProfitLoss >= 0
    ? 'bg-green-500/10 text-green-600 dark:text-green-300'
    : 'bg-red-500/10 text-red-600 dark:text-red-300';
  const expandHandleButtonClass = `absolute right-1.5 top-1/2 z-10 inline-flex h-12 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-gradient-to-b from-white/95 via-white/90 to-slate-100/90 text-slate-500 shadow-[0_8px_22px_rgba(15,23,42,0.12)] backdrop-blur transition-all duration-200 hover:text-slate-700 hover:shadow-[0_10px_28px_rgba(15,23,42,0.18)] dark:border-slate-700/80 dark:from-slate-800/95 dark:via-slate-900/90 dark:to-slate-950/90 dark:text-slate-300 dark:hover:text-slate-100 sm:right-2 sm:h-16 sm:w-9`;
  const sectionToggleButtonClass = `flex w-full items-center justify-between gap-2 rounded-xl border ${themes[theme].border} ${themes[theme].background} px-3 py-2 text-left transition-colors hover:opacity-90`;

  const updateComboSellStrike = useCallback((newSellStrike: number, isEmbedded: boolean) => {
    const currentCombo = isEmbedded ? confirmData?.meta?.comboCandidate : advisedModal?.combo;
    if (!currentCombo) return;

    const comboType = currentCombo.buy_position.position.type as 'call' | 'put';
    
    const findQuote = (data: OptionsData, strike: number) => data.quotes?.find(q => q.expiry === group.expiry && getQuoteStrike(q) === strike);
    const getQuoteByStrike = (strike: number) => {
      const activeData = optionsData || localOptionsData;
      if (activeData) { const q = findQuote(activeData, strike); if (q) return q; }
      if (optionsDataMap) { for (const data of Object.values(optionsDataMap)) { const q = findQuote(data, strike); if (q) return q; } }
      if (localOptionsData) { const q = findQuote(localOptionsData, strike); if (q) return q; }
      return undefined;
    };

    const sellQuote = getQuoteByStrike(newSellStrike);
    if (!sellQuote) {
      toast.error(`未找到行权价 ${newSellStrike} 的期权行情`);
      return;
    }

    const sellFullCode = comboType === 'call' ? sellQuote.call_contract_code_full : sellQuote.put_contract_code_full;
    const sellCode = comboType === 'call' ? sellQuote.call_contract_code : sellQuote.put_contract_code;
    
    const undl = selectedSymbol || optionsData?.opt_undl_code_full || localOptionsData?.opt_undl_code_full || '';
    const now = new Date().toISOString();
    const sellLeg = {
      id: `combo-manual-${comboType}-sell-${group.expiry}-${newSellStrike}`,
      symbol: sellFullCode || sellCode || '',
      opt_undl_code_full: undl || undefined,
      strategy: '组合购买',
      type: comboType,
      option_type: comboType,
      position_type: 'sell' as const,
      strike: newSellStrike,
      strike_price: String(newSellStrike),
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
      status: 'open' as const,
      openDate: now,
      contract_code: sellCode || undefined,
      contract_code_full: sellFullCode || undefined,
      contract_strike_price: newSellStrike,
      contract_type_zh: comboType,
      position_type_zh: '义务' as const,
      leg_quantity: 1,
    };

    const buyStrike = currentCombo.buy_strike;
    const isBullish = comboType === 'call' ? newSellStrike > buyStrike : newSellStrike < buyStrike;
    const description = comboType === 'call'
      ? `${isBullish ? '认购牛市价差' : '认购熊市价差'} ${buyStrike}-${newSellStrike}`
      : `${isBullish ? '认沽熊市价差' : '认沽牛市价差'} ${buyStrike}-${newSellStrike}`;

    const updatedCombo: AdvisedCombination = {
      ...currentCombo,
      description,
      type: comboType === 'call' ? (isBullish ? 'bull_call_spread' : 'bear_call_spread') : (isBullish ? 'bear_put_spread' : 'bull_put_spread'),
      sell_strike: newSellStrike,
      sell_position: {
        code: sellFullCode || sellCode || '',
        name: sellFullCode || sellCode || '',
        position: sellLeg,
        strike: newSellStrike,
        volume: Number(sellQuote.putVolume || sellQuote.callVolume || 0)
      }
    };

    if (isEmbedded) {
      setConfirmData(prev => {
        if (!prev || !prev.meta) return prev;
        return {
          ...prev,
          meta: {
            ...prev.meta,
            comboCandidate: updatedCombo
          }
        };
      });
    } else {
      setAdvisedModal(prev => prev ? { ...prev, combo: updatedCombo } : null);
    }
  }, [advisedModal, confirmData, group.expiry, localOptionsData, optionsData, optionsDataMap, selectedSymbol]);

  const renderL5MarketData = useCallback((contractCode: string) => {
    const priceData = prices[contractCode];
    if (!priceData) {
      return (
        <div className="p-4 text-center text-xs opacity-50 italic">
          等待行情数据...
        </div>
      );
    }

    const bids = Array.from({ length: 5 }).map((_, i) => ({
      level: i + 1,
      price: priceData.bid_price?.[i] ?? (i === 0 ? priceData.bid : undefined),
      vol: priceData.bid_vol?.[i]
    }));
    const asks = Array.from({ length: 5 }).map((_, i) => ({
      level: i + 1,
      price: priceData.ask_price?.[i] ?? (i === 0 ? priceData.ask : undefined),
      vol: priceData.ask_vol?.[i]
    }));
    const maxVol = Math.max(
      ...bids.map(b => b.vol || 0),
      ...asks.map(a => a.vol || 0),
      1
    );

    return (
      <div className="p-2 bg-black/5 dark:bg-white/5 rounded-b border-t border-current/5 space-y-1.5">
        <div className="flex items-center justify-between px-1 text-[10px] opacity-60">
          <span className="font-medium">五档深度行情 (L5)</span>
          {priceData.timestamp ? (
            <span className="font-mono">{format(new Date(priceData.timestamp), 'HH:mm:ss')}</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          {/* 买盘 */}
          <div className="space-y-1">
            <div className="flex justify-between px-1.5 py-0.5 text-[10px] font-bold text-red-500 border-b border-red-500/20">
              <span>买盘</span>
              <span>价格</span>
              <span>量</span>
            </div>
            <div className="space-y-0.5">
              {bids.map((b) => {
                const pct = b.vol ? Math.min(100, Math.round((b.vol / maxVol) * 100)) : 0;
                return (
                  <div
                    key={`bid-${b.level}`}
                    className="relative flex items-center justify-between px-1.5 py-0.5 rounded"
                  >
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-red-500/10 rounded pointer-events-none transition-all"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="opacity-60 relative z-10 text-[10px]">{b.level}</span>
                    <span className="font-mono text-red-500 font-semibold relative z-10">{b.price != null ? b.price.toFixed(4) : '-'}</span>
                    <span className="font-mono opacity-80 relative z-10 text-[10px]">{b.vol ?? '-'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 卖盘 */}
          <div className="space-y-1">
            <div className="flex justify-between px-1.5 py-0.5 text-[10px] font-bold text-green-500 border-b border-green-500/20">
              <span>卖盘</span>
              <span>价格</span>
              <span>量</span>
            </div>
            <div className="space-y-0.5">
              {asks.map((a) => {
                const pct = a.vol ? Math.min(100, Math.round((a.vol / maxVol) * 100)) : 0;
                return (
                  <div
                    key={`ask-${a.level}`}
                    className="relative flex items-center justify-between px-1.5 py-0.5 rounded"
                  >
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-green-500/10 rounded pointer-events-none transition-all"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="opacity-60 relative z-10 text-[10px]">{a.level}</span>
                    <span className="font-mono text-green-500 font-semibold relative z-10">{a.price != null ? a.price.toFixed(4) : '-'}</span>
                    <span className="font-mono opacity-80 relative z-10 text-[10px]">{a.vol ?? '-'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }, [prices]);

  const renderLegMarketQuote = useCallback((
    contractCode: string,
    legType?: 'buy' | 'sell',
    targetQty?: number
  ) => {
    const priceData = prices[contractCode];
    const bid1Price = priceData?.bid_price?.[0] ?? priceData?.bid;
    const bid1Vol = priceData?.bid_vol?.[0];
    const ask1Price = priceData?.ask_price?.[0] ?? priceData?.ask;
    const ask1Vol = priceData?.ask_vol?.[0];
    const lastPrice = priceData?.price ?? priceData?.last_price;

    const spread = (ask1Price != null && bid1Price != null) ? (ask1Price - bid1Price) : null;

    const isBuyLeg = legType === 'buy';
    const execPrice = isBuyLeg ? ask1Price : bid1Price;
    const execVol = isBuyLeg ? ask1Vol : bid1Vol;
    const isSufficient = targetQty != null && execVol != null ? execVol >= targetQty : null;

    return (
      <details className="group border-t border-current/10">
        <summary className={`list-none [&::-webkit-details-marker]:hidden cursor-pointer px-2.5 py-1.5 hover:bg-current/[0.02] active:bg-current/[0.04] transition-colors select-none ${themes[theme].text}`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            {/* Left: 对手成交盘 (重点高亮，突出执行价与承接状态) */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                isBuyLeg
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}>
                {isBuyLeg ? '对盘卖1' : '对盘买1'}
              </span>
              <span className="font-mono font-bold text-xs sm:text-sm">
                {execPrice != null ? execPrice.toFixed(4) : '-'}
              </span>
              <span className="font-mono text-[10px] opacity-70">
                ({execVol ?? '-'})
              </span>
              {isSufficient != null && (
                <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                  isSufficient
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    : 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                }`}>
                  {isSufficient ? '充足' : `仅${execVol}`}
                </span>
              )}
            </div>

            {/* Right: 另一侧买卖盘 + 最新价/五档折叠 */}
            <div className="flex items-center gap-2 shrink-0 text-[11px]">
              <span className="opacity-60 font-mono hidden sm:inline">
                {isBuyLeg ? `买1 ${bid1Price != null ? bid1Price.toFixed(4) : '-'}` : `卖1 ${ask1Price != null ? ask1Price.toFixed(4) : '-'}`}
              </span>
              <span className="opacity-70 font-mono">
                最新 {lastPrice != null ? lastPrice.toFixed(4) : '-'}{spread != null ? ` (差${spread.toFixed(4)})` : ''}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:underline">
                <span className="group-open:hidden">五档</span>
                <span className="hidden group-open:inline">收起</span>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
              </span>
            </div>
          </div>
        </summary>
        {renderL5MarketData(contractCode)}
      </details>
    );
  }, [prices, theme, renderL5MarketData]);

  const renderComboDraftPanel = useCallback((draft: ComboDraftState, embedded = false) => (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>{draft.combo.description}</div>
        <div className={`text-xs ${themes[theme].text} opacity-60 font-mono`}>到期 {format(new Date(draft.combo.expiry), 'yyyy-MM-dd')}</div>
      </div>
      {(() => {
        const p = advisedPricePreview;
        if (!p) return null;
        const net = p.net;
        const qty = draft.quantity;
        const strikeDiff = Math.abs(draft.combo.sell_strike - draft.combo.buy_strike);
        const costRatio = strikeDiff > 0 && net != null ? (Math.abs(net) / strikeDiff) * 100 : null;

        const buyPos = draft.combo.buy_position?.position;
        const sellPos = draft.combo.sell_position?.position;
        const buyLegUnitInfo = getEffectiveContractUnitForPosition(buyPos);
        const sellLegUnitInfo = getEffectiveContractUnitForPosition(sellPos);
        const activeComboContractUnit = buyLegUnitInfo.effectiveUnit ?? sellLegUnitInfo.effectiveUnit ?? 1;

        const label = net == null ? '对手方一档价未就绪' : (net >= 0 ? '预计收到' : '预计支付');
        
        const displayNet = net != null ? net * activeComboContractUnit : 0;
        const displayPerHedge = p.perHedge != null ? p.perHedge * activeComboContractUnit : 0;

        const amountText = net == null ? '--' : formatCurrency(Math.abs(displayNet * qty), currencyConfig, 4);
        const hedgeText =
          p.perHedge == null ? '--' : `${p.perHedge >= 0 ? '+' : '-'}${formatCurrency(Math.abs(displayPerHedge), currencyConfig, 4)}`;
        const tsText = p.ts ? format(new Date(p.ts), 'HH:mm:ss') : '--';
        return (
          <div className={`mt-3 rounded-xl border p-3 ${themes[theme].border} ${themes[theme].background} space-y-2`}>
            {/* 第一行：预计支付/收到 + 成本价差比居左，总额居右 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className={`text-sm font-semibold whitespace-nowrap ${themes[theme].text}`}>{label}</span>
                {costRatio != null && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-300 whitespace-nowrap shrink-0" title="开仓价格与最大价值的比例">
                    成本/价差比 {costRatio.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <AnimatedFlash
                  value={amountText}
                  className={`font-mono font-bold text-base sm:text-lg ${net != null && net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}
                  type="price"
                />
              </div>
            </div>

            {/* 第二行：单套金额明细与行情采样时间 */}
            {((p.perHedge != null && qty > 0) || tsText !== '--') && (
              <div className="flex items-center justify-between text-[11px] opacity-65 font-mono pt-1.5 border-t border-current/5">
                <div>
                  {p.perHedge != null && qty > 0 ? (
                    <span className="flex items-center gap-1">
                      <span>单套</span>
                      <AnimatedFlash
                        value={hedgeText}
                        className={`font-semibold ${p.perHedge >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                        type="price"
                      />
                      <span>× {qty}张</span>
                    </span>
                  ) : null}
                </div>
                <div>
                  {tsText !== '--' ? <span>WS {tsText}</span> : null}
                </div>
              </div>
            )}
            {spreadHistory.length > 0 && (
              <div className="mt-2 pt-2 border-t border-current/5">
                <div className={`mb-1 text-[11px] ${themes[theme].text} opacity-70 flex items-center justify-between`}>
                  <span>点数 {spreadHistory.length}</span>
                  <span>
                    {spreadStatus
                      ? `采样 ${format(new Date(spreadStatus.ts), 'HH:mm:ss')} • ${spreadStatus.source === 'snapshot' ? 'WS' : (spreadStatus.source === 'last_known' ? '沿用' : '等待')}`
                      : '采样 --'}
                  </span>
                </div>
                {spreadWatchStatusText ? (
                  <div className={`mb-1 text-[11px] ${themes[theme].text} opacity-60`}>
                    {spreadWatchStatusText}
                  </div>
                ) : null}
                <RealTimeSpreadChart
                  theme={theme}
                  data={spreadHistory.map((point) => ({
                    ...point,
                    price: point.price == null ? null : point.price * activeComboContractUnit,
                  }))}
                  title="组合价差走势"
                  formatValue={(value) => {
                    if (value == null) return '--';
                    const abs = Math.abs(value);
                    const decimals = abs < 100 ? 2 : 0;
                    return formatCurrency(value, currencyConfig, decimals);
                  }}
                />
              </div>
            )}
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
              <div className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_84px_minmax(0,140px)] sm:items-center gap-1 sm:gap-3">
                <div className={`${themes[theme].text} opacity-80 flex items-center justify-between sm:block`}>
                  <span>买入腿（ASK1）x{p.buy.qty * qty}</span>
                  <span className="sm:hidden font-mono">
                    <AnimatedFlash value={p.buy.px == null ? '--' : p.buy.px.toFixed(4)} type="price" />
                  </span>
                </div>
                <div className={`hidden sm:block text-right font-mono ${themes[theme].text}`}>
                  <AnimatedFlash value={p.buy.px == null ? '--' : p.buy.px.toFixed(4)} type="price" />
                </div>
                <div className={`flex items-center justify-end gap-1 font-mono ${themes[theme].text}`}>
                  <span className="opacity-70">{p.buy.amt == null ? '' : (p.buy.amt >= 0 ? '收到' : '支付')}</span>
                  <AnimatedFlash
                    value={
                      p.buy.amt == null
                        ? '--'
                        : `${p.buy.amt >= 0 ? '+' : '-'}${formatCurrency(Math.abs(p.buy.amt * qty * activeComboContractUnit), currencyConfig, 4)}`
                    }
                    type="price"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_84px_minmax(0,140px)] sm:items-center gap-1 sm:gap-3">
                <div className={`${themes[theme].text} opacity-80 flex items-center justify-between sm:block`}>
                  <span>卖出腿（BID1）x{p.sell.qty * qty}</span>
                  <span className="sm:hidden font-mono">
                    <AnimatedFlash value={p.sell.px == null ? '--' : p.sell.px.toFixed(4)} type="price" />
                  </span>
                </div>
                <div className={`hidden sm:block text-right font-mono ${themes[theme].text}`}>
                  <AnimatedFlash value={p.sell.px == null ? '--' : p.sell.px.toFixed(4)} type="price" />
                </div>
                <div className={`flex items-center justify-end gap-1 font-mono ${themes[theme].text}`}>
                  <span className="opacity-70">{p.sell.amt == null ? '' : (p.sell.amt >= 0 ? '收到' : '支付')}</span>
                  <AnimatedFlash
                    value={
                      p.sell.amt == null
                        ? '--'
                        : `${p.sell.amt >= 0 ? '+' : '-'}${formatCurrency(Math.abs(p.sell.amt * qty * activeComboContractUnit), currencyConfig, 4)}`
                    }
                    type="price"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className={`text-sm ${themes[theme].text}`}>数量</div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const next = Math.max(1, draft.quantity - 1);
                if (embedded) setComboManageQuantity(next);
                else setAdvisedModal(prev => prev ? { ...prev, quantity: next } : prev);
              }}
              disabled={draft.quantity <= 1}
              className={`w-7 h-7 rounded flex items-center justify-center text-sm font-bold border ${themes[theme].border} ${themes[theme].secondary} disabled:opacity-30 active:scale-95 transition-all select-none cursor-pointer disabled:cursor-not-allowed`}
            >
              -
            </button>
            <input
              type="number"
              min={1}
              value={draft.quantity}
              onChange={(e) => {
                const n = parseInt(e.target.value) || 1;
                const next = Math.max(1, n);
                if (embedded) {
                  setComboManageQuantity(next);
                } else {
                  setAdvisedModal(prev => prev ? { ...prev, quantity: next } : prev);
                }
              }}
              className={`w-14 text-center px-1.5 py-1 rounded text-sm font-mono border ${themes[theme].border} ${themes[theme].input} ${themes[theme].text}`}
            />
            <button
              type="button"
              onClick={() => {
                const next = draft.quantity + 1;
                if (embedded) setComboManageQuantity(next);
                else setAdvisedModal(prev => prev ? { ...prev, quantity: next } : prev);
              }}
              className={`w-7 h-7 rounded flex items-center justify-center text-sm font-bold border ${themes[theme].border} ${themes[theme].secondary} active:scale-95 transition-all select-none cursor-pointer`}
            >
              +
            </button>
          </div>
        </div>

        <div className={`rounded-lg p-2 sm:p-2.5 border ${themes[theme].border} ${themes[theme].background} space-y-2`}>
          <div className={`text-xs font-semibold ${themes[theme].text} opacity-80`}>组合腿配置</div>
          
          {/* Buy Leg (权利仓) */}
          <div className="flex flex-col border border-current/10 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 bg-blue-500/5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                  买入 (权利)
                </span>
                <span className={`font-semibold truncate ${themes[theme].text}`}>
                  {(() => {
                    const p = draft.combo.buy_position.position;
                    return getContractNameForPosition(p) || p.symbol;
                  })()}
                </span>
                <span className={`text-[11px] ${themes[theme].text} opacity-50 font-mono shrink-0`}>
                  @{draft.combo.buy_strike}
                </span>
              </div>
              <div className={`${themes[theme].text} opacity-80 font-mono text-[11px] shrink-0`}>
                {(() => {
                  const p = draft.combo.buy_position.position;
                  const avail = Number(p.available ?? p.quantity);
                  const legQty = draft.quantity;
                  return `数量 ${legQty}${avail !== legQty ? ` (可用 ${avail})` : ''}`;
                })()}
              </div>
            </div>
            
            {renderLegMarketQuote(
              draft.combo.buy_position.position.contract_code_full || draft.combo.buy_position.position.symbol,
              'buy',
              draft.quantity
            )}
          </div>

          {/* Sell Leg (义务仓) */}
          <div className="flex flex-col border border-current/10 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 bg-rose-500/5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                  卖出 (义务)
                </span>
                <span className={`font-semibold truncate ${themes[theme].text}`}>
                  {(() => {
                    const p = draft.combo.sell_position.position;
                    return getContractNameForPosition(p) || p.symbol;
                  })()}
                </span>
                <span className={`text-[11px] ${themes[theme].text} opacity-50 font-mono shrink-0`}>
                  @{draft.combo.sell_strike}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1">
                  <span className="opacity-60 text-[10px]">换行权:</span>
                  <select
                    value={draft.combo.sell_strike}
                    onChange={(e) => {
                      const nextStrike = Number(e.target.value);
                      updateComboSellStrike(nextStrike, embedded);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${themes[theme].border} ${themes[theme].input} ${themes[theme].text} focus:outline-none`}
                  >
                    {expiryStrikeLadder
                      .filter(s => s !== draft.combo.buy_strike)
                      .map(s => (
                        <option key={s} value={s}>
                          {formatStrikeNumber(s)}
                        </option>
                      ))}
                  </select>
                </div>
                <div className={`${themes[theme].text} opacity-80 font-mono text-[11px]`}>
                  {(() => {
                    const p = draft.combo.sell_position.position;
                    const avail = Number(p.available ?? p.quantity);
                    const legQty = draft.quantity;
                    return `数量 ${legQty}${avail !== legQty ? ` (可用 ${avail})` : ''}`;
                  })()}
                </div>
              </div>
            </div>

            {renderLegMarketQuote(
              draft.combo.sell_position.position.contract_code_full || draft.combo.sell_position.position.symbol,
              'sell',
              draft.quantity
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end">
        <button
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-700 active:scale-[0.98] text-white shadow-sm transition-all text-center flex items-center justify-center cursor-pointer"
          onClick={async () => {
            // Debug logging for combination adjustment
            const isDebug = import.meta.env.DEV ||
                            new URLSearchParams(window.location.search).get('debug') === 'true' || 
                            localStorage.getItem('options_portfolio_debug') === 'true';
            if (isDebug) {
              console.group('%c[Options Portfolio Debug] Combination Adjustment', 'color: #f59e0b; font-weight: bold;');
              console.log('Mode:', draft.mode);
              console.log('Description:', draft.combo.description);
              console.log('Total Quantity:', draft.quantity);
              
              const legCodes = [];
              if (draft.combo.buy_position) {
                legCodes.push(draft.combo.buy_position.position.contract_code_full || draft.combo.buy_position.position.symbol);
              }
              if (draft.combo.sell_position) {
                legCodes.push(draft.combo.sell_position.position.contract_code_full || draft.combo.sell_position.position.symbol);
              }
              console.log('Legs (Market Data in UI):', legCodes);
              console.groupEnd();
            }

            if (draft.mode === 't_board_create') {
              try {
                const { error } = await optionsService.createOptionCombination(
                  { ...draft.combo, quantity: draft.quantity },
                  selectedAccountId || null,
                  userId || null
                );
                if (error) throw error;
                toast.success('已创建组合');
                onRefresh?.();
                if (embedded) {
                  setConfirmData(null);
                } else {
                  setAdvisedModal(null);
                }
              } catch (e) {
                toast.error(e instanceof Error ? e.message : '创建失败');
              }
            } else {
              if (onExecuteAdvised) onExecuteAdvised({ ...draft.combo, quantity: draft.quantity });
              if (embedded) {
                setConfirmData(null);
              } else {
                setAdvisedModal(null);
              }
            }
          }}
        >{draft.mode === 't_board_create' ? '创建组合' : '执行组合'}</button>
      </div>
    </>
  ), [
    advisedPricePreview,
    currencyConfig,
    onExecuteAdvised,
    onRefresh,
    selectedAccountId,
    spreadHistory,
    spreadStatus,
    theme,
    userId,
    expiryStrikeLadder,
    formatStrikeNumber,
    updateComboSellStrike,
    prices,
    renderLegMarketQuote
  ]);

  const renderStatusBadge = useCallback((item: OptionsStrategy | OptionsPosition, type: 'complex' | 'single') => {
    const dte = group.daysToExpiry;
    const itemSymbol = type === 'complex' 
      ? (item as OptionsStrategy).positions[0]?.opt_undl_code_full || selectedSymbol || ''
      : (item as OptionsPosition).opt_undl_code_full || selectedSymbol || '';

    let overrideProfitRatio: number | undefined = undefined;
    let resolvedItem = item;
    if (type === 'complex') {
      const s = item as OptionsStrategy;
      const resolvedPositions = (s.positions || [])
        .map(p => resolveDisplayPosition(p))
        .filter((p): p is OptionsPosition => !!p);
      resolvedItem = {
        ...s,
        positions: resolvedPositions
      };
      const est = estimateCloseForStrategy(resolvedItem);
      const perf = getStrategyPerformanceMetrics(resolvedItem, est);
      if (perf.profitRealizationPct != null) {
        overrideProfitRatio = perf.profitRealizationPct / 100;
      }
    }

    const statusRes = getComboStatus(resolvedItem, type, dte, itemSymbol, allSinglePositions, overrideProfitRatio);
    let badgeClass = '';
    let label = '';
    let explanation = '';

    const prPercent = Math.round(statusRes.profitRatio * 100);

    if (statusRes.status === 'AUTO') {
      badgeClass = 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/30';
      label = 'AUTO';
      explanation = `已达止盈且成本检查通过。收益率: ${prPercent}% (目标: 90%)`;
    } else if (statusRes.status === 'PROFIT') {
      badgeClass = 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/30';
      label = 'PROFIT';
      explanation = `收益率已达 80% 止盈阈值。收益率: ${prPercent}%`;
    } else if (statusRes.status === 'WATCH') {
      badgeClass = 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/30';
      label = 'WATCH';
      explanation = `收益监控中（已达 50% 监控阈值）。收益率: ${prPercent}%`;
    } else {
      const pr = statusRes.profitRatio;
      if (pr >= 0.90) {
        badgeClass = 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/20';
        label = '90%+';
        explanation = `利润实现率已达: ${prPercent}%`;
      } else if (pr >= 0.80) {
        badgeClass = 'bg-green-50 text-green-700 border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/20';
        label = '80%+';
        explanation = `利润实现率已达: ${prPercent}%`;
      } else if (pr >= 0.50) {
        badgeClass = 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/20';
        label = '50%+';
        explanation = `利润实现率已达: ${prPercent}%`;
      } else {
        return null;
      }
    }

    return (
      <span 
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeClass} cursor-help shrink-0`}
        title={explanation}
      >
        {label}
      </span>
    );
  }, [group.daysToExpiry, selectedSymbol, allSinglePositions, resolveDisplayPosition, estimateCloseForStrategy, getStrategyPerformanceMetrics]);

  const comboStatuses = useMemo(() => {
    const list: ReturnType<typeof getComboStatus>[] = [];
    const dte = group.daysToExpiry;
    const grpSymbol = group.single[0]?.opt_undl_code_full || group.complex[0]?.positions[0]?.opt_undl_code_full || selectedSymbol || '';
    
    group.complex.forEach(strategy => {
      const resolvedPositions = (strategy.positions || [])
        .map(p => resolveDisplayPosition(p))
        .filter((p): p is OptionsPosition => !!p);
      const resolvedStrategy = {
        ...strategy,
        positions: resolvedPositions
      };
      
      const est = estimateCloseForStrategy(resolvedStrategy);
      const perf = getStrategyPerformanceMetrics(resolvedStrategy, est);
      const calculatedProfitRatio = perf.profitRealizationPct != null ? perf.profitRealizationPct / 100 : 0;
      
      const statusRes = getComboStatus(resolvedStrategy, 'complex', dte, grpSymbol, allSinglePositions, calculatedProfitRatio);
      
      const summaries = getStrategyStrikeGapSummary(resolvedStrategy);
      let formattedStrikeRange = '';
      if (summaries.length > 0) {
        formattedStrikeRange = summaries.map(s => `${s.startStrikeText}-${s.endStrikeText}`).join(', ');
      } else {
        const strikes = resolvedPositions
          .map(p => p.strike)
          .filter(s => s > 0)
          .sort((a, b) => a - b);
        formattedStrikeRange = strikes.join('-');
      }
      
      statusRes.strikeLabel = formattedStrikeRange;
      list.push(statusRes);
    });
    
    group.single.forEach(position => {
      const resolvedPosition = resolveDisplayPosition(position) ?? position;
      const statusRes = getComboStatus(resolvedPosition, 'single', dte, grpSymbol, allSinglePositions);
      statusRes.strikeLabel = String(resolvedPosition.strike);
      list.push(statusRes);
    });
    return list;
  }, [group, selectedSymbol, allSinglePositions, resolveDisplayPosition, getStrategyStrikeGapSummary, estimateCloseForStrategy, getStrategyPerformanceMetrics]);

  const statusCounts = useMemo(() => {
    const counts = {
      watch: [] as typeof comboStatuses,
      profit: [] as typeof comboStatuses,
      auto: [] as typeof comboStatuses
    };
    comboStatuses.forEach(c => {
      if (c.status === 'AUTO') counts.auto.push(c);
      else if (c.status === 'PROFIT') counts.profit.push(c);
      else if (c.status === 'WATCH') counts.watch.push(c);
    });

    const sortByProfitRatio = (a: (typeof comboStatuses)[0], b: (typeof comboStatuses)[0]) => {
      const valA = a.profitRatio ?? -Infinity;
      const valB = b.profitRatio ?? -Infinity;
      return valB - valA;
    };

    counts.auto.sort(sortByProfitRatio);
    counts.profit.sort(sortByProfitRatio);
    counts.watch.sort(sortByProfitRatio);

    return counts;
  }, [comboStatuses]);

  const sortedStrategies = useMemo(() => {
    const arr = [...(confirmData?.meta?.strategies || [])];
    
    return arr.sort((a, b) => {
      const resolvedA = {
        ...a.strategy,
        positions: (a.strategy.positions || [])
          .map(p => resolveDisplayPosition(p))
          .filter((p): p is OptionsPosition => !!p)
      };
      const resolvedB = {
        ...b.strategy,
        positions: (b.strategy.positions || [])
          .map(p => resolveDisplayPosition(p))
          .filter((p): p is OptionsPosition => !!p)
      };
      
      const estA = estimateCloseForStrategy(resolvedA);
      const perfA = getStrategyPerformanceMetrics(resolvedA, estA);
      
      const estB = estimateCloseForStrategy(resolvedB);
      const perfB = getStrategyPerformanceMetrics(resolvedB, estB);
      
      const valA = perfA.profitRealizationPct;
      const valB = perfB.profitRealizationPct;
      
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      return valB - valA; // Descending by profit realization percentage
    });
  }, [confirmData?.meta?.strategies, resolveDisplayPosition, estimateCloseForStrategy, getStrategyPerformanceMetrics]);

  const tooltipCardClass = theme === 'dark'
    ? 'bg-zinc-900/95 border-zinc-700/80 text-zinc-100 shadow-[0_16px_36px_-8px_rgba(0,0,0,0.6)]'
    : theme === 'blue'
      ? 'bg-white/98 border-blue-200 text-slate-800 shadow-[0_16px_36px_-8px_rgba(37,99,235,0.15)]'
      : 'bg-white/98 border-slate-200 text-slate-800 shadow-[0_16px_36px_-8px_rgba(15,23,42,0.15)]';

  const tooltipDividerClass = theme === 'dark' ? 'border-zinc-800/80' : theme === 'blue' ? 'border-blue-50' : 'border-slate-100';
  const tooltipSubtextClass = theme === 'dark' ? 'text-zinc-300' : 'text-slate-600';
  const tooltipArrowClass = theme === 'dark' ? 'border-b-zinc-900' : 'border-b-white';

  return (
    <div className={`${themes[theme].card} ${themes[theme].border} relative isolate rounded-xl border overflow-hidden
      ${theme === 'dark'
        ? 'shadow-[0_1px_2px_rgba(0,0,0,0.25),0_12px_28px_-16px_rgba(0,0,0,0.45)]'
        : theme === 'blue'
          ? 'shadow-[0_1px_2px_rgba(30,64,175,0.04),0_10px_28px_-16px_rgba(37,99,235,0.10)]'
          : 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.08)]'
      }`}>
        <OptionQuoteSubscription realtimeCodes={dialogSubscriptionCodes} />
      <div className={`absolute inset-x-0 top-0 h-px z-10 bg-gradient-to-r ${
        theme === 'dark' ? 'from-zinc-800/60 via-zinc-900/20 to-transparent'
        : theme === 'blue' ? 'from-blue-50/90 via-blue-50/40 to-transparent'
        : 'from-slate-50/90 via-slate-50/40 to-transparent'
      }`} aria-hidden="true" />
      <div className={`relative border-b ${themes[theme].border} px-3 py-3 pr-12 sm:px-5 sm:py-4 sm:pr-16`}>
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex flex-1 items-start gap-3">
            <div className="min-w-0 flex-1">
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <h3 className={`text-lg sm:text-3xl font-semibold leading-tight ${themes[theme].text}`}>
                    {format(new Date(group.expiry), 'yyyy年MM月dd日')}
                  </h3>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-medium ${getDaysToExpiryColor(group.daysToExpiry)}`}>
                    {expiryStatusText}
                  </span>
                </div>
                <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-medium ${themes[theme].background} ${themes[theme].text}`}>
                    {filteredPositions.length} 个持仓
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-medium ${profitLossBadgeClass}`}>
                    浮盈亏 {totalProfitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalProfitLoss), currencyConfig, 0)}
                  </span>
                  {totalMargin > 0 && (
                    <span className="inline-flex items-center rounded-full px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-300 font-mono">
                      保证金 {formatCurrency(totalMargin, currencyConfig, 0)}
                    </span>
                  )}
                  {statusCounts.auto.length > 0 && (
                    <div className="relative group/autotip inline-flex items-center shrink-0">
                      <span className="inline-flex items-center rounded-full px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 border border-red-200/20 shrink-0 cursor-help">
                        AUTO: {statusCounts.auto.length}
                      </span>
                      <div 
                        onWheel={(e) => e.stopPropagation()}
                        className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/autotip:block w-80 p-3.5 ${tooltipCardClass} border rounded-xl z-50 pointer-events-auto overscroll-contain backdrop-blur-xl before:content-[''] before:absolute before:-top-2 before:left-0 before:w-full before:h-2`}
                      >
                        <div className="text-[11px] font-bold text-red-500 dark:text-red-400 mb-2 flex items-center justify-between">
                          <span>AUTO 组合列表</span>
                          <span className="text-[9px] font-normal font-mono opacity-60">按收益率</span>
                        </div>
                        <div className={`space-y-1 text-[10px] leading-relaxed max-h-60 overflow-y-auto overscroll-contain -mr-1.5 pr-2.5 custom-scrollbar ${tooltipSubtextClass}`}>
                          {statusCounts.auto.map((c, idx) => (
                            <div key={idx} className={`flex justify-between items-center border-b ${tooltipDividerClass} pb-1.5 pt-0.5 last:border-0 last:pb-0 gap-2`}>
                              <span className="truncate max-w-[155px] font-medium" title={c.name}>{c.name}</span>
                              <div className="flex items-center gap-2 shrink-0 ml-1">
                                <span className="font-mono opacity-60 text-[9px] min-w-[32px] text-right">{c.strikeLabel || '--'}</span>
                                <span className="font-mono text-red-500 dark:text-red-400 font-bold min-w-[36px] text-right">{Math.round(c.profitRatio * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent ${tooltipArrowClass}`}></div>
                      </div>
                    </div>
                  )}
                  {statusCounts.profit.length > 0 && (
                    <div className="relative group/profittip inline-flex items-center shrink-0">
                      <span className="inline-flex items-center rounded-full px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400 border border-green-200/20 shrink-0 cursor-help">
                        PROFIT: {statusCounts.profit.length}
                      </span>
                      <div 
                        onWheel={(e) => e.stopPropagation()}
                        className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/profittip:block w-80 p-3.5 ${tooltipCardClass} border rounded-xl z-50 pointer-events-auto overscroll-contain backdrop-blur-xl before:content-[''] before:absolute before:-top-2 before:left-0 before:w-full before:h-2`}
                      >
                        <div className="text-[11px] font-bold text-emerald-600 dark:text-green-400 mb-2 flex items-center justify-between">
                          <span>PROFIT 组合列表</span>
                          <span className="text-[9px] font-normal font-mono opacity-60">按收益率</span>
                        </div>
                        <div className={`space-y-1 text-[10px] leading-relaxed max-h-60 overflow-y-auto overscroll-contain -mr-1.5 pr-2.5 custom-scrollbar ${tooltipSubtextClass}`}>
                          {statusCounts.profit.map((c, idx) => (
                            <div key={idx} className={`flex justify-between items-center border-b ${tooltipDividerClass} pb-1.5 pt-0.5 last:border-0 last:pb-0 gap-2`}>
                              <span className="truncate max-w-[155px] font-medium" title={c.name}>{c.name}</span>
                              <div className="flex items-center gap-2 shrink-0 ml-1">
                                <span className="font-mono opacity-60 text-[9px] min-w-[32px] text-right">{c.strikeLabel || '--'}</span>
                                <span className="font-mono text-emerald-600 dark:text-green-400 font-bold min-w-[36px] text-right">{Math.round(c.profitRatio * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent ${tooltipArrowClass}`}></div>
                      </div>
                    </div>
                  )}
                  {statusCounts.watch.length > 0 && (
                    <div className="relative group/watchtip inline-flex items-center shrink-0">
                      <span className="inline-flex items-center rounded-full px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400 border border-yellow-200/20 shrink-0 cursor-help">
                        WATCH: {statusCounts.watch.length}
                      </span>
                      <div 
                        onWheel={(e) => e.stopPropagation()}
                        className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/watchtip:block w-80 p-3.5 ${tooltipCardClass} border rounded-xl z-50 pointer-events-auto overscroll-contain backdrop-blur-xl before:content-[''] before:absolute before:-top-2 before:left-0 before:w-full before:h-2`}
                      >
                        <div className="text-[11px] font-bold text-amber-600 dark:text-yellow-400 mb-2 flex items-center justify-between">
                          <span>WATCH 组合列表</span>
                          <span className="text-[9px] font-normal font-mono opacity-60">按收益率</span>
                        </div>
                        <div className={`space-y-1 text-[10px] leading-relaxed max-h-60 overflow-y-auto overscroll-contain -mr-1.5 pr-2.5 custom-scrollbar ${tooltipSubtextClass}`}>
                          {statusCounts.watch.map((c, idx) => (
                            <div key={idx} className={`flex justify-between items-center border-b ${tooltipDividerClass} pb-1.5 pt-0.5 last:border-0 last:pb-0 gap-2`}>
                              <span className="truncate max-w-[155px] font-medium" title={c.name}>{c.name}</span>
                              <div className="flex items-center gap-2 shrink-0 ml-1">
                                <span className="font-mono opacity-60 text-[9px] min-w-[32px] text-right">{c.strikeLabel || '--'}</span>
                                <span className="font-mono text-amber-600 dark:text-yellow-400 font-bold min-w-[36px] text-right">{Math.round(c.profitRatio * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent ${tooltipArrowClass}`}></div>
                      </div>
                    </div>
                  )}
                  {(statusCounts.auto.length > 0 || statusCounts.profit.length > 0 || statusCounts.watch.length > 0) && (
                    <div className="relative group/tooltip inline-flex items-center shrink-0">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center p-0.5 rounded-full text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors cursor-help"
                        aria-label="查看期权监控规则说明"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                      <div 
                        onWheel={(e) => e.stopPropagation()}
                        className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block w-80 p-3.5 ${tooltipCardClass} border rounded-xl z-50 pointer-events-auto overscroll-contain backdrop-blur-xl before:content-[''] before:absolute before:-top-2 before:left-0 before:w-full before:h-2`}
                      >
                        <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-1.5">期权到期监控规则 (W/P/A)</div>
                        <div className={`space-y-1.5 text-[10px] leading-relaxed ${tooltipSubtextClass}`}>
                          <p><strong className="text-amber-600 dark:text-yellow-400">WATCH</strong>: 收益率达到到期日动态阈值。</p>
                          <p><strong className="text-emerald-600 dark:text-green-400">PROFIT</strong>: 达标且由于剩余天数较长，剩余收益衰减效率偏低 (&lt;0.3%/天)。</p>
                          <p><strong className="text-red-500 dark:text-red-400">AUTO</strong>: 收益率 &ge; 90% 且当前剩余可获取的利润大于平仓交易成本。</p>
                          <div className={`border-t ${tooltipDividerClass} pt-1.5 mt-1.5 text-[9px] opacity-80`}>
                            <strong>到期日动态阈值标准 (DTE)：</strong>
                            <div className="grid grid-cols-2 gap-x-2 mt-0.5 font-mono">
                              <div>DTE &gt; 90天: 80%</div>
                              <div>DTE 60-90天: 85%</div>
                              <div>DTE 30-60天: 88%</div>
                              <div>DTE &lt; 30天: 90%</div>
                            </div>
                          </div>
                        </div>
                        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent ${tooltipArrowClass}`}></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>


        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          className={expandHandleButtonClass}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? '收起到期日分组' : '展开到期日分组'}
          title={isExpanded ? '收起' : '展开'}
        >
          <span className="sr-only">{isExpanded ? '收起到期日分组' : '展开到期日分组'}</span>
          <span className="pointer-events-none flex flex-col items-center gap-1">
            <span className="h-4 w-[2px] rounded-full bg-slate-300/90 dark:bg-slate-600/90" />
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>
      </div>



      <div className={`px-3 py-3 sm:px-5 sm:py-4 ${isExpanded ? 'block' : 'hidden'}`} aria-hidden={!isExpanded}>
        <div className="space-y-3 sm:space-y-4">
          {(() => {
            const callPositions = filteredPositions.filter(pos => (pos.type === 'call' || pos.contract_type_zh === 'call'));
            const putPositions = filteredPositions.filter(pos => (pos.type === 'put' || pos.contract_type_zh === 'put'));

            return (
              <div className="space-y-4 sm:space-y-5">
                <div className="mt-0">
                    <div className="flex items-center justify-between mb-2.5 gap-2">
                      <div 
                        className="flex items-center gap-1.5 sm:gap-2 cursor-pointer select-none hover:opacity-80 transition-opacity min-w-0 shrink-0"
                        onClick={onToggleTBoard}
                      >
                        <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded shrink-0 ${theme === 'dark' ? 'bg-zinc-600' : theme === 'blue' ? 'bg-blue-400' : 'bg-slate-400'}`}></div>
                        <h4 className={`text-sm sm:text-[17px] font-semibold tracking-tight whitespace-nowrap ${themes[theme].text}`}>
                          {filteredPositions.length > 0 ? '持仓T型数量看板' : 'T型报价'}
                        </h4>
                        {isTBoardExpanded ? (
                          <ChevronUp className={`w-4 h-4 shrink-0 ${themes[theme].text} opacity-50`} strokeWidth={2} />
                        ) : (
                          <ChevronDown className={`w-4 h-4 shrink-0 ${themes[theme].text} opacity-50`} strokeWidth={2} />
                        )}
                      </div>

                      {isTBoardExpanded && (
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                          {showOpenInterestOverlay && oiSummary && (
                            <div className="hidden md:flex items-center gap-2 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-100/90 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/60 shadow-xs">
                              {oiSummary.maxCall > 0 && (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium" title={`全市场 Call 最大未平仓量: 行权价 ${oiSummary.maxCallStrike} (${oiSummary.maxCall.toLocaleString()} 张)`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Call主力 {oiSummary.maxCallStrike} ({formatOINumber(oiSummary.maxCall)})
                                </span>
                              )}
                              {oiSummary.maxCall > 0 && oiSummary.maxPut > 0 && (
                                <span className="text-gray-300 dark:text-zinc-600">|</span>
                              )}
                              {oiSummary.maxPut > 0 && (
                                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium" title={`全市场 Put 最大未平仓量: 行权价 ${oiSummary.maxPutStrike} (${oiSummary.maxPut.toLocaleString()} 张)`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  Put主力 {oiSummary.maxPutStrike} ({formatOINumber(oiSummary.maxPut)})
                                </span>
                              )}
                              <span className="text-gray-300 dark:text-zinc-600">|</span>
                              <span className="text-gray-600 dark:text-zinc-300">
                                P/C比: <span className="font-bold text-slate-800 dark:text-zinc-200">{oiSummary.pcr}</span>
                              </span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowOpenInterestOverlay(prev => !prev);
                            }}
                            className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium transition-all shadow-xs ${
                              showOpenInterestOverlay
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 border border-transparent hover:bg-gray-200 dark:hover:bg-zinc-700'
                            }`}
                            title="开启或关闭市场未平仓量 (OI) 分布平滑曲线图层"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${showOpenInterestOverlay ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
                            <span className="hidden sm:inline">未平仓量 (OI) 图层</span>
                            <span className="sm:hidden">OI图层</span>
                            <span className="text-[10px] font-mono opacity-80">{showOpenInterestOverlay ? 'ON' : 'OFF'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              enterFullscreen();
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all shadow-xs ${
                              theme === 'dark'
                                ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700/80'
                                : theme === 'blue'
                                  ? 'bg-blue-100/90 text-blue-700 hover:bg-blue-200 border border-blue-200'
                                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                            }`}
                            title="全屏查看T型报价 (适合手机/平板/大屏操作)"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>全屏</span>
                          </button>
                        </div>
                      )}
                    </div>
                    {isTBoardExpanded && (
                      <>
                        {(() => {
                          const renderTBoardTableContent = (inFullscreen: boolean) => {
                            const { strikes } = tBoardStrikesAndMetrics;
                            const hasData = strikes.length > 0;
                            if (!hasData) {
                              return (
                                <div className={`text-center py-12 text-sm ${themes[theme].text} opacity-75`}>暂无数据</div>
                              );
                            }
                            return (
                              <div className={inFullscreen ? "h-full flex flex-col" : "space-y-2.5 sm:space-y-3"}>
                                {!inFullscreen && (
                                  <div className="md:hidden flex items-center justify-between gap-2 py-0.5">
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          hasUserAdjustedTBoardRef.current = false;
                                          scrollToAtm(true);
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 transition-all active:scale-95 whitespace-nowrap shadow-2xs"
                                        title="一键定位平值与行权价"
                                      >
                                        <Crosshair className="w-3.5 h-3.5 shrink-0" />
                                        <span>定位平值</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={enterFullscreen}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-all active:scale-95 whitespace-nowrap shadow-2xs"
                                        title="进入全屏沉浸浏览与操作"
                                      >
                                        <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                                        <span>全屏</span>
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-lg border border-black/5 dark:border-white/5 shrink-0">
                                      <span className="text-[11px] opacity-70">缩放</span>
                                      <input
                                        type="range"
                                        min={70}
                                        max={110}
                                        step={5}
                                        value={Math.round(mobileTBoardScale * 100)}
                                        onChange={(event) => setMobileTBoardScale(Number(event.target.value) / 100)}
                                        className="w-16 accent-blue-600 h-1 cursor-pointer"
                                        aria-label="调整T型持仓列表大小"
                                      />
                                      <span className="text-[11px] font-mono opacity-80 min-w-[28px] text-right font-medium">
                                        {Math.round(mobileTBoardScale * 100)}%
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <div
                                  ref={tBoardScrollRef}
                                  className={
                                    inFullscreen
                                      ? "flex-1 min-h-0 overflow-auto overscroll-contain select-none"
                                      : "overflow-x-auto"
                                  }
                                  style={inFullscreen ? { WebkitOverflowScrolling: 'touch' } : undefined}
                                  onScroll={handleTBoardScroll}
                                >
                                  <div className="relative inline-block min-w-full">
                                    <table
                                      ref={tBoardTableRef}
                                      className="w-full text-xs min-w-[1120px]"
                                      style={(isMobileViewport || inFullscreen) ? { zoom: mobileTBoardScale } : undefined}
                                    >
                                      <thead className={inFullscreen ? `sticky top-0 z-20 shadow-xs ${
                                        theme === 'dark' ? 'bg-zinc-900/95' : theme === 'blue' ? 'bg-slate-900/95' : 'bg-slate-100/95'
                                      } backdrop-blur-md` : undefined}>
                                        <tr className={`${themes[theme].text} opacity-75`}>
                                          <th className="text-center py-2" colSpan={7}>Calls</th>
                                          <th className={`text-center py-2 border-l border-r ${themes[theme].border}`}></th>
                                          <th className="text-center py-2" colSpan={7}>Puts</th>
                                        </tr>
                                        <tr className={`text-xs ${themes[theme].text} opacity-70`}>
                                          <th className="text-center py-2">组合</th>
                                          <th className="text-center py-2">备兑</th>
                                          <th className="text-center py-2">义务</th>
                                          <th className="text-center py-2 px-2">权利</th>
                                          <th className="text-center py-2 px-2">保证金</th>
                                          <th className="text-center py-2 px-2">时间价值</th>
                                          <th className={`text-center py-2 px-2 border-r ${themes[theme].border}`}>现价</th>
                                          <th ref={strikeHeaderRef} className={`text-center py-2 px-3 font-bold ${themes[theme].text}`}>行权价</th>
                                          <th className={`text-center py-2 px-2 border-l ${themes[theme].border}`}>现价</th>
                                          <th className="text-center py-2 px-2">时间价值</th>
                                          <th className="text-center py-2 px-2">保证金</th>
                                          <th className="text-center py-2 px-2">权利</th>
                                          <th className="text-center py-2">义务</th>
                                          <th className="text-center py-2">备兑</th>
                                          <th className="text-center py-2">组合</th>
                                        </tr>
                                      </thead>
                                      <tbody className={`divide-y ${themes[theme].border}`}>
                                        {(() => {
                                          const { metrics } = tBoardStrikesAndMetrics;
                                          const maxRisk = Math.max(1, ...metrics.map(m => m.risk));
                                          const resolveMaxTimeValueForStrike = (strike: number): number => {
                                            const quote = quotesByStrike.get(strike);
                                            if (!quote) return 0;
                                            let callTV: number | null = null;
                                            let putTV: number | null = null;
                                            const qCallTV = quote.callTimeValue;
                                            const qPutTV = quote.putTimeValue;
                                            if (typeof qCallTV === 'number' && Number.isFinite(qCallTV)) callTV = qCallTV;
                                            if (typeof qPutTV === 'number' && Number.isFinite(qPutTV)) putTV = qPutTV;
                                            if ((callTV == null || putTV == null) && underlyingPrice != null) {
                                              const callCode = quote.call_contract_code || '';
                                              const callFullCode = quote.call_contract_code_full || '';
                                              const putCode = quote.put_contract_code || '';
                                              const putFullCode = quote.put_contract_code_full || '';
                                              const callPrice = (callCode && prices[callCode]?.price) || (callFullCode && prices[callFullCode]?.price) || quote.call_last_price;
                                              const putPrice = (putCode && prices[putCode]?.price) || (putFullCode && prices[putFullCode]?.price) || quote.put_last_price;
                                              if (callTV == null && typeof callPrice === 'number' && Number.isFinite(callPrice)) { callTV = callPrice - Math.max(0, underlyingPrice - strike); }
                                              if (putTV == null && typeof putPrice === 'number' && Number.isFinite(putPrice)) { putTV = putPrice - Math.max(0, strike - underlyingPrice); }
                                            }
                                            return Math.max(0, callTV ?? 0, putTV ?? 0);
                                          };
                                          const maxTimeValue = Math.max(0, ...metrics.map(m => resolveMaxTimeValueForStrike(m.s)));

                                          // ---- Spot price indicator line ----
                                          if (underlyingPrice != null && metrics.length > 0) {
                                            let insertIdx = metrics.length;
                                            for (let i = 0; i < metrics.length; i++) {
                                              if (metrics[i].s >= underlyingPrice) {
                                                insertIdx = i;
                                                break;
                                              }
                                            }

                                            const isInRange = underlyingPrice >= metrics[0].s && underlyingPrice <= metrics[metrics.length - 1].s;
                                            const spotColor = isInRange
                                              ? 'text-yellow-600 dark:text-yellow-400'
                                              : 'text-orange-500 dark:text-orange-400';

                                            const spotIndicator = (
                                              <tr key={`spot-${group.expiry}`} data-spot-indicator="true" style={{ background: 'transparent' }}>
                                                <td colSpan={15} className="py-1 px-2">
                                                  <div className="flex items-center gap-1.5">
                                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />
                                                    <span className={`text-[11px] font-semibold whitespace-nowrap ${spotColor}`}>
                                                      {isInRange ? '' : '⚠ '}标的价格: {formatCurrency(underlyingPrice, currencyConfig, 4)}
                                                    </span>
                                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />
                                                  </div>
                                                </td>
                                              </tr>
                                            );

                                            const rows: React.ReactNode[] = [];
                                            for (let i = 0; i < metrics.length; i++) {
                                              if (i === insertIdx) {
                                                rows.push(spotIndicator);
                                              }
                                              rows.push(
                                                <TBoardRow
                                                  key={`trow-top-${group.expiry}-${metrics[i].s}`}
                                                  metric={metrics[i]}
                                                  theme={theme}
                                                  maxRisk={maxRisk}
                                                  maxTimeValue={maxTimeValue}
                                                  underlyingPrice={underlyingPrice}
                                                  quotesByStrike={quotesByStrike}
                                                  prices={prices}
                                                  currencyConfig={currencyConfig}
                                                  strikes={strikes}
                                                  groupExpiry={group.expiry}
                                                  selectedSymbol={selectedSymbol}
                                                  optionsData={optionsData}
                                                  optionsDataMap={optionsDataMap}
                                                  localOptionsData={localOptionsData}
                                                  filteredPositions={filteredPositions}
                                                  onSetConfirmData={setConfirmData}
                                                />
                                              );
                                            }
                                            if (insertIdx === metrics.length) {
                                              rows.push(spotIndicator);
                                            }
                                            return rows;
                                          }

                                          return metrics.map((m) => (
                                            <TBoardRow
                                              key={`trow-top-${group.expiry}-${m.s}`}
                                              metric={m}
                                              theme={theme}
                                              maxRisk={maxRisk}
                                              maxTimeValue={maxTimeValue}
                                              underlyingPrice={underlyingPrice}
                                              quotesByStrike={quotesByStrike}
                                              prices={prices}
                                              currencyConfig={currencyConfig}
                                              strikes={strikes}
                                              groupExpiry={group.expiry}
                                              selectedSymbol={selectedSymbol}
                                              optionsData={optionsData}
                                              optionsDataMap={optionsDataMap}
                                              localOptionsData={localOptionsData}
                                              filteredPositions={filteredPositions}
                                              onSetConfirmData={setConfirmData}
                                            />
                                          ));
                                        })()}
                                      </tbody>
                                    </table>
                                    <OpenInterestOverlay
                                      tableRef={tBoardTableRef}
                                      strikeHeaderRef={strikeHeaderRef}
                                      theme={theme}
                                      data={openInterestByStrike}
                                      maxOpenInterest={maxOpenInterest}
                                      visible={showOpenInterestOverlay}
                                      scale={(isMobileViewport || inFullscreen) ? mobileTBoardScale : 1}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          };

                          return (
                            <>
                              {isTBoardFullscreen ? (
                                <div className={`rounded-xl p-4 sm:p-5 border border-dashed ${themes[theme].border} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                                  theme === 'dark' ? 'bg-zinc-900/40' : theme === 'blue' ? 'bg-blue-50/40' : 'bg-slate-50/70'
                                }`}>
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                      <Maximize2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <div className={`text-sm sm:text-base font-semibold ${themes[theme].text}`}>
                                        T型报价已在全屏模式中打开
                                      </div>
                                      <div className={`text-xs opacity-75 ${themes[theme].text}`}>
                                        当前正在全屏模式下浏览和操作，随时可恢复卡片视图
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={exitFullscreen}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors shrink-0"
                                  >
                                    <Minimize2 className="w-3.5 h-3.5" />
                                    <span>退出全屏</span>
                                  </button>
                                </div>
                              ) : (
                                <div className={`rounded-xl p-3 sm:p-4 border ${themes[theme].border} relative ${
                                  theme === 'dark'
                                    ? 'bg-zinc-950/40'
                                    : theme === 'blue'
                                      ? 'bg-blue-50/40'
                                      : 'bg-slate-50/70'
                                }`}>
                                  {isRefreshing && (
                                    <div className="absolute inset-0 z-10 bg-white/50 dark:bg-black/50 flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 rounded-xl">
                                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                    </div>
                                  )}
                                  {renderTBoardTableContent(false)}
                                </div>
                              )}

                              {isTBoardFullscreen && createPortal(
                                <div
                                  className={`fixed inset-0 z-[9999] flex flex-col ${themes[theme].card} ${
                                    theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : theme === 'blue' ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'
                                  } overflow-hidden`}
                                  style={{ overscrollBehavior: 'contain' }}
                                >
                                  {/* Fullscreen Header */}
                                  <header className={`shrink-0 border-b ${themes[theme].border} ${
                                    theme === 'dark' ? 'bg-zinc-900/95' : theme === 'blue' ? 'bg-slate-900/95' : 'bg-white/95'
                                  } backdrop-blur-md z-30 shadow-xs`}>
                                    {/* Top Row: Symbol, Price, Expiry date, and main actions */}
                                    <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
                                      {/* Left: Back button + Symbol info */}
                                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                        <button
                                          type="button"
                                          onClick={exitFullscreen}
                                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-xs shrink-0 select-none whitespace-nowrap ${
                                            theme === 'dark'
                                              ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:bg-zinc-600'
                                              : theme === 'blue'
                                                ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                                                : 'bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 border border-slate-200/80'
                                          }`}
                                          title="退出全屏 (Esc)"
                                        >
                                          <ArrowLeft className="w-4 h-4 shrink-0" />
                                          <span className="font-semibold whitespace-nowrap">返回</span>
                                        </button>

                                        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                                          <div className="flex items-baseline gap-1.5 min-w-0">
                                            <span className={`text-sm sm:text-base font-bold truncate ${themes[theme].text}`}>
                                              {selectedSymbol}
                                            </span>
                                            {underlyingPrice != null && (
                                              <span className="text-xs sm:text-sm font-mono font-semibold text-amber-500 dark:text-yellow-400 whitespace-nowrap">
                                                {formatCurrency(underlyingPrice, currencyConfig, 4)}
                                              </span>
                                            )}
                                          </div>

                                          <span className={`text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                                            theme === 'dark' ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-200/80 text-slate-700'
                                          }`}>
                                            {group.expiry}
                                          </span>

                                          <span className={`hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${profitLossBadgeClass}`}>
                                            {expiryStatusText}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Right (Desktop): All controls inline */}
                                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                                        {showOpenInterestOverlay && oiSummary && (
                                          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-100/90 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/60">
                                            {oiSummary.maxCall > 0 && (
                                              <span className="text-emerald-500 font-medium">
                                                Call主力 {oiSummary.maxCallStrike} ({formatOINumber(oiSummary.maxCall)})
                                              </span>
                                            )}
                                            {oiSummary.maxCall > 0 && oiSummary.maxPut > 0 && <span className="opacity-40">|</span>}
                                            {oiSummary.maxPut > 0 && (
                                              <span className="text-rose-500 font-medium">
                                                Put主力 {oiSummary.maxPutStrike} ({formatOINumber(oiSummary.maxPut)})
                                              </span>
                                            )}
                                            <span className="opacity-40">|</span>
                                            <span>PCR: {oiSummary.pcr}</span>
                                          </div>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => scrollToAtm(true)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 transition-colors whitespace-nowrap"
                                          title="一键定位居中平值行权价与标的价格"
                                        >
                                          <Crosshair className="w-3.5 h-3.5 shrink-0" />
                                          <span>定位平值</span>
                                        </button>

                                        <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-black/5 dark:border-white/5">
                                          <span className="text-xs opacity-70 font-mono">缩放</span>
                                          <input
                                            type="range"
                                            min={70}
                                            max={110}
                                            step={5}
                                            value={Math.round(mobileTBoardScale * 100)}
                                            onChange={(event) => setMobileTBoardScale(Number(event.target.value) / 100)}
                                            className="w-20 accent-blue-600 h-1.5 cursor-pointer"
                                            aria-label="调整全屏T型报价表格大小"
                                          />
                                          <span className="text-xs font-mono opacity-80 min-w-[32px] text-right">
                                            {Math.round(mobileTBoardScale * 100)}%
                                          </span>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => setShowOpenInterestOverlay(prev => !prev)}
                                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                                            showOpenInterestOverlay
                                              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                              : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100'
                                          }`}
                                          title="切换未平仓量 (OI) 平滑分布曲线"
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full ${showOpenInterestOverlay ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
                                          <span>OI图层</span>
                                          <span className="text-[10px] font-mono">{showOpenInterestOverlay ? 'ON' : 'OFF'}</span>
                                        </button>

                                        {onRefresh && (
                                          <button
                                            type="button"
                                            onClick={() => onRefresh()}
                                            disabled={isRefreshing}
                                            className="p-1.5 rounded-lg text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50 shrink-0"
                                            title="刷新数据"
                                          >
                                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={exitFullscreen}
                                          className="p-1.5 rounded-lg text-xs opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
                                          title="退出全屏 (Esc)"
                                        >
                                          <Minimize2 className="w-4 h-4" />
                                        </button>
                                      </div>

                                      {/* Right (Mobile): Only Refresh + Close/Minimize */}
                                      <div className="flex sm:hidden items-center gap-1 shrink-0">
                                        {onRefresh && (
                                          <button
                                            type="button"
                                            onClick={() => onRefresh()}
                                            disabled={isRefreshing}
                                            className="p-1.5 rounded-lg text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                                            title="刷新数据"
                                          >
                                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={exitFullscreen}
                                          className="p-1.5 rounded-lg text-xs opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                          title="退出全屏 (Esc)"
                                        >
                                          <Minimize2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Mobile Second Row: Controls Bar */}
                                    <div className="flex sm:hidden items-center justify-between gap-2 px-3 py-1.5 bg-black/[0.03] dark:bg-white/[0.03] border-t border-black/5 dark:border-white/5">
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => scrollToAtm(true)}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 active:scale-95 transition-all whitespace-nowrap shadow-2xs"
                                          title="一键定位平值"
                                        >
                                          <Crosshair className="w-3.5 h-3.5 shrink-0" />
                                          <span>定位平值</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => setShowOpenInterestOverlay(prev => !prev)}
                                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap shadow-2xs ${
                                            showOpenInterestOverlay
                                              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                              : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100 border border-transparent'
                                          }`}
                                          title="开启或关闭未平仓量 (OI) 图层"
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full ${showOpenInterestOverlay ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
                                          <span>OI:</span>
                                          <span className="font-mono text-[10px] font-semibold">{showOpenInterestOverlay ? 'ON' : 'OFF'}</span>
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-md border border-black/5 dark:border-white/5 shrink-0">
                                        <span className="text-[10px] opacity-70 font-mono">表格大小</span>
                                        <input
                                          type="range"
                                          min={70}
                                          max={110}
                                          step={5}
                                          value={Math.round(mobileTBoardScale * 100)}
                                          onChange={(event) => setMobileTBoardScale(Number(event.target.value) / 100)}
                                          className="w-16 accent-blue-600 h-1 cursor-pointer"
                                          aria-label="调整全屏T型报价表格大小"
                                        />
                                        <span className="text-[10px] font-mono opacity-80 min-w-[28px] text-right font-medium">
                                          {Math.round(mobileTBoardScale * 100)}%
                                        </span>
                                      </div>
                                    </div>

                                    {/* Mobile Optional Third Row: OI Summary (if enabled and available) */}
                                    {showOpenInterestOverlay && oiSummary && (
                                      <div className="flex sm:hidden items-center justify-between px-3 py-1 bg-blue-500/5 dark:bg-blue-500/10 border-t border-blue-500/10 text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          {oiSummary.maxCall > 0 && (
                                            <span className="text-emerald-500 font-medium">
                                              Call主力 {oiSummary.maxCallStrike} ({formatOINumber(oiSummary.maxCall)})
                                            </span>
                                          )}
                                          {oiSummary.maxCall > 0 && oiSummary.maxPut > 0 && <span className="opacity-30">|</span>}
                                          {oiSummary.maxPut > 0 && (
                                            <span className="text-rose-500 font-medium">
                                              Put主力 {oiSummary.maxPutStrike} ({formatOINumber(oiSummary.maxPut)})
                                            </span>
                                          )}
                                        </div>
                                        <span className="font-medium text-slate-700 dark:text-zinc-300">PCR: {oiSummary.pcr}</span>
                                      </div>
                                    )}
                                  </header>

                                  {/* Fullscreen Body */}
                                  <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
                                    {isRefreshing && (
                                      <div className="absolute inset-0 z-30 bg-black/20 dark:bg-black/40 flex items-center justify-center backdrop-blur-xs pointer-events-none">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                      </div>
                                    )}
                                    {renderTBoardTableContent(true)}
                                  </div>
                                </div>,
                                document.body
                              )}
                            </>
                          );
                        })()}
                      </>
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
                {isExpanded && (callPositions.length > 0 || putPositions.length > 0 || group.complex.length > 0) && (
                  <div className="space-y-3 sm:space-y-4">
                    <button
                      type="button"
                      className={sectionToggleButtonClass}
                      onClick={() => setIsDetailsSectionExpanded(prev => !prev)}
                      aria-expanded={isDetailsSectionExpanded}
                    >
                      <span className="min-w-0">
                        <span className={`block text-sm sm:text-base font-semibold ${themes[theme].text}`}>
                          详细持仓
                        </span>
                        <span className={`mt-0.5 block text-[11px] sm:text-xs ${themes[theme].text} opacity-65`}>
                          Call {callPositions.length} · Put {putPositions.length} · 复杂策略 {group.complex.length}
                        </span>
                      </span>
                      {isDetailsSectionExpanded ? (
                        <ChevronUp className={`w-4 h-4 shrink-0 ${themes[theme].text} opacity-60`} />
                      ) : (
                        <ChevronDown className={`w-4 h-4 shrink-0 ${themes[theme].text} opacity-60`} />
                      )}
                    </button>

                    {isDetailsSectionExpanded && (
                      <>
                        {(callPositions.length > 0 || putPositions.length > 0) && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
                            {callPositions.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-2 sm:mb-4">
                                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded"></div>
                                  <h4 className={`text-sm sm:text-lg font-semibold ${themes[theme].text}`}>
                                    Call期权 ({callPositions.length})
                                  </h4>
                                </div>
                                <div className="space-y-2 sm:space-y-3">
                                  {callPositions.map((position, index) => {
                                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
                                    return (
                                      <div
                                        key={`${position.id ?? 'noid'}-${position.symbol}-${position.strike}-${position.type}-${position.expiry}-${index}`}
                                        className={`${themes[theme].background} rounded-lg p-3 sm:p-4 border ${themes[theme].border} border-l-4 ${positionInfo.borderColor} ${getHighlightClass(position)}`}
                                      >
                                        <div className="flex justify-between items-start gap-2">
                                          <div className="flex items-start space-x-2 sm:space-x-3 min-w-0 flex-1">
                                            {getTypeIcon(position.type)}
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                                <div className={`text-xs sm:text-sm font-medium ${themes[theme].text} break-all`}>
                                                  {position.symbol} {position.strike}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                  {positionInfo.icon}
                                                  <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className={`text-[11px] sm:text-xs ${themes[theme].text} opacity-75 leading-tight`}>
                                                {position.strategy} • {positionInfo.description}
                                              </div>
                                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 sm:mt-2 text-[11px] sm:text-xs">
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
                                          <div className="text-right shrink-0">
                                            <div className={`text-xs sm:text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                            </div>
                                            <div className={`text-[10px] sm:text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 mt-1">
                                              {renderStatusBadge(position, 'single')}
                                              <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${getStatusColor(position.status)}`}>
                                                {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {putPositions.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-2 sm:mb-4">
                                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded"></div>
                                  <h4 className={`text-sm sm:text-lg font-semibold ${themes[theme].text}`}>
                                    Put期权 ({putPositions.length})
                                  </h4>
                                </div>
                                <div className="space-y-2 sm:space-y-3">
                                  {putPositions.map((position, index) => {
                                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
                                    return (
                                      <div
                                        key={`${position.id ?? 'noid'}-${position.symbol}-${position.strike}-${position.type}-${position.expiry}-${index}`}
                                        className={`${themes[theme].background} rounded-lg p-3 sm:p-4 border ${themes[theme].border} border-l-4 ${positionInfo.borderColor} ${getHighlightClass(position)}`}
                                      >
                                        <div className="flex justify-between items-start gap-2">
                                          <div className="flex items-start space-x-2 sm:space-x-3 min-w-0 flex-1">
                                            {getTypeIcon(position.type)}
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                                <div className={`text-xs sm:text-sm font-medium ${themes[theme].text} break-all`}>
                                                  {position.symbol} {position.strike}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                  {positionInfo.icon}
                                                  <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className={`text-[11px] sm:text-xs ${themes[theme].text} opacity-75 leading-tight`}>
                                                {position.strategy} • {positionInfo.description}
                                              </div>
                                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 sm:mt-2 text-[11px] sm:text-xs">
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
                                          <div className="text-right shrink-0">
                                            <div className={`text-xs sm:text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                            </div>
                                            <div className={`text-[10px] sm:text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 mt-1">
                                              {renderStatusBadge(position, 'single')}
                                              <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${getStatusColor(position.status)}`}>
                                                {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {group.complex.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2 sm:mb-4">
                              <div className="w-3 h-3 sm:w-4 sm:h-4 bg-purple-500 rounded"></div>
                              <h4 className={`text-sm sm:text-lg font-semibold ${themes[theme].text}`}>
                                复杂策略 ({group.complex.length})
                              </h4>
                            </div>
                            <div className="space-y-2 sm:space-y-3">
                              {group.complex.map((strategy, strategyIndex) => {
                                const positions = filterAndSortPositions(strategy.positions)
                                  .filter(position => statusFilter === 'all' || position.status === statusFilter);
                                if (positions.length === 0) return null;
                                const legCount = positions.length;
                                const callCombosByStrike = computeCombosForPositions(strategy, 'call');
                                const putCombosByStrike = computeCombosForPositions(strategy, 'put');
                                const comboCount = Array.from(callCombosByStrike.values()).reduce((sum, v) => sum + v, 0) +
                                  Array.from(putCombosByStrike.values()).reduce((sum, v) => sum + v, 0);
                                return (
                                  <div key={`${strategy.id ?? 'nostrategy'}-${strategyIndex}`} className={`${themes[theme].background} rounded-lg p-3 sm:p-4 border-l-4 border-purple-500`}>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 mb-2 sm:mb-3">
                                      <div className={`text-[11px] sm:text-sm ${themes[theme].text} opacity-75 flex items-center gap-2`}>
                                        <span>{strategy.name} （{legCount} 腿，组合数 {comboCount}）</span>
                                        {renderStatusBadge(strategy, 'complex')}
                                      </div>
                                      <div className="flex gap-3 sm:text-right text-xs sm:text-sm shrink-0">
                                        <div className={`font-medium ${themes[theme].text}`}>
                                          成本 {formatCurrency(strategy.totalCost, currencyConfig, 4)}
                                        </div>
                                        <div className={`${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {strategy.profitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(strategy.profitLoss), currencyConfig, 4)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="grid gap-2 sm:gap-3">
                                      {positions.map((position) => {
                                        const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
                                        return (
                                          <div key={`${position.id ?? 'noid'}-${position.symbol}-${position.strike}-${position.type}-${position.expiry}`} className={`${themes[theme].card} rounded-lg p-2 sm:p-3 border ${themes[theme].border}`}>
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                                  {positionInfo.icon}
                                                  <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                                <div className="min-w-0">
                                                  <div className={`text-xs sm:text-sm font-medium ${themes[theme].text} break-all`}>
                                                    {position.symbol} {position.strike} {position.type.toUpperCase()}
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="text-right shrink-0">
                                                <div className={`text-xs sm:text-sm font-medium ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                  {position.profitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                                </div>
                                                <div className={`text-[10px] sm:text-xs ${themes[theme].text} opacity-60`}>
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
                      </>
                    )}
                  </div>
                )}

                
              </div>
            );
          })()}
        </div>
      </div>
  {confirmData && createPortal(
    <div className="fixed inset-0 z-[2147483010] flex items-end justify-center md:items-center">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={() => {
          if (!isPageLocked) setConfirmData(null);
        }}
      ></div>
      <div className={`relative w-full rounded-t-2xl border-t border-x sm:border sm:rounded-2xl sm:max-w-2xl sm:w-[min(90vw,820px)]
        flex flex-col
        max-h-[92svh] md:max-h-[85svh]
        ${themes[theme].card} ${themes[theme].border}
        ${theme === 'dark'
          ? 'shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.55),0_8px_32px_-8px_rgba(0,0,0,0.55)]'
          : theme === 'blue'
            ? 'shadow-[0_-10px_40px_-16px_rgba(37,99,235,0.18),0_8px_32px_-8px_rgba(15,23,42,0.08)]'
            : 'shadow-[0_-10px_40px_-16px_rgba(15,23,42,0.18),0_8px_32px_-8px_rgba(15,23,42,0.08)]'
        } overflow-hidden`}>
        {/* Sheet grab handle (mobile only) */}
        <div className="relative sm:hidden pt-3 pb-2 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-current/15" aria-hidden="true" />
        </div>
        {/* Sheet header */}
        <div className={`flex items-start justify-between gap-3 px-4 pb-3 pt-1 sm:px-6 sm:pb-4 sm:pt-5 shrink-0 border-b ${themes[theme].border}`}>
          <div className="min-w-0 flex-1">
            {confirmData.meta?.action !== 'combo_manage' && (
              <>
                <div className={`text-[17px] sm:text-xl font-semibold tracking-tight ${themes[theme].text}`}>{confirmData.title}</div>
                <div className={`mt-1.5 text-[13px] sm:text-sm opacity-80 ${themes[theme].text}`}>{confirmData.description}</div>
              </>
            )}
            {confirmData.meta?.action === 'combo_manage' && embeddedComboDraft && (
              <div className={`text-[17px] sm:text-xl font-semibold tracking-tight ${themes[theme].text}`}>组合管理</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isPageLocked) setConfirmData(null);
            }}
            disabled={isPageLocked}
            className={`shrink-0 inline-flex items-center justify-center rounded-xl p-2 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
              ${themes[theme].secondary} hover:opacity-90`}
            aria-label="关闭"
            title="关闭"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
        <div className={`px-4 pt-3.5 sm:px-6 sm:pt-4 overflow-y-auto min-h-0 flex-1 space-y-3 ${
          (confirmData.meta?.action !== 'unwind_combo_selection' && confirmData.meta?.action !== 'combo_manage')
            ? 'pb-4 sm:pb-5'
            : 'pb-[calc(env(safe-area-inset-bottom,0px)+20px)] sm:pb-6'
        }`}>
          {confirmData.meta?.action === 'unwind_combo_selection' || confirmData.meta?.action === 'combo_manage' ? (
            <div className="space-y-4">
              {confirmData.meta?.action === 'combo_manage' && embeddedComboDraft ? (
                <div className="space-y-2">
                  <div className={`text-sm font-semibold ${themes[theme].text}`}>调整组合</div>
                  <div className={`rounded-lg border p-3 sm:p-4 ${themes[theme].border} ${themes[theme].background}`}>
                    {renderComboDraftPanel(embeddedComboDraft, true)}
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {confirmData.meta?.action === 'combo_manage' ? (
                  <div className={`text-sm font-semibold ${themes[theme].text}`}>解除已有组合</div>
                ) : null}
                {sortedStrategies.length > 0 ? (
                  (() => {
                    const enrichedStrategies = sortedStrategies.map(item => {
                      const strikeGapSummary = getStrategyStrikeGapSummary(item.strategy);
                      const est = estimateCloseForStrategy(item.strategy);
                      const strategyId = item.strategy.id;
                      const strategyHistory = comboSpreadHistories[strategyId] || [];
                      const strategyStatus = comboSpreadStatuses[strategyId];
                      const strategyWatchCodes = getStrategyWatchCodes(item.strategy);
                      const strategyWatchStatusText = getSpreadWatchStatusText(strategyWatchCodes);
                      const strategyWatchQuoteLines = getSpreadWatchQuoteLines(item.strategy.positions || []);
                      const perf = getStrategyPerformanceMetrics(item.strategy, est);
                      const net = est.net;
                      const label = net == null ? '对手方一档价未就绪' : (net >= 0 ? '预计收到' : '预计支付');
                      const amountText = net == null ? '--' : formatCurrency(Math.abs(net), currencyConfig, 4);
                      const hedgeText =
                        est.perHedge == null
                          ? '--'
                          : `${est.perHedge >= 0 ? '+' : '-'}${formatCurrency(Math.abs(est.perHedge), currencyConfig, 4)}`;
                      const tsText = est.ts ? format(new Date(est.ts), 'HH:mm:ss') : '--';
                      const pairedQty = est.pairedQty || 0;
                      const maxProfitText = perf.hasInfiniteMaxProfit
                        ? '无限'
                        : perf.maxProfit == null
                          ? '--'
                          : formatCurrency(perf.maxProfit, currencyConfig, 4);
                      const currentProfitText = perf.currentProfit == null
                        ? '--'
                        : `${perf.currentProfit >= 0 ? '+' : '-'}${formatCurrency(Math.abs(perf.currentProfit), currencyConfig, 4)}`;
                      const remainingProfitText = perf.remainingProfit == null
                        ? '--'
                        : formatCurrency(perf.remainingProfit, currencyConfig, 4);
                      const profitRealizationText = perf.profitRealizationPct == null
                        ? '--'
                        : `${perf.profitRealizationPct.toFixed(1)}%`;
                      const contractUnitText = perf.contractUnit == null
                        ? '--'
                        : perf.rawContractUnit != null && perf.rawContractUnit !== perf.contractUnit
                          ? `${perf.contractUnit}（原始 ${perf.rawContractUnit}）`
                          : String(perf.contractUnit);
                      const chartData = perf.mode === 'spread_value' && perf.contractUnit != null
                        ? strategyHistory.map((point) => ({
                            ...point,
                            price: point.price == null ? null : point.price * perf.contractUnit,
                          }))
                        : strategyHistory;

                      const rangeText = strikeGapSummary.map(s => {
                        const start = s.buyStrikeText || s.startStrikeText;
                        const end = s.sellStrikeText || s.endStrikeText;
                        return start && end ? `${start}-${end}` : '';
                      }).filter(Boolean).join(', ');

                      // Resolve status
                      const dte = group.daysToExpiry;
                      const itemSymbol = item.strategy.positions[0]?.opt_undl_code_full || selectedSymbol || '';
                      const resolvedPositions = (item.strategy.positions || [])
                        .map(p => resolveDisplayPosition(p))
                        .filter((p): p is OptionsPosition => !!p);
                      const resolvedStrategy = {
                        ...item.strategy,
                        positions: resolvedPositions
                      };
                      const calculatedProfitRatio = perf.profitRealizationPct != null ? perf.profitRealizationPct / 100 : undefined;
                      const statusRes = getComboStatus(resolvedStrategy, 'complex', dte, itemSymbol, allSinglePositions, calculatedProfitRatio);
                      const status = statusRes.status; // 'AUTO' | 'PROFIT' | 'WATCH' | 'HOLD'

                      return {
                        item,
                        strategyId,
                        strikeGapSummary,
                        est,
                        strategyHistory,
                        strategyStatus,
                        strategyWatchCodes,
                        strategyWatchStatusText,
                        strategyWatchQuoteLines,
                        perf,
                        net,
                        label,
                        amountText,
                        hedgeText,
                        tsText,
                        pairedQty,
                        maxProfitText,
                        currentProfitText,
                        remainingProfitText,
                        profitRealizationText,
                        contractUnitText,
                        chartData,
                        rangeText,
                        status
                      };
                    });

                    // Group by status
                    const groups: Record<
                      'AUTO' | 'PROFIT' | 'WATCH' | 'HOLD',
                      typeof enrichedStrategies
                    > = {
                      AUTO: [],
                      PROFIT: [],
                      WATCH: [],
                      HOLD: []
                    };

                    enrichedStrategies.forEach(enriched => {
                      if (groups[enriched.status]) {
                        groups[enriched.status].push(enriched);
                      } else {
                        groups.HOLD.push(enriched);
                      }
                    });

                    const sectionConfigs: Array<{
                      key: 'AUTO' | 'PROFIT' | 'WATCH' | 'HOLD';
                      title: string;
                      badgeClass: string;
                    }> = [
                      {
                        key: 'AUTO',
                        title: '自动止盈 (AUTO)',
                        badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      },
                      {
                        key: 'PROFIT',
                        title: '可止盈 (PROFIT)',
                        badgeClass: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                      },
                      {
                        key: 'WATCH',
                        title: '监控中 (WATCH)',
                        badgeClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
                      },
                      {
                        key: 'HOLD',
                        title: '普通持有 (HOLD)',
                        badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                      }
                    ];

                    return (
                      <div className="space-y-6">
                        {sectionConfigs.map(config => {
                          const items = groups[config.key];
                          if (items.length === 0) return null;

                          return (
                            <div key={config.key} className="space-y-2">
                              {/* Section Title */}
                              <div className="flex items-center gap-2 px-1">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${config.badgeClass}`}>
                                  {config.title}
                                </span>
                                <span className={`text-xs opacity-50 ${themes[theme].text}`}>
                                  ({items.length} 个组合)
                                </span>
                              </div>

                              {/* Section Items */}
                              <div className="space-y-2.5">
                                {items.map((enriched) => {
                                  const {
                                    item,
                                    strategyId,
                                    strikeGapSummary,
                                    est,
                                    strategyHistory,
                                    strategyStatus,
                                    strategyWatchStatusText,
                                    strategyWatchQuoteLines,
                                    perf,
                                    label,
                                    amountText,
                                    hedgeText,
                                    tsText,
                                    pairedQty,
                                    maxProfitText,
                                    currentProfitText,
                                    remainingProfitText,
                                    profitRealizationText,
                                    contractUnitText,
                                    chartData,
                                    rangeText
                                  } = enriched;

                                  const isExpanded = !!expandedComboIds[strategyId];
                                  const toggleExpanded = () => {
                                    setExpandedComboIds(prev => ({
                                      ...prev,
                                      [strategyId]: !prev[strategyId]
                                    }));
                                  };

                                  const strategyDisplayName = item.strategy.name?.trim()
                                    || strikeGapSummary?.[0]?.optionTypeLabel
                                    || (item.strategy.positions?.[0]?.opt_undl_code_full ? `${item.strategy.positions[0].opt_undl_code_full} 组合` : '期权组合');

                                  return (
                                    <div
                                      key={strategyId}
                                      className={`p-3 rounded-xl border ${themes[theme].border} transition-all duration-200 bg-current/[0.015] hover:bg-current/[0.03] shadow-sm`}
                                    >
                                      <div className="min-w-0">
                                        <div className="space-y-3">
                                          {/* Card Header & Summary */}
                                          <div
                                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 w-full cursor-pointer select-none"
                                            onClick={toggleExpanded}
                                          >
                                            {/* Top row on mobile / Left column on desktop */}
                                            <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0 flex-1">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className={`shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                  <ChevronDown className="w-4 h-4 opacity-70" />
                                                </span>
                                                <span className={`font-semibold text-sm ${themes[theme].text} truncate`}>
                                                  {strategyDisplayName}
                                                </span>
                                                {rangeText && (
                                                  <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded border border-current/15 bg-current/[0.04] opacity-90 shrink-0`}>
                                                    {rangeText}
                                                  </span>
                                                )}
                                                <span className="text-[11px] opacity-60 font-mono shrink-0 hidden sm:inline">
                                                  {item.qty}张
                                                </span>
                                              </div>

                                              {/* Mobile only: PnL badge in header row right */}
                                              <div className="sm:hidden shrink-0">
                                                {perf.currentProfit != null && (
                                                  <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${perf.currentProfit >= 0 ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border border-rose-500/20'}`}>
                                                    {currentProfitText}
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            {/* Middle row on mobile / Middle column on desktop */}
                                            <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
                                              {/* Mobile only: quantity */}
                                              <span className="sm:hidden text-[11px] opacity-65 font-mono">
                                                数量: <b className="font-semibold opacity-100">{item.qty}</b> 张
                                              </span>

                                              <div className="flex items-center gap-2">
                                                <span className={`opacity-60 ${themes[theme].text}`}>实现率</span>
                                                <span className={`font-bold font-mono ${themes[theme].text}`}>{profitRealizationText}</span>
                                                {/* Desktop only: PnL badge */}
                                                {perf.currentProfit != null && (
                                                  <span className={`hidden sm:inline-block font-mono text-xs md:text-sm font-bold px-2 py-0.5 rounded ${perf.currentProfit >= 0 ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border border-rose-500/20'}`}>
                                                    {currentProfitText}
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            {/* Action Buttons: on desktop inline right, on mobile full-width bottom row */}
                                            <div
                                              className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-current/10 shrink-0"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <button
                                                disabled={isPageLocked}
                                                className="flex-1 sm:flex-none px-3.5 py-1.5 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed sm:min-w-[80px] text-center cursor-pointer shadow-sm"
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
                                              >
                                                清仓
                                              </button>
                                              <button
                                                disabled={isPageLocked}
                                                className="flex-1 sm:flex-none px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed sm:min-w-[88px] text-center cursor-pointer shadow-sm"
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
                                              >
                                                解除组合
                                              </button>
                                            </div>
                                          </div>

                                          {/* Expanded Content */}
                                          {isExpanded && (
                                            <div className={`pt-3 border-t ${themes[theme].border} space-y-3`}>
                                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${themes[theme].border} ${themes[theme].text}`}>
                                                  数量 {item.qty}
                                                </span>
                                                {strikeGapSummary.map((summary) => (
                                                  <div key={`strike-gap-${strategyId}-${summary.key}`} className="contents">
                                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 ${themes[theme].border} ${themes[theme].text}`}>
                                                      <span className="font-semibold">{summary.optionTypeLabel}</span>
                                                      <span className="ml-1 opacity-80">
                                                        {summary.buyStrikeText && summary.sellStrikeText
                                                          ? `买 ${summary.buyStrikeText} / 卖 ${summary.sellStrikeText}`
                                                          : `${summary.startStrikeText} -> ${summary.endStrikeText}`}
                                                      </span>
                                                    </span>
                                                    {summary.tickCount != null && summary.tickCount > 0 ? (
                                                      <span className="inline-flex items-center rounded-full bg-rose-500/12 px-2.5 py-1 font-semibold text-rose-600 dark:text-rose-300">
                                                        跨 {summary.tickCount} 档
                                                      </span>
                                                    ) : null}
                                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 ${themes[theme].border} ${themes[theme].text}`}>
                                                      行权价差 {summary.priceDiffText}
                                                    </span>
                                                  </div>
                                                ))}
                                                {perf.mode === 'spread_value' && perf.contractUnit != null ? (
                                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 ${themes[theme].border} ${themes[theme].text}`}>
                                                    合约单位 {contractUnitText}
                                                  </span>
                                                ) : null}
                                              </div>
                                              <div className={`text-xs opacity-50 ${themes[theme].text}`}>
                                                {item.strategy.positions.map(p => `${getPositionContractLabel(p)} x ${p.quantity}`).join(', ')}
                                              </div>
                                              {perf.mode === 'spread_value' && perf.usedStandardContractUnit ? (
                                                <div className={`text-[11px] ${themes[theme].text} opacity-60`}>
                                                  标准 ETF 合约按 10000 计算
                                                </div>
                                              ) : null}
                                              <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-[minmax(0,1.05fr)_minmax(0,1.95fr)]">
                                                <div className={`${themes[theme].background} rounded border ${themes[theme].border} p-2`}>
                                                  <div className={`opacity-60 ${themes[theme].text}`}>最大盈利</div>
                                                  <div className={`mt-1 font-mono ${themes[theme].text}`}>{maxProfitText}</div>
                                                  {perf.mode === 'spread_value' && perf.tickCount != null && perf.tickCount > 0 && perf.tickSize != null && perf.contractUnit != null ? (
                                                    <>
                                                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                                                        <span className="inline-flex items-center rounded-full bg-rose-500/12 px-2 py-0.5 font-semibold text-rose-600 dark:text-rose-300">
                                                          {perf.tickCount} 档
                                                        </span>
                                                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${themes[theme].border} ${themes[theme].text}`}>
                                                          每档 {formatStrikeNumber(perf.tickSize)}
                                                        </span>
                                                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${themes[theme].border} ${themes[theme].text}`}>
                                                          合约单位 {contractUnitText}
                                                        </span>
                                                      </div>
                                                      <div className={`mt-1 text-[10px] ${themes[theme].text} opacity-60 font-mono`}>
                                                        {`${perf.tickCount} 档 × ${formatStrikeNumber(perf.tickSize)} × ${perf.contractUnit}${perf.strikeScale && perf.strikeScale !== 1 ? ` (÷${perf.strikeScale})` : ''}`}
                                                      </div>
                                                    </>
                                                  ) : null}
                                                </div>
                                                <div className={`${themes[theme].background} rounded border ${themes[theme].border} p-3`}>
                                                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                    <div className="min-w-0">
                                                      <div className={`opacity-60 ${themes[theme].text}`}>收益进度</div>
                                                      <div className={`mt-1 font-mono text-lg ${perf.currentProfit != null && perf.currentProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                        {currentProfitText}
                                                      </div>
                                                      <div className={`mt-1 text-[11px] ${themes[theme].text} opacity-60`}>
                                                        {perf.currentLabel}
                                                      </div>
                                                    </div>
                                                    <div className="shrink-0">
                                                      <div className={`text-[11px] ${themes[theme].text} opacity-60`}>利润实现率</div>
                                                      <div className={`mt-1 font-mono text-base ${themes[theme].text}`}>{profitRealizationText}</div>
                                                    </div>
                                                  </div>
                                                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                                    <div className={`rounded border px-3 py-2 ${themes[theme].card} ${themes[theme].border}`}>
                                                      <div className={`text-[11px] ${themes[theme].text} opacity-60`}>距最大盈利</div>
                                                      <div className={`mt-1 font-mono ${themes[theme].text}`}>{remainingProfitText}</div>
                                                    </div>
                                                    <div className={`rounded border px-3 py-2 ${themes[theme].card} ${themes[theme].border}`}>
                                                      <div className={`text-[11px] ${themes[theme].text} opacity-60`}>盈利空间</div>
                                                      <div className={`mt-1 font-mono ${themes[theme].text}`}>
                                                        {maxProfitText}
                                                        <span className="ml-2 text-[11px] opacity-60">上限</span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                  {perf.profitRealizationPct != null ? (
                                                    <div className="mt-3">
                                                      <div className={`mb-1 flex items-center justify-between text-[11px] ${themes[theme].text} opacity-60`}>
                                                        <span>进度</span>
                                                        <span>{profitRealizationText}</span>
                                                      </div>
                                                      <div className={`h-2 overflow-hidden rounded-full ${themes[theme].border} border ${themes[theme].card}`}>
                                                        <div
                                                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
                                                          style={{ width: `${Math.max(0, Math.min(100, perf.profitRealizationPct))}%` }}
                                                        />
                                                      </div>
                                                    </div>
                                                  ) : null}
                                                </div>
                                              </div>
                                              <div className={`mt-3 rounded border p-2 ${themes[theme].border} ${themes[theme].background}`}>
                                                {perf.calcStatus !== 'ok' ? (
                                                  <div className={`mb-2 text-[11px] ${themes[theme].text} opacity-70`}>
                                                    最大盈利线未显示：{perf.calcStatusText}
                                                  </div>
                                                ) : null}
                                                <div className={`mb-1 text-[11px] ${themes[theme].text} opacity-70 flex items-center justify-between`}>
                                                  <span>点数 {strategyHistory.length}</span>
                                                  <span>
                                                    {strategyStatus
                                                      ? `采样 ${format(new Date(strategyStatus.ts), 'HH:mm:ss')} • ${strategyStatus.source === 'snapshot' ? 'WS' : (strategyStatus.source === 'last_known' ? '沿用' : '等待')}`
                                                      : '采样 --'}
                                                  </span>
                                                </div>
                                                {strategyWatchStatusText ? (
                                                  <div className={`mb-1 text-[11px] ${themes[theme].text} opacity-60`}>
                                                    {strategyWatchStatusText}
                                                  </div>
                                                ) : null}
                                                {strategyWatchQuoteLines.length > 0 ? (
                                                  <div className={`mb-1 space-y-1 text-[11px] ${themes[theme].text} opacity-60`}>
                                                    {strategyWatchQuoteLines.map((line) => (
                                                      <div key={`${strategyId}-${line.key}`} className={`rounded border px-2 py-1 ${themes[theme].border}`}>
                                                        <div>{line.contractName}</div>
                                                        <div className="font-mono opacity-80">{line.quoteText}</div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                ) : null}
                                                <RealTimeSpreadChart
                                                  theme={theme}
                                                  data={chartData}
                                                  title={perf.mode === 'spread_value' ? '组合价值走势' : '组合价差走势'}
                                                  height={164}
                                                  referenceLines={
                                                    perf.mode === 'spread_value' && perf.maxProfit != null
                                                      ? [{ value: perf.maxProfit, label: '最大盈利', color: '#ef4444', dashArray: '6 4' }]
                                                      : []
                                                  }
                                                  formatValue={(value) => {
                                                    if (value == null) return '--';
                                                    const abs = Math.abs(value);
                                                    const decimals =
                                                      perf.mode === 'spread_value'
                                                        ? (abs < 100 ? 2 : 0)
                                                        : 4;
                                                    return formatCurrency(value, currencyConfig, decimals);
                                                  }}
                                                />
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-80`}>
                                                <div className="flex items-center justify-between gap-3">
                                                  <span className="font-semibold whitespace-nowrap">{label}</span>
                                                  <div className="flex items-baseline gap-2 min-w-0">
                                                    <AnimatedFlash value={amountText} className="font-mono whitespace-nowrap" type="price" />
                                                    <span className="text-[11px] opacity-60 truncate flex items-baseline gap-1">
                                                      {est.perHedge == null || pairedQty <= 0 ? null : (
                                                        <>
                                                          <span>（</span>
                                                          <AnimatedFlash
                                                            value={hedgeText}
                                                            className={`font-mono font-bold whitespace-nowrap ${est.perHedge != null && est.perHedge >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                                                            type="price"
                                                          />
                                                          <span className="whitespace-nowrap">× {pairedQty}）</span>
                                                        </>
                                                      )}
                                                      <span className="whitespace-nowrap">{`WS ${tsText}`}</span>
                                                    </span>
                                                  </div>
                                                </div>
                                                <div className="mt-1 grid grid-cols-1 gap-1">
                                                  {est.legs.map((l, i) => {
                                                    const legAmtText =
                                                      l.amt == null ? '--' : `${l.amt >= 0 ? '+' : '-'}${formatCurrency(Math.abs(l.amt), currencyConfig, 4)}`;
                                                    const legAmtLabel = l.amt == null ? '' : (l.amt >= 0 ? '收到' : '支付');
                                                    return (
                                                      <div key={`leg-est-${strategyId}-${i}`} className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_84px_minmax(0,140px)] sm:items-center gap-1 sm:gap-3">
                                                        <div className="truncate opacity-80 flex items-center justify-between sm:block">
                                                          <span>{getPositionContractLabel(l.pos)} • {l.closeSide === 'buy' ? '买入' : '卖出'} • x{l.qty}</span>
                                                          <span className="sm:hidden font-mono">
                                                            <AnimatedFlash value={l.px == null ? '--' : l.px.toFixed(4)} type="price" />
                                                          </span>
                                                        </div>
                                                        <div className="hidden sm:block text-right font-mono">
                                                          <AnimatedFlash value={l.px == null ? '--' : l.px.toFixed(4)} type="price" />
                                                        </div>
                                                        <div className="flex items-center justify-end gap-1 font-mono">
                                                          <span className="opacity-70">{legAmtLabel}</span>
                                                          <AnimatedFlash value={legAmtText} type="price" />
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </div>
                                          )}
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
                    );
                  })()
                ) : confirmData.meta?.action === 'combo_manage' ? (
                  <div className={`rounded-lg border border-dashed p-4 text-sm ${themes[theme].border} ${themes[theme].text} opacity-75`}>
                    当前行权价暂无已建组合，可直接在上方创建新组合。
                  </div>
                ) : null}
              </div>
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
            (() => {
              const s = Number(confirmData.meta?.strike || 0);
              const category = String(confirmData.meta?.category || '') as
                | 'call_right'
                | 'call_obligation'
                | 'put_right'
                | 'put_obligation'
                | 'call_covered'
                | 'put_covered';
              
              const isCall = category.startsWith('call');
              const isLong = category.endsWith('right');
              const type = isCall ? 'call' : 'put';
              const positionDirection = isLong ? 1 : -1;

              // 1. Find reference position & code
              const ids = collectIdsForCategory(category, s);
              const pool = (allExpiryBuckets || []).flatMap(b => b.single).concat(filteredPositions || []);
              const currentPositions = ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as OptionsPosition[];
              
              const currentSum = currentPositions.reduce((acc, pos) => {
                const base = Number(pos.selectedQuantity ?? pos.leg_quantity ?? pos.quantity) || 0;
                const avail = Number(pos.available ?? base) || 0;
                return acc + avail;
              }, 0);

              const key = confirmData.ids[0];
              const targetQty = qtyOverrides[key] ?? currentSum;
              const qtyChange = targetQty - currentSum;

              // Quote & contract codes
              const findQuote = (data: OptionsData) => data.quotes?.find(q => q.expiry === (confirmData.meta?.expiry || group.expiry) && getQuoteStrike(q) === s);
              let q: OptionQuote | undefined;
              if (optionsData) q = findQuote(optionsData);
              if (!q && optionsDataMap) {
                for (const data of Object.values(optionsDataMap)) { q = findQuote(data); if (q) break; }
              }
              if (!q && localOptionsData) q = findQuote(localOptionsData);

              const refPos = currentPositions[0] || pool.find(p =>
                p.expiry === (confirmData.meta?.expiry || group.expiry) &&
                Number(p.contract_strike_price ?? p.strike) === s &&
                (p.type === type || p.contract_type_zh === type)
              );

              const code = confirmData.meta?.contract_code || refPos?.contract_code || (isCall ? q?.call_contract_code : q?.put_contract_code);
              const fullCode = confirmData.meta?.contract_code_full || refPos?.contract_code_full || (isCall ? q?.call_contract_code_full : q?.put_contract_code_full);

              // Delta resolution
              let contractDelta = 0;
              let isEstimated = false;
              const quoteDelta = isCall ? q?.callDelta : q?.putDelta;

              if (typeof quoteDelta === 'number' && !isNaN(quoteDelta)) {
                contractDelta = quoteDelta;
              } else if (refPos && typeof refPos.delta === 'number' && !isNaN(refPos.delta)) {
                contractDelta = refPos.delta;
              } else if (underlyingPrice != null && underlyingPrice > 0) {
                isEstimated = true;
                const iv = (isCall ? q?.callImpliedVol : q?.putImpliedVol) || 0.25;
                const T = Math.max(0.01, group.daysToExpiry) / 365;
                const S = underlyingPrice;
                const K = s;
                const r = 0.03;
                try {
                  const normCdf = (x: number) => {
                    const a1 = 0.254829592; const a2 = -0.284496736; const a3 = 1.421413741; const a4 = -1.453152027; const a5 = 1.061405429; const p = 0.3275911;
                    const sign = x < 0 ? -1 : 1;
                    const absX = Math.abs(x) / Math.sqrt(2.0);
                    const t = 1.0 / (1.0 + p * absX);
                    const erf = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
                    return 0.5 * (1.0 + sign * erf);
                  };
                  const d1 = (Math.log(S / K) + (r + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
                  const delta = isCall ? normCdf(d1) : (normCdf(d1) - 1);
                  contractDelta = Number(delta.toFixed(3));
                } catch (err) {
                  const isITM = isCall ? (S > K) : (S < K);
                  contractDelta = isCall ? (isITM ? 0.75 : 0.25) : (isITM ? -0.75 : -0.25);
                }
              } else {
                contractDelta = isCall ? 0.5 : -0.5;
              }

              const deltaContribution = contractDelta * positionDirection;
              const deltaChange = qtyChange * deltaContribution;

              const formatDelta = (val: number) => {
                const sign = val >= 0 ? '+' : '';
                return `${sign}${val.toFixed(3)}`;
              };

              const getImpactText = () => {
                if (qtyChange === 0) return '持仓无变化 (Delta 不变)';
                const directionText = qtyChange > 0 ? '增加' : '减少';
                const deltaSign = deltaChange >= 0 ? '正' : '负';
                return `${directionText}持仓，将为账户注入 ${formatDelta(deltaChange)} 的${deltaSign} Delta 风险敞口`;
              };

              const priceData = (code && prices[code]) || (fullCode && prices[fullCode]) || null;
                const latestPrice = typeof priceData?.price === 'number' && Number.isFinite(priceData.price)
                  ? priceData.price
                  : undefined;
                const isDebug = import.meta.env.DEV ||
                  new URLSearchParams(window.location.search).get('debug') === 'true' ||
                  localStorage.getItem('options_portfolio_debug') === 'true';
                const invalidPriceLogKey = `${fullCode || code || 'unknown'}:${priceData?.timestamp || 'no-timestamp'}`;
                if (priceData && latestPrice === undefined && isDebug && !invalidPriceLogKeys.has(invalidPriceLogKey)) {
                  invalidPriceLogKeys.add(invalidPriceLogKey);
                  console.groupCollapsed('[Options Portfolio Debug] Invalid option price');
                  console.table([{
                    code,
                    fullCode,
                    price: priceData.price,
                    lastPrice: priceData.last_price,
                    bid: priceData.bid,
                    ask: priceData.ask,
                    timestamp: priceData.timestamp,
                  }]);
                  console.log('Raw price data:', priceData);
                  console.groupEnd();
                }
              const wl = whitelists.find(w => (code && w.contract_code === code) || (fullCode && w.contract_code === fullCode));

              const categoryLabelMap: Record<string, string> = {
                call_right: '认购权利 (Call Buy)',
                call_obligation: '认购义务 (Call Sell)',
                call_covered: '认购备兑 (Call Covered)',
                put_right: '认沽权利 (Put Buy)',
                put_obligation: '认沽义务 (Put Sell)',
                put_covered: '认沽备兑 (Put Covered)'
              };
              const categoryTitle = categoryLabelMap[category] || category;
              const expiryText = format(new Date(confirmData.meta?.expiry || group.expiry), 'yyyy-MM-dd');

              return (
                <div className="space-y-3">
                  {/* 1. 标的身份徽章栏 */}
                  <div className={`p-3 rounded-xl border ${themes[theme].border} ${themes[theme].background} flex flex-wrap items-center justify-between gap-2.5`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        isCall
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {categoryTitle}
                      </span>
                      <span className={`text-xs font-mono font-bold ${themes[theme].text}`}>
                        @{s.toFixed(4).replace(/\.?0+$/, '')}
                      </span>
                      <span className={`text-[11px] opacity-60 ${themes[theme].text}`}>
                        {expiryText} 到期
                      </span>
                      {(fullCode || code) && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(fullCode || code || '');
                            toast.success(`已复制合约代码: ${fullCode || code}`);
                          }}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 border ${themes[theme].border} transition-all`}
                          title="点击复制合约代码"
                        >
                          <span>{code || fullCode}</span>
                          <span className="text-[10px]">📋</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] opacity-60 ${themes[theme].text}`}>当前持有:</span>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                        currentSum > 0
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          : 'bg-gray-500/10 opacity-70 text-gray-500 border border-gray-500/20'
                      }`}>
                        {currentSum} 张
                      </span>
                    </div>
                  </div>

                  {/* 2. 核心调整控制台 (Target Adjustment Console) */}
                  <div className={`p-3.5 rounded-xl border ${themes[theme].border} ${themes[theme].card} space-y-3 shadow-sm`}>
                    {/* 目标数量主行 */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className={`text-xs font-bold ${themes[theme].text} flex items-center gap-1.5`}>
                          <span>🎯</span>
                          <span>目标持仓数量</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {qtyChange === 0 ? (
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 opacity-75">持仓数量保持不变</span>
                          ) : qtyChange > 0 ? (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                              <span>↑ 加仓</span>
                              <span>+{qtyChange} 张</span>
                              <span className="opacity-60 font-mono">({currentSum} → {targetQty})</span>
                            </span>
                          ) : targetQty === 0 ? (
                            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
                              <span>✕ 全部平仓清零</span>
                              <span className="opacity-60 font-mono">({currentSum} → 0)</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                              <span>↓ 减仓</span>
                              <span>{qtyChange} 张</span>
                              <span className="opacity-60 font-mono">({currentSum} → {targetQty})</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 步进器 */}
                      <div className="flex items-center shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-700">
                        <button
                          type="button"
                          onClick={() => {
                            const cur = Number(qtyOverrides[key] ?? currentSum);
                            const next = Math.max(0, cur - 1);
                            setQtyOverrides(prev => ({ ...prev, [key]: next }));
                          }}
                          className={`w-9 h-9 flex items-center justify-center bg-gray-50 dark:bg-neutral-800 ${themes[theme].text} hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all text-base font-bold select-none border-r ${themes[theme].border}`}
                          title="减少 1 张"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={targetQty}
                          onChange={(e) => {
                            const n = Math.max(0, parseFloat(e.target.value) || 0);
                            setQtyOverrides(prev => ({ ...prev, [key]: n }));
                          }}
                          className={`w-16 h-9 px-1 text-center font-mono font-bold text-base ${themes[theme].input} ${themes[theme].text} focus:outline-none`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cur = Number(qtyOverrides[key] ?? currentSum);
                            const next = cur + 1;
                            setQtyOverrides(prev => ({ ...prev, [key]: next }));
                          }}
                          className={`w-9 h-9 flex items-center justify-center bg-gray-50 dark:bg-neutral-800 ${themes[theme].text} hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all text-base font-bold select-none border-l ${themes[theme].border}`}
                          title="增加 1 张"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 快捷步进按钮组与白名单 */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-dashed border-gray-200 dark:border-neutral-800">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[-5, -2, -1].map((step) => (
                          <button
                            key={`step-${step}`}
                            type="button"
                            onClick={() => {
                              const cur = Number(qtyOverrides[key] ?? currentSum);
                              const next = Math.max(0, cur + step);
                              setQtyOverrides(prev => ({ ...prev, [key]: next }));
                            }}
                            className="px-2.5 py-1 rounded-md text-xs font-mono font-bold border border-rose-500/25 text-rose-600 dark:text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 active:scale-95 transition-all"
                            title={`减少 ${Math.abs(step)} 张`}
                          >
                            {step}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setQtyOverrides(prev => ({ ...prev, [key]: 0 }));
                          }}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${themes[theme].border} ${themes[theme].text} opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all`}
                          title="重置目标为 0 (清仓)"
                        >
                          清零
                        </button>
                        {[1, 2, 5].map((step) => (
                          <button
                            key={`step-+${step}`}
                            type="button"
                            onClick={() => {
                              const cur = Number(qtyOverrides[key] ?? currentSum);
                              const next = cur + step;
                              setQtyOverrides(prev => ({ ...prev, [key]: next }));
                            }}
                            className="px-2.5 py-1 rounded-md text-xs font-mono font-bold border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 active:scale-95 transition-all"
                            title={`增加 ${step} 张`}
                          >
                            +{step}
                          </button>
                        ))}
                      </div>

                      {/* 白名单按钮 */}
                      <button
                        type="button"
                        disabled={targetQty === 0}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-all shrink-0 ${
                          targetQty === 0
                            ? 'opacity-30 cursor-not-allowed border border-gray-300 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-400 dark:text-neutral-500'
                            : 'bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-600/30 hover:bg-blue-600 hover:text-white active:scale-95'
                        }`}
                        title={targetQty === 0 ? '目标数量须大于0方可加入白名单' : '将此调整数量保存到白名单计划'}
                        onClick={async () => {
                          if (targetQty === 0) return;
                          let holdType = 'obligation';
                          if (refPos?.hold_type) holdType = refPos.hold_type;
                          else if (isLong) holdType = 'right';
                          else if (category.includes('covered')) holdType = 'covered';

                          if (code) {
                            try {
                              await optionsService.addWhitelist({
                                account_id: selectedAccountId || '',
                                contract_code: code,
                                contract_code_full: fullCode,
                                reason: 'Manual adjustment',
                                quantity: targetQty,
                                expiry_month: (confirmData.meta?.expiry || group.expiry).slice(0, 7).replace('-', ''),
                                option_type: type,
                                strike_price: s,
                                hold_type: holdType,
                                is_active: true
                              }, userId || '', selectedAccountId);
                              toast.success(`已添加到白名单: ${fullCode || code}`);
                            } catch (err) {
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
                    </div>

                    {/* 委托价格设置 */}
                    <div className="pt-2 border-t border-dashed border-gray-200 dark:border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className={`font-semibold ${themes[theme].text}`}>委托价格</span>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.0001"
                            placeholder="市价委托"
                            value={syncPrice != null ? syncPrice : ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') setSyncPrice(null);
                              else {
                                const n = parseFloat(v);
                                if (!Number.isNaN(n)) setSyncPrice(n);
                              }
                            }}
                            className={`w-28 px-2 py-1 rounded-md text-xs font-mono font-bold border ${themes[theme].border} ${themes[theme].input} ${themes[theme].text} focus:outline-none`}
                          />
                          {syncPrice != null && (
                            <button
                              type="button"
                              onClick={() => setSyncPrice(null)}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                              title="清除价格 (市价)"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {priceData && (
                        <div className="flex items-center gap-1.5">
                          {typeof priceData.price === 'number' && (
                            <button
                              type="button"
                              onClick={() => setSyncPrice(priceData.price ?? null)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                                syncPrice === priceData.price
                                  ? 'bg-blue-600 text-white border-blue-600 font-bold'
                                  : 'border-gray-200 dark:border-neutral-700 opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                              }`}
                            >
                              最新 {priceData.price.toFixed(4)}
                            </button>
                          )}
                          {typeof priceData.bid === 'number' && (
                            <button
                              type="button"
                              onClick={() => setSyncPrice(priceData.bid ?? null)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                                syncPrice === priceData.bid
                                  ? 'bg-red-600 text-white border-red-600 font-bold'
                                  : 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/15'
                              }`}
                            >
                              买一 {priceData.bid.toFixed(4)}
                            </button>
                          )}
                          {typeof priceData.ask === 'number' && (
                            <button
                              type="button"
                              onClick={() => setSyncPrice(priceData.ask ?? null)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                                syncPrice === priceData.ask
                                  ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                                  : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15'
                              }`}
                            >
                              卖一 {priceData.ask.toFixed(4)}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. 实时 Delta 风险评估卡片 */}
                  <div className={`p-3.5 rounded-xl border ${themes[theme].border} ${themes[theme].background} space-y-2.5`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${themes[theme].text} flex items-center gap-1.5`}>
                        <span>📊</span> Delta 风险评估
                      </span>
                      {isEstimated && (
                        <span className={`text-[10px] opacity-60 px-1.5 py-0.5 rounded border ${themes[theme].border}`}>
                          理论估计值
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className={`p-2 rounded-lg bg-black/5 dark:bg-white/5 space-y-0.5`}>
                        <div className={`text-[11px] opacity-60 ${themes[theme].text}`}>合约单张 Delta (Δ)</div>
                        <div className={`font-mono font-bold text-sm ${contractDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatDelta(contractDelta)}
                        </div>
                      </div>
                      <div className={`p-2 rounded-lg bg-black/5 dark:bg-white/5 space-y-0.5`}>
                        <div className={`text-[11px] opacity-60 ${themes[theme].text}`}>当前持仓方向 Delta (单张)</div>
                        <div className={`font-mono font-bold text-sm ${deltaContribution >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatDelta(deltaContribution)}
                        </div>
                      </div>
                    </div>

                    <div className={`pt-2 border-t border-dashed ${themes[theme].border} flex items-center justify-between text-xs`}>
                      <div className="space-y-0.5">
                        <span className={`text-[11px] opacity-60 ${themes[theme].text}`}>持仓变动:</span>
                        <div className={`font-mono font-semibold ${qtyChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : qtyChange < 0 ? 'text-rose-600 dark:text-rose-400' : themes[theme].text}`}>
                          {qtyChange > 0 ? `+${qtyChange}` : qtyChange} 张 ({currentSum} → {targetQty})
                        </div>
                      </div>
                      <div className="text-right space-y-0.5">
                        <span className={`text-[11px] opacity-60 ${themes[theme].text}`}>Delta 影响值:</span>
                        <div className={`font-mono font-bold text-base ${deltaChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : deltaChange < 0 ? 'text-rose-600 dark:text-rose-400' : themes[theme].text}`}>
                          {qtyChange === 0 ? '0.000' : formatDelta(deltaChange)}
                        </div>
                      </div>
                    </div>

                    <div className={`text-[11px] leading-relaxed p-2 rounded-lg bg-blue-500/5 border border-blue-500/15 ${themes[theme].text}`}>
                      💡 {getImpactText()}
                    </div>
                  </div>

                  {/* 4. 行情五档深度卡片 (Compact Order Book with Depth) */}
                  {priceData && (
                    <div className={`p-3 rounded-xl border ${themes[theme].border} ${themes[theme].background} space-y-2`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-bold ${themes[theme].text} flex items-center gap-1.5`}>
                          <span>📈</span> 五档行情盘口
                          <span className="font-mono text-blue-600 dark:text-blue-400 ml-1">
                            最新: {latestPrice !== undefined ? latestPrice.toFixed(4) : '-'}
                          </span>
                        </span>
                        <span className="opacity-50 font-mono text-[10px]">{format(new Date(priceData.timestamp), 'HH:mm:ss')}</span>
                      </div>

                      {(() => {
                        const bids = Array.from({ length: 5 }).map((_, i) => ({
                          level: i + 1,
                          price: priceData.bid_price?.[i] ?? (i === 0 ? priceData.bid : undefined),
                          vol: priceData.bid_vol?.[i]
                        }));
                        const asks = Array.from({ length: 5 }).map((_, i) => ({
                          level: i + 1,
                          price: priceData.ask_price?.[i] ?? (i === 0 ? priceData.ask : undefined),
                          vol: priceData.ask_vol?.[i]
                        }));
                        const maxVol = Math.max(
                          ...bids.map(b => b.vol || 0),
                          ...asks.map(a => a.vol || 0),
                          1
                        );

                        return (
                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            {/* 买盘 */}
                            <div className="space-y-1">
                              <div className="flex justify-between px-1.5 py-0.5 text-[10px] font-bold text-red-500 border-b border-red-500/20">
                                <span>买盘</span>
                                <span>价格</span>
                                <span>量</span>
                              </div>
                              <div className="space-y-0.5">
                                {bids.map((b) => {
                                  const isSelected = syncPrice != null && typeof b.price === 'number' && Math.abs(b.price - syncPrice) < 1e-6;
                                  const pct = b.vol ? Math.min(100, Math.round((b.vol / maxVol) * 100)) : 0;
                                  return (
                                    <div
                                      key={`bid-${b.level}`}
                                      onClick={() => {
                                        if (typeof b.price === 'number') setSyncPrice(b.price);
                                      }}
                                      className={`relative flex items-center justify-between px-1.5 py-0.5 rounded cursor-pointer transition-all hover:bg-red-500/15 ${
                                        isSelected ? 'bg-red-500/25 ring-1 ring-red-500 font-bold' : ''
                                      }`}
                                      title="点击设定为目标委托价格"
                                    >
                                      {/* Depth Bar */}
                                      <div
                                        className="absolute right-0 top-0 bottom-0 bg-red-500/10 rounded pointer-events-none transition-all"
                                        style={{ width: `${pct}%` }}
                                      />
                                      <span className="opacity-60 relative z-10 text-[10px]">{b.level}</span>
                                      <span className="font-mono text-red-500 font-semibold relative z-10">{b.price != null ? b.price.toFixed(4) : '-'}</span>
                                      <span className="font-mono opacity-80 relative z-10 text-[10px]">{b.vol ?? '-'}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 卖盘 */}
                            <div className="space-y-1">
                              <div className="flex justify-between px-1.5 py-0.5 text-[10px] font-bold text-green-500 border-b border-green-500/20">
                                <span>卖盘</span>
                                <span>价格</span>
                                <span>量</span>
                              </div>
                              <div className="space-y-0.5">
                                {asks.map((a) => {
                                  const isSelected = syncPrice != null && typeof a.price === 'number' && Math.abs(a.price - syncPrice) < 1e-6;
                                  const pct = a.vol ? Math.min(100, Math.round((a.vol / maxVol) * 100)) : 0;
                                  return (
                                    <div
                                      key={`ask-${a.level}`}
                                      onClick={() => {
                                        if (typeof a.price === 'number') setSyncPrice(a.price);
                                      }}
                                      className={`relative flex items-center justify-between px-1.5 py-0.5 rounded cursor-pointer transition-all hover:bg-green-500/15 ${
                                        isSelected ? 'bg-green-500/25 ring-1 ring-green-500 font-bold' : ''
                                      }`}
                                      title="点击设定为目标委托价格"
                                    >
                                      {/* Depth Bar */}
                                      <div
                                        className="absolute right-0 top-0 bottom-0 bg-green-500/10 rounded pointer-events-none transition-all"
                                        style={{ width: `${pct}%` }}
                                      />
                                      <span className="opacity-60 relative z-10 text-[10px]">{a.level}</span>
                                      <span className="font-mono text-green-500 font-semibold relative z-10">{a.price != null ? a.price.toFixed(4) : '-'}</span>
                                      <span className="font-mono opacity-80 relative z-10 text-[10px]">{a.vol ?? '-'}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* 5. 白名单提示 (如有执行计划) */}
                  {wl && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <span>⚠️</span>
                      <span>当前合约已存在自动计划执行: <strong>{wl.reason}</strong> {wl.quantity ? `(${wl.quantity} 张)` : ''}</span>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            (() => {
              const allComplexPositions = (allExpiryBuckets || []).flatMap(b => b.complex.flatMap(strategy => strategy.positions));
              const items = confirmData.ids.map(id => {
                const pos =
                  filteredPositions.find(x => x.id === id) ||
                  allComplexPositions.find(x => x.id === id);
                const raw =
                  (allExpiryBuckets || []).flatMap(b => b.single).find(x => x.id === id) ||
                  allComplexPositions.find(x => x.id === id) ||
                  pos;
                if (!raw) return null;
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
                    <details className={`${themes[theme].background} rounded p-2 border ${themes[theme].border}`}>
                      <summary className={`cursor-pointer text-[11px] ${themes[theme].text} opacity-80 select-none`}>
                        原始数据 (JSON)
                      </summary>
                      <pre className={`mt-2 text-[11px] ${themes[theme].text} overflow-auto max-h-40`}>{JSON.stringify(raw, null, 2)}</pre>
                    </details>
                  </div>
                );
              });
              const visibleItems = items.filter(Boolean);
              return visibleItems.length > 0 ? <div className="space-y-2">{visibleItems}</div> : null;
            })()
          )}
        {confirmData.meta?.action !== 'unwind_combo_selection' && confirmData.meta?.action !== 'combo_manage' && (
        <details className={`mt-4 ${themes[theme].background} rounded p-3 border ${themes[theme].border}`}>
          <summary className={`cursor-pointer text-xs ${themes[theme].text} opacity-80 select-none`}>
            请求详情 (JSON)
          </summary>
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
              syncPrice,
              positions
            };
            return (
              <pre className={`mt-2 text-xs ${themes[theme].text} overflow-auto max-h-60`}>{JSON.stringify(data, null, 2)}</pre>
            );
          })()}
        </details>
        )}
        </div>
        {confirmData.meta?.action !== 'unwind_combo_selection' && confirmData.meta?.action !== 'combo_manage' && (
        <div className={`shrink-0 flex items-center justify-end gap-2.5 sm:gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-t ${themes[theme].border} ${themes[theme].card} pb-[calc(env(safe-area-inset-bottom,0px)+12px)] sm:pb-3.5`}>
          <button
            type="button"
            disabled={isPageLocked}
            className={`px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium ${themes[theme].secondary} active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
            onClick={() => {
              if (!isPageLocked) setConfirmData(null);
            }}
          >取消</button>
          <button
            type="button"
            disabled={isPageLocked}
            className="px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
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
                const lastPriceRefer = (() => {
                  const ref = resolvePriceUpdate([confirmData.meta?.contract_code_full, confirmData.meta?.contract_code]);
                  const v = ref?.price;
                  if (typeof v === 'number' && Number.isFinite(v)) return v;
                  const q = confirmData.meta?.quote;
                  const qv = p.type === 'call' ? q?.call_last_price : q?.put_last_price;
                  if (typeof qv === 'number' && Number.isFinite(qv)) return qv;
                  return undefined;
                })();
                const resp = await optionsService.updatePositions({ updates: [{ type: p.type, position_type: p.position_type, strike, expiry: String(confirmData.meta?.expiry || group.expiry), quantity: sum, option_type: p.type, strike_price: String(strike), price: syncPrice != null ? syncPrice : undefined, limit_price: syncPrice != null ? syncPrice : undefined, last_price_refer: lastPriceRefer }], accountId: selectedAccountId || null, userId: userId || null });
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
          {(() => {
            let label = '确认执行';
            if (confirmData.meta?.action === 'sync_category') {
              const key = confirmData.ids[0];
              const q = qtyOverrides[key];
              if (q === 0) label = '确认平仓 (清零)';
              else if (typeof q === 'number') label = `确认调整 (${q} 张)`;
            }
            return (
              <button
                type="button"
                disabled={isPageLocked}
                className="px-5 py-2 sm:py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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

                const lastPriceRefer = (() => {
                  const ref = resolvePriceUpdate([
                    confirmData.meta?.contract_code_full,
                    confirmData.meta?.contract_code,
                    referencePos?.contract_code_full,
                    referencePos?.contract_code,
                  ]);
                  const v = ref?.price;
                  if (typeof v === 'number' && Number.isFinite(v)) return v;
                  const q = confirmData.meta?.quote;
                  const qv = p.type === 'call' ? q?.call_last_price : q?.put_last_price;
                  if (typeof qv === 'number' && Number.isFinite(qv)) return qv;
                  const pv = referencePos?.last_price;
                  if (typeof pv === 'number' && Number.isFinite(pv)) return pv;
                  return undefined;
                })();

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

                // Debug logging for sync_category adjustment
                const isDebug = import.meta.env.DEV ||
                                new URLSearchParams(window.location.search).get('debug') === 'true' || 
                                localStorage.getItem('options_portfolio_debug') === 'true';
                if (isDebug) {
                  console.group('%c[Options Portfolio Debug] Sync Category Adjustment', 'color: #f59e0b; font-weight: bold;');
                  console.log('Action: sync_category');
                  console.log('Category:', category);
                  console.table([{
                    code: referencePos?.contract_code_full || foundSymbol || 'N/A',
                    type: p.type,
                    strike,
                    expiry: String(confirmData.meta?.expiry || group.expiry),
                    old_qty: origAvailSum,
                    new_qty: q,
                    change
                  }]);
                  console.groupEnd();
                }

                const resp = await optionsService.updatePositions({ updates: [{ type: p.type, position_type: p.position_type, strike, expiry: String(confirmData.meta?.expiry || group.expiry), quantity: q, original_quantity: origAvailSum, change_quantity: change, is_covered: category === 'call_covered' || category === 'put_covered', symbol: foundSymbol, option_type: p.type, strike_price: String(strike), price: syncPrice != null ? syncPrice : undefined, limit_price: syncPrice != null ? syncPrice : undefined, last_price_refer: lastPriceRefer }], positions: positionsToSend, accountId: selectedAccountId || null, userId: userId || null });
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
          >
            {label}
          </button>
            );
          })()}
        </div>
        )}
      </div>
    </div>,
    document.body
  )}
  {advisedModal && createPortal(
    <div className="fixed inset-0 z-[2147483010] flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setAdvisedModal(null)}></div>
      <div
        className={`relative w-full rounded-t-2xl border-t border-x sm:border sm:rounded-2xl sm:max-w-2xl sm:w-[min(90vw,820px)]
          flex flex-col max-h-[92svh] md:max-h-[85svh]
          ${themes[theme].card} ${themes[theme].border} overflow-hidden
          ${theme === 'dark'
            ? 'shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.55),0_8px_32px_-8px_rgba(0,0,0,0.55)]'
            : theme === 'blue'
              ? 'shadow-[0_-10px_40px_-16px_rgba(37,99,235,0.18),0_8px_32px_-8px_rgba(15,23,42,0.08)]'
              : 'shadow-[0_-10px_40px_-16px_rgba(15,23,42,0.18),0_8px_32px_-8px_rgba(15,23,42,0.08)]'
        }`}
      >
        {/* Sheet grab handle (mobile only) */}
        <div className="relative sm:hidden pt-3 pb-2 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-current/15" aria-hidden="true" />
        </div>
        {/* Header */}
        <div className={`flex items-start justify-between gap-3 px-4 pb-3 pt-1 sm:px-6 sm:pb-4 sm:pt-5 shrink-0 border-b ${themes[theme].border}`}>
          <div className="min-w-0 flex-1">
            <div className={`text-[17px] sm:text-xl font-semibold tracking-tight ${themes[theme].text}`}>
              {advisedModal.mode === 't_board_create' ? '创建组合' : '执行组合'}
            </div>
            <div className={`mt-1.5 text-[13px] sm:text-sm opacity-80 ${themes[theme].text}`}>
              请确认组合各腿数量与方向
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAdvisedModal(null)}
            className={`shrink-0 inline-flex items-center justify-center rounded-xl p-2 transition-colors active:scale-95
              ${themes[theme].secondary} hover:opacity-90`}
            aria-label="关闭"
            title="关闭"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
        <div className="px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:px-6 sm:pt-5 sm:pb-6 overflow-y-auto min-h-0 flex-1">
          {renderComboDraftPanel(advisedModal)}
        </div>
      </div>
    </div>,
    document.body
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

// ---- TBoardRow: React.memo component for T-board rows ----
const TBOARD_COMBO_HINT_CLASS = 'decoration-dotted underline-offset-2 hover:opacity-80';
const TBOARD_ACTION_STACK_CLASS = 'flex flex-col items-center gap-1.5';

interface TBoardMetric {
  s: number;
  callRight: number;
  callRightAvail: number;
  callObligation: number;
  callObligationAvail: number;
  callCovered: number;
  callCoveredAvail: number;
  comboCallQty: number;
  putRight: number;
  putRightAvail: number;
  putObligation: number;
  putObligationAvail: number;
  putCovered: number;
  putCoveredAvail: number;
  comboPutQty: number;
  comboCallStrategies: Array<{ strategy: OptionsStrategy; qty: number }>;
  comboPutStrategies: Array<{ strategy: OptionsStrategy; qty: number }>;
  risk: number;
}

interface TBoardRowProps {
  metric: TBoardMetric;
  theme: Theme;
  maxRisk: number;
  maxTimeValue: number;
  underlyingPrice: number | null;
  quotesByStrike: Map<number, OptionQuote>;
  prices: Record<string, { price: number } | undefined>;
  currencyConfig: CurrencyConfig;
  /** Callback context (ignored by memo comparator) */
  strikes: number[];
  groupExpiry: string;
  selectedSymbol?: string;
  optionsData?: OptionsData | null | undefined;
  optionsDataMap?: Record<string, OptionsData> | undefined;
  localOptionsData?: OptionsData | null | undefined;
  filteredPositions: OptionsPosition[];
  onSetConfirmData: (data: any) => void;
}

const TBoardRow = React.memo(function TBoardRow({
  metric: m,
  theme,
  maxRisk,
  maxTimeValue,
  underlyingPrice,
  quotesByStrike,
  prices,
  currencyConfig,
  strikes,
  groupExpiry,
  selectedSymbol,
  optionsData,
  optionsDataMap,
  localOptionsData,
  filteredPositions,
  onSetConfirmData,
}: TBoardRowProps) {
  const tBoardValueTextClass = `inline-flex items-center justify-center text-[13px] font-semibold leading-tight ${themes[theme].text}`;
  const tBoardComboValueClass = `inline-flex min-w-[2.5rem] items-center justify-center text-[13px] font-semibold leading-tight ${themes[theme].text}`;
  const getTBoardActionButtonClass = (variant: 'adjust' | 'release' = 'adjust') => (
    variant === 'adjust'
      ? 'inline-flex min-w-[3.6rem] items-center justify-center rounded-full border border-blue-200/90 bg-white/88 px-2.5 py-1 text-[11px] font-semibold text-blue-700 shadow-sm backdrop-blur transition-all hover:-translate-y-[1px] hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900/80 dark:text-blue-300 dark:hover:bg-blue-950/70'
      : 'inline-flex min-w-[3.6rem] items-center justify-center rounded-full border border-rose-200/90 bg-white/88 px-2.5 py-1 text-[11px] font-semibold text-rose-700 shadow-sm backdrop-blur transition-all hover:-translate-y-[1px] hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900/80 dark:text-rose-300 dark:hover:bg-rose-950/70'
  );

  const intensity = Math.min(1, m.risk / maxRisk);
  const h = Math.round(0 + 120 * (1 - intensity));
  const c = theme === 'dark' ? `hsla(${h},70%,30%,0.35)` : `hsla(${h},85%,85%,0.65)`;
  const bg = `linear-gradient(to right, ${c} 0%, transparent 100%)`;

  let callPrice = '';
  let putPrice = '';
  let callMarginText = '-';
  let putMarginText = '-';
  let callCode = '';
  let putCode = '';
  let callFullCode = '';
  let putFullCode = '';
  const quote = quotesByStrike.get(m.s);

  if (quote) {
    callCode = quote.call_contract_code || '';
    callFullCode = quote.call_contract_code_full || '';
    putCode = quote.put_contract_code || '';
    putFullCode = quote.put_contract_code_full || '';
    const callMargin = quote.callMargin ?? quote.call_margin;
    const putMargin = quote.putMargin ?? quote.put_margin;

    const getPrice = (code: string, fullCode: string, last?: number) => {
      const p = (code && prices[code]) || (fullCode && prices[fullCode]);
      if (p) return p.price.toFixed(4);
      return typeof last === 'number' && last ? last.toFixed(4) : '-';
    };
    callPrice = getPrice(callCode, callFullCode, quote.call_last_price);
    putPrice = getPrice(putCode, putFullCode, quote.put_last_price);
    if (typeof callMargin === 'number' && Number.isFinite(callMargin)) {
      callMarginText = formatCurrency(callMargin, currencyConfig, Number.isInteger(callMargin) ? 0 : 2);
    }
    if (typeof putMargin === 'number' && Number.isFinite(putMargin)) {
      putMarginText = formatCurrency(putMargin, currencyConfig, Number.isInteger(putMargin) ? 0 : 2);
    }
  }

  let callTV: number | null = null;
  let putTV: number | null = null;
  if (quote) {
    const qCallTV = quote.callTimeValue;
    const qPutTV = quote.putTimeValue;
    if (typeof qCallTV === 'number' && Number.isFinite(qCallTV)) callTV = qCallTV;
    if (typeof qPutTV === 'number' && Number.isFinite(qPutTV)) putTV = qPutTV;
  }
  if ((callTV == null || putTV == null) && underlyingPrice != null) {
    const cp = parseFloat(callPrice);
    const pp = parseFloat(putPrice);
    if (callTV == null && !isNaN(cp)) callTV = cp - Math.max(0, underlyingPrice - m.s);
    if (putTV == null && !isNaN(pp)) putTV = pp - Math.max(0, m.s - underlyingPrice);
  }
  let displayCallTV = '-';
  let displayPutTV = '-';
  if (callTV != null) displayCallTV = callTV.toFixed(4);
  if (putTV != null) displayPutTV = putTV.toFixed(4);

  const strikeMaxTV = Math.max(0, callTV ?? 0, putTV ?? 0);
  const tvIntensity = maxTimeValue > 0 ? Math.min(1, strikeMaxTV / maxTimeValue) : 0;
  let timeValueColor = 'transparent';
  if (tvIntensity > 0.01) {
    const alpha = theme === 'dark' ? 0.3 : 0.5;
    timeValueColor = `rgba(255, 170, 0, ${tvIntensity * alpha})`;
  }
  const timeValueBg = timeValueColor !== 'transparent'
    ? `linear-gradient(0deg, ${timeValueColor}, ${timeValueColor})`
    : 'none';
  const rowBg = timeValueBg === 'none' ? bg : `${timeValueBg}, ${bg}`;

  const displayVal = (_c: string, _s: number, d: number) => d;

  const getQuoteStrike = (q: OptionQuote): number => {
    const record = q as unknown as { strike_price?: unknown };
    const value = record.strike_price ?? q.strike;
    return typeof value === 'number' ? value : Number(value);
  };

  const openAdjustConfirm = (category: string, s: number) => {
    const title = '确认调整持仓数量';
    const categoryLabel: Record<string, string> = {
      call_right: 'Call 权利',
      call_obligation: 'Call 义务',
      call_covered: 'Call 备兑',
      put_right: 'Put 权利',
      put_obligation: 'Put 义务',
      put_covered: 'Put 备兑'
    };
    const ids = (() => {
      if (category.startsWith('call')) {
        if (category === 'call_right') return filteredPositions.filter(p => p.strike === s && p.type === 'call' && p.position_type === 'buy').map(p => p.id);
        if (category === 'call_covered') return filteredPositions.filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh === '备兑').map(p => p.id);
        if (category === 'call_obligation') return filteredPositions.filter(p => p.strike === s && p.type === 'call' && p.position_type === 'sell' && p.position_type_zh !== '备兑').map(p => p.id);
      } else {
        if (category === 'put_right') return filteredPositions.filter(p => p.strike === s && p.type === 'put' && p.position_type === 'buy').map(p => p.id);
        if (category === 'put_covered') return filteredPositions.filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh === '备兑').map(p => p.id);
        if (category === 'put_obligation') return filteredPositions.filter(p => p.strike === s && p.type === 'put' && p.position_type === 'sell' && p.position_type_zh !== '备兑').map(p => p.id);
      }
      return [] as string[];
    })();

    const currentSum = ids.reduce((acc, id) => {
      const pos = filteredPositions.find(x => x.id === id);
      const qty = Number(pos?.selectedQuantity ?? pos?.leg_quantity ?? pos?.quantity) || 0;
      return acc + qty;
    }, 0);
    const desc = `${categoryLabel[category]} @${s}（到期 ${format(new Date(groupExpiry), 'yyyy-MM-dd')}），当前数量 ${currentSum}`;
    const syntheticId = `sync-${category}-${s}`;

    const findQuote = (data: OptionsData) => data.quotes?.find(q => q.expiry === groupExpiry && getQuoteStrike(q) === s);
    let quoteForModal: OptionQuote | undefined;
    if (optionsData) quoteForModal = findQuote(optionsData);
    if (!quoteForModal && optionsDataMap) {
      for (const data of Object.values(optionsDataMap)) { quoteForModal = findQuote(data); if (quoteForModal) break; }
    }
    if (!quoteForModal && localOptionsData) quoteForModal = findQuote(localOptionsData);

    const isCall = category.startsWith('call');
    const contract_code = isCall ? quoteForModal?.call_contract_code : quoteForModal?.put_contract_code;
    const contract_code_full = isCall ? quoteForModal?.call_contract_code_full : quoteForModal?.put_contract_code_full;

    const codes: string[] = [];
    if (contract_code_full) codes.push(contract_code_full);
    else {
      const posCodes = ids.map(id => filteredPositions.find(p => p.id === id)?.contract_code_full).filter(Boolean) as string[];
      codes.push(...posCodes);
    }
    const uniqueCodes = Array.from(new Set(codes));
    
    // Debug logging for opening adjustment dialog
    const isDebug = import.meta.env.DEV ||
                    new URLSearchParams(window.location.search).get('debug') === 'true' || 
                    localStorage.getItem('options_portfolio_debug') === 'true';
    if (isDebug) {
      console.group('%c[Options Portfolio Debug] Opening Adjustment Dialog', 'color: #3b82f6; font-weight: bold;');
      console.log('Action: openAdjustConfirm');
      console.log('Category:', category);
      console.log('Strike:', s);
      console.log('Current Total Qty:', currentSum);
      console.log('Target Codes:', uniqueCodes);
      console.groupEnd();
    }

    onSetConfirmData({
      ids: [syntheticId],
      meta: { action: 'sync_category', category, strike: s, expiry: groupExpiry, quote: quoteForModal, contract_code, contract_code_full },
      title,
      description: desc
    });
  };

  const openComboManageModal = (comboType: 'call' | 'put') => {
    const strategies = comboType === 'call' ? (m.comboCallStrategies || []) : (m.comboPutStrategies || []);
    const buyStrike = Number(m.s);
    let sellStrike: number | null = null;
    if (comboType === 'call') { const higher = strikes.find(s => s > buyStrike); if (higher != null) sellStrike = higher; }
    else { const lower = [...strikes].reverse().find(s => s < buyStrike); if (lower != null) sellStrike = lower; }
    if (sellStrike == null) { toast.error('找不到可用的另一腿行权价，无法生成组合'); return; }

    const findQuote = (data: OptionsData, strike: number) => data.quotes?.find(q => q.expiry === groupExpiry && getQuoteStrike(q) === strike);
    const getQuoteByStrike = (strike: number) => {
      if (optionsData) { const q = findQuote(optionsData, strike); if (q) return q; }
      if (optionsDataMap) { for (const data of Object.values(optionsDataMap)) { const q = findQuote(data, strike); if (q) return q; } }
      if (localOptionsData) { const q = findQuote(localOptionsData, strike); if (q) return q; }
      return undefined;
    };

    const buyQuote = getQuoteByStrike(buyStrike);
    const sellQuote = getQuoteByStrike(sellStrike);
    if (!buyQuote || !sellQuote) { toast.error('缺少期权链数据，无法生成组合'); return; }

    const buyFullCode = comboType === 'call' ? buyQuote.call_contract_code_full : buyQuote.put_contract_code_full;
    const buyCode = comboType === 'call' ? buyQuote.call_contract_code : buyQuote.put_contract_code;
    const sellFullCode = comboType === 'call' ? sellQuote.call_contract_code_full : sellQuote.put_contract_code_full;
    const sellCode = comboType === 'call' ? sellQuote.call_contract_code : sellQuote.put_contract_code;
    if ((!buyFullCode && !buyCode) || (!sellFullCode && !sellCode)) { toast.error('缺少合约代码，无法生成组合'); return; }

    const now = new Date().toISOString();
    const undl = selectedSymbol || optionsData?.opt_undl_code_full || localOptionsData?.opt_undl_code_full || '';
    const makeLegPosition = (positionType: 'buy' | 'sell', strike: number, code: string, fullCode: string | undefined): OptionsPosition => ({
      id: `combo-manual-${comboType}-${positionType}-${groupExpiry}-${strike}`,
      symbol: fullCode || code, opt_undl_code_full: undl || undefined, strategy: '组合购买',
      type: comboType, option_type: comboType, position_type: positionType, strike,
      strike_price: String(strike), expiry: groupExpiry, quantity: 1, premium: 0, currentValue: 0,
      profitLoss: 0, profitLossPercentage: 0, impliedVolatility: 0, delta: 0, gamma: 0, theta: 0, vega: 0,
      status: 'open', openDate: now, contract_code: code || undefined, contract_code_full: fullCode || undefined,
      contract_strike_price: strike, contract_type_zh: comboType,
      position_type_zh: positionType === 'buy' ? '权利' : '义务', leg_quantity: 1,
    });

    const buyLeg = makeLegPosition('buy', buyStrike, buyCode || buyFullCode || '', buyFullCode);
    const sellLeg = makeLegPosition('sell', sellStrike, sellCode || sellFullCode || '', sellFullCode);
    const isBullish = comboType === 'call' ? sellStrike > buyStrike : sellStrike < buyStrike;
    const description = comboType === 'call'
      ? `${isBullish ? '认购牛市价差' : '认购熊市价差'} ${buyStrike}-${sellStrike}`
      : `${isBullish ? '认沽熊市价差' : '认沽牛市价差'} ${buyStrike}-${sellStrike}`;

    const combo: AdvisedCombination = {
      type: comboType === 'call' ? (isBullish ? 'bull_call_spread' : 'bear_call_spread') : (isBullish ? 'bear_put_spread' : 'bull_put_spread'),
      description, expiry: groupExpiry, quantity: 1,
      buy_position: { code: buyFullCode || buyCode || '', name: buyFullCode || buyCode || '', position: buyLeg, strike: buyStrike, volume: Number(buyQuote.callVolume || buyQuote.putVolume || 0) },
      sell_position: { code: sellFullCode || sellCode || '', name: sellFullCode || sellCode || '', position: sellLeg, strike: sellStrike, volume: Number(sellQuote.putVolume || sellQuote.callVolume || 0) },
      buy_strike: buyStrike, sell_strike: sellStrike,
    };

    onSetConfirmData({
      ids: strategies.flatMap(s => s.strategy.positions.map(p => p.id)),
      meta: { action: 'combo_manage', comboType, strike: m.s, expiry: groupExpiry, strategies, strategyIds: strategies.map(s => s.strategy.id), quote, contract_code: comboType === 'call' ? quote?.call_contract_code : quote?.put_contract_code, contract_code_full: comboType === 'call' ? quote?.call_contract_code_full : quote?.put_contract_code_full, comboCandidate: combo },
      title: '组合管理',
      description: `调整 ${m.s} ${groupExpiry} 的 ${comboType === 'call' ? 'Call' : 'Put'} 组合`
    });
  };

  return (
    <tr data-strike={m.s} style={{ backgroundImage: rowBg, contentVisibility: 'auto' as any, contain: 'layout style paint' as any }} className={themes[theme].cardHover}>
      <td className={`align-top text-center py-2 ${themes[theme].text}`}>
        <div className="flex flex-col items-center gap-1.5">
          {m.comboCallStrategies.length > 0 ? (
            <>
              <span className={`${tBoardComboValueClass} ${TBOARD_COMBO_HINT_CLASS} cursor-help`} title={m.comboCallStrategies.map(s => `${s.strategy.name} (${s.qty})`).join('\n')}>{m.comboCallStrategies.reduce((sum, s) => sum + s.qty, 0)}</span>
              <div className={TBOARD_ACTION_STACK_CLASS}>
                <button type="button" className={`${getTBoardActionButtonClass('adjust')} whitespace-nowrap shrink-0`} onClick={() => openComboManageModal('call')}>调整</button>
              </div>
            </>
          ) : (
            <>
              <span className={tBoardComboValueClass}>0</span>
              <div className={TBOARD_ACTION_STACK_CLASS}>
                <button type="button" className={`${getTBoardActionButtonClass('adjust')} whitespace-nowrap shrink-0`} onClick={() => openComboManageModal('call')}>调整</button>
              </div>
            </>
          )}
        </div>
      </td>
      <td className={`align-top text-center py-2 ${themes[theme].text}`}>
        <div className="flex items-center justify-center gap-1">
          <div className="flex flex-col items-center gap-1.5">
            <span className={tBoardValueTextClass}>{displayVal('call_covered', m.s, m.callCovered)}{m.callCoveredAvail !== m.callCovered ? `（${m.callCoveredAvail}）` : ''}</span>
            <button type="button" className={getTBoardActionButtonClass('adjust')} onClick={() => openAdjustConfirm('call_covered', m.s)}>调整</button>
          </div>
        </div>
      </td>
      <td className={`align-top text-center py-2 ${themes[theme].text}`}>
        <div className="flex items-center justify-center gap-1">
          <div className="flex flex-col items-center gap-1.5">
            <span className={tBoardValueTextClass}>{displayVal('call_obligation', m.s, m.callObligation)}{m.callObligationAvail !== m.callObligation ? `（${m.callObligationAvail}）` : ''}</span>
            <button type="button" className={getTBoardActionButtonClass('adjust')} onClick={() => openAdjustConfirm('call_obligation', m.s)}>调整</button>
          </div>
        </div>
      </td>
      <td className={`align-top text-center py-2 px-3 w-20 ${themes[theme].text}`}>
        <div className="flex items-center justify-center gap-1">
          <div className="flex flex-col items-center gap-1.5">
            <span className={tBoardValueTextClass}>{displayVal('call_right', m.s, m.callRight)}{m.callRightAvail !== m.callRight ? `（${m.callRightAvail}）` : ''}</span>
            <button type="button" className={getTBoardActionButtonClass('adjust')} onClick={() => openAdjustConfirm('call_right', m.s)}>调整</button>
          </div>
        </div>
      </td>
      <td className={`text-center py-1.5 px-2 w-20 ${themes[theme].text} text-xs leading-tight`}>
        <AnimatedFlash value={callMarginText} className="font-mono text-xs text-gray-500" type="price" />
      </td>
      <td className={`text-center py-1.5 px-2 w-20 ${themes[theme].text} text-xs leading-tight`}>
        <AnimatedFlash value={displayCallTV} className="font-mono text-xs text-gray-500" />
      </td>
      <td className={`text-center py-1.5 px-2 w-20 border-r ${themes[theme].border} ${themes[theme].text} text-xs leading-tight`}>
        <AnimatedFlash value={callPrice || '-'} className="font-mono text-xs" type="price" />
      </td>
      <td data-role="strike" className={`text-center py-1.5 px-2 w-20 font-bold font-mono text-[13px] ${themes[theme].text}`}>{m.s}
      </td>
      <td className={`text-center py-1.5 px-2 w-20 border-l ${themes[theme].border} ${themes[theme].text} text-xs leading-tight`}>
        <AnimatedFlash value={putPrice || '-'} className="font-mono text-xs" type="price" />
      </td>
      <td className={`text-center py-1.5 px-2 w-20 ${themes[theme].text} text-xs leading-tight`}>
        <AnimatedFlash value={displayPutTV} className="font-mono text-xs text-gray-500" />
      </td>
      <td className={`text-center py-1.5 px-2 w-20 ${themes[theme].text} text-xs leading-tight`}>
        <AnimatedFlash value={putMarginText} className="font-mono text-xs text-gray-500" type="price" />
      </td>
      <td className={`align-top text-center py-2 px-3 w-20 ${themes[theme].text}`}>
        <div className="flex items-center justify-center gap-1">
          <div className="flex flex-col items-center gap-1.5">
            <span className={tBoardValueTextClass}>{displayVal('put_right', m.s, m.putRight)}{m.putRightAvail !== m.putRight ? `（${m.putRightAvail}）` : ''}</span>
            <button type="button" className={getTBoardActionButtonClass('adjust')} onClick={() => openAdjustConfirm('put_right', m.s)}>调整</button>
          </div>
        </div>
      </td>
      <td className={`align-top text-center py-2 ${themes[theme].text}`}>
        <div className="flex items-center justify-center gap-1">
          <div className="flex flex-col items-center gap-1.5">
            <span className={tBoardValueTextClass}>{displayVal('put_obligation', m.s, m.putObligation)}{m.putObligationAvail !== m.putObligation ? `（${m.putObligationAvail}）` : ''}</span>
            <button type="button" className={getTBoardActionButtonClass('adjust')} onClick={() => openAdjustConfirm('put_obligation', m.s)}>调整</button>
          </div>
        </div>
      </td>
      <td className={`align-top text-center py-2 ${themes[theme].text}`}>
        <div className="flex items-center justify-center gap-1">
          <div className="flex flex-col items-center gap-1.5">
            <span className={tBoardValueTextClass}>{displayVal('put_covered', m.s, m.putCovered)}{m.putCoveredAvail !== m.putCovered ? `（${m.putCoveredAvail}）` : ''}</span>
            <button type="button" className={getTBoardActionButtonClass('adjust')} onClick={() => openAdjustConfirm('put_covered', m.s)}>调整</button>
          </div>
        </div>
      </td>
      <td className={`align-top text-center py-2 ${themes[theme].text}`}>
        <div className="flex flex-col items-center gap-1.5">
          {m.comboPutStrategies.length > 0 ? (
            <>
              <span className={`${tBoardComboValueClass} ${TBOARD_COMBO_HINT_CLASS} cursor-help`} title={m.comboPutStrategies.map(s => `${s.strategy.name} (${s.qty})`).join('\n')}>{m.comboPutStrategies.reduce((sum, s) => sum + s.qty, 0)}</span>
              <div className={TBOARD_ACTION_STACK_CLASS}>
                <button type="button" className={`${getTBoardActionButtonClass('adjust')} whitespace-nowrap shrink-0`} onClick={() => openComboManageModal('put')}>调整</button>
              </div>
            </>
          ) : (
            <>
              <span className={tBoardComboValueClass}>0</span>
              <div className={TBOARD_ACTION_STACK_CLASS}>
                <button type="button" className={`${getTBoardActionButtonClass('adjust')} whitespace-nowrap shrink-0`} onClick={() => openComboManageModal('put')}>调整</button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparator: only re-render when THIS row's display data changes
  if (prevProps.metric !== nextProps.metric) return false;
  if (prevProps.theme !== nextProps.theme) return false;
  if (prevProps.maxRisk !== nextProps.maxRisk) return false;
  if (prevProps.maxTimeValue !== nextProps.maxTimeValue) return false;
  if (prevProps.underlyingPrice !== nextProps.underlyingPrice) return false;
  const s = prevProps.metric.s;
  const prevQuote = prevProps.quotesByStrike.get(s);
  const nextQuote = nextProps.quotesByStrike.get(s);
  if (prevQuote !== nextQuote) return false;
  if (nextQuote) {
    const codes = [nextQuote.call_contract_code, nextQuote.call_contract_code_full, nextQuote.put_contract_code, nextQuote.put_contract_code_full].filter(Boolean);
    for (const code of codes) { if (code && prevProps.prices[code]?.price !== nextProps.prices[code]?.price) return false; }
  }
  return true;
});
// ---- End TBoardRow ----
