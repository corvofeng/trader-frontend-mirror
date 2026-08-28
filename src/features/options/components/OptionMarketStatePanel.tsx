import { useEffect, useState, useMemo, useRef } from 'react';
import { Theme, themes } from '../../../lib/theme';
import { optionsService, authService } from '../../../lib/services';
import type { OptionMarketStateData } from '../../../lib/services/types';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import { 
  Compass, 
  RefreshCw, 
  AlertTriangle, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  HelpCircle,
  Calendar,
  LineChart
} from 'lucide-react';
import { StockChart } from '../../trading/components/StockChart';

interface StressGaugeProps {
  score: number;
  theme: 'light' | 'dark' | 'blue';
}

function StressGauge({ score, theme }: StressGaugeProps) {
  const isDark = theme === 'dark';
  const percentage = Math.min(Math.max(score / 100, 0), 1);
  
  // Speedometer arc parameters
  const cx = 100;
  const cy = 85;
  const r = 70;
  const startAngle = 150;
  const endAngle = 390; // Total 240 degrees arc
  const totalArc = endAngle - startAngle;
  
  // Calculate tip of the needle
  const needleAngle = startAngle + percentage * totalArc;
  const needleTipX = cx + (r - 12) * Math.cos((needleAngle * Math.PI) / 180);
  const needleTipY = cy + (r - 12) * Math.sin((needleAngle * Math.PI) / 180);
  
  // Needle base width coordinates (orthogonal to tip direction)
  const baseAngleLeft = needleAngle - 90;
  const baseAngleRight = needleAngle + 90;
  const needleLeftX = cx + 6 * Math.cos((baseAngleLeft * Math.PI) / 180);
  const needleLeftY = cy + 6 * Math.sin((baseAngleLeft * Math.PI) / 180);
  const needleRightX = cx + 6 * Math.cos((baseAngleRight * Math.PI) / 180);
  const needleRightY = cy + 6 * Math.sin((baseAngleRight * Math.PI) / 180);

  // Generate tick marks (every 10 units from 0 to 100)
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const tickPct = i / 10;
    const tickAngle = startAngle + tickPct * totalArc;
    const rad = (tickAngle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad);
    const y1 = cy + r * Math.sin(rad);
    const x2 = cx + (r - 6) * Math.cos(rad);
    const y2 = cy + (r - 6) * Math.sin(rad);
    const labelX = cx + (r - 18) * Math.cos(rad);
    const labelY = cy + (r - 18) * Math.sin(rad) + 3; // slight offset for vertical alignment
    ticks.push({ i, x1, y1, x2, y2, labelX, labelY, value: i * 10 });
  }

  // Helper to describe sub-arc
  const getSubArc = (startPct: number, endPct: number) => {
    const a1 = startAngle + startPct * totalArc;
    const a2 = startAngle + endPct * totalArc;
    const rad1 = (a1 * Math.PI) / 180;
    const rad2 = (a2 * Math.PI) / 180;
    const s = { x: cx + r * Math.cos(rad1), y: cy + r * Math.sin(rad1) };
    const e = { x: cx + r * Math.cos(rad2), y: cy + r * Math.sin(rad2) };
    const largeArc = a2 - a1 > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  return (
    <div className="relative flex flex-col items-center select-none w-full max-w-[200px] mx-auto">
      <svg viewBox="0 0 200 120" className="w-full h-auto overflow-visible">
        {/* Glow Shadow filter */}
        <defs>
          <filter id="needle-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Background Arc Track */}
        <path
          d={getSubArc(0, 1)}
          fill="none"
          stroke={isDark ? '#27272a' : '#e2e8f0'}
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* 2. Highlight Arcs representing standard gauge, but with custom visual mapping */}
        {/* Safe/Normal/Low stress: 0 to 0.45 (Green) */}
        <path
          d={getSubArc(0, 0.45)}
          fill="none"
          stroke="#10b981"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Warning/Mid stress: 0.45 to 0.7 (Orange/Yellow) */}
        <path
          d={getSubArc(0.45, 0.7)}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="6"
        />

        {/* Danger/High stress: 0.7 to 1 (Red) */}
        <path
          d={getSubArc(0.7, 1)}
          fill="none"
          stroke="#ef4444"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* 3. Ticks and Labels */}
        {ticks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={isDark ? '#52525b' : '#94a3b8'}
              strokeWidth={t.i % 5 === 0 ? "1.5" : "0.75"}
            />
            {t.i % 2 === 0 && (
              <text
                x={t.labelX}
                y={t.labelY}
                fill={isDark ? '#a1a1aa' : '#64748b'}
                fontSize="8"
                fontWeight="700"
                textAnchor="middle"
                className="font-mono"
              >
                {t.value}
              </text>
            )}
          </g>
        ))}

        {/* 4. Needle Pin shadow */}
        <circle cx={cx} cy={cy} r="6" fill="#000000" opacity="0.1" transform="translate(0, 1.5)" />
        
        {/* 5. Needle Pointer */}
        <path
          d={`M ${needleLeftX} ${needleLeftY} L ${needleTipX} ${needleTipY} L ${needleRightX} ${needleRightY} Z`}
          fill="#f97316"
          filter="url(#needle-glow)"
        />
        <circle cx={cx} cy={cy} r="5" fill="#f97316" />
        <circle cx={cx} cy={cy} r="2" fill="#ffffff" />
      </svg>
      
      {/* 6. Numeric Display */}
      <div className="absolute bottom-[-2px] flex flex-col items-center">
        <span className="text-3xl font-black font-mono tracking-tight text-slate-900 dark:text-zinc-50">
          {score}
        </span>
        <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-zinc-500 mt-[-2px]">
          STRESS SCORE
        </span>
      </div>
    </div>
  );
}

