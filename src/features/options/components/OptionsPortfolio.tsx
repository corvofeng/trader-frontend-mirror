import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Calendar, Activity } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { setCookie, getCookie } from '../../../shared/utils/cookie';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService, stockService } from '../../../lib/services';
import type { OptionsPortfolioData, OptionsPosition, OptionsStrategy, AdvisedCombination, OptionsData, OptionWhitelist } from '../../../lib/services/types';
import { computeCombosForPositions as computeCombosForStrategy } from '../utils/strategyCombos';
import toast from 'react-hot-toast';
import { ExpiryGroupCard } from './ExpiryGroupCard';
import { DEFAULT_PORTFOLIO_COLUMNS } from '../types/tboard';
import { OptionQuoteSubscription } from './OptionQuoteSubscription';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { useClosePositions } from '../hooks/useClosePositions';
import { UnderlyingPriceMonitor } from './UnderlyingPriceMonitor';
import { PortfolioAnalyticsTabs } from './PortfolioAnalyticsTabs';
import { StockKlineChart } from './StockKlineChart';
import { TodayOrderFlowPanel } from './TodayComboPanel';
import { PortfolioMobileFab } from './PortfolioMobileFab';
import { getDaysToExpiryColor, getPositionTypeInfo2, getStatusColorClass, getTypeIcon, getComboStatus } from '../utils/portfolioUi';

interface OptionsPortfolioProps {
  theme: Theme;
  selectedAccountId?: string | null;
  refreshKey?: number;
  optionsData?: OptionsData | null;
  selectedSymbol?: string;
  bottomOffset?: string;
  hideMobileFab?: boolean;
}

interface VisibleContractInfo {
  code: string;
  type: string;
  strike: number;
  expiry: string;
}

const DEMO_USER_ID = 'mock-user-id';

  

