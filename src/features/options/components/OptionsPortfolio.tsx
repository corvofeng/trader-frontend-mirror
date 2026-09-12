import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Activity, RefreshCw, Layers } from 'lucide-react';
import { PortfolioActivityLog, ActivityLogEntry } from './PortfolioActivityLog';
import { Theme, themes } from '../../../lib/theme';
import { setCookie, getCookie } from '../../../shared/utils/cookie';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService, stockService } from '../../../lib/services';
import type { OptionsPortfolioData, OptionsPosition, OptionsStrategy, AdvisedCombination, OptionsData, OptionWhitelist } from '../../../lib/services/types';
import { computeCombosForPositions as computeCombosForStrategy } from '../utils/strategyCombos';
import toast from 'react-hot-toast';
import { ExpiryGroupCard } from './ExpiryGroupCard';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { useClosePositions } from '../hooks/useClosePositions';
import { UnderlyingPriceMonitor } from './UnderlyingPriceMonitor';
import { PortfolioOverview } from './PortfolioOverview';
import { OptionPortfolioHistoryChart } from './OptionPortfolioHistoryChart';
import { SubjectPositionsPanel } from './SubjectPositionsPanel';
import { StockKlineChart } from './StockKlineChart';
import { TodayOrderFlowPanel } from './TodayComboPanel';
import { getDaysToExpiryColor, getPositionTypeInfo2, getStatusColorClass, getTypeIcon, getComboStatus } from '../utils/portfolioUi';

interface OptionsPortfolioProps {
  theme: Theme;
  selectedAccountId?: string | null;
  refreshKey?: number;
  optionsData?: OptionsData | null;
  selectedSymbol?: string;
}

const DEMO_USER_ID = 'mock-user-id';

  

