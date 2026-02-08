import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { Calendar, TrendingUp, TrendingDown, Activity, Shield, Target, Layers, ChevronDown, ChevronUp, RefreshCw, List, Play } from 'lucide-react';
import { PortfolioActivityLog, ActivityLogEntry } from './PortfolioActivityLog';
import { Hash } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { setCookie, getCookie } from '../../../shared/utils/cookie';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService, stockService } from '../../../lib/services';
import { emitAddLegToStrategy } from '../events/strategySelection';
import { logger } from '../../../shared/utils/logger';
import type { OptionsPortfolioData, CustomOptionsStrategy, OptionsPosition, OptionsStrategy, AdvisedCombination, OptionsData, OptionWhitelist, OptionOrder } from '../../../lib/services/types';
import { computeCombosForPositions as computeCombosForStrategy } from '../utils/strategyCombos';
import toast from 'react-hot-toast';
import { ExpiryGroupCard } from './ExpiryGroupCard';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';

interface OptionsPortfolioProps {
  theme: Theme;
  selectedAccountId?: string | null;
  refreshKey?: number;
  optionsData?: OptionsData | null;
  selectedSymbol?: string;
}

type OptionsViewMode = 'expiry' | 'strategy' | 'grouped';

const DEMO_USER_ID = 'mock-user-id';

  

// 扩展OptionsPosition类型以包含策略ID
interface ExtendedOptionsPosition extends OptionsPosition {
  strategy_id?: string;
  is_single_leg?: boolean;
}

const getPositionTypeInfo2 = (positionType: string, optionType: string, positionTypeZh?: string, isCovered?: boolean) => {
  const isLong = positionType === 'buy';
  const isCall = optionType === 'call';

  if ((positionTypeZh === '备兑' || isCovered) && !isLong) {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '备兑',
      color: 'bg-purple-100 text-purple-800 dark:text-purple-400 dark:bg-purple-900',
      description: '备兑',
      borderColor: 'border-l-purple-500'
    };
  }

  if (isLong && isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:text-blue-400 dark:bg-blue-900',
      description: '有权买入标的',
      borderColor: 'border-l-blue-500'
    };
  }

  if (isLong && !isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:text-blue-400 dark:bg-blue-900',
      description: '有权卖出标的',
      borderColor: 'border-l-blue-500'
    };
  }

  if (!isLong && isCall) {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '义务方',
      color: 'bg-orange-100 text-orange-800 dark:text-orange-400 dark:bg-orange-900',
      description: '有义务卖出标的',
      borderColor: 'border-l-orange-500'
    };
  }

  return {
    icon: <Target className="w-3 h-3" />,
    label: '义务方',
    color: 'bg-orange-100 text-orange-800 dark:text-orange-400 dark:bg-orange-900',
    description: '有义务买入标的',
    borderColor: 'border-l-orange-500'
  };
};