export function OptionsPortfolio({
  theme,
  selectedAccountId: selectedAccountIdProp,
  refreshKey = 0,
  optionsData,
  selectedSymbol,
  bottomOffset,
  hideMobileFab = false,
}: OptionsPortfolioProps) {
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
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const [isMobileTodayComboOpen, setIsMobileTodayComboOpen] = useState(false);
  const [isMobileUnderlyingMonitorOpen, setIsMobileUnderlyingMonitorOpen] = useState(false);

  const [isDesktopTodayComboOpen, setIsDesktopTodayComboOpen] = useState(() => {
    try {
      return localStorage.getItem('options_portfolio_today_combo_open') === '1';
    } catch {
      return false;
    }
  });

  const [isDesktopUnderlyingOpen, setIsDesktopUnderlyingOpen] = useState(() => {
    try {
      return localStorage.getItem('underlying_price_monitor_collapsed') === '0';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    setIsMobile(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const {
    isConnected,
    send,
    portfolioSnapshot,
    prices,
    reconnect
  } = useOptionPriceWebSocket();
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
  const [visibleContracts, setVisibleContracts] = useState<VisibleContractInfo[]>([]);
  const lastLoggedCodesRef = useRef<string>('');
  
  const [wsRefreshNonce, setWsRefreshNonce] = useState(0);

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

  // ScrollSpy determines the active month; quotes are loaded for every expiry in that month.
  useEffect(() => {
    if (groups.length === 0) return;

    const handleScrollSpy = () => {
      // Header offset + sticky nav height approx
      // Adjust this value based on your actual header height + sticky nav height
      const offset = 220; 
      
      let currentActive: string | null = null;
      
      // Iterate through groups to find which one is currently active
      for (const group of groups) {
        const el = document.getElementById(`expiry-group-${group.expiry}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          
          // Original ScrollSpy logic for active expiry
          if (rect.top <= offset) {
             currentActive = group.expiry;
          }
        }
      }
      
      // Fallback: if we are at the very top and no group satisfies rect.top <= offset
      // (e.g. first group starts at 250px and offset is 220px), active is the first one.
      if (!currentActive && groups.length > 0) {
         currentActive = groups[0].expiry;
      }

      const activeMonth = currentActive?.slice(0, 7);
      const monthCodes = new Map<string, VisibleContractInfo>();
      const addContract = (
        code: string | undefined,
        type: string,
        strike: number,
        expiry: string
      ) => {
        if (!code) return;
        monthCodes.set(code, { code, type, strike, expiry });
      };

      groups
        .filter((group) => group.expiry.slice(0, 7) === activeMonth)
        .forEach((group) => {
          const addPosition = (position: OptionsPosition) => {
            addContract(
              position.contract_code_full,
              position.contract_type_zh || position.option_type || position.type,
              position.strike,
              position.expiry
            );
          };

          group.single.forEach(addPosition);
          group.complex.forEach((strategy) => strategy.positions.forEach(addPosition));
        });

      const chainDataSources = [optionsData, internalOptionsDataMap[activeSymbol]]
        .filter((data): data is OptionsData => !!data);
      chainDataSources.forEach((data) => {
        data.quotes
          .filter((quote) => quote.expiry.slice(0, 7) === activeMonth)
          .forEach((quote) => {
            addContract(quote.call_contract_code_full, 'call', quote.strike, quote.expiry);
            addContract(quote.put_contract_code_full, 'put', quote.strike, quote.expiry);
          });
      });

      const nextContracts = Array.from(monthCodes.values()).sort((a, b) => a.code.localeCompare(b.code));
      setActiveExpiry(prev => prev !== currentActive ? currentActive : prev);
      setVisibleContracts((prev) => {
        const unchanged = prev.length === nextContracts.length &&
          prev.every((contract, index) => contract.code === nextContracts[index]?.code);
        return unchanged ? prev : nextContracts;
      });
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
  }, [activeSymbol, groups, internalOptionsDataMap, optionsData]);

  // Debug logging for visible contracts
  useEffect(() => {
    // Expose a helper to the console to enable debug mode easily
    (window as any).enablePortfolioDebug = (enabled = true) => {
      localStorage.setItem('options_portfolio_debug', enabled ? 'true' : 'false');
      console.log(`[Options Portfolio Debug] ${enabled ? 'Enabled' : 'Disabled'}. Please refresh the page or scroll to see updates.`);
    };

    // Check for debug mode: default to true in DEV, or via URL/localStorage
    const isDebug = import.meta.env.DEV || 
                    new URLSearchParams(window.location.search).get('debug') === 'true' || 
                    localStorage.getItem('options_portfolio_debug') === 'true';
    
    if (isDebug && visibleContracts.length > 0) {
      const currentCodesStr = `${activeMonthKey || 'unknown'}:${visibleContracts.map(c => c.code).join(',')}`;
      if (currentCodesStr !== lastLoggedCodesRef.current) {
        console.groupCollapsed(
          `%c[Options Portfolio Debug] Month Contracts: ${activeMonthKey || 'unknown'}`,
          'color: #3b82f6; font-weight: bold;'
        );
        console.table([{
          month: activeMonthKey,
          total: visibleContracts.length,
          calls: visibleContracts.filter((contract) => contract.type.toLowerCase().includes('call')).length,
          puts: visibleContracts.filter((contract) => contract.type.toLowerCase().includes('put')).length,
        }]);
        console.table(visibleContracts);
        console.log('Summary Codes:', visibleContracts.map(c => c.code));
        console.groupEnd();
        lastLoggedCodesRef.current = currentCodesStr;
      }
    }
  }, [activeMonthKey, visibleContracts]);

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

  const visibleCodes = useMemo(
    () => visibleContracts.map((contract) => contract.code),
    [visibleContracts]
  );

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
  }, [selectedAccountIdProp, activeSymbol, selectedSymbol]);

  const refreshPortfolioAndQuotes = useCallback(async () => {
    const effectiveSymbol = activeSymbol || selectedSymbol || '';
    if (!effectiveSymbol) return;
    setWsRefreshNonce((prev) => prev + 1);

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
  }, [activeSymbol, fetchPortfolio, selectedSymbol]);

  const handleManualRefresh = useCallback(async () => {
    reconnect({ silent: true });
    const toastId = toast.loading('正在刷新持仓与行情数据...', { id: 'options-portfolio-refresh-toast' });
    try {
      await refreshPortfolioAndQuotes();
      toast.success('持仓与行情数据已刷新！', { id: toastId });
    } catch (e) {
      console.error('Refresh portfolio failed:', e);
      toast.error('持仓与行情刷新失败，请稍后重试', { id: toastId });
    }
  }, [reconnect, refreshPortfolioAndQuotes]);

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
    setPortfolioData(portfolioSnapshot);
  }, [portfolioSnapshot]);

  

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

  // Heavyweight financial elevation shadows (Dense, deep, physical presence)
  const cardShadowFn = useMemo(() => {
    if (theme === 'dark') {
      return 'shadow-[0_4px_20px_-2px_rgba(0,0,0,0.65),0_16px_36px_-4px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.07)]';
    }
    if (theme === 'blue') {
      return 'shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_16px_36px_-4px_rgba(30,58,138,0.16),0_0_0_1px_rgba(30,58,138,0.08)]';
    }
    return 'shadow-[0_4px_20px_-2px_rgba(15,23,42,0.08),0_16px_36px_-4px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.06)]';
  }, [theme]);


  const handleOpenUnderlying = useCallback(() => {
    if (isMobile) {
      setIsMobileUnderlyingMonitorOpen(true);
    } else {
      setIsDesktopUnderlyingOpen(true);
    }
  }, [isMobile]);

  const handleOpenTodayCombo = useCallback(() => {
    if (isMobile) {
      setIsMobileTodayComboOpen(true);
    } else {
      setIsDesktopTodayComboOpen(true);
    }
  }, [isMobile]);

  if (isLoading && !portfolioData) {
    return (
      <>
        <OptionQuoteSubscription realtimeCodes={[activeSymbol]} />
        <div className={`${themes[theme].card} rounded-2xl ${cardShadowFn} p-10 border ${themes[theme].border} relative overflow-hidden`}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent pointer-events-none" />
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4 shadow-sm shadow-blue-500/20"></div>
            <p className={`${themes[theme].text} font-semibold tracking-wide text-base`}>正在加载期权投资组合...</p>
            <p className="text-xs text-muted-foreground mt-1 opacity-70">正在建立行情连接并读取持仓快照</p>
          </div>
        </div>
        <PortfolioMobileFab
          theme={theme}
          activeSymbol={activeSymbol}
          currentUnderlyingPrice={activeSymbol ? getCurrentUnderlyingPrice(activeSymbol) : null}
          isWsConnected={isConnected}
          isRefreshing={isLoading}
          onRefresh={handleManualRefresh}
          months={[]}
          activeMonthKey={null}
          monthlyStatusCounts={{}}
          onSelectMonth={() => {}}
          onOpenUnderlyingMonitor={handleOpenUnderlying}
          onOpenTodayCombo={handleOpenTodayCombo}
        />
      </>
    );
  }

  if (!portfolioData) {
    return (
      <>
        <OptionQuoteSubscription realtimeCodes={[activeSymbol]} />
        <div className={`${themes[theme].card} rounded-2xl ${cardShadowFn} p-10 border ${themes[theme].border} relative isolate overflow-hidden`}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
          <div className="text-center">
            <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-35`} strokeWidth={1.5} />
            <p className={`text-lg font-bold tracking-tight ${themes[theme].text}`}>暂无期权持仓</p>
            <p className={`text-sm ${themes[theme].text} opacity-65 mt-1`}>
              当前选定账户或标的下暂无活跃期权持仓
            </p>
          </div>
        </div>
        <PortfolioAnalyticsTabs
          theme={theme}
          accountAlias={selectedAccountIdProp || ''}
          portfolioData={portfolioData}
          currentUnderlyingPrice={activeSymbol ? getCurrentUnderlyingPrice(activeSymbol) : null}
          subjectPositions={[]}
          currencyConfig={currencyConfig}
        />
        <PortfolioMobileFab
          theme={theme}
          activeSymbol={activeSymbol}
          currentUnderlyingPrice={activeSymbol ? getCurrentUnderlyingPrice(activeSymbol) : null}
          isWsConnected={isConnected}
          isRefreshing={isLoading}
          onRefresh={handleManualRefresh}
          months={[]}
          activeMonthKey={null}
          monthlyStatusCounts={{}}
          onSelectMonth={() => {}}
          onOpenUnderlyingMonitor={handleOpenUnderlying}
          onOpenTodayCombo={handleOpenTodayCombo}
        />
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
      <OptionQuoteSubscription ordinaryCodes={visibleCodes} realtimeCodes={[activeSymbol]} />
      {portfolioData.is_snapshot && (
        <div className={`px-4 py-3 sm:px-4 rounded-xl ${themes[theme].semantic.snapshotBanner} border ${themes[theme].border} ${cardShadowFn}`}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 pt-0.5">
              <Activity className={`h-5 w-5 ${themes[theme].semantic.snapshotIcon}`} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0 pr-8 sm:pr-0">
              <p className={`text-xs sm:text-sm font-medium leading-relaxed ${themes[theme].semantic.snapshotText}`}>
                当前显示的数据为快照数据，可能与实时市场状态存在延迟。
              </p>
            </div>
          </div>
        </div>
      )}
      <PortfolioAnalyticsTabs
        theme={theme}
        accountAlias={selectedAccountIdProp || ''}
        portfolioData={portfolioData}
        currentUnderlyingPrice={activeSymbol ? getCurrentUnderlyingPrice(activeSymbol) : null}
        subjectPositions={portfolioData.subject_positions}
        currencyConfig={currencyConfig}
      />

      {activeSymbol && (
        <StockKlineChart
          symbol={activeSymbol}
          theme={theme}
          optionsData={optionsData ?? internalOptionsDataMap[activeSymbol] ?? null}
          currentUnderlyingPrice={getCurrentUnderlyingPrice(activeSymbol)}
        />
      )}

      <div className="space-y-4 sm:space-y-5">
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
                customColumns={DEFAULT_PORTFOLIO_COLUMNS}
                storageKey="options_portfolio_tboard_cols"
                defaultPreset="portfolio"
                tBoardTitle="持仓T型数量看板"
              />
            </div>
          );
        })}
      </div>

      <TodayOrderFlowPanel
        theme={theme}
        selectedAccountId={selectedAccountIdProp || null}
        userId={currentUserId || null}
        refreshKey={refreshKey}
        isOpen={isMobile ? isMobileTodayComboOpen : isDesktopTodayComboOpen}
        onOpenChange={isMobile ? setIsMobileTodayComboOpen : setIsDesktopTodayComboOpen}
        hideHandle={true}
        isMobile={isMobile}
      />

      {/* Underlying Price Monitor */}
      {activeSymbol && (
        <UnderlyingPriceMonitor
          symbol={activeSymbol}
          theme={theme}
          refreshNonce={wsRefreshNonce}
          isMobile={isMobile}
          isOpen={isMobile ? isMobileUnderlyingMonitorOpen : isDesktopUnderlyingOpen}
          onOpenChange={isMobile ? setIsMobileUnderlyingMonitorOpen : setIsDesktopUnderlyingOpen}
          hideHandle={true}
        />
      )}

      {/* Unified Floating Action Hub (Material Speed Dial & Navigation for both Mobile & Desktop) */}
      <PortfolioMobileFab
        theme={theme}
        activeSymbol={activeSymbol}
        currentUnderlyingPrice={activeSymbol ? getCurrentUnderlyingPrice(activeSymbol) : null}
        isWsConnected={isConnected}
        isRefreshing={isLoading}
        onRefresh={handleManualRefresh}
        months={months}
        activeMonthKey={activeMonthKey}
        monthlyStatusCounts={monthlyStatusCounts}
        onSelectMonth={(firstExpiry) => {
          const el = document.getElementById(`expiry-group-${firstExpiry}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onOpenUnderlyingMonitor={handleOpenUnderlying}
        onOpenTodayCombo={handleOpenTodayCombo}
        bottomOffset={bottomOffset}
        hideFab={hideMobileFab}
      />

      {/* 复杂策略编辑与构建统一使用上方“保存确认弹窗” */}
    </div>
  );
}
  
