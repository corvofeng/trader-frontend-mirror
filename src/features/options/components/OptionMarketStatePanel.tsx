import { useEffect, useState, useMemo } from 'react';
import { Theme, themes } from '../../../lib/theme';
import { optionsService } from '../../../lib/services';
import type { OptionMarketStateData } from '../../../lib/services/types';
import { 
  Compass, 
  RefreshCw, 
  AlertTriangle, 
  Info, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  HelpCircle,
  Award,
  Layers,
  Calendar
} from 'lucide-react';

interface OptionMarketStatePanelProps {
  theme: Theme;
  selectedSymbol: string;
}

export function OptionMarketStatePanel({ theme, selectedSymbol }: OptionMarketStatePanelProps) {
  // Query parameters state
  const [days, setDays] = useState<number>(120);
  const [useWindows, setUseWindows] = useState<boolean>(selectedSymbol === '588000.SH');
  const [windows, setWindows] = useState<string>('1,3,5');
  const [top, setTop] = useState<number>(10);
  const [wings, setWings] = useState<number>(20);
  const [minBaseOi, setMinBaseOi] = useState<number>(1000);
  const [asOf, setAsOf] = useState<string>('');
  const [expiryFilter, setExpiryFilter] = useState<string>('');
  
  // Data state
  const [marketStateData, setMarketStateData] = useState<OptionMarketStateData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Cache refresh status
  const [refreshApplied, setRefreshApplied] = useState<boolean | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  
  // Selected visual window for joint analysis
  const [activeAnalysisWindow, setActiveAnalysisWindow] = useState<string>('5');
  
  // Expiry Month Group filter
  const [selectedMonthTab, setSelectedMonthTab] = useState<string>('all');
  const [expandedExpiries, setExpandedExpiries] = useState<Record<string, boolean>>({});

  // Active ranking tab
  const [activeRankingTab, setActiveRankingTab] = useState<'abs_inc' | 'abs_dec' | 'rel_inc' | 'rel_dec'>('abs_inc');

  // Enforce windows parameter limitation: only 588000.SH supports windows parameter in V1
  useEffect(() => {
    const isSh = selectedSymbol === '588000.SH';
    setUseWindows(isSh);
  }, [selectedSymbol]);

  // Load market state data
  const loadMarketState = async (forceRefresh: boolean = false) => {
    if (!selectedSymbol) return;
    
    setIsLoading(true);
    setError(null);
    if (!forceRefresh) {
      setRefreshApplied(null);
      setRefreshMessage(null);
    }
    
    try {
      const expArray = expiryFilter.trim() 
        ? expiryFilter.split(',').map(e => e.trim()).filter(Boolean)
        : undefined;

      const res = await optionsService.getOptionMarketState(selectedSymbol, {
        days,
        windows: useWindows && selectedSymbol === '588000.SH' ? windows : undefined,
        top: useWindows ? top : undefined,
        wings: useWindows ? wings : undefined,
        min_base_oi: useWindows ? minBaseOi : undefined,
        as_of: asOf || undefined,
        expiry: expArray,
        refresh: forceRefresh
      });

      if (res.error) {
        throw res.error;
      }

      if (res.data) {
        setMarketStateData(res.data);
        
        // Read header feedback from meta
        if (forceRefresh) {
          const applied = (res.meta as any)?.refreshApplied;
          setRefreshApplied(applied ?? false);
          if (applied) {
            setRefreshMessage('强制刷新成功：已绕过进程内缓存并重新回填数据。');
          } else {
            setRefreshMessage('强制刷新被忽略：只有登录管理员权限才可跳过缓存，当前使用后端缓存。');
          }
          // Clear message after 4 seconds
          setTimeout(() => {
            setRefreshMessage(null);
            setRefreshApplied(null);
          }, 4500);
        }
      }
    } catch (err) {
      console.error('Failed to load option market state:', err);
      setError(err instanceof Error ? err.message : '加载期权市场状态接口失败');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch when dependency props or query params change (except window specific settings)
  useEffect(() => {
    loadMarketState(false);
  }, [selectedSymbol, days, useWindows, asOf, expiryFilter]);

  // Expand expiries by default when data loads
  useEffect(() => {
    if (!marketStateData) return;
    const expiries = Object.keys(marketStateData.oi_analysis?.t_shapes || marketStateData.contract_activity?.t_quotes || {});
    const initialExpanded: Record<string, boolean> = {};
    expiries.forEach((exp, idx) => {
      initialExpanded[exp] = idx === 0; // expand first one by default
    });
    setExpandedExpiries(initialExpanded);

    // Set first available window as active analysis window
    if (marketStateData.oi_analysis?.volatility_regime?.windows) {
      const wins = Object.keys(marketStateData.oi_analysis.volatility_regime.windows);
      if (wins.length > 0) {
        // Prefer '5' if exists, otherwise the first one
        setActiveAnalysisWindow(wins.includes('5') ? '5' : wins[0]);
      }
    }
  }, [marketStateData]);

  const toggleExpiry = (exp: string) => {
    setExpandedExpiries(prev => ({ ...prev, [exp]: !prev[exp] }));
  };

  // Group Expiration Dates by Month
  const groupedExpiries = useMemo(() => {
    const dates = Object.keys(marketStateData?.oi_analysis?.t_shapes || marketStateData?.contract_activity?.t_quotes || {});
    const groups: Record<string, string[]> = {};
    
    dates.forEach(d => {
      // YYYY-MM-DD -> YYYY-MM
      const parts = d.split('-');
      if (parts.length >= 2) {
        const month = `${parts[0]}-${parts[1]}`;
        if (!groups[month]) {
          groups[month] = [];
        }
        groups[month].push(d);
      }
    });

    return groups;
  }, [marketStateData]);

  const monthTabs = useMemo(() => {
    return ['all', ...Object.keys(groupedExpiries).sort()];
  }, [groupedExpiries]);

  // Filtered Expiration Dates according to selected Month Tab
  const filteredExpiries = useMemo(() => {
    const allDates = Object.keys(marketStateData?.oi_analysis?.t_shapes || marketStateData?.contract_activity?.t_quotes || {}).sort();
    if (selectedMonthTab === 'all') {
      return allDates;
    }
    return groupedExpiries[selectedMonthTab] || [];
  }, [selectedMonthTab, groupedExpiries, marketStateData]);

  // Helper to color positioning score
  const getPositioningLabel = (score: number) => {
    if (score < -15) return { text: '防守偏好 (Put 偏多)', color: 'text-blue-500 dark:text-blue-400' };
    if (score > 15) return { text: '进攻偏好 (Call 偏多)', color: 'text-emerald-500 dark:text-emerald-400' };
    return { text: '均衡偏好 (Call/Put 平衡)', color: 'text-zinc-500 dark:text-zinc-400' };
  };

  // Helper to color stress score
  const getStressLabel = (score: number) => {
    if (score > 70) return { text: '极度紧张', color: 'text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-950/30' };
    if (score > 45) return { text: '情绪偏紧', color: 'text-amber-500 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/30' };
    return { text: '平稳宽裕', color: 'text-green-500 dark:text-green-400 bg-green-100 dark:bg-green-950/30' };
  };

  // Joint signal styling helper
  const getSignalBadgeStyle = (code: string) => {
    switch (code) {
      case 'OI_UP_IV_UP':
        return 'bg-red-500/10 border-red-500/30 text-red-500';
      case 'OI_UP_IV_DOWN':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500';
      case 'OI_DOWN_IV_UP':
        return 'bg-orange-500/10 border-orange-500/30 text-orange-500';
      case 'OI_DOWN_IV_DOWN':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-500';
      default:
        return 'bg-zinc-500/10 border-zinc-500/30 text-zinc-500';
    }
  };

  // Rendering standard T-Quotes row values
  const renderStandardRow = (row: any, isDark: boolean) => {
    const callVal = row.call;
    const putVal = row.put;
    const textTheme = isDark ? 'text-zinc-100' : 'text-slate-900';

    return (
      <tr key={row.strike_price} className={`border-b ${themes[theme].border} hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition-colors ${row.is_atm ? 'bg-blue-50/30 dark:bg-blue-950/10 border-y border-blue-200 dark:border-blue-900' : ''}`}>
        {/* Call Columns */}
        <td className="px-3 py-2.5 text-left text-xs font-mono">
          <div className={textTheme}>{callVal?.oi?.toLocaleString() ?? '--'}</div>
          {callVal?.delta_oi !== undefined && (
            <div className={`text-[10px] ${callVal.delta_oi >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {callVal.delta_oi >= 0 ? `+${callVal.delta_oi.toLocaleString()}` : callVal.delta_oi.toLocaleString()}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 text-center text-xs font-mono text-zinc-500">{callVal?.volume?.toLocaleString() ?? '--'}</td>
        <td className="px-3 py-2.5 text-center text-xs font-mono text-zinc-500">{callVal?.iv ? `${callVal.iv}%` : '--'}</td>
        <td className="px-2 py-2.5 text-center text-[10px] font-mono text-zinc-400 hidden lg:table-cell">{callVal?.delta ?? '--'}</td>
        <td className="px-2 py-2.5 text-center text-[10px] font-mono text-zinc-400 hidden lg:table-cell">{callVal?.gamma ?? '--'}</td>

        {/* Center Strike Price */}
        <td className="px-4 py-2.5 text-center font-bold text-sm bg-slate-100/50 dark:bg-zinc-800/50">
          <div className="flex items-center justify-center gap-1">
            <span className={row.is_atm ? 'text-blue-600 dark:text-blue-400 font-extrabold' : textTheme}>
              {row.strike_price.toFixed(3)}
            </span>
            {row.is_atm && (
              <span className="px-1 py-0.2 text-[8px] bg-blue-500 text-white rounded shrink-0">ATM</span>
            )}
          </div>
        </td>

        {/* Put Columns */}
        <td className="px-2 py-2.5 text-center text-[10px] font-mono text-zinc-400 hidden lg:table-cell">{putVal?.gamma ?? '--'}</td>
        <td className="px-2 py-2.5 text-center text-[10px] font-mono text-zinc-400 hidden lg:table-cell">{putVal?.delta ?? '--'}</td>
        <td className="px-3 py-2.5 text-center text-xs font-mono text-zinc-500">{putVal?.iv ? `${putVal.iv}%` : '--'}</td>
        <td className="px-3 py-2.5 text-center text-xs font-mono text-zinc-500">{putVal?.volume?.toLocaleString() ?? '--'}</td>
        <td className="px-3 py-2.5 text-right text-xs font-mono">
          <div className={textTheme}>{putVal?.oi?.toLocaleString() ?? '--'}</div>
          {putVal?.delta_oi !== undefined && (
            <div className={`text-[10px] ${putVal.delta_oi >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {putVal.delta_oi >= 0 ? `+${putVal.delta_oi.toLocaleString()}` : putVal.delta_oi.toLocaleString()}
            </div>
          )}
        </td>
      </tr>
    );
  };

  // Rendering Multi-window OI Analysis T-Shapes row values
  const renderAnalysisRow = (row: any, isDark: boolean, activeWins: string[]) => {
    const callVal = row.call;
    const putVal = row.put;
    const textTheme = isDark ? 'text-zinc-100' : 'text-slate-900';

    const getStatusText = (status: string, deltaOi?: number, deltaPercent?: number) => {
      switch (status) {
        case 'COMPARABLE':
          if (deltaOi === undefined) return '--';
          const prefix = deltaOi >= 0 ? '+' : '';
          const pct = deltaPercent !== undefined ? ` (${deltaPercent > 0 ? '+' : ''}${deltaPercent}%)` : '';
          return `${prefix}${deltaOi.toLocaleString()}${pct}`;
        case 'FIRST_SEEN':
          return '新增合约';
        case 'BASELINE_MISSING':
          return '缺少基准';
        case 'ZERO_BASE':
          if (deltaOi === undefined) return '0';
          return `${deltaOi >= 0 ? '+' : ''}${deltaOi.toLocaleString()} (N/A)`;
        case 'INSUFFICIENT_WINDOW':
          return '数据不足';
        default:
          return '--';
      }
    };

    const getStatusColor = (status: string, deltaOi?: number) => {
      if (status === 'FIRST_SEEN') return 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 px-1 py-0.5 rounded text-[9px] font-semibold';
      if (status === 'BASELINE_MISSING' || status === 'INSUFFICIENT_WINDOW') return 'text-zinc-400';
      if (deltaOi === undefined || deltaOi === 0) return 'text-zinc-500';
      return deltaOi > 0 ? 'text-emerald-500 dark:text-emerald-400 font-medium' : 'text-rose-500 dark:text-rose-400 font-medium';
    };

    return (
      <tr key={row.strike_price} className={`border-b ${themes[theme].border} hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition-colors ${row.is_atm ? 'bg-blue-50/30 dark:bg-blue-950/10 border-y border-blue-200 dark:border-blue-900' : ''}`}>
        {/* Call Side */}
        <td className="px-3 py-2 text-left text-xs font-mono">
          <div className={textTheme}>{callVal?.open_interest?.toLocaleString() ?? '--'}</div>
        </td>
        <td className="px-2 py-2 text-center text-xs font-mono text-zinc-500 hidden sm:table-cell">{callVal?.daily_volume?.toLocaleString() ?? '--'}</td>
        <td className="px-2 py-2 text-center text-xs font-mono text-zinc-500 hidden sm:table-cell">{callVal?.implied_volatility_percent ? `${callVal.implied_volatility_percent}%` : '--'}</td>
        
        {/* Call multi-windows deltas */}
        {activeWins.map(w => {
          const winData = callVal?.windows?.[w];
          const delta = winData?.delta_oi;
          const status = winData?.status;
          return (
            <td key={w} className="px-2 py-2 text-center text-[10px] font-mono whitespace-nowrap">
              {winData ? (
                <span className={getStatusColor(status, delta)}>
                  {getStatusText(status, delta, winData.delta_oi_percent)}
                </span>
              ) : '--'}
            </td>
          );
        })}

        {/* Center Strike Price */}
        <td className="px-4 py-2 text-center font-bold text-sm bg-slate-100/50 dark:bg-zinc-800/50">
          <div className="flex items-center justify-center gap-1">
            <span className={row.is_atm ? 'text-blue-600 dark:text-blue-400 font-extrabold' : textTheme}>
              {row.strike_price.toFixed(3)}
            </span>
            {row.is_atm && (
              <span className="px-1 py-0.2 text-[8px] bg-blue-500 text-white rounded shrink-0">ATM</span>
            )}
          </div>
        </td>

        {/* Put multi-windows deltas */}
        {[...activeWins].reverse().map(w => {
          const winData = putVal?.windows?.[w];
          const delta = winData?.delta_oi;
          const status = winData?.status;
          return (
            <td key={w} className="px-2 py-2 text-center text-[10px] font-mono whitespace-nowrap">
              {winData ? (
                <span className={getStatusColor(status, delta)}>
                  {getStatusText(status, delta, winData.delta_oi_percent)}
                </span>
              ) : '--'}
            </td>
          );
        })}

        {/* Put Side */}
        <td className="px-2 py-2 text-center text-xs font-mono text-zinc-500 hidden sm:table-cell">{putVal?.implied_volatility_percent ? `${putVal.implied_volatility_percent}%` : '--'}</td>
        <td className="px-2 py-2 text-center text-xs font-mono text-zinc-500 hidden sm:table-cell">{putVal?.daily_volume?.toLocaleString() ?? '--'}</td>
        <td className="px-3 py-2 text-right text-xs font-mono">
          <div className={textTheme}>{putVal?.open_interest?.toLocaleString() ?? '--'}</div>
        </td>
      </tr>
    );
  };

  const isDark = theme === 'dark';
  const textTheme = isDark ? 'text-zinc-100' : 'text-slate-900';

  return (
    <div className="space-y-6">
      {/* 1. Header Filter Controls Card */}
      <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border}`}>
        <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-blue-500" />
            <h3 className={`text-md font-bold ${textTheme}`}>市场状态分析配置</h3>
          </div>
          
          <button
            onClick={() => loadMarketState(true)}
            disabled={isLoading}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${themes[theme].secondary} ${
              isLoading ? 'opacity-50 cursor-not-allowed animate-pulse' : 'hover:scale-[0.98]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            管理员强制刷新
          </button>
        </div>

        {refreshMessage && (
          <div className={`mb-4 px-4 py-2.5 rounded-md border text-xs flex items-center gap-2 ${
            refreshApplied ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
          }`}>
            {refreshApplied ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{refreshMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-500">自然日观察窗口 (Days)</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={`px-3 py-1.5 rounded text-xs border ${themes[theme].input}`}
            >
              {[20, 60, 90, 120, 180, 240, 360].map(d => (
                <option key={d} value={d}>{d} 天</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-500">截止分析日期 (As Of)</label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              placeholder="最新数据日"
              className={`px-3 py-1.5 rounded text-xs border ${themes[theme].input}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-500">到期月过滤 (Expiry)</label>
            <input
              type="text"
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value)}
              placeholder="e.g. 2026-09-23,2026-12-23"
              className={`px-3 py-1.5 rounded text-xs border ${themes[theme].input}`}
            />
          </div>

          {selectedSymbol === '588000.SH' ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-500">OI 分析多窗口 (Windows)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="use-windows"
                    checked={useWindows}
                    onChange={(e) => setUseWindows(e.target.checked)}
                    className="rounded border-gray-300 dark:border-zinc-800 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  <label htmlFor="use-windows" className="text-[10px] font-semibold text-zinc-400">启用</label>
                </div>
              </div>
              <input
                type="text"
                disabled={!useWindows}
                value={windows}
                onChange={(e) => setWindows(e.target.value)}
                placeholder="e.g. 1,3,5"
                className={`px-3 py-1.5 rounded text-xs border ${themes[theme].input} ${!useWindows ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-zinc-800/30' : ''}`}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 bg-slate-50 dark:bg-zinc-800/20 p-2.5 rounded border border-dashed border-slate-200 dark:border-zinc-800 justify-center">
              <div className="flex items-center gap-1 text-zinc-400 text-[10px]">
                <Info className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                <span>OI分析多窗口参数仅支持 588000.SH，其他标的已自动切换为标准行情T型表展示。</span>
              </div>
            </div>
          )}
        </div>

        {useWindows && selectedSymbol === '588000.SH' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-zinc-500">行权价 ATM 挡数 (Wings)</label>
              <input
                type="number"
                min="1"
                max="50"
                value={wings}
                onChange={(e) => setWings(Number(e.target.value))}
                className={`px-3 py-1 rounded text-xs border ${themes[theme].input}`}
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-zinc-500">基准排名最低 OI (Min Base OI)</label>
              <input
                type="number"
                min="0"
                value={minBaseOi}
                onChange={(e) => setMinBaseOi(Number(e.target.value))}
                className={`px-3 py-1 rounded text-xs border ${themes[theme].input}`}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-zinc-500">排名返回条数 (Top Ranks)</label>
              <input
                type="number"
                min="1"
                max="50"
                value={top}
                onChange={(e) => setTop(Number(e.target.value))}
                className={`px-3 py-1 rounded text-xs border ${themes[theme].input}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Loading & Error Overlay */}
      {isLoading && !marketStateData && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-zinc-500 text-sm">正在加载市场状态分析数据，这可能需要几秒钟时间...</p>
        </div>
      )}

      {error && (
        <div className={`${themes[theme].card} rounded-lg p-8 border border-red-200 dark:border-red-900 text-center space-y-4`}>
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <h4 className={`text-md font-bold ${textTheme}`}>数据加载失败</h4>
          <p className="text-xs text-red-600 dark:text-red-400 max-w-md mx-auto">{error}</p>
          <button
            onClick={() => loadMarketState(false)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold"
          >
            重试加载
          </button>
        </div>
      )}

      {/* 3. Main Dashboard Content */}
      {marketStateData && (
        <div className="space-y-6">
          
          {/* A. Core Scores Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Stress Score Gauge Card */}
            <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border} flex flex-col justify-between`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">市场压力指数</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStressLabel(marketStateData.state.stress_score).color}`}>
                  {getStressLabel(marketStateData.state.stress_score).text}
                </span>
              </div>

              <div className="flex items-center justify-center py-4 relative">
                {/* Score Circle Progress */}
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle 
                      cx="56" cy="56" r="46" 
                      stroke={isDark ? '#27272a' : '#f1f5f9'} 
                      strokeWidth="8" fill="transparent" 
                    />
                    <circle 
                      cx="56" cy="56" r="46" 
                      stroke={marketStateData.state.stress_score > 70 ? '#ef4444' : marketStateData.state.stress_score > 45 ? '#f59e0b' : '#10b981'} 
                      strokeWidth="8" fill="transparent" 
                      strokeDasharray={2 * Math.PI * 46}
                      strokeDashoffset={2 * Math.PI * 46 * (1 - marketStateData.state.stress_score / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className={`text-3xl font-extrabold ${textTheme}`}>{marketStateData.state.stress_score}</span>
                    <span className="text-[10px] text-zinc-500">点数 / 100</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                结合ATM IV分位数(55%)、期权流动性(30%)与 Put/Call Skew(15%)计算所得，反映当前隐含市场交易紧张程度。
              </p>
            </div>

            {/* Positioning Bias Slider Card */}
            <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border} flex flex-col justify-between`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">仓位偏好与定价偏向</span>
                <span className={`text-xs font-semibold ${getPositioningLabel(marketStateData.state.positioning_score).color}`}>
                  {getPositioningLabel(marketStateData.state.positioning_score).text}
                </span>
              </div>

              <div className="py-6 px-2">
                {/* Horizontal slider bar */}
                <div className="relative w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-full flex items-center justify-between">
                  <div className="absolute left-0 w-1/2 h-full bg-blue-500/20 rounded-l-full" />
                  <div className="absolute right-0 w-1/2 h-full bg-emerald-500/20 rounded-r-full" />
                  
                  {/* Score Pointer */}
                  <div 
                    className="absolute w-5 h-5 rounded-full border-2 bg-white dark:bg-zinc-900 shadow-md flex items-center justify-center -translate-x-1/2" 
                    style={{ left: `${((marketStateData.state.positioning_score + 100) / 200) * 100}%` }}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      marketStateData.state.positioning_score < -15 ? 'bg-blue-500' : marketStateData.state.positioning_score > 15 ? 'bg-emerald-500' : 'bg-zinc-400'
                    }`} />
                  </div>

                  <span className="absolute left-1 -bottom-5 text-[9px] text-zinc-400 font-mono">-100 Put偏好</span>
                  <span className="absolute right-1 -bottom-5 text-[9px] text-zinc-400 font-mono">+100 Call偏好</span>
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-5 text-[9px] text-zinc-400 font-mono">0 中性</span>
                </div>
                
                <div className="text-center mt-6">
                  <span className={`text-2xl font-black ${textTheme}`}>{marketStateData.state.positioning_score > 0 ? `+${marketStateData.state.positioning_score}` : marketStateData.state.positioning_score}</span>
                  <span className="text-[10px] text-zinc-500 ml-1">分</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                描述多空持仓力量偏好，不代表未来价格方向预测。由未平仓比(35%)、成交比(25%)、持仓变化差(25%)与 skew 综合。
              </p>
            </div>

            {/* Interpretable Signals Card */}
            <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border} flex flex-col justify-between`}>
              <div>
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-3">观察可解释信号</span>
                {marketStateData.state.signals && marketStateData.state.signals.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {marketStateData.state.signals.map((sig: any) => (
                      <span 
                        key={sig.code} 
                        className={`px-2 py-1 rounded text-xs font-mono border ${
                          sig.severity === 'high'
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 dark:text-rose-400'
                            : sig.direction === 'aggressive'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 dark:text-emerald-400'
                            : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-600 dark:text-zinc-300'
                        }`}
                        title={sig.message}
                       >
                        {sig.code}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 italic py-4">暂无特殊可解释信号触发</div>
                )}
              </div>

              <div className="border-t border-slate-100 dark:border-zinc-800 pt-3 mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span>置信度: <span className="font-bold text-zinc-700 dark:text-zinc-300 uppercase">{marketStateData.state.confidence || '中等'}</span></span>
                <span>数据截止: <span className="font-mono">{marketStateData.meta.as_of}</span></span>
              </div>
            </div>
          </div>

          {/* B. Latest Stats Overview Cards */}
          <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border}`}>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-4">市场指标快照</span>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">标的资产价格</div>
                <div className={`text-md font-bold font-mono ${textTheme}`}>{marketStateData.latest.underlying_price?.value ?? '--'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">平值 IV</div>
                <div className={`text-md font-bold font-mono ${textTheme}`}>{marketStateData.latest.atm_iv ? `${marketStateData.latest.atm_iv.value?.toFixed(2)}%` : '--'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">综合流动性</div>
                <div className={`text-md font-bold font-mono ${textTheme}`}>{marketStateData.latest.liquidity ? `${marketStateData.latest.liquidity.value?.toFixed(1)}` : '--'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">总未平仓量 (OI)</div>
                <div className={`text-md font-bold font-mono ${textTheme}`}>{marketStateData.latest.open_interest?.total?.toLocaleString() ?? '--'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">成交量 (Volume)</div>
                <div className={`text-md font-bold font-mono ${textTheme}`}>{marketStateData.latest.volume?.total?.toLocaleString() ?? '--'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">IV Skew (P-C)</div>
                <div className={`text-md font-bold font-mono ${textTheme}`}>{marketStateData.latest.put_call_iv_skew !== undefined ? `${marketStateData.latest.put_call_iv_skew.value?.toFixed(2)}%` : '--'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">平均买卖价差</div>
                <div className={`text-md font-bold font-mono ${textTheme}`}>{marketStateData.latest.liquidity ? `${marketStateData.latest.liquidity.average_spread_percent?.toFixed(3)}%` : '--'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">主力持仓集中度</div>
                <div className={`text-md font-bold font-mono ${textTheme}`}>{marketStateData.latest.concentration ? `${marketStateData.latest.concentration.top_five_contract_share?.toFixed(1)}%` : '--'}</div>
              </div>
            </div>

            {/* Underlying Market Details sub-section */}
            <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 mt-4 grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
              <div className="flex items-center justify-between md:justify-start gap-2">
                <span className="text-zinc-500">标的历史涨跌:</span>
                <span className={`font-semibold font-mono ${marketStateData.underlying_market.change_20d && marketStateData.underlying_market.change_20d >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {marketStateData.underlying_market.change_20d ? `${marketStateData.underlying_market.change_20d > 0 ? '+' : ''}${marketStateData.underlying_market.change_20d.toFixed(2)}%` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between md:justify-start gap-2">
                <span className="text-zinc-500">标的历史波动率 (HV):</span>
                <span className={`font-semibold font-mono ${textTheme}`}>
                  {marketStateData.underlying_market.volatility_20d ? `${marketStateData.underlying_market.volatility_20d.toFixed(2)}%` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between md:justify-start gap-2">
                <span className="text-zinc-500">区间最大回撤 (MDD):</span>
                <span className="font-semibold font-mono text-rose-500">
                  {marketStateData.underlying_market.max_drawdown_20d ? `${marketStateData.underlying_market.max_drawdown_20d.toFixed(2)}%` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between md:justify-start gap-2 md:col-span-2">
                <span className="text-zinc-500">标记移动均线:</span>
                <span className="font-semibold font-mono text-zinc-600 dark:text-zinc-300">
                  {marketStateData.underlying_market.ma20 !== undefined
                    ? `MA20:${marketStateData.underlying_market.ma20} | MA60:${marketStateData.underlying_market.ma60} | MA120:${marketStateData.underlying_market.ma120}`
                    : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* C. Multi-Window Volatility Regime Joint Interpretations */}
          {useWindows && marketStateData.oi_analysis?.volatility_regime?.windows && (
            <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-500" />
                  <h3 className={`text-md font-bold ${textTheme}`}>多窗口 IV × OI 联合分析</h3>
                </div>
                
                {/* Select window buttons */}
                <div className="flex gap-1.5 p-0.5 bg-slate-100 dark:bg-zinc-800/80 rounded-md self-start">
                  {Object.keys(marketStateData.oi_analysis.volatility_regime.windows).map(w => (
                    <button
                      key={w}
                      onClick={() => setActiveAnalysisWindow(w)}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                        activeAnalysisWindow === w
                          ? 'bg-white dark:bg-zinc-900 shadow-xs text-blue-600 dark:text-blue-400'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      {w}D 窗口
                    </button>
                  ))}
                </div>
              </div>

              {/* Joint Regime Details */}
              {marketStateData.oi_analysis.volatility_regime.windows[activeAnalysisWindow] ? (() => {
                const regime = marketStateData.oi_analysis.volatility_regime.windows[activeAnalysisWindow];
                
                if (regime.status !== 'COMPARABLE') {
                  return (
                    <div className="text-center py-6 text-xs text-zinc-500 italic">
                      该窗口的数据不可比：状态 {regime.status}
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="p-3 bg-slate-50 dark:bg-zinc-800/20 rounded border border-slate-100 dark:border-zinc-800">
                        <div className="text-[10px] text-zinc-500 mb-1">联合判定信号</div>
                        <div className={`px-2 py-0.5 inline-block text-xs rounded border ${getSignalBadgeStyle(regime.signal_code)}`}>
                          {regime.label} ({regime.signal_code})
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 dark:bg-zinc-800/20 rounded border border-slate-100 dark:border-zinc-800">
                        <div className="text-[10px] text-zinc-500 mb-1">平值 IV 变动</div>
                        <div className={`text-md font-bold font-mono ${regime.delta_atm_iv_points && regime.delta_atm_iv_points >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                          {regime.delta_atm_iv_points && regime.delta_atm_iv_points >= 0 ? '+' : ''}{regime.delta_atm_iv_points} 个波点
                        </div>
                        <div className="text-[9px] text-zinc-500">基准平值IV: {regime.baseline_atm_iv_percent}% 至 当前: {regime.current_atm_iv_percent}%</div>
                      </div>

                      <div className="p-3 bg-slate-50 dark:bg-zinc-800/20 rounded border border-slate-100 dark:border-zinc-800">
                        <div className="text-[10px] text-zinc-500 mb-1">可比未平仓量变动 (OI)</div>
                        <div className={`text-md font-bold font-mono ${regime.comparable_delta_oi && regime.comparable_delta_oi >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {regime.comparable_delta_oi && regime.comparable_delta_oi >= 0 ? '+' : ''}{regime.comparable_delta_oi?.toLocaleString()} 张
                        </div>
                        <div className="text-[9px] text-zinc-500">基准交易日: {regime.baseline_date}</div>
                      </div>

                      <div className="p-3 bg-slate-50 dark:bg-zinc-800/20 rounded border border-slate-100 dark:border-zinc-800">
                        <div className="text-[10px] text-zinc-500 mb-1">解读置信度</div>
                        <div className={`text-md font-extrabold uppercase ${
                          regime.confidence === 'high' ? 'text-emerald-500' : regime.confidence === 'medium' ? 'text-blue-500' : 'text-amber-500'
                        }`}>
                          {regime.confidence || '中等'}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-zinc-800/20 rounded-lg border border-slate-100 dark:border-zinc-800 space-y-2">
                      <div className="text-xs font-semibold flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 text-blue-500" />
                        联合分析解读：
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pl-4 border-l-2 border-blue-500/50">
                        {regime.interpretation}
                      </p>
                    </div>

                    {marketStateData.oi_analysis.interpretations && marketStateData.oi_analysis.interpretations.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold">详细可解释性证据：</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {marketStateData.oi_analysis.interpretations.map((inter, i) => (
                            <div key={i} className="p-3 border rounded border-slate-100 dark:border-zinc-800 text-xs space-y-1.5 bg-white dark:bg-zinc-900/40">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-blue-500 text-[10px]">{inter.title || '状态解读'}</span>
                                <span className="px-1.5 py-0.2 rounded text-[8px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500">置信: {inter.confidence}</span>
                              </div>
                              {inter.possible_explanations?.map((exp: string, idx: number) => (
                                <p key={idx} className="font-medium text-zinc-700 dark:text-zinc-300">{exp}</p>
                              ))}
                              {inter.evidence && inter.evidence.length > 0 && (
                                <ul className="list-disc pl-4 text-[10px] text-zinc-400 space-y-0.5 mt-1.5">
                                  {inter.evidence.map((ev: any, ei: number) => (
                                    <li key={ei}>
                                      {ev.label || ev.code}: {ev.value !== undefined ? (typeof ev.value === 'number' ? ev.value.toLocaleString() : ev.value) : ''} {ev.unit || ''}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : null}
            </div>
          )}

          {/* D. Expiration Date T-Quotes Split by Month */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                <h3 className={`text-md font-bold ${textTheme}`}>T型持仓与变化明细</h3>
              </div>
              
              {/* Expiry Month Tabs Selector */}
              <div className="flex flex-wrap gap-1.5 mt-2 sm:mt-0">
                {monthTabs.map(m => (
                  <button
                    key={m}
                    onClick={() => setSelectedMonthTab(m)}
                    className={`px-3 py-1 rounded text-xs transition-all ${
                      selectedMonthTab === m
                        ? 'bg-blue-600 text-white font-semibold'
                        : `text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 ${themes[theme].secondary}`
                    }`}
                  >
                    {m === 'all' ? '全部月份' : `${m.split('-')[0]}年${m.split('-')[1]}月`}
                  </button>
                ))}
              </div>
            </div>

            {/* Displaying T-shape tables */}
            {filteredExpiries.length > 0 ? (
              <div className="space-y-4">
                {filteredExpiries.map(exp => {
                  const isExpanded = expandedExpiries[exp] ?? false;
                  
                  // Get Quote details depending on layout mode
                  const hasAnalysis = useWindows && selectedSymbol === '588000.SH' && marketStateData.oi_analysis?.t_shapes?.[exp];
                  const quoteDetails = hasAnalysis
                    ? marketStateData.oi_analysis!.t_shapes[exp]
                    : marketStateData.contract_activity?.t_quotes?.[exp];

                  if (!quoteDetails) return null;

                  const parsedWins = useWindows ? windows.split(',').map(w => w.trim()) : [];

                  return (
                    <div 
                      key={exp} 
                      className={`${themes[theme].card} rounded-lg border ${themes[theme].border} overflow-hidden shadow-xs`}
                    >
                      {/* Expiry header bar */}
                      <div 
                        onClick={() => toggleExpiry(exp)}
                        className={`p-4 flex items-center justify-between cursor-pointer transition-colors bg-slate-50/50 dark:bg-zinc-800/20 hover:bg-slate-100/50 dark:hover:bg-zinc-800/40 border-b ${themes[theme].border}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold font-mono`}>
                            {exp}
                          </div>
                          <div className="text-xs text-zinc-500">
                            平值行权价: <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">{quoteDetails.atm_strike}</span>
                            <span className="mx-2">|</span>
                            标的参考价: <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">{quoteDetails.underlying_price}</span>
                            {hasAnalysis && (
                              <>
                                <span className="mx-2">|</span>
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1 py-0.2 rounded border border-emerald-500/20">多窗口OI分析已启用</span>
                              </>
                            )}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>

                      {/* Expandable Table Content */}
                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse table-auto">
                            <thead>
                              <tr className={`border-b ${themes[theme].border} bg-slate-100/30 dark:bg-zinc-800/10 text-[10px] text-zinc-500 tracking-wider uppercase`}>
                                {/* Call Side Columns */}
                                <th className="px-3 py-2 text-left font-bold w-24">Call 持仓 (OI)</th>
                                <th className="px-2 py-2 text-center font-bold hidden sm:table-cell w-20">Call 成交</th>
                                <th className="px-2 py-2 text-center font-bold hidden sm:table-cell w-16">Call IV</th>
                                
                                {hasAnalysis && parsedWins.map(w => (
                                  <th key={w} className="px-2 py-2 text-center font-bold text-blue-500 dark:text-blue-400 w-24">{w}D ΔOI</th>
                                ))}
                                {!hasAnalysis && (
                                  <>
                                    <th className="px-2 py-2 text-center font-bold hidden lg:table-cell w-16">Call Delta</th>
                                    <th className="px-2 py-2 text-center font-bold hidden lg:table-cell w-16">Call Gamma</th>
                                  </>
                                )}

                                {/* Center Strike Price */}
                                <th className="px-4 py-2 text-center font-bold bg-slate-100/50 dark:bg-zinc-800/50 w-24">行权价 (Strike)</th>

                                {/* Put Side Columns */}
                                {hasAnalysis && [...parsedWins].reverse().map(w => (
                                  <th key={w} className="px-2 py-2 text-center font-bold text-blue-500 dark:text-blue-400 w-24">{w}D ΔOI</th>
                                ))}
                                {!hasAnalysis && (
                                  <>
                                    <th className="px-2 py-2 text-center font-bold hidden lg:table-cell w-16">Put Gamma</th>
                                    <th className="px-2 py-2 text-center font-bold hidden lg:table-cell w-16">Put Delta</th>
                                  </>
                                )}
                                
                                <th className="px-2 py-2 text-center font-bold hidden sm:table-cell w-16">Put IV</th>
                                <th className="px-2 py-2 text-center font-bold hidden sm:table-cell w-20">Put 成交</th>
                                <th className="px-3 py-2 text-right font-bold w-24">Put 持仓 (OI)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                              {quoteDetails.rows?.map((row: any) => {
                                return hasAnalysis
                                  ? renderAnalysisRow(row, isDark, parsedWins)
                                  : renderStandardRow(row, isDark);
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-xs text-zinc-500 bg-slate-50 dark:bg-zinc-800/10 rounded border border-dashed border-slate-200 dark:border-zinc-800">
                该月份暂无到期合约明细
              </div>
            )}
          </div>

          {/* E. OI Rankings Section */}
          {useWindows && marketStateData.oi_analysis?.rankings && (
            <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 border-b pb-3 border-slate-100 dark:border-zinc-800 gap-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-500" />
                  <h3 className={`text-md font-bold ${textTheme}`}>持仓变化异动排名</h3>
                </div>

                {/* Rankings type selector */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'abs_inc', label: '绝对增仓' },
                    { id: 'abs_dec', label: '绝对减仓' },
                    { id: 'rel_inc', label: '相对增仓%' },
                    { id: 'rel_dec', label: '相对减仓%' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveRankingTab(tab.id as any)}
                      className={`px-2.5 py-1 rounded text-xs transition-all ${
                        activeRankingTab === tab.id
                          ? 'bg-blue-600 text-white font-semibold'
                          : `text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 ${themes[theme].secondary}`
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Displaying Rankings List */}
              {(() => {
                const getRankList = () => {
                  const ranks = marketStateData.oi_analysis!.rankings;
                  switch (activeRankingTab) {
                    case 'abs_inc': return ranks.absolute_increase || [];
                    case 'abs_dec': return ranks.absolute_decrease || [];
                    case 'rel_inc': return ranks.relative_increase || [];
                    case 'rel_dec': return ranks.relative_decrease || [];
                  }
                };

                const list = getRankList();
                if (list.length === 0) {
                  return (
                    <div className="text-center py-8 text-xs text-zinc-500 italic">
                      该类型下暂无进入排名的异动合约
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse table-auto text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-zinc-800 text-[10px] text-zinc-400 font-bold tracking-wider uppercase">
                          <th className="pb-2 w-10 text-center">排名</th>
                          <th className="pb-2 pl-4">合约代码</th>
                          <th className="pb-2 text-center">类型</th>
                          <th className="pb-2 text-center">到期日</th>
                          <th className="pb-2 text-center">行权价</th>
                          <th className="pb-2 text-right">变化值</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/40">
                        {list.map((item, idx) => {
                          const isPut = item.option_type?.toLowerCase() === 'put';
                          const anyItem = item as any;
                          const deltaVal = (activeRankingTab === 'abs_inc' || activeRankingTab === 'abs_dec')
                            ? `${anyItem.delta_oi >= 0 ? '+' : ''}${anyItem.delta_oi?.toLocaleString()} 张`
                            : `${anyItem.delta_oi_percent >= 0 ? '+' : ''}${anyItem.delta_oi_percent}%`;
                          
                          return (
                            <tr key={item.contract_code} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/10">
                              <td className="py-2 text-center font-mono font-bold text-zinc-400">{idx + 1}</td>
                              <td className="py-2 pl-4 font-mono font-medium">{item.contract_code}</td>
                              <td className="py-2 text-center">
                                <span className={`px-1.5 py-0.2 text-[10px] rounded font-semibold ${
                                  isPut 
                                    ? 'bg-blue-500/10 text-blue-500' 
                                    : 'bg-emerald-500/10 text-emerald-500'
                                }`}>
                                  {isPut ? 'Put' : 'Call'}
                                </span>
                              </td>
                              <td className="py-2 text-center font-mono">{item.expiry}</td>
                              <td className="py-2 text-center font-mono font-bold">{item.strike?.toFixed(3)}</td>
                              <td className={`py-2 text-right font-mono font-semibold ${
                                (activeRankingTab.includes('inc')) ? 'text-emerald-500' : 'text-rose-500'
                              }`}>
                                {deltaVal}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* F. Methodology Footer Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-zinc-400 dark:text-zinc-500 pt-4">
            <div className="space-y-2 p-4 bg-slate-50 dark:bg-zinc-800/10 border border-slate-100 dark:border-zinc-800/60 rounded-lg">
              <div className="font-bold flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>核心指标算法口径</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[10px] leading-relaxed">
                <li><strong className="text-zinc-600 dark:text-zinc-400">压力指数 (Stress Score)：</strong> {marketStateData.methodology?.formula || '55% * IV分位 + 30% * (100 - 流动性分位) + 15% * Skew分位'}</li>
                <li><strong className="text-zinc-600 dark:text-zinc-400">仓位偏好 (Positioning Score)：</strong> Put/Call 持仓比(35%)、成交比(25%)、持仓日变动差(25%)及平值 IV Skew(15%)。范围在 -100(防守) 至 +100(进攻) 之间。</li>
                <li><strong className="text-zinc-600 dark:text-zinc-400">T型数据口径：</strong> 先对每个合约取每日收盘最后一条记录求和，不重复计算。</li>
              </ul>
            </div>

            <div className="space-y-2 p-4 bg-slate-50 dark:bg-zinc-800/10 border border-slate-100 dark:border-zinc-800/60 rounded-lg">
              <div className="font-bold flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>数据完整性与限制说明</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[10px] leading-relaxed">
                {marketStateData.methodology?.limits?.map((limit, idx) => (
                  <li key={idx}>{limit}</li>
                )) || (
                  <li>该接口从 InfluxDB 聚合市场行为，分析截止时间存在缓存延迟（最高5分钟），历史缺失日期不进行插值计算。</li>
                )}
                {marketStateData.data_quality && (
                  <li>数据覆盖率：{marketStateData.data_quality.coverage !== undefined ? `${(marketStateData.data_quality.coverage * 100).toFixed(1)}%` : '--'} | 分析置信度：{marketStateData.data_quality.confidence || '高'}。</li>
                )}
              </ul>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
