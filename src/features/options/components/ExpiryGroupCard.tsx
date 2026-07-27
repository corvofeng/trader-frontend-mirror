import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPosition, OptionsStrategy, AdvisedCombination, OptionsData, OptionQuote, OptionWhitelist } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types';
import { optionsService } from '../../../lib/services';
import { logger } from '../../../shared/utils/logger';
import toast from 'react-hot-toast';
import { useAutoRefresh, useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { AnimatedFlash } from './AnimatedFlash';
import { RealTimeSpreadChart } from './RealTimeSpreadChart';

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
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  ));
  const [mobileTBoardScale, setMobileTBoardScale] = useState(0.85);
  const pageLockRef = useRef(false);
  const requestedContractUnitRef = useRef<Record<string, number>>({});
  const tBoardScrollRef = useRef<HTMLDivElement | null>(null);
  const strikeHeaderRef = useRef<HTMLTableCellElement | null>(null);
  const hasUserAdjustedTBoardRef = useRef(false);
  const isProgrammaticTBoardScrollRef = useRef(false);
  const allSinglePositions = useMemo(() => (allExpiryBuckets || []).flatMap(bucket => bucket.single), [allExpiryBuckets]);
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

  const embeddedComboDraft = useMemo<ComboDraftState | null>(() => {
    if (confirmData?.meta?.action !== 'combo_manage' || !confirmData.meta.comboCandidate) return null;
    return {
      combo: confirmData.meta.comboCandidate,
      quantity: Math.max(1, Number(comboManageQuantity) || 1),
      mode: 't_board_create',
    };
  }, [comboManageQuantity, confirmData]);

  const activeComboDraft = advisedModal ?? embeddedComboDraft;

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

      // Keep the dialog on a normalized "single combo" basis.
      const maxProfit = normalizedSpreadWidth * contractUnit;
      const currentSpreadValue = est?.perHedge != null ? Math.max(0, est.perHedge * contractUnit) : null;
      const remainingProfit = currentSpreadValue != null ? Math.max(0, maxProfit - currentSpreadValue) : null;
      const profitRealizationPct =
        currentSpreadValue != null && maxProfit > 0
          ? Math.max(0, Math.min(100, (currentSpreadValue / maxProfit) * 100))
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
    if (confirmData.meta?.action !== 'unwind_combo_selection' && confirmData.meta?.action !== 'combo_manage') return;
    const strategies = confirmData.meta?.strategies || [];
    const codes = normalizeCodeList(
      strategies.flatMap((item) =>
        (item.strategy?.positions || []).map((p) => p.contract_code_full || p.contract_code || p.symbol)
      )
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
    if (!activeComboDraft) return;
    const buyPos = activeComboDraft.combo.buy_position?.position;
    const sellPos = activeComboDraft.combo.sell_position?.position;
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
  }, [activeComboDraft, connect, isConnected, normalizeCodeList, throttledQueryPrice]);

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
        const px = getCounterpartyTopPrice(update, closeSide);
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

  const spreadWatchStatusText = useMemo(
    () => getSpreadWatchStatusText(spreadWatchCodes),
    [getSpreadWatchStatusText, spreadWatchCodes]
  );

  const spreadWatchQuoteLines = useMemo(
    () => getSpreadWatchQuoteLines(spreadWatchPositions),
    [getSpreadWatchQuoteLines, spreadWatchPositions]
  );

  useEffect(() => {
    if (!activeComboDraft) {
      if (spreadHistory.length > 0) setSpreadHistory([]);
    }
  }, [activeComboDraft, spreadHistory.length]);

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

  useEffect(() => {
    if (!isMobileViewport || !isTBoardExpanded) return;
    if (hasUserAdjustedTBoardRef.current) return;

    const container = tBoardScrollRef.current;
    const strikeHeader = strikeHeaderRef.current;
    if (!container || !strikeHeader) return;

    const centerStrikeColumn = () => {
      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const desiredScrollLeft = Math.max(
        0,
        Math.min(
          strikeHeader.offsetLeft + strikeHeader.offsetWidth / 2 - container.clientWidth / 2,
          maxScrollLeft
        )
      );

      isProgrammaticTBoardScrollRef.current = true;
      container.scrollLeft = desiredScrollLeft;
      window.setTimeout(() => {
        isProgrammaticTBoardScrollRef.current = false;
      }, 80);
    };

    const frameId = window.requestAnimationFrame(centerStrikeColumn);
    return () => window.cancelAnimationFrame(frameId);
  }, [isMobileViewport, isTBoardExpanded, mobileTBoardScale, filteredPositions.length, group.expiry]);

  const handleTBoardScroll = useCallback(() => {
    if (isProgrammaticTBoardScrollRef.current) return;
    hasUserAdjustedTBoardRef.current = true;
  }, []);

  const actionButtonClass = `rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm font-medium transition-colors ${themes[theme].secondary}`;

  const renderComboDraftPanel = useCallback((draft: ComboDraftState, embedded = false) => (
    <>
      <div className={`text-lg font-semibold ${themes[theme].text}`}>{draft.combo.description}</div>
      <div className={`mt-1 text-xs ${themes[theme].text} opacity-75`}>到期 {format(new Date(draft.combo.expiry), 'yyyy-MM-dd')}</div>
      {(() => {
        const p = advisedPricePreview;
        if (!p) return null;
        const net = p.net;
        const label = net == null ? '对手方一档价未就绪' : (net >= 0 ? '预计收到' : '预计支付');
        const amountText = net == null ? '--' : formatCurrency(Math.abs(net), currencyConfig, 4);
        const hedgeText =
          p.perHedge == null ? '--' : `${p.perHedge >= 0 ? '+' : '-'}${formatCurrency(Math.abs(p.perHedge), currencyConfig, 4)}`;
        const tsText = p.ts ? format(new Date(p.ts), 'HH:mm:ss') : '--';
        return (
          <div className={`mt-3 rounded border p-3 ${themes[theme].border} ${themes[theme].background}`}>
            <div className={`text-sm ${themes[theme].text} flex items-center justify-between gap-3`}>
              <div className="font-semibold whitespace-nowrap">{label}</div>
              <div className="flex items-baseline gap-2 min-w-0">
                <AnimatedFlash value={amountText} className="font-mono whitespace-nowrap" type="price" />
                <span className="text-[11px] opacity-60 truncate flex items-baseline gap-1">
                  {p.perHedge == null || (p.pairedQty || 0) <= 0 ? null : (
                    <>
                      <span>（</span>
                      <AnimatedFlash
                        value={hedgeText}
                        className={`font-mono font-bold whitespace-nowrap ${p.perHedge != null && p.perHedge >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                        type="price"
                      />
                      <span className="whitespace-nowrap">× {p.pairedQty || 0}）</span>
                    </>
                  )}
                  <span className="whitespace-nowrap">{`WS ${tsText}`}</span>
                </span>
              </div>
            </div>
            {spreadHistory.length > 0 && (
              <div className="mt-2">
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
                {spreadWatchQuoteLines.length > 0 ? (
                  <div className={`mb-1 space-y-1 text-[11px] ${themes[theme].text} opacity-60`}>
                    {spreadWatchQuoteLines.map((line) => (
                      <div key={line.key} className={`rounded border px-2 py-1 ${themes[theme].border}`}>
                        <div>{line.contractName}</div>
                        <div className="font-mono opacity-80">{line.quoteText}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <RealTimeSpreadChart
                  theme={theme}
                  data={spreadHistory}
                  title="组合价差走势"
                />
              </div>
            )}
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
              <div className="grid grid-cols-[minmax(0,1fr)_84px_minmax(0,140px)] items-center gap-3">
                <div className={`${themes[theme].text} opacity-80`}>买入腿（ASK1）x{p.buy.qty}</div>
                <div className={`text-right font-mono ${themes[theme].text}`}>
                  <AnimatedFlash value={p.buy.px == null ? '--' : p.buy.px.toFixed(4)} type="price" />
                </div>
                <div className={`flex items-center justify-end gap-1 font-mono ${themes[theme].text}`}>
                  <span className="opacity-70">{p.buy.amt == null ? '' : (p.buy.amt >= 0 ? '收到' : '支付')}</span>
                  <AnimatedFlash
                    value={
                      p.buy.amt == null ? '--' : `${p.buy.amt >= 0 ? '+' : '-'}${formatCurrency(Math.abs(p.buy.amt), currencyConfig, 4)}`
                    }
                    type="price"
                  />
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_84px_minmax(0,140px)] items-center gap-3">
                <div className={`${themes[theme].text} opacity-80`}>卖出腿（BID1）x{p.sell.qty}</div>
                <div className={`text-right font-mono ${themes[theme].text}`}>
                  <AnimatedFlash value={p.sell.px == null ? '--' : p.sell.px.toFixed(4)} type="price" />
                </div>
                <div className={`flex items-center justify-end gap-1 font-mono ${themes[theme].text}`}>
                  <span className="opacity-70">{p.sell.amt == null ? '' : (p.sell.amt >= 0 ? '收到' : '支付')}</span>
                  <AnimatedFlash
                    value={
                      p.sell.amt == null ? '--' : `${p.sell.amt >= 0 ? '+' : '-'}${formatCurrency(Math.abs(p.sell.amt), currencyConfig, 4)}`
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
          <div className="flex items-center gap-2">
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
              className={`w-24 px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
            />
          </div>
        </div>
        <div className={`${themes[theme].background} rounded p-3 border ${themes[theme].border}`}>
          <div className={`text-sm font-medium ${themes[theme].text}`}>买入腿</div>
          {(() => {
            const p = draft.combo.buy_position.position;
            const contractName = getContractNameForPosition(p);
            return contractName ? (
              <div className={`text-xs ${themes[theme].text} opacity-85 mt-1 font-medium`}>
                {contractName}
              </div>
            ) : null;
          })()}
          <div className={`text-xs ${themes[theme].text} opacity-75 mt-1`}>
            {draft.combo.buy_position.position.symbol} {draft.combo.buy_position.position.strike} {String(draft.combo.buy_position.position.type).toUpperCase()} • {draft.combo.buy_position.position.position_type === 'buy' ? '买入' : '卖出'}
          </div>
          <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
            {(() => {
              const p = draft.combo.buy_position.position;
              const avail = Number(p.available ?? p.quantity);
              const qty = p.quantity;
              return <>数量 {qty}{avail !== qty ? `（${avail}）` : ''}</>;
            })()}
          </div>
        </div>
        <div className={`${themes[theme].background} rounded p-3 border ${themes[theme].border}`}>
          <div className={`text-sm font-medium ${themes[theme].text}`}>卖出腿</div>
          {(() => {
            const p = draft.combo.sell_position.position;
            const contractName = getContractNameForPosition(p);
            return contractName ? (
              <div className={`text-xs ${themes[theme].text} opacity-85 mt-1 font-medium`}>
                {contractName}
              </div>
            ) : null;
          })()}
          <div className={`text-xs ${themes[theme].text} opacity-75 mt-1`}>
            {draft.combo.sell_position.position.symbol} {draft.combo.sell_position.position.strike} {String(draft.combo.sell_position.position.type).toUpperCase()} • {draft.combo.sell_position.position.position_type === 'buy' ? '买入' : '卖出'}
          </div>
          <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
            {(() => {
              const p = draft.combo.sell_position.position;
              const avail = Number(p.available ?? p.quantity);
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
            if (onLoadAdvised) onLoadAdvised({ ...draft.combo, quantity: draft.quantity });
            if (embedded) {
              setConfirmData(null);
            } else {
              setAdvisedModal(null);
            }
          }}
        >加载到构建器</button>
        <button
          className={`px-3 py-1 rounded text-sm bg-purple-600 text-white`}
          onClick={async () => {
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
    onLoadAdvised,
    onRefresh,
    selectedAccountId,
    spreadHistory,
    spreadStatus,
    spreadWatchQuoteLines,
    spreadWatchStatusText,
    theme,
    userId
  ]);

  return (
    <div className={`${themes[theme].card} ${themes[theme].border} rounded-2xl border shadow-md overflow-hidden`}>
      <div className={`p-3 sm:p-6 border-b ${themes[theme].border}`}>
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className={`text-[11px] sm:text-xs font-medium uppercase tracking-[0.18em] ${themes[theme].text} opacity-45`}>
              到期日
            </div>
            <h3 className={`mt-0.5 sm:mt-1 text-lg sm:text-3xl font-semibold leading-tight ${themes[theme].text}`}>
              {format(new Date(group.expiry), 'yyyy年MM月dd日')}
            </h3>
            <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
              <span className={`px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium ${getDaysToExpiryColor(group.daysToExpiry)}`}>
                {group.daysToExpiry > 0 ? `${group.daysToExpiry}天后到期` : '已到期'}
              </span>
              <span className={`px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium ${themes[theme].background} ${themes[theme].text}`}>
                {filteredPositions.length} 个持仓
              </span>
              <span className={`px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium ${
                totalProfitLoss >= 0
                  ? 'bg-green-500/10 text-green-600 dark:text-green-300'
                  : 'bg-red-500/10 text-red-600 dark:text-red-300'
              }`}>
                浮盈亏 {totalProfitLoss >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalProfitLoss), currencyConfig, 0)}
              </span>
              {totalMargin > 0 && (
                <span className="px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-300 font-mono">
                  保证金 {formatCurrency(totalMargin, currencyConfig, 0)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:gap-3 lg:min-w-[320px] lg:max-w-[360px]">
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <button onClick={onToggleExpand} className={actionButtonClass}>
                {isExpanded ? '收起详情' : '展开详情'}
              </button>
              <button
                onClick={() => toggleExpirySelection(group.expiry)}
                className={actionButtonClass}
              >
                {isSelectingExpiry(group.expiry) ? '退出选择' : '选择此到期日'}
              </button>
              {isSelectingExpiry(group.expiry) && (
                <button
                  onClick={() => openSaveModal(group.expiry)}
                  className="col-span-2 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                  构建组合并保存
                </button>
              )}
            </div>
          </div>
        </div>
      </div>



      <div className="p-3 sm:p-6">
        <div className="space-y-4">
          {(() => {
            const callPositions = filteredPositions.filter(pos => (pos.type === 'call' || pos.contract_type_zh === 'call'));
            const putPositions = filteredPositions.filter(pos => (pos.type === 'put' || pos.contract_type_zh === 'put'));

            return (
              <div className="space-y-5 sm:space-y-6">
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
                        const { strikes } = tBoardStrikesAndMetrics;
                        const hasData = strikes.length > 0;
                        if (!hasData) {
                          return (
                            <div className={`text-center text-sm ${themes[theme].text} opacity-75`}>暂无数据</div>
                          );
                        }
                        return (
                          <div className="space-y-3">
                          <div className="md:hidden flex items-center justify-between gap-3">
                            <label className={`flex items-center gap-2 text-xs ${themes[theme].text} opacity-75`}>
                              <span>表格大小</span>
                              <span className="font-mono">{Math.round(mobileTBoardScale * 100)}%</span>
                            </label>
                            <input
                              type="range"
                              min={70}
                              max={110}
                              step={5}
                              value={Math.round(mobileTBoardScale * 100)}
                              onChange={(event) => setMobileTBoardScale(Number(event.target.value) / 100)}
                              className="w-32 accent-blue-600"
                              aria-label="调整T型持仓列表大小"
                            />
                          </div>
                          <div
                            ref={tBoardScrollRef}
                            className="overflow-x-auto"
                            onScroll={handleTBoardScroll}
                          >
                            <table
                              className="w-full text-xs min-w-[980px]"
                              style={isMobileViewport ? { zoom: mobileTBoardScale } : undefined}
                            >
                              <thead>
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
                                  <th ref={strikeHeaderRef} className="text-center py-2 px-3">行权价</th>
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
                                      <tr key={`spot-${group.expiry}`} style={{ background: 'transparent' }}>
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
                                          isConnected={isConnected}
                                          onConnect={connect}
                                          onQueryPrice={queryPrice}
                                        />
                                      );
                                    }
                                    if (insertIdx === metrics.length) {
                                      rows.push(spotIndicator);
                                    }
                                    return rows;
                                  }

                                  return metrics.map(m => (
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
                                      isConnected={isConnected}
                                      onConnect={connect}
                                      onQueryPrice={queryPrice}
                                    />
                                  ));
                                })()}
                              </tbody>
                            </table>
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
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
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
                                    <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${getStatusColor(position.status)}`}>
                                      {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                    </span>
                                    {!isSelectingExpiry(position.expiry) && (
                                      <button
                                        type="button"
                                        onClick={() => setPositionSelected(position.id, true)}
                                        className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs bg-blue-600 text-white hover:bg-blue-700"
                                        aria-label="加入策略"
                                      >
                                        加入策略
                                      </button>
                                    )}
                                    {isSelectingExpiry(position.expiry) && (
                                      <div className="flex items-center gap-1 sm:gap-2">
                                        <label className={`text-[10px] sm:text-xs ${themes[theme].text} opacity-75 flex items-center gap-1`}>
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
                                            className={`w-14 sm:w-20 px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs ${themes[theme].input} ${themes[theme].text}`}
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
                          <div className={`${themes[theme].background} rounded-lg p-4 sm:p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                            <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-75`}>
                              暂无Call期权持仓
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

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
                                    <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${getStatusColor(position.status)}`}>
                                      {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                                    </span>
                                    {!isSelectingExpiry(position.expiry) && (
                                      <button
                                        type="button"
                                        onClick={() => setPositionSelected(position.id, true)}
                                        className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs bg-blue-600 text-white hover:bg-blue-700"
                                        aria-label="加入策略"
                                      >
                                        加入策略
                                      </button>
                                    )}
                                    {isSelectingExpiry(position.expiry) && (
                                      <div className="flex items-center gap-1 sm:gap-2">
                                        <label className={`text-[10px] sm:text-xs ${themes[theme].text} opacity-75 flex items-center gap-1`}>
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
                                            className={`w-14 sm:w-20 px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs ${themes[theme].input} ${themes[theme].text}`}
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
                          <div className={`${themes[theme].background} rounded-lg p-4 sm:p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                            <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-75`}>
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
                              <div className={`text-[11px] sm:text-sm ${themes[theme].text} opacity-75`}>
                                {strategy.name} （{legCount} 腿，组合数 {comboCount}）
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
        {confirmData.meta?.action !== 'combo_manage' && (
          <>
            <div className={`text-lg font-semibold ${themes[theme].text}`}>{confirmData.title}</div>
            <div className={`mt-2 text-sm ${themes[theme].text}`}>{confirmData.description}</div>
          </>
        )}
        <div className={`${confirmData.meta?.action === 'combo_manage' ? 'mt-0' : 'mt-4'} overflow-y-auto min-h-0 flex-1 space-y-2`}>
          {confirmData.meta?.action === 'unwind_combo_selection' || confirmData.meta?.action === 'combo_manage' ? (
            <div className="space-y-4">
              {confirmData.meta?.action === 'combo_manage' && embeddedComboDraft ? (
                <div className="space-y-2">
                  <div className={`text-sm font-semibold ${themes[theme].text}`}>调整组合</div>
                  <div className={`rounded-lg border p-4 ${themes[theme].border} ${themes[theme].background}`}>
                    {renderComboDraftPanel(embeddedComboDraft, true)}
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {confirmData.meta?.action === 'combo_manage' ? (
                  <div className={`text-sm font-semibold ${themes[theme].text}`}>解除已有组合</div>
                ) : null}
                {(confirmData.meta.strategies || []).length > 0 ? (
                  (confirmData.meta.strategies || []).map((item, idx) => (
                    <div
                      key={`strat-select-${idx}`}
                      className={`p-3 rounded border ${themes[theme].border}`}
                    >
                      <div className="min-w-0">
                        {(() => {
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
                          return (
                            <>
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                  <div className={`font-semibold ${themes[theme].text}`}>
                                    {item.strategy.name}
                                    <span className="ml-2 text-xs font-normal opacity-50">{item.strategy.id}</span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  <button
                                    disabled={isPageLocked}
                                    className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[92px]"
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
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[92px]"
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
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${themes[theme].border} ${themes[theme].text}`}>
                                  数量 {item.qty}
                                </span>
                                {strikeGapSummary.map((summary) => (
                                  <div key={`strike-gap-${idx}-${summary.key}`} className="contents">
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
                              <div className={`mt-2 text-xs opacity-50 ${themes[theme].text}`}>
                                {item.strategy.positions.map(p => `${getPositionContractLabel(p)} x ${p.quantity}`).join(', ')}
                              </div>
                              {perf.mode === 'spread_value' && perf.usedStandardContractUnit ? (
                                <div className={`mt-1 text-[11px] ${themes[theme].text} opacity-60`}>
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
                              <div className={`mt-2 text-xs ${themes[theme].text} opacity-80`}>
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
                                      <div key={`leg-est-${idx}-${i}`} className="grid grid-cols-[minmax(0,1fr)_84px_minmax(0,140px)] items-center gap-3">
                                        <div className="truncate opacity-80">
                                          {getPositionContractLabel(l.pos)} • {l.closeSide === 'buy' ? '买入' : '卖出'} • x{l.qty}
                                        </div>
                                        <div className="text-right font-mono">
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
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ))
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
          >确认执行</button>
        </div>
        )}
      </div>
    </div>
  )}
  {advisedModal && (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => setAdvisedModal(null)}></div>
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] md:w-auto md:min-w-[600px] md:max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border ${themes[theme].card} ${themes[theme].border} p-6`}
      >
        {renderComboDraftPanel(advisedModal)}
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
  localOptionsData?: OptionsData | undefined;
  filteredPositions: OptionsPosition[];
  onSetConfirmData: (data: any) => void;
  isConnected: boolean;
  onConnect: () => void;
  onQueryPrice: (codes: string[]) => void;
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
  isConnected,
  onConnect,
  onQueryPrice,
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
    if (uniqueCodes.length > 0) {
      if (!isConnected) onConnect();
      onQueryPrice(uniqueCodes);
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
    <tr style={{ backgroundImage: rowBg, contentVisibility: 'auto' as any, contain: 'layout style paint' as any }} className={themes[theme].cardHover}>
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
      <td className={`text-center py-1.5 px-2 w-20 ${themes[theme].text}`}>{m.s}
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
