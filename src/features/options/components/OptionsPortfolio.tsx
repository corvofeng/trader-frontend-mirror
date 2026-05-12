import { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Activity, RefreshCw } from 'lucide-react';
import { PortfolioActivityLog, ActivityLogEntry } from './PortfolioActivityLog';
import { Theme, themes } from '../../../lib/theme';
import { setCookie, getCookie } from '../../../shared/utils/cookie';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService, stockService } from '../../../lib/services';
import { emitAddLegToStrategy } from '../events/strategySelection';
import { logger } from '../../../shared/utils/logger';
import type { OptionsPortfolioData, CustomOptionsStrategy, OptionsPosition, OptionsStrategy, AdvisedCombination, OptionsData, OptionWhitelist } from '../../../lib/services/types';
import { computeCombosForPositions as computeCombosForStrategy } from '../utils/strategyCombos';
import toast from 'react-hot-toast';
import { ExpiryGroupCard } from './ExpiryGroupCard';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { useClosePositions } from '../hooks/useClosePositions';
import { useSaveStrategyModal } from '../hooks/useSaveStrategyModal';
import { UnderlyingPriceMonitor } from './UnderlyingPriceMonitor';
import { PortfolioOverview } from './PortfolioOverview';
import { SubjectPositionsPanel } from './SubjectPositionsPanel';
import { ViewModeTabs, type OptionsViewMode } from './ViewModeTabs';
import { ExpiryFastNav } from './ExpiryFastNav';
import { GroupedPositionsView } from './GroupedPositionsView';
import { SaveStrategyModal } from './SaveStrategyModal';
import { TodayOrderFlowPanel } from './TodayComboPanel';
import { CustomStrategiesPanel } from './CustomStrategiesPanel';
import { OptionsPortfolioStrategyView } from './OptionsPortfolioStrategyView';
import { getDaysToExpiryColor, getMoneynessTagForPrice, getPositionTypeInfo2, getRowHighlightClassForTag, getStatusColorClass, getTypeIcon, inferStrategyFromLegsWithSelection, type InferredStrategyResult } from '../utils/portfolioUi';

interface OptionsPortfolioProps {
  theme: Theme;
  selectedAccountId?: string | null;
  refreshKey?: number;
  optionsData?: OptionsData | null;
  selectedSymbol?: string;
}

const DEMO_USER_ID = 'mock-user-id';

  

// 扩展OptionsPosition类型以包含策略ID
interface ExtendedOptionsPosition extends OptionsPosition {
  strategy_id?: string;
  is_single_leg?: boolean;
}