// Helper functions for Cookie management
const getCookie = (name: string): string | null => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop()?.split(';').shift() || '');
  return null;
};

const setCookie = (name: string, value: string, daysActive: number = 365) => {
  const d = new Date();
  d.setTime(d.getTime() + daysActive * 24 * 60 * 60 * 1000);
  const expires = `expires=${d.toUTCString()}`;
  document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax`;
};

interface OptionMarketStatePanelProps {
  theme: Theme;
  selectedSymbol: string;
}

export function OptionMarketStatePanel({ theme, selectedSymbol }: OptionMarketStatePanelProps) {
  // Query parameters state
  const [days, setDays] = useState<number>(120);
  const [asOf, setAsOf] = useState<string>('');
  const [expiryFilter, setExpiryFilter] = useState<string>('');
  
  // Data state
  const [marketStateData, setMarketStateData] = useState<OptionMarketStateData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Cache refresh status
  const [refreshApplied, setRefreshApplied] = useState<boolean | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  
  // Expiry Month Group filter
  const [selectedMonthTab, setSelectedMonthTab] = useState<string>('all');
  const [expandedExpiries, setExpandedExpiries] = useState<Record<string, boolean>>({});

  // Authentication status
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  // Chart refs
  const ivChartRef = useRef<HTMLDivElement | null>(null);
  const ivChartInstanceRef = useRef<any>(null);

  useEffect(() => {
    authService.getUser().then(res => {
      setIsLoggedIn(!!res?.data?.user);
    }).catch(() => setIsLoggedIn(false));
  }, []);

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

  // Fetch when dependency props or query params change
  useEffect(() => {
    loadMarketState(false);
  }, [selectedSymbol, days, asOf, expiryFilter]);

  // Expand expiries by default or load from cookies when data loads
  useEffect(() => {
    if (!marketStateData) return;
    const expiries = marketStateData.term_structure?.map(t => t.expiry)
      || Object.keys(marketStateData.contract_activity?.by_expiry || {})
      || [];
    
    // Read persisted expanded states from cookies
    const cookieVal = getCookie('expiry_expanded_states');
    let persisted: Record<string, boolean> = {};
    if (cookieVal) {
      try {
        persisted = JSON.parse(cookieVal);
      } catch (e) {
        console.error('Failed to parse expiry_expanded_states cookie:', e);
      }
    }

    const initialExpanded: Record<string, boolean> = {};
    expiries.forEach((exp, idx) => {
      if (persisted[exp] !== undefined) {
        initialExpanded[exp] = persisted[exp];
      } else {
        initialExpanded[exp] = idx === 0; // default: first one expanded, others collapsed
      }
    });
    setExpandedExpiries(initialExpanded);
  }, [marketStateData]);


  // Initialize and update historical IV chart
  useEffect(() => {
    if (!ivChartRef.current || !marketStateData?.history || marketStateData.history.length === 0) {
      if (ivChartInstanceRef.current) {
        try {
          ivChartInstanceRef.current.remove();
        } catch (e) {
          // ignore already disposed error
        }
        ivChartInstanceRef.current = null;
      }
      return;
    }

    if (ivChartInstanceRef.current) {
      try {
        ivChartInstanceRef.current.remove();
      } catch (e) {
        // ignore already disposed error
      }
    }

    const isDark = theme === 'dark';
    const gridColor = isDark ? '#27272a' : '#f1f5f9';
    const textColor = isDark ? '#a1a1aa' : '#4b5563';
    const scaleBorderColor = isDark ? '#3f3f46' : '#e4e4e7';

    const chart = createChart(ivChartRef.current, {
      width: ivChartRef.current.clientWidth || 400,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: textColor,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: gridColor, style: LineStyle.Solid, visible: true },
        horzLines: { color: gridColor, style: LineStyle.Solid, visible: true },
      },
      rightPriceScale: {
        borderColor: scaleBorderColor,
        textColor: textColor,
        autoScale: true,
      },
      timeScale: {
        borderColor: scaleBorderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });
    ivChartInstanceRef.current = chart;

    const historyData = marketStateData.history;

    // Series 1: ATM IV (Purple #8b5cf6)
    const atmIvSeries = chart.addLineSeries({
      color: '#8b5cf6',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(2)}%`,
      },
    });
    const atmData = historyData
      .map(h => ({ time: h.date, value: h.atm_iv ?? 0 }))
      .filter(d => d.value > 0)
      .sort((a, b) => a.time.localeCompare(b.time));
    atmIvSeries.setData(atmData);

    // Series 2: Call IV (Emerald #10b981)
    const callIvSeries = chart.addLineSeries({
      color: '#10b981',
      lineWidth: 1,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(2)}%`,
      },
    });
    const callData = historyData
      .map(h => ({ time: h.date, value: h.atm_call_iv ?? 0 }))
      .filter(d => d.value > 0)
      .sort((a, b) => a.time.localeCompare(b.time));
    callIvSeries.setData(callData);

    // Series 3: Put IV (Blue #3b82f6)
    const putIvSeries = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 1,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(2)}%`,
      },
    });
    const putData = historyData
      .map(h => ({ time: h.date, value: h.atm_put_iv ?? 0 }))
      .filter(d => d.value > 0)
      .sort((a, b) => a.time.localeCompare(b.time));
    putIvSeries.setData(putData);

    // Fit content initially
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (ivChartRef.current && ivChartRef.current.clientWidth > 0) {
        chart.resize(ivChartRef.current.clientWidth, 400);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        chart.remove();
      } catch (e) {
        // ignore already disposed error
      }
      if (ivChartInstanceRef.current === chart) {
        ivChartInstanceRef.current = null;
      }
    };
  }, [marketStateData?.history, theme]);

  const toggleExpiry = (exp: string) => {
    setExpandedExpiries(prev => {
      const nextState = !prev[exp];
      const nextExpanded = { ...prev, [exp]: nextState };
      
      // Persist the state in cookie
      const cookieVal = getCookie('expiry_expanded_states');
      let persisted: Record<string, boolean> = {};
      if (cookieVal) {
        try {
          persisted = JSON.parse(cookieVal);
        } catch (e) {
          // ignore
        }
      }
      persisted[exp] = nextState;
      setCookie('expiry_expanded_states', JSON.stringify(persisted));
      
      return nextExpanded;
    });
  };

  // Group Expiration Dates by Month
  const groupedExpiries = useMemo(() => {
    const dates = marketStateData?.term_structure?.map(t => t.expiry)
      || Object.keys(marketStateData?.contract_activity?.by_expiry || {})
      || [];
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
    const allDates = (marketStateData?.term_structure?.map(t => t.expiry)
      || Object.keys(marketStateData?.contract_activity?.by_expiry || {})
      || []).sort();
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



  const isDark = theme === 'dark';
  const textTheme = isDark ? 'text-zinc-100' : 'text-slate-900';

  return (
    <div className="space-y-6">
      {/* 1. Header Filter Controls Card */}
      {isLoggedIn && (
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
            <label className="text-xs font-semibold text-slate-600 dark:text-zinc-350">自然日观察窗口 (Days)</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={`px-3 py-1.5 rounded text-xs border focus:ring-1 focus:ring-blue-500 outline-none ${themes[theme].input}`}
            >
              {[20, 60, 90, 120, 180, 240, 360].map(d => (
                <option key={d} value={d}>{d} 天</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-zinc-350">截止分析日期 (As Of)</label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              placeholder="最新数据日"
              className={`px-3 py-1.5 rounded text-xs border focus:ring-1 focus:ring-blue-500 outline-none ${themes[theme].input}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-zinc-350">到期月过滤 (Expiry)</label>
            <input
              type="text"
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value)}
              placeholder="e.g. 2026-08-26,2026-09-23"
              className={`px-3 py-1.5 rounded text-xs border focus:ring-1 focus:ring-blue-500 outline-none ${themes[theme].input}`}
            />
          </div>
        </div>
      </div>
      )}

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

              <div className="flex items-center justify-center py-4 relative min-h-[140px]">
                <StressGauge score={marketStateData.state.stress_score} theme={theme} />
              </div>

              <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                结合ATM IV分位数(55%)、期权流动性(30%)与 Put/Call Skew(15%)计算所得，反映当前隐含市场交易紧张程度。
              </p>
            </div>

            {/* Positioning Bias Slider Card */}
            <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border} flex flex-col justify-between`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">仓位偏好与定价偏向</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border bg-slate-50/55 dark:bg-zinc-800/10 ${getPositioningLabel(marketStateData.state.positioning_score).color}`}>
                  {getPositioningLabel(marketStateData.state.positioning_score).text}
                </span>
              </div>

              <div className="py-8 px-2 flex flex-col justify-center min-h-[140px]">
                {/* Horizontal slider bar */}
                <div className="relative w-full h-3 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-between border border-slate-200 dark:border-zinc-700">
                  <div className="absolute left-0 w-1/2 h-full bg-blue-500/20 rounded-l-full border-r border-slate-300 dark:border-zinc-600" />
                  <div className="absolute right-0 w-1/2 h-full bg-emerald-500/20 rounded-r-full" />
                  
                  {/* Score Pointer */}
                  <div 
                    className="absolute w-6 h-6 rounded-full border-2 border-slate-400 dark:border-zinc-500 bg-white dark:bg-zinc-900 shadow-md flex items-center justify-center -translate-x-1/2 transition-all hover:scale-105" 
                    style={{ left: `${((marketStateData.state.positioning_score + 100) / 200) * 100}%` }}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full ${
                      marketStateData.state.positioning_score < -15 ? 'bg-blue-500 shadow-xs shadow-blue-500/50' : marketStateData.state.positioning_score > 15 ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-zinc-400'
                    }`} />
                  </div>

                  <span className="absolute left-1 -bottom-6 text-[9.5px] text-slate-500 dark:text-zinc-400 font-mono font-semibold">-100 Put偏好</span>
                  <span className="absolute right-1 -bottom-6 text-[9.5px] text-slate-500 dark:text-zinc-400 font-mono font-semibold">+100 Call偏好</span>
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-6 text-[9.5px] text-slate-500 dark:text-zinc-400 font-mono font-semibold">0 中性</span>
                </div>
                
                <div className="text-center mt-8">
                  <span className={`text-3xl font-black font-mono tracking-tight ${textTheme}`}>
                    {marketStateData.state.positioning_score > 0 ? `+${marketStateData.state.positioning_score}` : marketStateData.state.positioning_score}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 ml-1 font-bold">分</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center leading-relaxed">
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
              <div className="space-y-1 bg-slate-50/50 dark:bg-zinc-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/30">
                <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">标的资产价格</div>
                <div className={`text-lg font-black font-mono tracking-tight ${textTheme}`}>{marketStateData.latest.underlying_price?.value ?? '--'}</div>
              </div>
              <div className="space-y-1 bg-slate-50/50 dark:bg-zinc-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/30">
                <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">平值 IV</div>
                <div className={`text-lg font-black font-mono tracking-tight ${textTheme}`}>{marketStateData.latest.atm_iv ? `${marketStateData.latest.atm_iv.value?.toFixed(2)}%` : '--'}</div>
              </div>
              <div className="space-y-1 bg-slate-50/50 dark:bg-zinc-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/30">
                <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">综合流动性</div>
                <div className={`text-lg font-black font-mono tracking-tight ${textTheme}`}>{marketStateData.latest.liquidity ? `${marketStateData.latest.liquidity.value?.toFixed(1)}` : '--'}</div>
              </div>
              <div className="space-y-1 bg-slate-50/50 dark:bg-zinc-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/30">
                <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">总未平仓量 (OI)</div>
                <div className={`text-lg font-black font-mono tracking-tight ${textTheme}`}>{marketStateData.latest.open_interest?.total?.toLocaleString() ?? '--'}</div>
              </div>
              <div className="space-y-1 bg-slate-50/50 dark:bg-zinc-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/30">
                <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">成交量 (Volume)</div>
                <div className={`text-lg font-black font-mono tracking-tight ${textTheme}`}>{marketStateData.latest.volume?.total?.toLocaleString() ?? '--'}</div>
              </div>
              <div className="space-y-1 bg-slate-50/50 dark:bg-zinc-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/30">
                <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">IV Skew (P-C)</div>
                <div className={`text-lg font-black font-mono tracking-tight ${textTheme}`}>{marketStateData.latest.put_call_iv_skew !== undefined ? `${marketStateData.latest.put_call_iv_skew.value?.toFixed(2)}%` : '--'}</div>
              </div>
              <div className="space-y-1 bg-slate-50/50 dark:bg-zinc-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/30">
                <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">平均买卖价差</div>
                <div className={`text-lg font-black font-mono tracking-tight ${textTheme}`}>{marketStateData.latest.liquidity ? `${marketStateData.latest.liquidity.average_spread_percent?.toFixed(3)}%` : '--'}</div>
              </div>
              <div className="space-y-1 bg-slate-50/50 dark:bg-zinc-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/30">
                <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">主力持仓集中度</div>
                <div className={`text-lg font-black font-mono tracking-tight ${textTheme}`}>{marketStateData.latest.concentration ? `${marketStateData.latest.concentration.top_five_contract_share?.toFixed(1)}%` : '--'}</div>
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

          {/* C. Charts Layout: K-Line & IV Trend Chart side-by-side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Card 1: K-Line Candlestick Chart */}
            <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border} flex flex-col`}>
              <div className="flex items-center justify-between pb-1.5 mb-4 border-b border-slate-100 dark:border-zinc-800/60">
                <div className="flex items-center gap-2">
                  <LineChart className="w-5 h-5 text-blue-500" />
                  <h3 className={`text-md font-bold ${textTheme}`}>标的资产 K 线走势 ({selectedSymbol})</h3>
                </div>
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                  最近 6 个月数据
                </div>
              </div>
              <div className="h-[400px] w-full rounded-lg overflow-hidden border border-slate-150 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-1 min-h-[400px]">
                <StockChart
                  stockCode={selectedSymbol}
                  theme={theme}
                  compactMode={true}
                  fillContainer={true}
                  defaultVisibleMonths={6}
                />
              </div>
            </div>

            {/* Card 2: IV Historical Trend Chart */}
            {marketStateData?.history && marketStateData.history.length > 0 ? (
              <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border} flex flex-col`}>
                <div className="flex items-center justify-between pb-1.5 mb-4 border-b border-slate-100 dark:border-zinc-800/60">
                  <div className="flex items-center gap-2">
                    <LineChart className="w-5 h-5 text-blue-500" />
                    <h3 className={`text-md font-bold ${textTheme}`}>IV 历史走势分析 ({marketStateData.history.length}D)</h3>
                  </div>
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                    最近 {marketStateData.history.length} 个自然日
                  </div>
                </div>
                
                <div className="relative w-full h-[400px] flex-1 min-h-[400px]">
                  <div ref={ivChartRef} className="w-full h-full" />
                </div>
                
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 justify-center text-[10.5px] text-slate-500 dark:text-zinc-400 font-medium pt-2 border-t border-slate-100 dark:border-zinc-800/60 mt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] inline-block"></span>
                    <span>综合平值 ATM IV (Call & Put 均值)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] inline-block"></span>
                    <span>认购平值 ATM Call IV</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] inline-block"></span>
                    <span>认沽平值 ATM Put IV</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className={`${themes[theme].card} rounded-lg p-5 border ${themes[theme].border} flex items-center justify-center min-h-[460px] text-zinc-500 text-xs italic`}>
                暂无历史 IV 数据
              </div>
            )}
          </div>



          {/* D. Expiration Date Contract Activity Split by Month */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                <h3 className={`text-md font-bold ${textTheme}`}>各到期日主力合约异动明细</h3>
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

            {/* Displaying Expiry Activity Blocks */}
            {filteredExpiries.length > 0 ? (
              <div className="space-y-4">
                {filteredExpiries.map(exp => {
                  const isExpanded = expandedExpiries[exp] ?? false;
                  const termDetails = marketStateData.term_structure?.find(t => t.expiry === exp);
                  const activity = marketStateData.contract_activity?.by_expiry?.[exp];

                  return (
                    <div 
                      key={exp} 
                      className={`${themes[theme].card} rounded-lg border ${themes[theme].border} overflow-hidden shadow-xs`}
                    >
                      {/* Expiry header bar */}
                      <div 
                        onClick={() => toggleExpiry(exp)}
                        className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between cursor-pointer transition-colors bg-slate-50/50 dark:bg-zinc-800/20 hover:bg-slate-100/50 dark:hover:bg-zinc-800/40 border-b ${themes[theme].border} gap-2`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm font-bold font-mono`}>
                            {exp}
                          </div>
                          {termDetails && (
                            <div className="text-sm text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>剩余 <span className="font-mono font-extrabold text-zinc-800 dark:text-zinc-200">{termDetails.days_to_expiry}</span> 天</span>
                              <span className="text-zinc-300 dark:text-zinc-800">|</span>
                              <span>Call IV: <span className="font-mono font-extrabold text-pink-600 dark:text-pink-400">{termDetails.atm_call_iv?.toFixed(2)}%</span></span>
                              <span className="text-zinc-300 dark:text-zinc-800">|</span>
                              <span>Put IV: <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">{termDetails.atm_put_iv?.toFixed(2)}%</span></span>
                              {termDetails.put_skew_25d !== undefined && (
                                <>
                                  <span className="text-zinc-300 dark:text-zinc-800">|</span>
                                  <span>Put Skew: <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400">{termDetails.put_skew_25d?.toFixed(2)}%</span></span>
                                </>
                              )}
                              {termDetails.put_call_oi_ratio !== undefined && (
                                <>
                                  <span className="text-zinc-300 dark:text-zinc-800">|</span>
                                  <span>P/C 持仓比: <span className="font-mono font-extrabold text-zinc-800 dark:text-zinc-200">{termDetails.put_call_oi_ratio}</span></span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-zinc-400 self-end sm:self-auto" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-zinc-400 self-end sm:self-auto" />
                        )}
                      </div>

                      {/* Expandable Activity Content */}
                      {isExpanded && (() => {
                        if (!activity) {
                          return (
                            <div className="p-6 text-center text-xs text-zinc-500 italic">
                              暂无该到期日的合约异动数据
                            </div>
                          );
                        }

                        const renderActivityTable = (title: string, list: any[], type: 'build' | 'unwind' | 'active') => {
                          return (
                            <div className="space-y-2 flex-1 min-w-[285px] p-4 rounded-lg bg-slate-50/50 dark:bg-zinc-800/10 border border-slate-100 dark:border-zinc-800/50">
                              <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200 border-b border-slate-200 dark:border-zinc-800 pb-1.5 flex justify-between items-center">
                                <span>{title}</span>
                                <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-medium font-mono">TOP 5</span>
                              </div>
                              
                              {list && list.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="text-zinc-400 text-[10px] sm:text-xs uppercase font-bold border-b border-slate-200 dark:border-zinc-800">
                                        <th className="pb-1.5 pl-1">合约行权价</th>
                                        <th className="pb-1.5 text-center">类型</th>
                                        <th className="pb-1.5 text-right">
                                          {type === 'active' ? '成交量' : '持仓变化'}
                                        </th>
                                        <th className="pb-1.5 text-right">IV</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/40">
                                      {list.map((item: any) => {
                                        const isPut = item.option_type?.toLowerCase() === 'put';
                                        let changeVal = '';
                                        let changePctStr = '';
                                        
                                        if (type === 'active') {
                                          changeVal = item.volume?.toLocaleString();
                                        } else {
                                          changeVal = `${item.open_interest_change >= 0 ? '+' : ''}${item.open_interest_change?.toLocaleString()}`;
                                          const baseOI = (item.open_interest || 0) - (item.open_interest_change || 0);
                                          const oiChange = item.open_interest_change || 0;
                                          if (oiChange !== 0) {
                                            let pct = 0;
                                            if (baseOI > 0) {
                                              pct = (oiChange / baseOI) * 100;
                                            } else if (item.open_interest > 0) {
                                              pct = 100;
                                            }
                                            changePctStr = `${oiChange >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
                                          } else {
                                            changePctStr = '0.0%';
                                          }
                                        }
                                        
                                        return (
                                          <tr key={item.contract_code} className="hover:bg-slate-100/30 dark:hover:bg-zinc-800/20">
                                            <td className="py-2.5 pl-1 font-medium font-mono text-xs" title={item.contract_name}>
                                              <span className="font-bold text-zinc-850 dark:text-zinc-150">{item.strike_price}</span>
                                              <span className="block text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-normal">#{item.contract_code}</span>
                                            </td>
                                            <td className="py-2.5 text-center">
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                                isPut 
                                                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400' 
                                                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 dark:text-emerald-400'
                                              }`}>
                                                {isPut ? '认沽' : '认购'}
                                              </span>
                                            </td>
                                            <td className="py-2.5 text-right font-mono text-xs sm:text-sm">
                                              {type === 'active' ? (
                                                <span className="font-extrabold text-zinc-700 dark:text-zinc-300">
                                                  {changeVal}
                                                </span>
                                              ) : (
                                                <div className="flex flex-col items-end leading-tight">
                                                  <span className={`font-extrabold ${
                                                    item.open_interest_change >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                                  }`}>
                                                    {changeVal}
                                                  </span>
                                                  <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500 mt-0.5">
                                                    {changePctStr}
                                                  </span>
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2.5 text-right font-mono text-xs text-zinc-600 dark:text-zinc-400">
                                              {item.implied_volatility ? `${item.implied_volatility.toFixed(1)}%` : '--'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="text-center py-6 text-[10px] text-zinc-400 italic">暂无合约</div>
                              )}
                            </div>
                          );
                        };

                        return (
                          <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {renderActivityTable("主力增仓排行 (Largest Builds)", activity.largest_builds || [], 'build')}
                            {renderActivityTable("主力减仓排行 (Largest Unwinds)", activity.largest_unwinds || [], 'unwind')}
                            {renderActivityTable("活跃成交排行 (Most Active)", activity.most_active || [], 'active')}
                          </div>
                        );
                      })()}
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