export function OptionsPortfolio({ theme, selectedAccountId: selectedAccountIdProp, refreshKey = 0, optionsData, selectedSymbol }: OptionsPortfolioProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [whitelists, setWhitelists] = useState<OptionWhitelist[]>([]);
  const [customStrategies, setCustomStrategies] = useState<CustomOptionsStrategy[]>([]);
  const [todayOrders, setTodayOrders] = useState<OptionOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Use prop directly to avoid stale state during refresh
  // 已不在界面使用策略加载状态，避免未使用变量
  const [viewMode, setViewMode] = useState<OptionsViewMode>('expiry');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'expiry' | 'profitLoss' | 'symbol'>('expiry');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedStrategies, setExpandedStrategies] = useState<string[]>([]);
  const [underlyingCache, setUnderlyingCache] = useState<Record<string, number>>({});
  const [internalOptionsDataMap, setInternalOptionsDataMap] = useState<Record<string, OptionsData>>({});
  // 到期分组选择模式（每个到期日单独开启多选）
  const [expirySelectionMode, setExpirySelectionMode] = useState<Record<string, boolean>>({});
  // 选中的腿及数量（positionId -> quantity）
  const [selectedLegs, setSelectedLegs] = useState<Record<string, number>>({});
  // 保存确认弹窗状态
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [modalExpiry, setModalExpiry] = useState<string | null>(null);
  const [saveStrategyName, setSaveStrategyName] = useState<string>('');
  const [saveStrategyCategory, setSaveStrategyCategory] = useState<'bullish' | 'bearish' | 'neutral' | 'volatility'>('neutral');
  const [saveStrategyDescription, setSaveStrategyDescription] = useState<string>('');
  const [isModalSaving, setIsModalSaving] = useState(false);
  const { currencyConfig } = useCurrency();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<string>(selectedSymbol || '');
  
  // Activity Log State
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const previousPositionsRef = useRef<Record<string, OptionsPosition>>({});
  const isBaselineEstablishedRef = useRef(false);
  const { isConnected, send, portfolioSnapshot, prices, queryPrice } = useOptionPriceWebSocket();
  const requestedSymbolsRef = useRef<Set<string>>(new Set());

  // State for collapsible expiry groups
  const [expandedExpiryGroups, setExpandedExpiryGroups] = useState<Record<string, boolean>>(() => {
    const saved = getCookie('options_portfolio_expanded_groups');
    return saved ? JSON.parse(saved) : {};
  });

  // State for collapsible T-boards (per expiry)
  const [tBoardExpandedGroups, setTBoardExpandedGroups] = useState<Record<string, boolean>>(() => {
    const saved = getCookie('options_portfolio_t_board_expanded');
    return saved ? JSON.parse(saved) : {};
  });

  // State for active expiry group in viewport (ScrollSpy)
  const [activeExpiry, setActiveExpiry] = useState<string | null>(null);
  
  // State for scroll-following refresh button
  const [showRefreshButton, setShowRefreshButton] = useState(false);

  // Persist expanded groups to cookie whenever it changes
  useEffect(() => {
    setCookie('options_portfolio_expanded_groups', JSON.stringify(expandedExpiryGroups), 30);
  }, [expandedExpiryGroups]);

  // Persist T-board expanded states to cookie
  useEffect(() => {
    setCookie('options_portfolio_t_board_expanded', JSON.stringify(tBoardExpandedGroups), 30);
  }, [tBoardExpandedGroups]);

  // Restore scroll position
  useEffect(() => {
    const savedScrollY = getCookie('options_portfolio_scroll_y');
    if (savedScrollY) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScrollY, 10));
      }, 100);
    }

    const handleScroll = () => {
      setCookie('options_portfolio_scroll_y', window.scrollY.toString(), 7);
    };

    // Debounce scroll handler
    let timeoutId: NodeJS.Timeout;
    const debouncedScrollHandler = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleScroll, 100);
    };

    window.addEventListener('scroll', debouncedScrollHandler);
    return () => {
      window.removeEventListener('scroll', debouncedScrollHandler);
      clearTimeout(timeoutId);
    };
  }, []);

  // ScrollSpy to update active expiry based on viewport
  useEffect(() => {
    if (!portfolioData) return;

    const handleScrollSpy = () => {
      // Update refresh button visibility
      setShowRefreshButton(window.scrollY > 300);

      const groups = portfolioData.expiryBuckets || portfolioData.expiryGroups || [];
      if (groups.length === 0) return;

      // Header offset + sticky nav height approx
      // Adjust this value based on your actual header height + sticky nav height
      const offset = 220; 
      
      let currentActive: string | null = null;
      
      // Iterate through groups to find which one is currently active
      for (const group of groups) {
        const el = document.getElementById(`expiry-group-${group.expiry}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          // If the element's top is "above" the viewing line (offset), it's a candidate.
          // Because we iterate in order, the last one that satisfies this condition 
          // is the one currently "occupying" the top of the content area.
          if (rect.top <= offset) {
             currentActive = group.expiry;
          } else {
            // Once we hit a group that starts below the offset, we stop.
            // The previous one is our active group.
            break;
          }
        }
      }
      
      // Fallback: if we are at the very top and no group satisfies rect.top <= offset
      // (e.g. first group starts at 250px and offset is 220px), active is the first one.
      if (!currentActive && groups.length > 0) {
         currentActive = groups[0].expiry;
      }

      setActiveExpiry(prev => prev !== currentActive ? currentActive : prev);
    };

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScrollSpy();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll);
    // Trigger once on mount/data change to set initial state
    handleScrollSpy();
    
    return () => window.removeEventListener('scroll', onScroll);
  }, [portfolioData]);

  const toggleExpiryGroup = (expiry: string) => {
    setExpandedExpiryGroups(prev => ({
      ...prev,
      [expiry]: !prev[expiry]
    }));
  };

  const toggleTBoardGroup = (expiry: string) => {
    setTBoardExpandedGroups(prev => ({
      ...prev,
      [expiry]: prev[expiry] === undefined ? false : !prev[expiry] // Default is expanded (undefined), so toggle to false
    }));
  };

  // Sync prop to state
  useEffect(() => {
    if (selectedSymbol !== undefined) {
      setActiveSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  // Reset baseline when account changes
  useEffect(() => {
    isBaselineEstablishedRef.current = false;
    previousPositionsRef.current = {};
    setActivityLogs([]);
  }, [selectedAccountIdProp]);

  const getSanitizedUnderlying = (code: string) => {
    return code?.startsWith('US.') ? code.replace('US.', '') : code;
  };

  // Poll for underlying price via WebSocket
  useEffect(() => {
    if (!isConnected || !activeSymbol) return;

    const runQuery = () => {
      queryPrice([activeSymbol]);
    };

    runQuery();
    // Poll every 5 seconds to keep price fresh
    const interval = setInterval(runQuery, 5000);
    return () => clearInterval(interval);
  }, [isConnected, activeSymbol, queryPrice]);

  // Fetch data when active symbol changes
  useEffect(() => {
    if (!activeSymbol) return;

    const sanitized = getSanitizedUnderlying(activeSymbol);

    const ensurePrice = async () => {
      if (!sanitized) return;
      if (underlyingCache[sanitized] !== undefined) return;
      try {
        const { data } = await stockService.getCurrentPrice(sanitized);
        const price = data?.price ?? null;
        setUnderlyingCache(prev => ({ ...prev, [sanitized]: price }));
      } catch (e) {
        console.error('Error fetching price for', sanitized, e);
        // Set to null to avoid infinite retry loop on error
        setUnderlyingCache(prev => ({ ...prev, [sanitized]: null }));
      }
    };

    ensurePrice();

    // Ensure we have the options chain data (market data)
    if (!internalOptionsDataMap[activeSymbol] && !requestedSymbolsRef.current.has(activeSymbol)) {
      requestedSymbolsRef.current.add(activeSymbol);
      optionsService.getOptionsData(activeSymbol).then(({ data: optData }) => {
        if (optData) {
          setInternalOptionsDataMap(prev => ({ ...prev, [activeSymbol]: optData }));
        }
      }).catch(err => {
        console.error('Error fetching options data for active symbol:', activeSymbol, err);
      });
    }
  }, [activeSymbol, internalOptionsDataMap, underlyingCache]);

  // 复杂策略编辑复用“保存确认弹窗”，不使用独立编辑器

  const processDiff = useCallback((newData: OptionsPortfolioData) => {
      const getPositionsMap = (pData: OptionsPortfolioData) => {
         const map: Record<string, OptionsPosition> = {};
         (pData.expiryBuckets || []).forEach(b => {
           b.single.forEach(p => map[p.id] = p);
           b.complex.forEach(s => s.positions.forEach(p => map[p.id] = p));
         });
         return map;
      };

      const currentPositions = getPositionsMap(newData);

      // Initial load baseline check
      if (!isBaselineEstablishedRef.current) {
        previousPositionsRef.current = currentPositions;
        isBaselineEstablishedRef.current = true;
        return;
      }

      const previousPositions = previousPositionsRef.current;
      const newLogs: ActivityLogEntry[] = [];
      const now = Date.now();

      // 1. Check for closed positions
      Object.entries(previousPositions).forEach(([id, pos]) => {
         if (!currentPositions[id] && pos.quantity > 0 && pos.status !== 'closed' && pos.status !== 'expired') {
           newLogs.push({
             id: `closed-${id}-${now}`,
             timestamp: now,
             type: 'closed',
             symbol: pos.symbol,
             contract_code_full: pos.contract_code_full,
             description: `${pos.symbol} ${pos.type.toUpperCase()} ${pos.strike} closed`
           });
         }
      });

      // 2. Check for new and updated positions
      Object.entries(currentPositions).forEach(([id, pos]) => {
         const prev = previousPositions[id];
         if (!prev) {
           if (pos.quantity > 0) {
              newLogs.push({
                id: `new-${id}-${now}`,
                timestamp: now,
                type: 'new',
                symbol: pos.symbol,
                contract_code_full: pos.contract_code_full,
                description: `${pos.symbol} ${pos.type.toUpperCase()} ${pos.strike} opened (${pos.quantity})`
              });
           }
         } else {
           if (prev.quantity !== pos.quantity) {
              newLogs.push({
                id: `update-${id}-${now}`,
                timestamp: now,
                type: 'update',
                symbol: pos.symbol,
                contract_code_full: pos.contract_code_full,
                description: `Quantity changed: ${prev.quantity} -> ${pos.quantity}`,
                details: { oldQty: prev.quantity, newQty: pos.quantity }
              });
           }
         }
      });
      
      if (newLogs.length > 0) {
          setActivityLogs(prev => [...newLogs, ...prev]);
          toast.success(`${newLogs.length} position updates detected`, {
              icon: '🔔',
              duration: 3000
          });
      }
      
      previousPositionsRef.current = currentPositions;
  }, []);

  const fetchPortfolio = useCallback(async () => {
    try {
      setIsLoading(true);

      let userId: string | null = null;
      try {
        const authRes = await authService.getUser();
        const user = authRes?.data?.user;
        userId = user?.id || null;
        setCurrentUserId(userId);
      } catch (error) {
        console.log(error);
      }
      if (!userId) {
        setIsLoading(false);
        return;
      }

      const [portfolioRes, analysisRes, whitelistsRes] = await Promise.all([
        optionsService.getOptionsPortfolio(userId, selectedAccountIdProp || null),
        optionsService.getPortfolioAnalysis(userId, selectedAccountIdProp || null),
        optionsService.getWhitelists(userId, selectedAccountIdProp || null)
      ]);

      const { data, error } = portfolioRes;
      
      if (error) throw error;
      if (data) {
        // Merge analysis data if available
        if (analysisRes.data) {
          data.expiry_analysis = analysisRes.data;
        }

        if (whitelistsRes.data) {
          setWhitelists(whitelistsRes.data);
        }

        // Diff Logic
        processDiff(data);

        setPortfolioData(data);
      }
    } catch (error) {
      console.error('Error fetching portfolio data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccountIdProp]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio, refreshKey]);

  useEffect(() => {
    if (!portfolioData) return;

    // Identify unique symbols and fetch their options data if needed
    const symbols = new Set<string>();
    if (activeSymbol) {
       // If activeSymbol is set, ensure we fetch it
       symbols.add(activeSymbol);
    }
    
    // Collect all symbols from positions to ensure we have data for everything if needed
    (portfolioData.expiryBuckets || []).forEach(bucket => {
      bucket.single.forEach(pos => {
        if (pos.opt_undl_code_full) symbols.add(pos.opt_undl_code_full);
      });
    });

    // Fetch missing options data
    for (const sym of Array.from(symbols)) {
       if (!internalOptionsDataMap[sym] && !requestedSymbolsRef.current.has(sym)) {
         requestedSymbolsRef.current.add(sym);
         optionsService.getOptionsData(sym).then(({ data: optData }) => {
           if (optData) {
             setInternalOptionsDataMap(prev => ({ ...prev, [sym]: optData }));
           }
         }).catch(err => {
           console.error('Error fetching options data for symbol:', sym, err);
         });
       }
    }
  }, [portfolioData, activeSymbol, internalOptionsDataMap]);

  useEffect(() => {
    if (!isConnected) return;
    const accountId = selectedAccountIdProp || null;
    const userId = currentUserId || null;
    if (!accountId && !userId) return;

    const queryPortfolio = () => {
      const payload = {
        action: 'query_options_portfolio',
        accountId,
        userId
      };
      send(payload);
    };

    // Initial query
    queryPortfolio();

    // Poll every 3 seconds
    const intervalId = setInterval(queryPortfolio, 3000);

    return () => clearInterval(intervalId);
  }, [isConnected, selectedAccountIdProp, currentUserId, send]);

  useEffect(() => {
    if (!portfolioSnapshot) return;
    
    // Process diff logic for websocket updates
    processDiff(portfolioSnapshot);

    setPortfolioData(prev => {
      // Preserve expiry_analysis if missing in snapshot but present in previous data
      const analysis = portfolioSnapshot.expiry_analysis || prev?.expiry_analysis;
      return {
        ...portfolioSnapshot,
        expiry_analysis: analysis
      };
    });
  }, [portfolioSnapshot, processDiff]);

  

  // Helper to get current underlying price from WS or Cache
  const getCurrentUnderlyingPrice = (symbol: string) => {
    const wsPrice = prices[symbol]?.price;
    if (wsPrice != null) return wsPrice;
    
    const sanitized = getSanitizedUnderlying(symbol);
    return underlyingCache[sanitized] ?? null;
  };

  const getMoneynessTag = (p: OptionsPosition) => {
    const full = p.opt_undl_code_full;
    const price = getCurrentUnderlyingPrice(full || activeSymbol);
    
    if (price == null) return null;
    const thr = 0.005;
    const diffRatio = Math.abs(price - p.strike) / Math.max(p.strike, 1);
    if (diffRatio <= thr) return { label: 'ATM', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' };
    const isCall = (p.type === 'call' || p.contract_type_zh === 'call');
    const isITM = isCall ? price > p.strike : price < p.strike;
    return isITM
      ? { label: 'ITM', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' }
      : { label: 'OTM', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100' };
  };

  

  // 本页面不订阅外部“打开编辑器”事件，保持弹窗一致

  useEffect(() => {
    const fetchCustomStrategies = async () => {
      try {
        
        let userId = DEMO_USER_ID;
        try {
          const authRes = await authService.getUser();
          const user = authRes?.data?.user;
          userId = user?.id || DEMO_USER_ID;
        } catch {
          // ignore and fallback
        }
        const { data, error } = await optionsService.getCustomStrategies(userId, selectedAccountIdProp || null);
        
        if (error) throw error;
        if (data) {
          setCustomStrategies(data);
        }
      } catch (error) {
        console.error('Error fetching custom strategies:', error as Error);
      }
    };

    fetchCustomStrategies();
  }, [selectedAccountIdProp]);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!selectedAccountIdProp) return;
      try {
        let userId = DEMO_USER_ID;
        try {
          const authRes = await authService.getUser();
          const user = authRes?.data?.user;
          userId = user?.id || DEMO_USER_ID;
        } catch {
          // ignore
        }
        
        const { data } = await optionsService.getOptionOrders(selectedAccountIdProp, userId, { only_today: true });
        
        if (data && data.length > 0) {
          // Sort by time desc
          const sorted = [...data].sort((a, b) => {
            const timeA = a.order_time ? new Date(a.order_time).getTime() : 0;
            const timeB = b.order_time ? new Date(b.order_time).getTime() : 0;
            return timeB - timeA;
          });
          
          setTodayOrders(sorted);
        } else {
          setTodayOrders([]);
        }
      } catch (error) {
        console.error('Error fetching orders:', error);
      }
    };
    
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [selectedAccountIdProp]);

  const toggleStrategyExpansion = (strategyId: string) => {
    setExpandedStrategies(prev => 
      prev.includes(strategyId) 
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  const isSelectedPosition = (p: OptionsPosition) => {
    return !!activeSymbol && (p.opt_undl_code_full === activeSymbol);
  };
  const getRowHighlightClass = (p: OptionsPosition) => {
    if (!isSelectedPosition(p)) return '';
    const tag = getMoneynessTag(p);
    if (!tag) return 'ring-1 ring-blue-300';
    if (tag.label === 'ATM') return 'ring-1 ring-blue-400';
    if (tag.label === 'ITM') return 'ring-1 ring-green-400';
    return 'ring-1 ring-amber-400';
  };

  // 开关指定到期日的选择模式
  const toggleExpirySelection = (expiry: string) => {
    setExpirySelectionMode(prev => ({ ...prev, [expiry]: !prev[expiry] }));
  };

  const isSelectingExpiry = (expiry: string) => !!expirySelectionMode[expiry];

  const handleClosePositions = async (ids: string[], meta?: { action?: string; comboType?: 'call' | 'put'; strike?: number; expiry?: string; strategyIds?: string[]; category?: string }, overrides?: Record<string, number>) => {
    if (!ids || ids.length === 0) return;
    try {
      logger.info('[OptionsPortfolio] handleClosePositions: start', { idsCount: ids.length, meta });
      const matchesMeta = (p: OptionsPosition) => {
        let ok = true;
        if (meta?.expiry) ok = ok && p.expiry === meta.expiry;
        if (meta?.strike != null) {
          const sv = Number(p.contract_strike_price ?? p.strike);
          ok = ok && sv === meta.strike;
        }
        if (meta?.comboType) {
          const t = p.type ?? p.contract_type_zh;
          ok = ok && (t === meta.comboType);
        }
        if (meta?.category) {
          const isCovered = p.position_type_zh === '备兑' || !!p.is_covered;
          if (meta.category === 'call_obligation') {
            ok = ok && ((p.type === 'call' || p.contract_type_zh === 'call') && p.position_type === 'sell' && !isCovered);
          } else if (meta.category === 'put_obligation') {
            ok = ok && ((p.type === 'put' || p.contract_type_zh === 'put') && p.position_type === 'sell' && !isCovered);
          } else if (meta.category === 'call_right') {
            ok = ok && ((p.type === 'call' || p.contract_type_zh === 'call') && p.position_type === 'buy');
          } else if (meta.category === 'put_right') {
            ok = ok && ((p.type === 'put' || p.contract_type_zh === 'put') && p.position_type === 'buy');
          } else if (meta.category === 'call_covered') {
            ok = ok && ((p.type === 'call' || p.contract_type_zh === 'call') && p.position_type === 'sell' && isCovered);
          } else if (meta.category === 'put_covered') {
            ok = ok && ((p.type === 'put' || p.contract_type_zh === 'put') && p.position_type === 'sell' && isCovered);
          }
        }
        return ok;
      };
      const collectPositions = (): OptionsPosition[] => {
        const list: OptionsPosition[] = [];
        (portfolioData?.expiryBuckets || []).forEach(bucket => {
          bucket.single.forEach(p => { if (ids.includes(p.id) && matchesMeta(p)) list.push(p); });
        });
        (portfolioData?.expiryGroups || []).forEach(group => {
          group.positions.forEach(p => { if (ids.includes(p.id) && matchesMeta(p) && !list.find(x => x.id === p.id)) list.push(p); });
        });
        (portfolioData?.strategies || []).forEach(s => {
          s.positions.forEach(p => { if (ids.includes(p.id) && matchesMeta(p) && !list.find(x => x.id === p.id)) list.push(p); });
        });
        logger.debug('[OptionsPortfolio] collectPositions: collected', { count: list.length });
        return list;
      };
      const selectedPositions = collectPositions();
      logger.debug('[OptionsPortfolio] selectedPositions', { ids: selectedPositions.map(p => p.id) });
      const rawSingles = (portfolioData?.expiryBuckets || []).flatMap(b => b.single);
      const rawPositions = selectedPositions.map(p => rawSingles.find(x => x.id === p.id) || p).map(pos => ({
        ...pos,
        option_type: pos.type,
        strike_price: String(pos.strike)
      }));
      const selectedPositionsWithQty = selectedPositions.map(p => {
        const override = overrides?.[p.id];
        const base = Number(p.selectedQuantity ?? p.leg_quantity ?? p.quantity);
        const qty = override ?? base;
        return { ...p, selectedQuantity: qty } as OptionsPosition;
      });
      const selectedIds = selectedPositions.map(p => p.id);
      logger.info('[OptionsPortfolio] syncing via updatePositions', { meta, count: selectedIds.length });
      const updates = selectedPositionsWithQty.map(p => {
        const base = Number(p.selectedQuantity ?? p.leg_quantity ?? p.quantity) || 0;
        const avail = Number(p.available ?? base) || 0;
        const defaultTarget = Math.max(0, Math.min(avail, avail));
        const targetQty = Math.max(0, Math.min(avail, overrides?.[p.id] ?? defaultTarget));
        return {
          id: p.id,
          type: p.type as 'call' | 'put',
          position_type: p.position_type,
          strike: Number(p.contract_strike_price ?? p.strike),
          expiry: p.expiry,
          quantity: targetQty,
          original_quantity: avail,
          change_quantity: targetQty - avail,
          is_covered: p.position_type_zh === '备兑' || !!p.is_covered,
          symbol: p.symbol,
          option_type: p.type,
          strike_price: String(p.strike)
        };
      });
      const { error } = await optionsService.updatePositions({ updates, positions: rawPositions, accountId: selectedAccountIdProp || null, userId: currentUserId || null });
      if (error) throw error;
      toast.success('同步成功');
      try {
        const { data: refreshed } = await optionsService.getOptionsPortfolio(currentUserId || DEMO_USER_ID, selectedAccountIdProp || null);
        if (refreshed) setPortfolioData(refreshed);
      } catch (refreshError) {
        console.error(refreshError);
      }
    } catch (e) {
      console.error(e as Error);
      toast.error('同步失败');
    }
  };

  // 根据 positionId 查找持仓，用于判断是否复杂策略
  const findPositionById = (positionId: string): OptionsPosition | undefined => {
    for (const group of portfolioData?.expiryGroups || []) {
      const found = group.positions.find(p => p.id === positionId);
      if (found) return found;
    }
    return undefined;
  };

  const setPositionSelected = (positionId: string, checked: boolean) => {
    setSelectedLegs(prev => {
      const next = { ...prev };
      if (checked) {
        // 若无数量则默认1
        next[positionId] = next[positionId] && next[positionId] > 0 ? next[positionId] : 1;
        // 在选择模式下：复杂策略不再同步到构建器
        const pos = findPositionById(positionId);
        const isComplex = pos ? (pos.type !== 'call' && pos.type !== 'put') : false;
        if (!isComplex) {
          emitAddLegToStrategy({ positionId, quantity: next[positionId] });
        }
      } else {
        delete next[positionId];
      }
      return next;
    });
  };

  const updateSelectedQuantity = (positionId: string, qty: number) => {
    const bounded = Math.max(1, qty);
    setSelectedLegs(prev => ({ ...prev, [positionId]: bounded }));
    // 在选择模式下：复杂策略不再同步到构建器
    const pos = findPositionById(positionId);
    const isComplex = pos ? (pos.type !== 'call' && pos.type !== 'put') : false;
    if (!isComplex) {
      emitAddLegToStrategy({ positionId, quantity: bounded });
    }
  };

  // 构建并保存本到期日所选腿为一个自定义策略
  const buildStrategyFromExpiry = async (
    expiry: string,
    overrides?: { name?: string; strategyCategory?: 'bullish' | 'bearish' | 'neutral' | 'volatility'; description?: string }
  ) => {
    try {
      const selectedIds = Object.keys(selectedLegs).filter(id => {
        const qty = selectedLegs[id];
        return qty && qty > 0;
      });

      if (selectedIds.length === 0) {
        toast.error('请先选择期权腿并设置数量');
        return;
      }

      // 聚合该到期组的持仓，匹配被选中的ID
      const group = portfolioData?.expiryGroups.find(g => g.expiry === expiry);
      if (!group) {
        toast.error('未找到该到期组');
        return;
      }

      const positions: OptionsPosition[] = group.positions
        .filter(p => selectedIds.includes(p.id))
        .map(p => ({
          ...p,
          selectedQuantity: Math.max(1, Math.min(selectedLegs[p.id] || 1, p.quantity)),
          // 以选择数量估算策略中的盈亏，不影响原始quantity
          profitLoss: (p.currentValue - p.premium) * (selectedLegs[p.id] || 1) * 100,
        }));

      // 基本策略信息：名称可用到期日+数量概述
      const defaultName = `${format(new Date(expiry), 'yyyy-MM-dd')} 自选组合 (${positions.length}腿)`;
      const defaultDescription = `基于到期日 ${format(new Date(expiry), 'yyyy-MM-dd')} 的多腿组合`;
      const name = overrides?.name?.trim() ? overrides!.name! : defaultName;
      const description = overrides?.description?.trim() ? overrides!.description! : defaultDescription;
      const strategyCategoryOverride = overrides?.strategyCategory || 'neutral';

      // 用户ID（若登录则使用真实，否则DEMO）
      let userId = DEMO_USER_ID;
      try {
        const authRes = await authService.getUser();
        const user = authRes?.data?.user;
        userId = user?.id || DEMO_USER_ID;
      } catch {
        // ignore
      }

      const payload: Omit<CustomOptionsStrategy, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        name,
        description,
        positions,
        strategyCategory: strategyCategoryOverride,
        riskLevel: 'medium',
        isPresetStrategy: false,
      };

      const { error } = await optionsService.saveCustomStrategy(payload);
      if (error) throw error;

      toast.success('组合构建并保存成功！');

      // 成功后：清理本到期的选择并退出选择模式
      setSelectedLegs(prev => {
        const next = { ...prev };
        positions.forEach(p => { delete next[p.id]; });
        return next;
      });
      setExpirySelectionMode(prev => ({ ...prev, [expiry]: false }));
    } catch (e) {
      console.error(e);
      toast.error('保存组合失败，请稍后重试');
    }
  };

  // 打开保存确认弹窗，并填充默认值（可编辑）
  const openSaveModal = (expiry: string) => {
    const group = (portfolioData?.expiryBuckets && portfolioData.expiryBuckets.length > 0)
      ? { expiry, positions: portfolioData.expiryBuckets.find(b => b.expiry === expiry)?.single || [] }
      : portfolioData?.expiryGroups.find(g => g.expiry === expiry);
    const selectedIds = Object.keys(selectedLegs).filter(id => selectedLegs[id] && selectedLegs[id] > 0);
    const positionsCount = group ? group.positions.filter(p => selectedIds.includes(p.id)).length : selectedIds.length;
    const currentPositions = group ? group.positions.filter(p => selectedIds.includes(p.id)) : [];
    const inferred = inferStrategyFromLegs(currentPositions);
    const inferredName = inferred ? inferred.nameZh : '自选组合';
    const defaultName = `${format(new Date(expiry), 'yyyy-MM-dd')} ${inferredName} (${positionsCount}腿)`;
    const defaultDescription = `基于到期日 ${format(new Date(expiry), 'yyyy-MM-dd')} 的多腿组合${inferred ? `，初步识别：${inferred.nameZh}` : ''}`;

    setModalExpiry(expiry);
    setSaveStrategyName(defaultName);
    setSaveStrategyCategory(inferred ? inferred.category : 'neutral');
    setSaveStrategyDescription(defaultDescription);
    setSaveModalOpen(true);
  };

  const closeSaveModal = () => {
    setSaveModalOpen(false);
    setModalExpiry(null);
    setIsModalSaving(false);
  };

  const confirmSaveModal = async () => {
  if (!modalExpiry) {
    logger.debug('[OptionsPortfolio] Guard: modalExpiry missing');
    return;
  }
    try {
      setIsModalSaving(true);
      await buildStrategyFromExpiry(modalExpiry, {
        name: saveStrategyName,
        strategyCategory: saveStrategyCategory,
        description: saveStrategyDescription,
      });
      closeSaveModal();
    } catch {
      setIsModalSaving(false);
    }
  };

  // ====== 策略类型初步解析（基于所选腿） ======
  type InferredResult = {
    nameZh: string;
    category: 'bullish' | 'bearish' | 'neutral' | 'volatility';
    confidence: number; // 0~1
  };

  const inferStrategyFromLegsInternal = (legs: OptionsPosition[]): InferredResult | null => {
    if (!legs || legs.length === 0) return null;

    const byType = {
      call: legs.filter(l => l.type === 'call'),
      put: legs.filter(l => l.type === 'put')
    };
    const getQty = (l: OptionsPosition) => selectedLegs[l.id] || 0;
    const totalLegs = legs.reduce((acc, l) => acc + (getQty(l) > 0 ? 1 : 0), 0);
    const calls = byType.call.filter(l => getQty(l) > 0);
    const puts = byType.put.filter(l => getQty(l) > 0);

    const sortByStrikeAsc = (arr: OptionsPosition[]) => [...arr].sort((a,b)=>a.strike-b.strike);

    // 单腿
    if (totalLegs === 1) {
      const l = legs.find(x => getQty(x) > 0)!;
      if (l.type === 'call') {
        return { nameZh: l.position_type === 'buy' ? '买入看涨' : '卖出看涨', category: l.position_type === 'buy' ? 'bullish' : 'bearish', confidence: 0.9 };
      } else if (l.type === 'put') {
        return { nameZh: l.position_type === 'buy' ? '买入看跌' : '卖出看跌', category: l.position_type === 'buy' ? 'bearish' : 'bullish', confidence: 0.9 };
      }
    }

    // 垂直价差（看涨/看跌）
    if (calls.length === 2 && puts.length === 0) {
      const [c1, c2] = sortByStrikeAsc(calls);
      const q1 = getQty(c1), q2 = getQty(c2);
      if (q1 === q2 && q1 > 0) {
        if (c1.position_type === 'buy' && c2.position_type === 'sell') {
          return { nameZh: '牛市看涨价差', category: 'bullish', confidence: 0.95 };
        }
        if (c1.position_type === 'sell' && c2.position_type === 'buy') {
          return { nameZh: '熊市看涨价差', category: 'bearish', confidence: 0.95 };
        }
      }
    }
    if (puts.length === 2 && calls.length === 0) {
      const [p1, p2] = sortByStrikeAsc(puts);
      const q1 = getQty(p1), q2 = getQty(p2);
      if (q1 === q2 && q1 > 0) {
        if (p1.position_type === 'sell' && p2.position_type === 'buy') {
          return { nameZh: '牛市看跌价差', category: 'bullish', confidence: 0.95 };
        }
        if (p1.position_type === 'buy' && p2.position_type === 'sell') {
          return { nameZh: '熊市看跌价差', category: 'bearish', confidence: 0.95 };
        }
      }
    }

    // 跨式 / 勒式
    if (calls.length === 1 && puts.length === 1) {
      const c = calls[0], p = puts[0];
      const qc = getQty(c), qp = getQty(p);
      if (qc === qp && qc > 0 && c.position_type === 'buy' && p.position_type === 'buy') {
        if (c.strike === p.strike) {
          return { nameZh: '买入跨式', category: 'volatility', confidence: 0.9 };
        } else {
          return { nameZh: '买入勒式', category: 'volatility', confidence: 0.9 };
        }
      }
    }

    // 铁鹰：卖出看涨价差 + 卖出看跌价差（各两腿）
    if (calls.length === 2 && puts.length === 2) {
      const [c1, c2] = sortByStrikeAsc(calls);
      const [p1, p2] = sortByStrikeAsc(puts);
      const spreadCallShort = c1.position_type === 'sell' && c2.position_type === 'buy';
      const spreadPutShort = p1.position_type === 'sell' && p2.position_type === 'buy';
      const qtyOk = getQty(c1) === getQty(c2) && getQty(p1) === getQty(p2) && getQty(c1) === getQty(p1) && getQty(c1) > 0;
      if (spreadCallShort && spreadPutShort && qtyOk) {
        return { nameZh: '铁鹰（Iron Condor）', category: 'neutral', confidence: 0.9 };
      }
    }

    // 蝶式（基于看涨）：买入低、卖出中x2、买入高
    if (calls.length >= 3 && puts.length === 0) {
      const sorted = sortByStrikeAsc(calls);
      if (sorted.length === 3) {
        const [low, mid, high] = sorted;
        const qLow = getQty(low), qMid = getQty(mid), qHigh = getQty(high);
        const pattern = low.position_type === 'buy' && mid.position_type === 'sell' && high.position_type === 'buy' && qMid === qLow * 2 && qLow === qHigh && qLow > 0;
        if (pattern) return { nameZh: '蝶式价差（看涨）', category: 'neutral', confidence: 0.85 };
      }
    }

    // 兜底：返回中性分类
    return { nameZh: '自选组合', category: 'neutral', confidence: 0.5 };
  };

  const inferStrategyFromLegs = (legs: OptionsPosition[]): InferredResult | null => {
    return inferStrategyFromLegsInternal(legs);
  };

  // 生成策略ID的逻辑
  const getStrategyId = (position: OptionsPosition, index: number): string => {
    // 规范化策略名，兼容 snake_case/大小写
    const normalized = (position.strategy || '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    if (normalized.includes('SPREAD') || normalized.includes('CONDOR') || normalized.includes('BUTTERFLY')) {
      return `STR-${normalized.replace(/\s+/g, '')}-${Math.floor(index / 2) + 1}`;
    } else if (normalized.includes('STRADDLE') || normalized.includes('STRANGLE')) {
      return `VOL-${normalized.replace(/\s+/g, '')}-${Math.floor(index / 2) + 1}`;
    } else {
      return `SINGLE-${(position.type || 'unknown').toUpperCase()}-${index + 1}`;
    }
  };

  // 判断是否为单腿期权
  const isSingleLegPosition = (position: OptionsPosition): boolean => {
    return position.strategy === 'Long Call' || 
           position.strategy === 'Long Put' || 
           position.strategy === 'Covered Call' || 
           position.strategy === 'Protective Put';
  };

  

  const getStatusColor = (status: OptionsPosition['status']) => {
    switch (status) {
      case 'open':
        return theme === 'dark' 
          ? 'bg-green-900 text-green-100' 
          : 'bg-green-100 text-green-800';
      case 'closed':
        return theme === 'dark' 
          ? 'bg-blue-900 text-blue-100' 
          : 'bg-blue-100 text-blue-800';
      case 'expired':
        return theme === 'dark'
          ? 'bg-red-900 text-red-100'
          : 'bg-red-100 text-red-800';
      default:
        return theme === 'dark'
          ? 'bg-gray-700 text-gray-100'
          : 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: OptionsPosition['type']) => {
    switch (type) {
      case 'call':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'put':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'spread':
      case 'iron_condor':
      case 'butterfly':
        return <Target className="w-4 h-4 text-purple-500" />;
      case 'straddle':
      case 'strangle':
        return <Activity className="w-4 h-4 text-orange-500" />;
      default:
        return <Shield className="w-4 h-4 text-gray-500" />;
    }
  };

  const getDaysToExpiryColor = (days: number) => {
    if (days <= 7) return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900';
    if (days <= 30) return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900';
    return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900';
  };

  const filterAndSortPositions = useCallback((positions: OptionsPosition[]) => {
    // Always clone the array to avoid mutating the original prop
    let filtered = [...positions];
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(pos => pos.status === statusFilter);
    }
    
    return filtered.sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'expiry':
          return multiplier * (new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
        case 'profitLoss':
          return multiplier * (a.profitLoss - b.profitLoss);
        case 'symbol':
          return multiplier * a.symbol.localeCompare(b.symbol);
        default:
          return 0;
      }
    });
  }, [statusFilter, sortBy, sortDirection]);

  const computeCombosForPositions = (strategy: OptionsStrategy, type: 'call' | 'put') => computeCombosForStrategy(strategy, type);

  if (isLoading && !portfolioData) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md p-8`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${themes[theme].text}`}>正在加载期权投资组合...</p>
        </div>
      </div>
    );
  }

  if (!portfolioData) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md p-8`}>
        <div className="text-center">
          <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
          <p className={`text-lg font-medium ${themes[theme].text}`}>暂无期权持仓</p>
          <p className={`text-sm ${themes[theme].text} opacity-75`}>
            您还没有任何期权持仓
          </p>
        </div>
      </div>
    );
  }

  const allPositionsSource = (portfolioData?.expiryBuckets && portfolioData.expiryBuckets.length > 0)
    ? portfolioData.expiryBuckets.map(b => ({ expiry: b.expiry, positions: b.single }))
    : [];
  const allPositions = allPositionsSource
    .flatMap(group => group.positions)
    .filter(position => statusFilter === 'all' || position.status === statusFilter)
    .map((position, index) => {
      // 为缺失id生成稳定ID
      const safeId = position.id ?? `pos-${index}-${(position.symbol || 'SYM')}-${(position.expiry || 'EXP')}`;
      const extendedPosition: ExtendedOptionsPosition = {
        ...position,
        id: safeId,
        strategy_id: getStrategyId(position, index),
        is_single_leg: isSingleLegPosition(position)
      };
      return extendedPosition;
    });

  let groupedStrategies = new Map<string, ExtendedOptionsPosition[]>();
  let singleLegs: ExtendedOptionsPosition[] = [];

  if (Array.isArray(portfolioData.expiryBuckets) && portfolioData.expiryBuckets.length > 0) {
    singleLegs = portfolioData.expiryBuckets.flatMap(b => b.single)
      .filter(position => statusFilter === 'all' || position.status === statusFilter)
      .map((position, index) => {
        const safeId = position.id ?? `pos-single-${index}-${(position.symbol || 'SYM')}-${(position.expiry || 'EXP')}`;
        return {
          ...position,
          id: safeId,
          strategy_id: getStrategyId(position, index),
          is_single_leg: true,
        } as ExtendedOptionsPosition;
      });
  }

  if (Array.isArray(portfolioData.expiryBuckets) && portfolioData.expiryBuckets.length > 0) {
    groupedStrategies = new Map<string, ExtendedOptionsPosition[]>();
    portfolioData.expiryBuckets.forEach(bucket => {
      bucket.complex.forEach(strategy => {
        const positions = filterAndSortPositions(strategy.positions)
          .filter(position => statusFilter === 'all' || position.status === statusFilter)
          .map((position, index) => {
            const safeId = position.id ?? `pos-strategy-${index}-${(position.symbol || 'SYM')}-${(position.expiry || 'EXP')}`;
            return {
              ...position,
              id: safeId,
              strategy_id: strategy.id || getStrategyId(position, index),
              is_single_leg: false,
            } as ExtendedOptionsPosition;
          });
        if (positions.length > 0 && strategy.id) groupedStrategies.set(strategy.id, positions);
      });
    });
  }

  // 根据复杂仓位打开保存弹窗（预选同策略ID且同到期日的腿）
  const openEditForComplexPosition = (position: ExtendedOptionsPosition) => {
    const strategyId = position.strategy_id;
    if (!strategyId) {
      logger.debug('[OptionsPortfolio] Missing strategy_id for position, skip edit', {
        positionId: position.id,
        symbol: position.symbol,
        expiry: position.expiry,
        strategy: position.strategy,
        type: position.type,
      });
      return;
    }
    const expiry = position.expiry;

    const legs = allPositions.filter(p => p.strategy_id === strategyId && p.expiry === expiry);

    setSelectedLegs(prev => {
      const next = { ...prev };
      legs.forEach(l => {
        next[l.id] = Math.max(1, l.selectedQuantity || l.quantity || 1);
      });
      return next;
    });

    openSaveModal(expiry);
  };

  const loadAdvisedCombination = (combo: AdvisedCombination) => {
    if (!combo || !combo.expiry) return;
    setExpirySelectionMode(prev => ({ ...prev, [combo.expiry]: true }));
    setModalExpiry(combo.expiry);
    const ids: string[] = [];
    const buyId = combo.buy_position?.position?.id;
    const sellId = combo.sell_position?.position?.id;
    if (buyId) ids.push(buyId);
    if (sellId) ids.push(sellId);
    ids.forEach(id => setPositionSelected(id, true));
    ids.forEach(id => updateSelectedQuantity(id, Math.max(1, combo.quantity)));
    setSaveStrategyName(combo.description || '组合建议');
  };

  const executeAdvisedCombination = async (combo: AdvisedCombination) => {
    try {
      const { error } = await optionsService.executeCombination({ ...combo, quantity: Math.max(1, combo.quantity) }, selectedAccountIdProp || null, currentUserId || null);
      if (error) throw error;
      toast.success('已执行组合建议');
      try {
        const { data: refreshed } = await optionsService.getOptionsPortfolio(currentUserId || DEMO_USER_ID, selectedAccountIdProp || null);
        if (refreshed) setPortfolioData(refreshed);
      } catch (refreshError) {
        console.error(refreshError);
      }
    } catch (e) {
      toast.error('执行失败');
      console.error(e);
    }
  };

  // 不再使用独立编辑器更新回调

  return (
    <div className="space-y-6">
      {portfolioData.is_snapshot && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 dark:bg-amber-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <Activity className="h-5 w-5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm text-amber-700 dark:text-amber-200 sm:whitespace-nowrap">
                当前显示的数据为快照数据，可能与实时市场状态存在延迟。
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Portfolio Overview */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                  期权投资组合概览
                </h2>
                <button
                  onClick={() => setIsLogOpen(true)}
                  className={`ml-2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${themes[theme].text} relative`}
                  title="查看持仓变动日志"
                >
                  <Activity className="w-5 h-5" />
                  {activityLogs.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                  )}
                </button>
              </div>
              {activeSymbol && getCurrentUnderlyingPrice(activeSymbol) != null && (
                <div className="flex items-center gap-3">
            <span className={`text-sm ${themes[theme].text}`}>当前价 {getCurrentUnderlyingPrice(activeSymbol)!.toFixed(4)}</span>
          </div>
              )}
            </div>
          </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总金额 balance</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(portfolioData.balance ?? 0, currencyConfig, 4)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>可用金额 available</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(portfolioData.available ?? 0, currencyConfig, 4)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>当前仓位盈亏 position_profit</h3>
              <p className={`text-2xl font-bold mt-1 ${(portfolioData.position_profit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(portfolioData.position_profit ?? 0) >= 0 ? '+' : ''}{formatCurrency(Math.abs(portfolioData.position_profit ?? 0), currencyConfig, 4)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>当前使用保证金 real_used_margin</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(portfolioData.real_used_margin ?? 0, currencyConfig, 4)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Subject Positions (Underlying Assets) */}
      {portfolioData.subject_positions && portfolioData.subject_positions.length > 0 && (
        <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6 border-b border-gray-200">
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              标的物持仓
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {portfolioData.subject_positions.map((pos, idx) => (
                <div key={idx} className={`${themes[theme].background} rounded-lg p-4 border border-gray-200 dark:border-gray-700`}>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className={`text-lg font-bold ${themes[theme].text}`}>{pos.stock_code}</h3>
                    <span className={`text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100`}>
                      标的
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className={`text-sm ${themes[theme].text} opacity-75`}>当前价格</span>
                      <span className={`text-sm font-medium ${themes[theme].text}`}>{pos.stock_price != null ? formatCurrency(pos.stock_price, currencyConfig, 4) : '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-sm ${themes[theme].text} opacity-75`}>持仓市值</span>
                      <span className={`text-sm font-medium ${themes[theme].text}`}>{pos.total_stock_price != null ? formatCurrency(pos.total_stock_price, currencyConfig, 4) : '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-sm ${themes[theme].text} opacity-75`}>总持仓</span>
                      <span className={`text-sm font-bold ${themes[theme].text}`}>{pos.total_volume.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-sm ${themes[theme].text} opacity-75`}>备兑锁定</span>
                      <span className={`text-sm font-medium ${themes[theme].text}`}>{pos.covered_volume.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-sm ${themes[theme].text} opacity-75`}>其他锁定</span>
                      <span className={`text-sm font-medium ${themes[theme].text}`}>{pos.lock_volume.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Today's Orders */}
      {todayOrders.length > 0 && (
        <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6 border-b border-gray-200">
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              今日订单
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className={`min-w-full divide-y ${themes[theme].divide}`}>
              <thead className={themes[theme].tableHeader}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">方向</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">价格</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">数量 (成/总)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">策略/备注</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${themes[theme].divide}`}>
                {todayOrders.map((order, idx) => (
                  <tr key={idx} className={themes[theme].tableRow}>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themes[theme].text}`}>
                      {order.order_time ? (order.order_time.split(' ')[1] || order.order_time) : '-'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themes[theme].text}`}>
                      <div className="font-medium">{order.instrument_name}</div>
                      {order.is_combination && (
                        <span className="text-xs text-purple-500 bg-purple-100 dark:bg-purple-900 px-1 rounded">组合</span>
                      )}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm`}>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        ((order.op_type_name || '').includes('OPEN') || (order.op_type_name_zh || '').includes('开')) 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {order.op_type_name_zh || order.op_type_name}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themes[theme].text}`}>
                      {order.order_status_name}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${themes[theme].text}`}>
                      <div>限: {formatCurrency(order.limit_price, currencyConfig)}</div>
                      {order.traded_price > 0 && <div className="text-gray-500 text-xs">成: {formatCurrency(order.traded_price, currencyConfig)}</div>}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${themes[theme].text}`}>
                      {order.volume_traded} / {order.volume_total_original}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themes[theme].text}`}>
                      <div>{order.strategy_name}</div>
                      {order.compact_no && (
                        <div className="text-xs text-purple-600 dark:text-purple-400">
                          组合编号: {order.compact_no}
                        </div>
                      )}
                      {order.contract_ids && order.contract_ids.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1" title={order.contract_ids.join(', ')}>
                          合约: {order.contract_ids.length > 1 ? `${order.contract_ids.length}个合约` : order.contract_ids[0]}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">{order.remark}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Controls - REMOVED */}

      {/* Portfolio Content */}
      {viewMode === 'grouped' && (
        <div className="space-y-8">
          {/* 策略组合 */}
          {groupedStrategies.size > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-5 h-5 text-purple-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  策略组合 ({groupedStrategies.size} 个策略)
                </h3>
              </div>
              <div className="space-y-6">
                {Array.from(groupedStrategies.entries()).map(([strategyId, positions]) => (
                  <div key={strategyId} className={`${themes[theme].background} rounded-lg p-4 border-l-4 border-purple-500`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-purple-500" />
                        <span className={`text-sm font-mono ${themes[theme].text} bg-purple-100 dark:bg-purple-900 px-2 py-1 rounded`}>
                          {strategyId}
                        </span>
                        <span className={`text-sm ${themes[theme].text} opacity-75`}>
                          {positions[0].strategy} ({positions.length} 腿)
                        </span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${themes[theme].text}`}>
                          总成本: {formatCurrency(positions.reduce((sum, p) => sum + p.premium * p.quantity * 100, 0), currencyConfig)}
                        </div>
                        <div className={`text-sm ${
                          positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
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
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                    {positionInfo.label}
                                  </span>
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
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
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

          {/* 单腿期权 */}
          {singleLegs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-blue-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  单腿期权 ({singleLegs.length} 个持仓)
                </h3>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Call期权列 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <h4 className={`text-md font-medium ${themes[theme].text}`}>
                      Call期权 ({singleLegs.filter(p => p.type === 'call').length})
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {singleLegs.filter(p => p.type === 'call').map((position) => {
                      const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
                      const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      
                      return (
                        <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border-l-4 ${
                          position.position_type === 'buy' ? 'border-blue-500' : 'border-orange-500'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-mono ${themes[theme].text} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>
                                {position.strategy_id}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                {positionInfo.label}
                              </span>
                            </div>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                              {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {position.symbol} {position.strike} CALL
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                  到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
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
                              <div className={`text-xs ${themes[theme].text} opacity-75 mt-2 p-2 ${themes[theme].background} rounded`}>
                                {position.notes}
                              </div>
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

                {/* Put期权列 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <h4 className={`text-md font-medium ${themes[theme].text}`}>
                      Put期权 ({singleLegs.filter(p => p.type === 'put').length})
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {singleLegs.filter(p => p.type === 'put').map((position) => {
                      const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh, position.is_covered);
                      const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      
                      return (
                        <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border-l-4 ${
                          position.position_type === 'buy' ? 'border-blue-500' : 'border-orange-500'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-mono ${themes[theme].text} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>
                                {position.strategy_id}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                {positionInfo.label}
                              </span>
                            </div>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                              {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {position.symbol} {position.strike} PUT
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                  到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
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
                              <div className={`text-xs ${themes[theme].text} opacity-75 mt-2 p-2 ${themes[theme].background} rounded`}>
                                {position.notes}
                              </div>
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

          {/* 自定义策略显示 */}
          {customStrategies.length > 0 && (
            <div className="mt-8">
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4 flex items-center gap-2`}>
                <Layers className="w-5 h-5 text-purple-500" />
                自定义策略 ({customStrategies.length})
              </h3>
              <div className="space-y-4">
                {customStrategies.map((strategy) => {
                  const isExpanded = expandedStrategies.includes(strategy.id);
                  const totalCost = strategy.positions.reduce((sum, pos) => 
                    sum + (pos.premium * (pos.selectedQuantity || pos.quantity) * 100), 0);
                  const currentValue = strategy.positions.reduce((sum, pos) => 
                    sum + (pos.currentValue * (pos.selectedQuantity || pos.quantity) * 100), 0);
                  const profitLoss = currentValue - totalCost;
                  const profitLossPercentage = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;
                  
                  return (
                    <div key={strategy.id} className={`${themes[theme].background} rounded-lg border ${themes[theme].border}`}>
                      <div 
                        className={`p-4 cursor-pointer ${themes[theme].cardHover}`}
                        onClick={() => toggleStrategyExpansion(strategy.id)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              {strategy.strategyCategory && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  strategy.strategyCategory === 'bullish' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                                  strategy.strategyCategory === 'bearish' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                                  strategy.strategyCategory === 'volatility' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100' :
                                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                                }`}>
                                  {strategy.strategyCategory === 'bullish' ? '看涨' :
                                   strategy.strategyCategory === 'bearish' ? '看跌' :
                                   strategy.strategyCategory === 'volatility' ? '波动率' : '中性'}
                                </span>
                              )}
                              {strategy.riskLevel && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  strategy.riskLevel === 'low' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' :
                                  strategy.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' :
                                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                                }`}>
                                  {strategy.riskLevel === 'low' ? '低风险' :
                                   strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                                </span>
                              )}
                            </div>
                            <div>
                              <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                {strategy.name}
                              </h4>
                              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                                {strategy.description}
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                                {strategy.positions.length} 个期权 • 创建于 {new Date(strategy.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className={`text-lg font-semibold ${
                                profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(profitLoss), currencyConfig, 4)}
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-75`}>
                                ({profitLossPercentage >= 0 ? '+' : ''}{profitLossPercentage.toFixed(2)}%)
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-60`}>
                                成本: {formatCurrency(totalCost, currencyConfig, 4)}
                              </p>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
                            ) : (
                              <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-4 pb-4">
                          <div className="space-y-2">
                            <h5 className={`text-sm font-medium ${themes[theme].text} mb-3`}>
                              包含的期权持仓
                            </h5>
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
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                              {positionInfo.label}
                                            </span>
                                          </div>
                                          <span className={`text-xs ${themes[theme].text} opacity-75`}>
                                            到期: {format(new Date(position.expiry), 'MM-dd')}
                                          </span>
                                        </div>
                                        <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                                          数量: {position.selectedQuantity || position.quantity}
                                          {position.selectedQuantity && position.selectedQuantity !== position.quantity && (
                                            <span className="text-blue-600 ml-1">
                                              (原始: {position.quantity})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className={`text-sm font-medium ${
                                        adjustedProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {adjustedProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(adjustedProfitLoss), currencyConfig, 4)}
                                      </div>
                                      <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                        成本: {formatCurrency(adjustedCost, currencyConfig, 4)}
                                      </div>
                                      <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                        当前: {formatCurrency(adjustedValue, currencyConfig, 4)}
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
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === 'expiry' ? (
        <div className="space-y-6">
          {(() => {
            const groups = (portfolioData.expiryBuckets && portfolioData.expiryBuckets.length > 0
              ? portfolioData.expiryBuckets
              : (portfolioData.expiryGroups || []).map(g => ({
                  expiry: g.expiry,
                  daysToExpiry: g.daysToExpiry,
                  single: g.positions,
                  complex: []
                }))
            );

            return (
              <>
                {/* Table of Contents */}
                <div className={`${themes[theme].card} rounded-lg p-4 mb-6 flex flex-wrap gap-3 sticky top-16 z-40 shadow-md bg-opacity-95 backdrop-blur-sm transition-all duration-200`}>
                  <div className={`text-sm font-medium ${themes[theme].text} flex items-center mr-2`}>
                    <Layers className="w-4 h-4 mr-1" />
                    快速导航:
                  </div>
                  {groups.map(group => {
                     // Calculate total P&L for the group
                     const singlePL = group.single.reduce((sum, p) => sum + p.profitLoss, 0);
                     const complexPL = group.complex.reduce((sum, s) => sum + s.profitLoss, 0);
                     const totalPL = singlePL + complexPL;
                     const isProfitable = totalPL >= 0;

                     const analysis = portfolioData.expiry_analysis?.[group.expiry];
                     const worstCalls = analysis?.exercise_analysis?.call_obligation_count_worst ?? 0;
                     const worstPuts = analysis?.exercise_analysis?.put_obligation_count_worst ?? 0;
                     const hasObligations = worstCalls > 0 || worstPuts > 0;
                     
                     // Calculate total margin for the group
                     const totalMargin = group.single.reduce((sum, p) => sum + (p.margin || 0), 0) +
                                       group.complex.reduce((sum, s) => sum + s.positions.reduce((pSum, p) => pSum + (p.margin || 0), 0), 0);
                     
                     return (
                      <button
                        key={group.expiry}
                        onClick={() => {
                          const el = document.getElementById(`expiry-group-${group.expiry}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all flex items-center gap-2
                          ${activeExpiry === group.expiry ? 'ring-2 ring-blue-500 shadow-sm scale-105' : ''}
                          ${expandedExpiryGroups[group.expiry] 
                            ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300' 
                            : `${themes[theme].background} ${themes[theme].border} ${themes[theme].text} opacity-75 hover:opacity-100`
                          }`}
                      >
                        <span>{group.expiry}</span>
                        <div className="flex flex-col items-end leading-tight">
                          <span className={isProfitable ? 'text-green-600' : 'text-red-600'}>
                            {isProfitable ? '+' : ''}{formatCurrency(Math.abs(totalPL), currencyConfig, 4)}
                          </span>
                          {totalMargin > 0 && (
                            <span className="text-[10px] opacity-75 text-amber-600 dark:text-amber-400 font-mono">
                              保:{formatCurrency(totalMargin, currencyConfig, 0)}
                            </span>
                          )}
                        </div>
                        {hasObligations && (
                           <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${theme === 'dark' ? 'bg-red-900/30 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-600'}`}>
                             {worstCalls > 0 && <span>C:{worstCalls}</span>}
                             {worstPuts > 0 && <span>P:{worstPuts}</span>}
                           </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {groups.map((group) => {
                  return (
                  <div key={group.expiry} id={`expiry-group-${group.expiry}`}>
                    <ExpiryGroupCard
                      theme={theme}
                      whitelists={whitelists}
                      group={group}
                      statusFilter={statusFilter}
                      filterAndSortPositions={filterAndSortPositions}
                      isSelectingExpiry={isSelectingExpiry}
                      toggleExpirySelection={toggleExpirySelection}
                      openSaveModal={openSaveModal}
                      selectedLegs={selectedLegs}
                      setPositionSelected={setPositionSelected}
                      updateSelectedQuantity={updateSelectedQuantity}
                      currencyConfig={currencyConfig}
                      getDaysToExpiryColor={getDaysToExpiryColor}
                      getTypeIcon={getTypeIcon}
                      getStatusColor={getStatusColor}
                      getPositionTypeInfo2={getPositionTypeInfo2}
                      computeCombosForPositions={computeCombosForPositions}
                      allExpiryBuckets={portfolioData.expiryBuckets || []}
                      selectedSymbol={activeSymbol}
                      underlyingPrice={getCurrentUnderlyingPrice(activeSymbol)}
                      onClosePositions={handleClosePositions}
                      isRefreshing={isLoading}
                      advisedCombinations={(portfolioData.advised_combinations || []).filter(c => c.expiry === group.expiry)}
                      onLoadAdvised={loadAdvisedCombination}
                      onExecuteAdvised={executeAdvisedCombination}
                      selectedAccountId={selectedAccountIdProp || null}
                      userId={currentUserId || null}
                      optionsData={optionsData}
                      optionsDataMap={internalOptionsDataMap}
                      isExpanded={!!expandedExpiryGroups[group.expiry]}
                      onToggleExpand={() => toggleExpiryGroup(group.expiry)}
                      isTBoardExpanded={tBoardExpandedGroups[group.expiry] !== false}
                      onToggleTBoard={() => toggleTBoardGroup(group.expiry)}
                      analysis={portfolioData.expiry_analysis?.[group.expiry]}
                    />
                  </div>
                );
                })}
              </>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-6">
          {(portfolioData.complexStrategies || []).map((strategy) => {
            const filteredPositions = filterAndSortPositions(strategy.positions);
            if (filteredPositions.length === 0) return null;

            return (
              <div key={strategy.id} className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                        {strategy.name}
                      </h3>
                      <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                        {strategy.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          strategy.category === 'bullish' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                          strategy.category === 'bearish' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                          strategy.category === 'neutral' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100' :
                          'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100'
                        }`}>
                          {strategy.category === 'bullish' ? '看涨' :
                           strategy.category === 'bearish' ? '看跌' :
                           strategy.category === 'neutral' ? '中性' : '波动'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          strategy.riskLevel === 'low' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                          strategy.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' :
                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                        }`}>
                          {strategy.riskLevel === 'low' ? '低风险' :
                           strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                        </span>
                        <span className={`text-sm ${themes[theme].text} opacity-75`}>
                          {filteredPositions.length} 个持仓
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {strategy.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(strategy.profitLoss), currencyConfig, 4)}
                      </p>
                      <p className={`text-sm ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ({strategy.profitLossPercentage >= 0 ? '+' : ''}{strategy.profitLossPercentage.toFixed(2)}%)
                      </p>
                      <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                        当前价值: {formatCurrency(strategy.currentValue, currencyConfig, 4)}
                      </p>
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
                          {/* Call和Put期权两列展示 */}
                          {(callPositions.length > 0 || putPositions.length > 0) && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Call期权列 */}
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
                                        className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor} ${getRowHighlightClass(position)}`}
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
                                                  {(() => { const tag = getMoneynessTag(position); return tag ? (<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.className}`}>{tag.label}</span>) : null; })()}
                                                </div>
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  数量: {position.quantity}
                                                </span>
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig, 4)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                            </div>
                                            <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                              {position.status === 'open' ? '持仓中' : 
                                               position.status === 'closed' ? '已平仓' : '已到期'}
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
                                      <p className={`${themes[theme].text} opacity-75`}>
                                        暂无Call期权持仓
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Put期权列 */}
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
                                        className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor} ${getRowHighlightClass(position)}`}
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
                                                  {(() => { const tag = getMoneynessTag(position); return tag ? (<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.className}`}>{tag.label}</span>) : null; })()}
                                                </div>
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  数量: {position.quantity}
                                                </span>
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig, 4)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                            </div>
                                            <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                              {position.status === 'open' ? '持仓中' : 
                                               position.status === 'closed' ? '已平仓' : '已到期'}
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
                                      <p className={`${themes[theme].text} opacity-75`}>
                                        暂无Put期权持仓
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 复杂策略期权（价差、跨式等）单独展示 */}
                          {spreadPositions.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                                <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                  复杂策略 ({spreadPositions.length})
                                </h4>
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
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                  {positionInfo.label}
                                                </span>
                                              </div>
                                            </div>
                                            <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                              到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                            </div>
                                            <div className="flex items-center gap-3 mt-2 text-xs">
                                              <span className={`${themes[theme].text} opacity-75`}>
                                                数量: {position.quantity}
                                              </span>
                                              <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig, 4)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig, 4)}
                                            </div>
                                            <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                          </div>
                                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                            {position.status === 'open' ? '持仓中' : 
                                             position.status === 'closed' ? '已平仓' : '已到期'}
                                          </span>
                                          {!isSelectingExpiry(position.expiry) && (
                                            <button
                                              type="button"
                                              onClick={() => openEditForComplexPosition(position as ExtendedOptionsPosition)}
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
      )}

      {/* 保存确认弹窗 */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeSaveModal} />
          <div className={`${themes[theme].card} relative z-10 w-full max-w-md rounded-lg shadow-lg p-6`}>
            <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>确认保存组合</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-sm ${themes[theme].text} opacity-75`}>策略名称</label>
                <input
                  type="text"
                  value={saveStrategyName}
                  onChange={(e) => setSaveStrategyName(e.target.value)}
                  className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
                  placeholder="请输入策略名称"
                />
              </div>
              <div>
                <label className={`text-sm ${themes[theme].text} opacity-75`}>组合类型</label>
                <select
                  value={saveStrategyCategory}
                  onChange={(e) => setSaveStrategyCategory(e.target.value as typeof saveStrategyCategory)}
                  className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="neutral">中性</option>
                  <option value="bullish">看涨</option>
                  <option value="bearish">看跌</option>
                  <option value="volatility">波动率</option>
                </select>
              </div>
              {/* 识别结果与腿预览（支持编辑） */}
              <div className="border rounded p-3">
                <div className={`text-sm font-medium ${themes[theme].text} mb-2`}>组合预览与编辑</div>
                <div className="max-h-48 overflow-auto space-y-2">
                  {(portfolioData?.expiryGroups?.find(g => g.expiry === modalExpiry)?.positions || [])
                    .map(p => {
                      const checked = !!selectedLegs[p.id] && selectedLegs[p.id] > 0;
                      const qty = selectedLegs[p.id] || 0;
                      return (
                        <div key={`${p.id ?? 'noid'}-${p.symbol}-${p.strike}-${p.type}-${p.expiry}`} className="flex items-center justify-between text-xs gap-2">
                          <label className={`flex items-center gap-2 ${themes[theme].text}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setPositionSelected(p.id, e.target.checked)}
                            />
                            <span>
                              {p.symbol} {p.expiry} {p.type === 'call' ? '看涨' : p.type === 'put' ? '看跌' : p.strategy} {p.position_type === 'buy' ? '买入' : '卖出'} @ {p.strike}
                            </span>
                          </label>
                          <div className="flex items-center gap-1">
                            <span className={`${themes[theme].text} opacity-70`}>数量</span>
                            <input
                              type="number"
                              min={1}
                              max={p.quantity}
                              value={checked ? qty : 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                const clamped = Math.max(checked ? 1 : 0, Math.min(val, p.quantity));
                                updateSelectedQuantity(p.id, clamped);
                              }}
                              className={`w-20 px-2 py-1 rounded ${themes[theme].input} ${themes[theme].text}`}
                              disabled={!checked}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
                {/* 实时识别提示 */}
                {(() => {
                  const group = portfolioData?.expiryGroups?.find(g => g.expiry === modalExpiry);
                  const selectedIds = Object.keys(selectedLegs).filter(id => selectedLegs[id] && selectedLegs[id] > 0);
                  const positions = group ? group.positions.filter(p => selectedIds.includes(p.id)) : [];
                  const inferred = inferStrategyFromLegs(positions);
                  return (
                    <div className={`mt-2 text-xs ${themes[theme].text}`}>
                      初步识别：{inferred ? `${inferred.nameZh}（置信度 ${Math.round(inferred.confidence*100)}%）` : '无法识别'}
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className={`text-sm ${themes[theme].text} opacity-75`}>描述</label>
                <textarea
                  value={saveStrategyDescription}
                  onChange={(e) => setSaveStrategyDescription(e.target.value)}
                  className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
                  rows={3}
                  placeholder="可选，添加组合描述"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={closeSaveModal}
                className={`px-3 py-2 rounded ${themes[theme].secondary}`}
                disabled={isModalSaving}
              >
                取消
              </button>
              <button
                onClick={confirmSaveModal}
                className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={isModalSaving}
              >
                {isModalSaving ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scroll-following Refresh Button */}
      <button
        onClick={fetchPortfolio}
        className={`fixed bottom-8 right-8 p-3 rounded-full shadow-lg transition-all duration-300 z-40 ${
          showRefreshButton ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
        } ${themes[theme].card} ${themes[theme].border} border hover:bg-gray-100 dark:hover:bg-gray-700`}
        aria-label="Refresh Portfolio"
        title="刷新持仓"
      >
        <RefreshCw className={`w-6 h-6 ${themes[theme].text}`} />
      </button>

      {/* Activity Log Side Panel */}
      <PortfolioActivityLog
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        logs={activityLogs}
        onClear={() => setActivityLogs([])}
        theme={theme}
      />

      {/* 复杂策略编辑与构建统一使用上方“保存确认弹窗” */}
    </div>
  );
}
  