export function OptionsPortfolio({ theme, selectedAccountId: selectedAccountIdProp, refreshKey = 0, optionsData, selectedSymbol }: OptionsPortfolioProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [whitelists, setWhitelists] = useState<OptionWhitelist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Use prop directly to avoid stale state during refresh
  // 已不在界面使用策略加载状态，避免未使用变量
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'expiry' | 'profitLoss' | 'symbol'>('expiry');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [underlyingCache, setUnderlyingCache] = useState<Record<string, number | null>>({});
  const [internalOptionsDataMap, setInternalOptionsDataMap] = useState<Record<string, OptionsData>>({});
  void setStatusFilter;
  void setSortBy;
  void setSortDirection;
  const { currencyConfig } = useCurrency();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<string>(selectedSymbol || '');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    setIsMobile(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

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
  
  const [wsRefreshNonce, setWsRefreshNonce] = useState(0);

  // State for mobile month navigation popover
  const [mobileMonthMenuOpen, setMobileMonthMenuOpen] = useState(false);

  const groups = useMemo(() => {
    if (!portfolioData) return [];
    return portfolioData.expiryBuckets && portfolioData.expiryBuckets.length > 0
      ? portfolioData.expiryBuckets
      : (portfolioData.expiryGroups || []).map(g => ({
          expiry: g.expiry,
          daysToExpiry: g.daysToExpiry,
          single: g.positions,
          complex: []
        }));
  }, [portfolioData]);

  const months = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; label: string; firstExpiry: string }[] = [];

    groups.forEach((group) => {
      const parts = group.expiry.split('-');
      if (parts.length >= 2) {
        const yearMonth = `${parts[0]}-${parts[1]}`;
        if (!seen.has(yearMonth)) {
          seen.add(yearMonth);
          const shortYear = parts[0].slice(-2);
          const cleanMonth = parseInt(parts[1], 10);
          list.push({
            key: yearMonth,
            label: `${shortYear}年${cleanMonth}月`,
            firstExpiry: group.expiry,
          });
        }
      }
    });
    return list;
  }, [groups]);

  const activeMonthKey = useMemo(() => {
    if (!activeExpiry) return null;
    const parts = activeExpiry.split('-');
    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : null;
  }, [activeExpiry]);

  const comboStatusesByExpiry = useMemo(() => {
    const map: Record<string, ReturnType<typeof getComboStatus>[]> = {};
    const allSinglePositions = groups.flatMap(g => g.single);
    groups.forEach(group => {
      const list: ReturnType<typeof getComboStatus>[] = [];
      const dte = group.daysToExpiry;
      const grpSymbol = group.single[0]?.opt_undl_code_full || group.complex[0]?.positions[0]?.opt_undl_code_full || activeSymbol || '';
      
      group.complex.forEach(strategy => {
        list.push(getComboStatus(strategy, 'complex', dte, grpSymbol, allSinglePositions));
      });
      group.single.forEach(position => {
        list.push(getComboStatus(position, 'single', dte, grpSymbol, allSinglePositions));
      });
      map[group.expiry] = list;
    });
    return map;
  }, [groups, activeSymbol]);

  const monthlyStatusCounts = useMemo(() => {
    const counts: Record<string, { watch: number; profit: number; auto: number; hold: number; total: number; items: ReturnType<typeof getComboStatus>[] }> = {};
    
    months.forEach(m => {
      counts[m.key] = { watch: 0, profit: 0, auto: 0, hold: 0, total: 0, items: [] };
    });

    Object.entries(comboStatusesByExpiry).forEach(([expiry, statuses]) => {
      const parts = expiry.split('-');
      if (parts.length >= 2) {
        const yearMonth = `${parts[0]}-${parts[1]}`;
        const mCount = counts[yearMonth];
        if (mCount) {
          statuses.forEach(statusRes => {
            mCount.total += 1;
            mCount.items.push(statusRes);
            if (statusRes.status === 'AUTO') mCount.auto += 1;
            else if (statusRes.status === 'PROFIT') mCount.profit += 1;
            else if (statusRes.status === 'WATCH') mCount.watch += 1;
            else mCount.hold += 1;
          });
        }
      }
    });

    return counts;
  }, [comboStatusesByExpiry, months]);

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
      // Update active expiry status from ScrollSpy

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
      [expiry]: prev[expiry] === undefined ? false : !prev[expiry]
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
      const effectiveSymbol = activeSymbol || selectedSymbol || '';
      if (!effectiveSymbol) {
        return null;
      }

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
          { symbol: effectiveSymbol }
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
  }, [selectedAccountIdProp, activeSymbol, processDiff, selectedSymbol]);

  const refreshPortfolioAndQuotes = useCallback(async () => {
    const effectiveSymbol = activeSymbol || selectedSymbol || '';
    if (!effectiveSymbol) return;
    setWsRefreshNonce((prev) => prev + 1);
    if (isConnected) {
      queryPrice([effectiveSymbol]);
    }
    const refreshed = await fetchPortfolio();

    const symbols = new Set<string>();
    if (effectiveSymbol) {
      symbols.add(effectiveSymbol);
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
  }, [activeSymbol, fetchPortfolio, isConnected, queryPrice, selectedSymbol]);

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

  const { handleClosePositions } = useClosePositions({
    portfolioData,
    setPortfolioData,
    selectedAccountId: selectedAccountIdProp || null,
    userId: currentUserId,
    activeSymbol,
    fallbackUserId: DEMO_USER_ID
  });

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

  const cardShadowFn = useMemo(() => {
    if (theme === 'dark') return 'shadow-[0_1px_2px_rgba(0,0,0,0.25),0_12px_28px_-16px_rgba(0,0,0,0.45)]';
    if (theme === 'blue') return 'shadow-[0_1px_2px_rgba(30,64,175,0.04),0_10px_28px_-16px_rgba(37,99,235,0.10)]';
    return 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.08)]';
  }, [theme]);

  const floatingGlassBg = useMemo(() => {
    if (theme === 'dark') return 'bg-zinc-900/70 border-zinc-800/60 text-zinc-100';
    if (theme === 'blue') return 'bg-white/80 border-blue-100/80 text-slate-900';
    return 'bg-white/80 border-slate-200/70 text-slate-900';
  }, [theme]);

  const refreshButton = useMemo(() => {
    const btn = (
      <button
        onClick={refreshPortfolioAndQuotes}
        disabled={isLoading}
        style={{
          position: 'fixed',
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          right: 'calc(16px + env(safe-area-inset-right, 0px))',
          zIndex: 2147483000,
        }}
        className={`p-3 rounded-full shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)] btn-tactile ${
          isLoading ? 'opacity-70 cursor-wait' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
        } ${themes[theme].card} ${themes[theme].border} border ring-1 ring-black/5 dark:ring-white/5 backdrop-blur-xl relative overflow-hidden`}
        aria-label="Refresh Portfolio"
        title="刷新持仓"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent dark:from-white/5 pointer-events-none" />
        <RefreshCw className={`w-6 h-6 relative ${themes[theme].text} ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
      </button>
    );
    if (typeof document === 'undefined') return btn;
    return createPortal(btn, document.body);
  }, [refreshPortfolioAndQuotes, isLoading, theme]);

  const mobileMonthToc = useMemo(() => {
    if (!isMobile || months.length === 0) return null;
    const el = (
      <div
        className="transition-all duration-300"
        style={{
          position: 'fixed',
          bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
          right: 'calc(16px + env(safe-area-inset-right, 0px))',
          zIndex: 2147482999,
        }}
      >
        <div className="relative">
          {mobileMonthMenuOpen && (
            <div className={`absolute bottom-16 right-0 p-2 rounded-2xl popover-spring shadow-[0_12px_40px_-12px_rgba(15,23,42,0.28)] border flex flex-col gap-1.5 min-w-[80px] max-h-[260px] overflow-y-auto ${floatingGlassBg} backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/5`}
                 style={{boxShadow: theme === 'dark' ? '0 16px 48px -16px rgba(0,0,0,0.6)' : undefined}}>
              <div className="text-[9px] uppercase tracking-wider font-bold opacity-25 px-1 py-0.5 border-b border-current/10 mb-0.5 w-full text-center">
                月份
              </div>
              {months.map((m) => {
                const isActive = activeMonthKey === m.key;
                const monthNum = parseInt(m.key.split('-')[1], 10);
                const counts = monthlyStatusCounts[m.key] || { watch: 0, profit: 0, auto: 0, total: 0 };
                const hasAlerts = counts.watch > 0 || counts.profit > 0 || counts.auto > 0;
                
                return (
                  <div key={m.key} className="flex items-center justify-between gap-3 px-1 py-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(`expiry-group-${m.firstExpiry}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        setMobileMonthMenuOpen(false);
                      }}
                      className={`text-center text-xs py-1 px-2.5 rounded-lg font-semibold btn-tactile ${
                        isActive
                          ? theme === 'dark'
                            ? 'bg-blue-500/25 text-blue-400'
                            : 'bg-blue-50 text-blue-600 border border-blue-100/70'
                          : theme === 'dark'
                            ? 'text-zinc-400 hover:bg-zinc-800/80'
                            : theme === 'blue'
                              ? 'text-slate-600 hover:bg-blue-50'
                              : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {monthNum}月
                    </button>
                    {hasAlerts && (
                      <div className="flex gap-0.5 shrink-0">
                        {counts.auto > 0 && (
                          <span className="w-4.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400">
                            {counts.auto}
                          </span>
                        )}
                        {counts.profit > 0 && (
                          <span className="w-4.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-400">
                            {counts.profit}
                          </span>
                        )}
                        {counts.watch > 0 && (
                          <span className="w-4.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-400">
                            {counts.watch}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={() => setMobileMonthMenuOpen(prev => !prev)}
            className={`p-3 rounded-full shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)] btn-tactile ${themes[theme].card} ${themes[theme].border} border hover:bg-gray-100 dark:hover:bg-gray-700 ring-1 ring-black/5 dark:ring-white/5 backdrop-blur-xl overflow-hidden relative`}
            aria-label="Toggle Expiry Months TOC"
            title="选择到期月份"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent dark:from-white/5 pointer-events-none" />
            <Layers className={`w-6 h-6 relative ${themes[theme].text}`} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    );
    if (typeof document === 'undefined') return el;
    return createPortal(el, document.body);
  }, [isMobile, months, mobileMonthMenuOpen, activeMonthKey, floatingGlassBg, theme]);

  if (isLoading && !portfolioData) {
    return (
      <>
        <div className={`${themes[theme].card} rounded-xl ${cardShadowFn} p-8 border ${themes[theme].border}`}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4 shadow-sm shadow-blue-500/20"></div>
            <p className={`${themes[theme].text} font-medium`}>正在加载期权投资组合...</p>
          </div>
        </div>
        {mobileMonthToc}
        {refreshButton}
      </>
    );
  }

  if (!portfolioData) {
    return (
      <>
        <div className={`${themes[theme].card} rounded-xl ${cardShadowFn} p-8 border ${themes[theme].border} relative isolate overflow-hidden`}>
          <div className={`absolute inset-x-0 top-0 h-px z-10 bg-gradient-to-r ${
            theme === 'dark' ? 'from-zinc-800/60 via-zinc-900/20 to-transparent'
            : theme === 'blue' ? 'from-blue-50/90 via-blue-50/40 to-transparent'
            : 'from-slate-50/90 via-slate-50/40 to-transparent'
          }`} aria-hidden="true" />
          <div className="text-center">
            <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} strokeWidth={1.5} />
            <p className={`text-lg font-semibold tracking-tight ${themes[theme].text}`}>暂无期权持仓</p>
            <p className={`text-sm ${themes[theme].text} opacity-65`}>
              您还没有任何期权持仓
            </p>
          </div>
        </div>
        <OptionPortfolioHistoryChart
          theme={theme}
          accountAlias={selectedAccountIdProp || ''}
        />
        {mobileMonthToc}
        {refreshButton}
      </>
    );
  }

  const executeAdvisedCombination = async (combo: AdvisedCombination) => {
    try {
      const { error } = await optionsService.executeCombination({ ...combo, quantity: Math.max(1, combo.quantity) }, selectedAccountIdProp || null, currentUserId || null);
      if (error) throw error;
      toast.success('已执行组合建议');
      try {
        const effectiveSymbol = activeSymbol || selectedSymbol || '';
        if (!effectiveSymbol) return;
        const { data: refreshed } = await optionsService.getOptionsPortfolio(
          currentUserId || DEMO_USER_ID,
          selectedAccountIdProp || null,
          { symbol: effectiveSymbol }
        );
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
    <div className="space-y-4 sm:space-y-5">
      {portfolioData.is_snapshot && (
        <div className={`px-4 py-3 sm:px-4 rounded-xl ${themes[theme].semantic.snapshotBanner} border ${themes[theme].border} ${cardShadowFn}`}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 pt-0.5">
              <Activity className={`h-5 w-5 ${themes[theme].semantic.snapshotIcon}`} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] sm:text-sm font-medium whitespace-nowrap ${themes[theme].semantic.snapshotText}`}>
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

      <OptionPortfolioHistoryChart
        theme={theme}
        accountAlias={selectedAccountIdProp || ''}
      />

      {isMobile && activeSymbol && (
        <UnderlyingPriceMonitor symbol={activeSymbol} theme={theme} refreshNonce={wsRefreshNonce} isMobile={true} />
      )}

      {portfolioData.subject_positions && portfolioData.subject_positions.length > 0 && (
        <SubjectPositionsPanel theme={theme} positions={portfolioData.subject_positions} currencyConfig={currencyConfig} />
      )}

      {!isMobile && activeSymbol && (
        <StockKlineChart
          symbol={activeSymbol}
          theme={theme}
          optionsData={optionsData ?? internalOptionsDataMap[activeSymbol] ?? null}
          currentUnderlyingPrice={getCurrentUnderlyingPrice(activeSymbol)}
        />
      )}

      <div className="space-y-4 sm:space-y-5">
        {(() => {
          return (
            <>
              {/* Floating Month TOC */}
              {!isMobile && months.length > 0 && (
                <div className={`fixed right-5 top-[272px] z-45 flex flex-col items-center gap-1.5 p-2 rounded-2xl shadow-[0_8px_32px_-12px_rgba(15,23,42,0.18)] border ${floatingGlassBg} backdrop-blur-xl transition-all duration-200 select-none ring-1 ring-black/5 dark:ring-white/5`}
                     style={{boxShadow: theme === 'dark' ? '0 12px 40px -16px rgba(0,0,0,0.5)' : undefined}}>
                  <div className="text-[9px] uppercase tracking-wider font-bold opacity-25 px-1 py-0.5 border-b border-current/10 mb-0.5 w-full text-center">
                    月份
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto pr-0.5 scrollbar-none">
                    {months.map((m) => {
                      const isActive = activeMonthKey === m.key;
                      const monthNum = parseInt(m.key.split('-')[1], 10);
                      const counts = monthlyStatusCounts[m.key] || { watch: 0, profit: 0, auto: 0, total: 0 };
                      const hasAlerts = counts.watch > 0 || counts.profit > 0 || counts.auto > 0;
                      
                      return (
                        <div key={m.key} className="flex items-center gap-2 px-1 py-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(`expiry-group-${m.firstExpiry}`);
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            title={m.label}
                            className={`text-center text-[10px] w-9 h-9 rounded-full transition-all duration-150 flex items-center justify-center font-semibold cursor-pointer active:scale-95 ${
                              isActive
                                ? theme === 'dark'
                                  ? 'bg-blue-500/25 text-blue-400 font-bold shadow-[0_0_0_1px_rgba(59,130,246,0.2)]'
                                  : 'bg-blue-50 text-blue-600 border border-blue-100/70 font-bold shadow-sm'
                                : theme === 'dark'
                                  ? 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                                  : theme === 'blue'
                                    ? 'text-slate-600 hover:bg-blue-50 hover:text-blue-900'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            {monthNum}月
                          </button>
                          
                          {hasAlerts && (
                            <div className="flex flex-col gap-0.5 shrink-0">
                              {counts.auto > 0 && (
                                <span className="w-4.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400" title={`AUTO: ${counts.auto}`}>
                                  {counts.auto}
                                </span>
                              )}
                              {counts.profit > 0 && (
                                <span className="w-4.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-400" title={`PROFIT: ${counts.profit}`}>
                                  {counts.profit}
                                </span>
                              )}
                              {counts.watch > 0 && (
                                <span className="w-4.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-400" title={`WATCH: ${counts.watch}`}>
                                  {counts.watch}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}


              {groups.map((group) => {
                return (
                <div key={group.expiry} id={`expiry-group-${group.expiry}`}>
                  <ExpiryGroupCard
                    theme={theme}
                    whitelists={whitelists}
                    group={group}
                    statusFilter={statusFilter}
                    filterAndSortPositions={filterAndSortPositions}
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
                    onExecuteAdvised={executeAdvisedCombination}
                    selectedAccountId={selectedAccountIdProp || null}
                    userId={currentUserId || null}
                    optionsData={optionsData}
                    optionsDataMap={internalOptionsDataMap}
                    isExpanded={expandedExpiryGroups[group.expiry] !== false}
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

      <TodayOrderFlowPanel
        theme={theme}
        selectedAccountId={selectedAccountIdProp || null}
        userId={currentUserId || null}
        refreshKey={refreshKey}
      />

      {/* Underlying Price Monitor */}
      {!isMobile && (
        <UnderlyingPriceMonitor symbol={activeSymbol} theme={theme} refreshNonce={wsRefreshNonce} isMobile={false} />
      )}

      {mobileMonthToc}

      {/* Fixed Refresh Button */}
      {refreshButton}

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
  