export function OptionsPortfolio({ theme, selectedAccountId: selectedAccountIdProp, refreshKey = 0, optionsData, selectedSymbol }: OptionsPortfolioProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [whitelists, setWhitelists] = useState<OptionWhitelist[]>([]);
  const [customStrategies, setCustomStrategies] = useState<CustomOptionsStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Use prop directly to avoid stale state during refresh
  // 已不在界面使用策略加载状态，避免未使用变量
  const [viewMode, setViewMode] = useState<OptionsViewMode>('expiry');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'expiry' | 'profitLoss' | 'symbol'>('expiry');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedStrategies, setExpandedStrategies] = useState<string[]>([]);
  const [underlyingCache, setUnderlyingCache] = useState<Record<string, number | null>>({});
  const [internalOptionsDataMap, setInternalOptionsDataMap] = useState<Record<string, OptionsData>>({});
  void setStatusFilter;
  void setSortBy;
  void setSortDirection;
  // 到期分组选择模式（每个到期日单独开启多选）
  const [expirySelectionMode, setExpirySelectionMode] = useState<Record<string, boolean>>({});
  // 选中的腿及数量（positionId -> quantity）
  const [selectedLegs, setSelectedLegs] = useState<Record<string, number>>({});
  const { currencyConfig } = useCurrency();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<string>(selectedSymbol || '');

  const inferStrategyFromLegs = useCallback((legs: OptionsPosition[]): InferredStrategyResult | null => {
    return inferStrategyFromLegsWithSelection(legs, selectedLegs);
  }, [selectedLegs]);

  const getPositionsForExpiry = useCallback((expiry: string): OptionsPosition[] => {
    if (portfolioData?.expiryBuckets && portfolioData.expiryBuckets.length > 0) {
      return portfolioData.expiryBuckets.find(b => b.expiry === expiry)?.single || [];
    }
    return portfolioData?.expiryGroups?.find(g => g.expiry === expiry)?.positions || [];
  }, [portfolioData]);

  const {
    saveModalOpen,
    modalExpiry,
    saveStrategyName,
    saveStrategyCategory,
    saveStrategyDescription,
    isModalSaving,
    setSaveStrategyName,
    setSaveStrategyCategory,
    setSaveStrategyDescription,
    openSaveModal,
    closeSaveModal,
    confirmSaveModal,
  } = useSaveStrategyModal({
    getPositionsForExpiry,
    selectedLegs,
    setSelectedLegs,
    setExpirySelectionMode,
    inferStrategyFromLegs,
    fallbackUserId: DEMO_USER_ID
  });
  
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
  const [wsRefreshNonce, setWsRefreshNonce] = useState(0);

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
    let timeoutId: ReturnType<typeof setTimeout>;
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
  }, [selectedAccountIdProp, activeSymbol]);

  const getSanitizedUnderlying = (code: string) => {
    return code?.startsWith('US.') ? code.replace('US.', '') : code;
  };

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

  const fetchPortfolio = useCallback(async (): Promise<OptionsPortfolioData | null> => {
    let fetched: OptionsPortfolioData | null = null;
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
        return null;
      }

      const [portfolioRes, whitelistsRes] = await Promise.all([
        optionsService.getOptionsPortfolio(
          userId,
          selectedAccountIdProp || null,
          activeSymbol ? { symbol: activeSymbol } : undefined
        ),
        optionsService.getWhitelists(userId, selectedAccountIdProp || null)
      ]);

      const { data, error } = portfolioRes;
      
      if (error) throw error;
      if (data) {
        if (whitelistsRes.data) {
          setWhitelists(whitelistsRes.data);
        }

        // Diff Logic
        processDiff(data);

        setPortfolioData(data);
        fetched = data;
      }
      return fetched;
    } catch (error) {
      console.error('Error fetching portfolio data:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccountIdProp, activeSymbol, processDiff]);

  const refreshPortfolioAndQuotes = useCallback(async () => {
    setWsRefreshNonce((prev) => prev + 1);
    if (isConnected && activeSymbol) {
      queryPrice([activeSymbol]);
    }
    const refreshed = await fetchPortfolio();

    const symbols = new Set<string>();
    if (activeSymbol) {
      symbols.add(activeSymbol);
    } else if (refreshed) {
      const isValidSymbol = (s: string | undefined): s is string => {
        if (!s) return false;
        // 过滤掉明显的期权合约代码 (中国市场通常为8位数字)
        if (/^\d{8}(\..+)?$/.test(s)) return false;
        return true;
      };

      (refreshed.expiryBuckets || []).forEach(bucket => {
        bucket.single.forEach(pos => {
          if (isValidSymbol(pos.opt_undl_code_full)) symbols.add(pos.opt_undl_code_full);
        });
        bucket.complex.forEach(strategy => {
          strategy.positions.forEach(pos => {
            if (isValidSymbol(pos.opt_undl_code_full)) symbols.add(pos.opt_undl_code_full);
          });
        });
      });
    }

    const symbolList = Array.from(symbols);
    if (symbolList.length === 0) return;

    const results = await Promise.all(
      symbolList.map(async (sym) => {
        const resp = await optionsService.refreshOptionsData(sym);
        return { sym, ...resp };
      })
    );

    setInternalOptionsDataMap(prev => {
      const next = { ...prev };
      for (const item of results) {
        if (item.data) next[item.sym] = item.data;
      }
      return next;
    });
  }, [activeSymbol, fetchPortfolio, isConnected, queryPrice]);

  useEffect(() => {
    void refreshPortfolioAndQuotes();
  }, [refreshKey, refreshPortfolioAndQuotes]);

  useEffect(() => {
    if (!portfolioData) return;

    // Identify unique symbols and fetch their options data if needed
    const symbols = new Set<string>();
    if (activeSymbol) {
       symbols.add(activeSymbol);
    }
    
    const isValidSymbol = (s: string | undefined): s is string => {
      if (!s) return false;
      if (/^\d{8}(\..+)?$/.test(s)) return false;
      return true;
    };

    (portfolioData.expiryBuckets || []).forEach(bucket => {
      bucket.single.forEach(pos => {
        if (isValidSymbol(pos.opt_undl_code_full)) symbols.add(pos.opt_undl_code_full);
      });
      bucket.complex.forEach(strategy => {
        strategy.positions.forEach(pos => {
          if (isValidSymbol(pos.opt_undl_code_full)) symbols.add(pos.opt_undl_code_full);
        });
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

    setPortfolioData(portfolioSnapshot);
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

    return getMoneynessTagForPrice(p, price);
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
    const tag = getMoneynessTag(p);
    return getRowHighlightClassForTag(isSelectedPosition(p), tag);
  };

  // 开关指定到期日的选择模式
  const toggleExpirySelection = (expiry: string) => {
    setExpirySelectionMode(prev => ({ ...prev, [expiry]: !prev[expiry] }));
  };

  const isSelectingExpiry = (expiry: string) => !!expirySelectionMode[expiry];

  const { handleClosePositions } = useClosePositions({
    portfolioData,
    setPortfolioData,
    selectedAccountId: selectedAccountIdProp || null,
    userId: currentUserId,
    activeSymbol,
    fallbackUserId: DEMO_USER_ID
  });

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

  

  const getStatusColor = useCallback(
    (status: OptionsPosition['status']) => getStatusColorClass(theme, status),
    [theme]
  );

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
    const ids: string[] = [];
    const buyId = combo.buy_position?.position?.id;
    const sellId = combo.sell_position?.position?.id;
    if (buyId) ids.push(buyId);
    if (sellId) ids.push(sellId);
    ids.forEach(id => setPositionSelected(id, true));
    ids.forEach(id => updateSelectedQuantity(id, Math.max(1, combo.quantity)));
    setSaveStrategyName(combo.description || '组合建议');
    openSaveModal(combo.expiry);
  };

  const executeAdvisedCombination = async (combo: AdvisedCombination) => {
    try {
      const { error } = await optionsService.executeCombination({ ...combo, quantity: Math.max(1, combo.quantity) }, selectedAccountIdProp || null, currentUserId || null);
      if (error) throw error;
      toast.success('已执行组合建议');
      try {
        const { data: refreshed } = await optionsService.getOptionsPortfolio(currentUserId || DEMO_USER_ID, selectedAccountIdProp || null, activeSymbol ? { symbol: activeSymbol } : undefined);
        if (refreshed) setPortfolioData(refreshed);
      } catch (refreshError) {
        console.error(refreshError);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '执行失败');
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
      <PortfolioOverview
        theme={theme}
        portfolioData={portfolioData}
        currencyConfig={currencyConfig}
        activityLogsCount={activityLogs.length}
        onOpenLog={() => setIsLogOpen(true)}
        currentUnderlyingPrice={activeSymbol ? getCurrentUnderlyingPrice(activeSymbol) : null}
      />

      {portfolioData.subject_positions && portfolioData.subject_positions.length > 0 && (
        <SubjectPositionsPanel theme={theme} positions={portfolioData.subject_positions} currencyConfig={currencyConfig} />
      )}



      <ViewModeTabs viewMode={viewMode} onChange={setViewMode} />

      {/* Portfolio Content */}
      {viewMode === 'grouped' && (
        <div className="space-y-8">
          <GroupedPositionsView
            theme={theme}
            currencyConfig={currencyConfig}
            groupedStrategies={groupedStrategies}
            singleLegs={singleLegs}
            getPositionTypeInfo2={getPositionTypeInfo2}
            getStatusColor={getStatusColor}
          />

          <CustomStrategiesPanel
            theme={theme}
            currencyConfig={currencyConfig}
            strategies={customStrategies}
            expandedStrategyIds={expandedStrategies}
            onToggleExpanded={toggleStrategyExpansion}
            getTypeIcon={getTypeIcon}
            getPositionTypeInfo2={getPositionTypeInfo2}
          />
        </div>
      )}

      {viewMode === 'expiry' && (
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
                <ExpiryFastNav
                  theme={theme}
                  groups={groups}
                  currencyConfig={currencyConfig}
                  activeExpiry={activeExpiry}
                  expandedExpiryGroups={expandedExpiryGroups}
                />

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
                      onRefresh={fetchPortfolio}
                      wsRefreshNonce={wsRefreshNonce}
                    />
                  </div>
                );
                })}
              </>
            );
          })()}
        </div>
      )}

      {viewMode === 'strategy' && (
        <OptionsPortfolioStrategyView
          theme={theme}
          currencyConfig={currencyConfig}
          strategies={portfolioData.complexStrategies || []}
          filterAndSortPositions={filterAndSortPositions}
          getTypeIcon={getTypeIcon}
          getStatusColor={getStatusColor}
          getRowHighlightClass={getRowHighlightClass}
          getMoneynessTag={getMoneynessTag}
          isSelectingExpiry={isSelectingExpiry}
          selectedLegs={selectedLegs}
          setPositionSelected={setPositionSelected}
          updateSelectedQuantity={updateSelectedQuantity}
          getPositionTypeInfo2={getPositionTypeInfo2}
          onEditComplexPosition={openEditForComplexPosition}
        />
      )}

      <SaveStrategyModal
        theme={theme}
        isOpen={saveModalOpen}
        modalExpiry={modalExpiry}
        positions={modalExpiry ? getPositionsForExpiry(modalExpiry) : []}
        selectedLegs={selectedLegs}
        setPositionSelected={setPositionSelected}
        updateSelectedQuantity={updateSelectedQuantity}
        name={saveStrategyName}
        setName={setSaveStrategyName}
        category={saveStrategyCategory}
        setCategory={setSaveStrategyCategory}
        description={saveStrategyDescription}
        setDescription={setSaveStrategyDescription}
        inferStrategyFromLegs={inferStrategyFromLegs}
        isSaving={isModalSaving}
        onCancel={closeSaveModal}
        onConfirm={confirmSaveModal}
      />

      <TodayOrderFlowPanel
        theme={theme}
        viewMode={viewMode}
        selectedAccountId={selectedAccountIdProp || null}
        userId={currentUserId || null}
        refreshKey={refreshKey}
      />

      {/* Underlying Price Monitor */}
      <UnderlyingPriceMonitor symbol={activeSymbol} theme={theme} refreshNonce={wsRefreshNonce} />

      {/* Scroll-following Refresh Button */}
      <button
        onClick={refreshPortfolioAndQuotes}
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
  
