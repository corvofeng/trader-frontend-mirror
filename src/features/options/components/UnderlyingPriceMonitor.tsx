import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAutoRefresh, useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { AnimatedFlash } from './AnimatedFlash';
import { Theme, themes } from '../../../lib/theme';
import { ChevronLeft, ChevronRight, Hourglass, RefreshCw, Activity } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface UnderlyingPriceMonitorProps {
  symbol: string;
  theme: Theme;
  refreshNonce?: number;
  isMobile?: boolean;
}

export function UnderlyingPriceMonitor({ symbol, theme, refreshNonce = 0, isMobile: isMobileProp }: UnderlyingPriceMonitorProps) {
  const { prices, isConnected, queryPrice } = useOptionPriceWebSocket();
  const [history, setHistory] = useState<{ time: string; price: number }[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastPushedAtRef = useRef<number>(0);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeDragPointerIdRef = useRef<number | null>(null);

  // Screen width detection for responsive fallback
  const [isMobileWidth, setIsMobileWidth] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    setIsMobileWidth(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobileWidth(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const isMobileMode = isMobileProp ?? isMobileWidth;

  const getViewportSize = useCallback(() => {
    const vv = window.visualViewport;
    return {
      width: vv?.width ?? window.innerWidth,
      height: vv?.height ?? window.innerHeight,
    };
  }, []);
  const [viewportSize, setViewportSize] = useState(() => getViewportSize());
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('underlying_price_monitor_collapsed');
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch {
      void 0;
    }
    return getViewportSize().width < 1280;
  });

  const getMonitorDims = useCallback((size = viewportSize) => {
    const compact = size.width < 768;
    const width = compact ? Math.max(220, Math.min(240, size.width - 16)) : 256;
    const approxHeight = compact ? 380 : 430;
    const chartHeight = compact ? 96 : 128;
    return { width, approxHeight, chartHeight, compact };
  }, [viewportSize]);

  const clampPanelPos = useCallback((pos: { top: number; left: number }, size = viewportSize) => {
    const dims = getMonitorDims(size);
    const top = Math.max(8, Math.min(pos.top, Math.max(8, size.height - dims.approxHeight)));
    const left = Math.max(8, Math.min(pos.left, Math.max(8, size.width - dims.width - 8)));
    return { top, left };
  }, [getMonitorDims, viewportSize]);

  const getDefaultPanelPos = useCallback((size = viewportSize) => {
    const dims = getMonitorDims(size);
    const topSeed = size.width < 1280
      ? Math.max(96, size.height - dims.approxHeight - 88)
      : 96;
    return clampPanelPos(
      {
        top: topSeed,
        left: size.width - dims.width - 8,
      },
      size
    );
  }, [clampPanelPos, getMonitorDims, viewportSize]);

  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>(() => {
    try {
      const saved = localStorage.getItem('underlying_price_monitor_pos');
      if (saved) {
        const obj = JSON.parse(saved);
        if (typeof obj?.top === 'number' && typeof obj?.left === 'number') {
          return obj;
        }
      }
      const legacy = localStorage.getItem('underlying_price_monitor_custom');
      if (legacy) {
        const obj = JSON.parse(legacy);
        if (typeof obj?.top === 'number' && typeof obj?.left === 'number') {
          return obj;
        }
      }
    } catch {
      void 0;
    }
    return getDefaultPanelPos(getViewportSize());
  });

  const persistPanelPos = useCallback((pos: { top: number; left: number }) => {
    try {
      localStorage.setItem('underlying_price_monitor_pos', JSON.stringify(pos));
      localStorage.setItem('underlying_price_monitor_custom', JSON.stringify(pos));
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    const syncViewport = () => {
      setViewportSize((prev) => {
        const next = getViewportSize();
        if (prev.width === next.width && prev.height === next.height) {
          return prev;
        }
        return next;
      });
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
    };
  }, [getViewportSize]);

  useEffect(() => {
    setPanelPos((prev) => {
      const next = clampPanelPos(prev);
      if (next.top === prev.top && next.left === prev.left) {
        return prev;
      }
      persistPanelPos(next);
      return next;
    });
  }, [clampPanelPos, persistPanelPos, viewportSize.height, viewportSize.width]);

  const autoRefreshIntervalMs = 5000;
  const { remainingMs, progress, triggerNow } = useAutoRefresh(
    () => {
      if (!symbol) return;
      queryPrice([symbol]);
    },
    {
      enabled: isConnected && !!symbol,
      intervalMs: autoRefreshIntervalMs,
      immediate: true,
      tickMs: 500,
    }
  );

  const prevRefreshNonceRef = useRef<number>(refreshNonce);
  useEffect(() => {
    if (prevRefreshNonceRef.current === refreshNonce) return;
    prevRefreshNonceRef.current = refreshNonce;
    triggerNow();
  }, [refreshNonce, triggerNow]);

  const priceData = prices[symbol];
  const currentPrice = priceData?.price;
  const lastUpdated = priceData?.timestamp ? new Date(priceData.timestamp).toLocaleTimeString() : null;

  const depth = 5;
  const bidRows = useMemo(() => {
    return Array.from({ length: depth }).map((_, i) => {
      const price = priceData?.bid_price?.[i] ?? (i === 0 ? priceData?.bid : undefined);
      const vol = priceData?.bid_vol?.[i];
      return { level: i + 1, price, vol };
    });
  }, [priceData]);

  const askRows = useMemo(() => {
    return Array.from({ length: depth }).map((_, i) => {
      const price = priceData?.ask_price?.[i] ?? (i === 0 ? priceData?.ask : undefined);
      const vol = priceData?.ask_vol?.[i];
      return { level: i + 1, price, vol };
    });
  }, [priceData]);

  const bestBid = bidRows[0]?.price;
  const bestAsk = askRows[0]?.price;
  const spread = typeof bestAsk === 'number' && typeof bestBid === 'number' ? bestAsk - bestBid : null;

  // Max volume calculation for visualization progress bar
  const maxVolume = useMemo(() => {
    const values = [...bidRows, ...askRows]
      .map((row) => (typeof row.vol === 'number' && Number.isFinite(row.vol) ? row.vol : 0));
    return Math.max(0, ...values);
  }, [askRows, bidRows]);

  const getVolumeRatio = useCallback((volume?: number) => {
    if (typeof volume !== 'number' || !Number.isFinite(volume) || volume <= 0 || maxVolume <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, volume / maxVolume));
  }, [maxVolume]);

  useEffect(() => {
    setHistory([]);
    lastPushedAtRef.current = 0;
  }, [symbol]);

  useEffect(() => {
    if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice)) return;
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString();

    setHistory((prev) => {
      const lastItem = prev[prev.length - 1];
      if (lastItem && lastItem.price === currentPrice && now - lastPushedAtRef.current < 1500) {
        return prev;
      }
      lastPushedAtRef.current = now;
      const next = [...prev, { time: timeStr, price: currentPrice }];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, [currentPrice]);

  const chartData: ChartData<'line'> = useMemo(() => {
    return {
      labels: history.map(h => h.time),
      datasets: [
        {
          label: symbol,
          data: history.map(h => h.price),
          borderColor: 'rgb(59, 130, 246)', // blue-500
          backgroundColor: 'rgba(59, 130, 246, 0.25)',
          tension: 0.2, // smoother curve
          pointRadius: history.length > 1 ? 1.5 : 2,
          borderWidth: 2,
          fill: false,
        },
      ],
    };
  }, [history, symbol]);

  const chartOptions: ChartOptions<'line'> = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context) => `${Number(context.parsed.y).toFixed(4)}`,
          },
        },
      },
      scales: {
        x: {
          display: false,
          grid: { display: false },
        },
        y: {
          position: 'right',
          ticks: {
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            callback: (value) => Number(value).toFixed(4),
          },
          grid: {
            color: theme === 'dark' ? 'rgba(75, 85, 99, 0.24)' : 'rgba(209, 213, 219, 0.35)',
          },
        },
      },
    };
  }, [theme]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (collapsed) return;
    if ((e.target as HTMLElement | null)?.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    activeDragPointerIdRef.current = e.pointerId;
    try {
      (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
    } catch {
      void 0;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const offsetX = e.clientX - (rect?.left ?? 0);
    const offsetY = e.clientY - (rect?.top ?? 0);
    dragOffsetRef.current = { x: offsetX, y: offsetY };
    const onDrag = (ev: PointerEvent) => {
      if (activeDragPointerIdRef.current != null && ev.pointerId !== activeDragPointerIdRef.current) return;
      ev.preventDefault();
      const next = clampPanelPos({
        top: ev.clientY - dragOffsetRef.current.y,
        left: ev.clientX - dragOffsetRef.current.x,
      });
      setPanelPos(next);
      persistPanelPos(next);
    };
    const endDrag = () => {
      setDragging(false);
      activeDragPointerIdRef.current = null;
      window.removeEventListener('pointermove', onDrag);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
    window.addEventListener('pointermove', onDrag, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }, [clampPanelPos, collapsed, persistPanelPos]);

  const dockToRight = useCallback(() => {
    const next = getDefaultPanelPos();
    setPanelPos(next);
    persistPanelPos(next);
  }, [getDefaultPanelPos, persistPanelPos]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('underlying_price_monitor_collapsed', next ? '1' : '0');
      } catch {
        void 0;
      }
      return next;
    });
  };

  if (!symbol) return null;

  // 1. MOBILE INLINE CARD LAYOUT
  if (isMobileMode) {
    return (
      <div className={`${themes[theme].card} rounded-lg border ${themes[theme].border} shadow-md overflow-hidden w-full mt-4`}>
        <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>标的盘口与走势</div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isConnected
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}
                >
                  <Activity className="mr-1 h-3 w-3" />
                  {isConnected ? 'WS 已连接' : 'WS 连接中'}
                </span>
              </div>
              <div className={`mt-1 text-sm ${themes[theme].text}`}>
                <span className="font-mono font-semibold">{symbol}</span>
                {lastUpdated ? <span className="ml-2 text-xs opacity-60">最近更新 {lastUpdated}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[90px]">
                <div className={`text-[11px] uppercase tracking-wide ${themes[theme].text} opacity-60`}>最新价</div>
                <div className={`text-xl font-bold ${themes[theme].text}`}>
                  <AnimatedFlash value={typeof currentPrice === 'number' ? currentPrice.toFixed(4) : '-'} type="price" />
                </div>
              </div>
              <div className="min-w-[140px]">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className={`${themes[theme].text} opacity-60`}>自动刷新</span>
                  <span className={`${themes[theme].text} opacity-60`}>
                    {isConnected ? `${Math.ceil(remainingMs / 1000)}s` : '--'}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div className="h-full bg-blue-500" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
              <button
                type="button"
                onClick={triggerNow}
                disabled={!isConnected || !symbol}
                className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium ${themes[theme].secondary} ${
                  !isConnected ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                刷新行情
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 grid-cols-1 md:grid-cols-2 sm:p-6">
          {/* Depth Section */}
          <div className={`rounded-lg border ${themes[theme].border} p-3 sm:p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div className={`text-sm font-semibold ${themes[theme].text}`}>盘口 5 档</div>
              <div className={`text-xs ${themes[theme].text} opacity-70`}>
                点差 {spread != null ? spread.toFixed(4) : '-'}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Buy Side */}
              <div className="min-w-0">
                <div className="mb-2 text-center text-xs font-semibold text-rose-500">买盘</div>
                <div className={`mb-1 grid grid-cols-[20px_1fr_40px] gap-1 px-1 text-[10px] ${themes[theme].text} opacity-60`}>
                  <div>档位</div>
                  <div className="text-right">价格</div>
                  <div className="text-right">量</div>
                </div>
                <div className="space-y-1">
                  {bidRows.map((row) => (
                    <div
                      key={`bid-${row.level}`}
                      className="grid grid-cols-[20px_1fr_40px] gap-1 rounded px-1 py-0.5 text-xs items-center"
                    >
                      <div className={`${themes[theme].text} opacity-75 text-[10px]`}>买{row.level}</div>
                      <div className="min-w-0">
                        <div className="text-right font-mono text-[11px] text-rose-500 font-semibold">
                          {typeof row.price === 'number' ? row.price.toFixed(4) : '-'}
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950/40">
                          <div
                            className="h-full rounded-full bg-rose-500/80 transition-[width] duration-300"
                            style={{ width: `${Math.round(getVolumeRatio(row.vol) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className={`text-right font-mono text-[10px] ${themes[theme].text}`}>{row.vol ?? '-'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sell Side */}
              <div className="min-w-0">
                <div className="mb-2 text-center text-xs font-semibold text-emerald-500">卖盘</div>
                <div className={`mb-1 grid grid-cols-[20px_1fr_40px] gap-1 px-1 text-[10px] ${themes[theme].text} opacity-60`}>
                  <div>档位</div>
                  <div className="text-right">价格</div>
                  <div className="text-right">量</div>
                </div>
                <div className="space-y-1">
                  {askRows.map((row) => (
                    <div
                      key={`ask-${row.level}`}
                      className="grid grid-cols-[20px_1fr_40px] gap-1 rounded px-1 py-0.5 text-xs items-center"
                    >
                      <div className={`${themes[theme].text} opacity-75 text-[10px]`}>卖{row.level}</div>
                      <div className="min-w-0">
                        <div className="text-right font-mono text-[11px] text-emerald-500 font-semibold">
                          {typeof row.price === 'number' ? row.price.toFixed(4) : '-'}
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                          <div
                            className="h-full rounded-full bg-emerald-500/80 transition-[width] duration-300"
                            style={{ width: `${Math.round(getVolumeRatio(row.vol) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className={`text-right font-mono text-[10px] ${themes[theme].text}`}>{row.vol ?? '-'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Chart Section */}
          <div className={`rounded-lg border ${themes[theme].border} p-3 sm:p-4 flex flex-col justify-between`}>
            <div className="mb-3 flex items-center justify-between">
              <div className={`text-sm font-semibold ${themes[theme].text}`}>短线走势</div>
              <div className={`text-xs ${themes[theme].text} opacity-70`}>
                {history.length > 0 ? `最近 ${history.length} 个点` : '暂无数据'}
              </div>
            </div>
            <div className="h-44 sm:h-52">
              {history.length > 0 ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <div className={`flex h-full items-center justify-center rounded border border-dashed ${themes[theme].border} text-sm ${themes[theme].text} opacity-70`}>
                  {isConnected ? '已发起订阅，等待首个行情点...' : '正在建立行情连接...'}
                </div>
              )}
            </div>
            <div className={`mt-3 grid grid-cols-3 gap-3 text-xs ${themes[theme].text}`}>
              <div>
                <div className="opacity-60">买一</div>
                <div className="font-mono font-semibold text-rose-500">
                  {typeof bestBid === 'number' ? bestBid.toFixed(4) : '-'}
                </div>
              </div>
              <div>
                <div className="opacity-60">卖一</div>
                <div className="font-mono font-semibold text-emerald-500">
                  {typeof bestAsk === 'number' ? bestAsk.toFixed(4) : '-'}
                </div>
              </div>
              <div>
                <div className="opacity-60">点差</div>
                <div className="font-mono font-semibold">{spread != null ? spread.toFixed(4) : '-'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. DESKTOP FLOATING LAYOUT (COLLAPSED STATE)
  if (collapsed) {
    const collapsedStyle: React.CSSProperties = {
      position: 'fixed',
      zIndex: 48,
      right: 0,
      width: 36,
      height: 156,
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      transition: `top 240ms ease, bottom 240ms ease, width 240ms ease, opacity 240ms ease, transform 240ms ease`
    };
    collapsedStyle.top = clampPanelPos(panelPos).top;
    
    return (
      <div
        className={`${themes[theme].card} shadow-lg border ${themes[theme].border} overflow-hidden opacity-90 hover:opacity-100 transition-opacity rounded-l-lg`}
        style={collapsedStyle}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`w-full h-full flex items-center justify-center ${themes[theme].secondary}`}
          aria-label="展开价格窗口"
          title="展开"
        >
          <div className="flex flex-col items-center gap-2">
            <ChevronLeft className="w-4 h-4" />
            <div
              className={`text-[10px] font-semibold ${themes[theme].text}`}
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              价格
            </div>
          </div>
        </button>
      </div>
    );
  }

  // 3. DESKTOP FLOATING LAYOUT (EXPANDED STATE)
  const baseClass = `${themes[theme].card} shadow-lg rounded-lg border ${themes[theme].border} overflow-hidden opacity-90 hover:opacity-100 transition-opacity ${dragging ? 'cursor-grabbing' : 'cursor-move'}`;
  const motionMs = 240;
  const monitorDims = getMonitorDims();
  const clampedPanelPos = clampPanelPos(panelPos);

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 48,
    width: monitorDims.width,
    top: clampedPanelPos.top,
    left: clampedPanelPos.left,
    transition: dragging
      ? 'none'
      : `top ${motionMs}ms ease, left ${motionMs}ms ease, width ${motionMs}ms ease, opacity ${motionMs}ms ease, transform ${motionMs}ms ease`
  };

  return (
    <div ref={containerRef} className={baseClass} style={style}>
      <div
        className={`p-3 border-b ${themes[theme].border} bg-opacity-50 backdrop-blur select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={startDrag}
        style={{ touchAction: 'none' }}
        title="拖动移动位置"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{symbol}</div>
            <div className={`text-[10px] ${themes[theme].text} opacity-60`}>
              {lastUpdated ? `更新 ${lastUpdated}` : '未更新'}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={`font-mono font-bold ${monitorDims.compact ? 'text-base' : 'text-lg'}`}>
              <AnimatedFlash value={typeof currentPrice === 'number' ? currentPrice.toFixed(4) : '-'} type="price" />
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              className={`${themes[theme].secondary} rounded-md p-1`}
              aria-label="折叠到右侧"
              title="折叠到右侧"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <Hourglass className={`w-4 h-4 ${themes[theme].text} opacity-60`} />
            <div className={`${monitorDims.compact ? 'w-10' : 'w-16'} h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden`}>
              <div className="h-1 bg-blue-500" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className={`text-[10px] ${themes[theme].text} opacity-60 ${monitorDims.compact ? 'w-7' : 'w-8'} text-right`}>
              {isConnected ? `${Math.ceil(remainingMs / 1000)}s` : '--'}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={triggerNow}
              disabled={!isConnected || !symbol}
              className={`${themes[theme].secondary} rounded-md p-1 disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label="刷新行情"
              title="刷新行情"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={dockToRight}
              className={`${themes[theme].secondary} rounded-md px-2 py-1 text-[11px]`}
              title="回到右侧默认位置"
            >
              靠右
            </button>
          </div>
        </div>
      </div>
      
      <div className={`px-2 py-2 border-b ${themes[theme].border}`}>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <div className="flex items-center gap-2">
            <span className={`${themes[theme].text} opacity-75`}>买一</span>
            <span className="font-mono text-rose-500 font-semibold">{typeof bestBid === 'number' ? bestBid.toFixed(4) : '-'}</span>
            <span className={`${themes[theme].text} opacity-75`}>卖一</span>
            <span className="font-mono text-emerald-500 font-semibold">{typeof bestAsk === 'number' ? bestAsk.toFixed(4) : '-'}</span>
          </div>
          <div className={`${themes[theme].text} opacity-75 font-semibold`}>
            {spread != null ? `点差 ${spread.toFixed(4)}` : '点差 -'}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mt-1 text-[10px]">
          {/* Buy side */}
          <div className="flex flex-col">
            <div className={`text-center font-medium border-b ${themes[theme].border} mb-1 text-rose-500`}>买盘</div>
            <div className="grid grid-cols-[14px_1fr_24px] gap-1 px-1 opacity-70 mb-1">
              <div>档</div>
              <div className="text-right">价</div>
              <div className="text-right">量</div>
            </div>
            <div className="space-y-0.5">
              {bidRows.map((r) => (
                <div key={`bid-${r.level}`} className="grid grid-cols-[14px_1fr_24px] gap-1 px-1 rounded items-center">
                  <div className="text-left opacity-75 text-[9px]">{r.level}</div>
                  <div className="min-w-0">
                    <div className="text-right text-rose-500 font-medium font-mono text-[10px]">{typeof r.price === 'number' ? r.price.toFixed(4) : '-'}</div>
                    <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950/40">
                      <div
                        className="h-full rounded-full bg-rose-500/80 transition-[width] duration-300"
                        style={{ width: `${Math.round(getVolumeRatio(r.vol) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right opacity-90 font-mono text-[9px] truncate">{r.vol ?? '-'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sell side */}
          <div className="flex flex-col">
            <div className={`text-center font-medium border-b ${themes[theme].border} mb-1 text-emerald-500`}>卖盘</div>
            <div className="grid grid-cols-[14px_1fr_24px] gap-1 px-1 opacity-70 mb-1">
              <div>档</div>
              <div className="text-right">价</div>
              <div className="text-right">量</div>
            </div>
            <div className="space-y-0.5">
              {askRows.map((r) => (
                <div key={`ask-${r.level}`} className="grid grid-cols-[14px_1fr_24px] gap-1 px-1 rounded items-center">
                  <div className="text-left opacity-75 text-[9px]">{r.level}</div>
                  <div className="min-w-0">
                    <div className="text-right text-emerald-500 font-medium font-mono text-[10px]">{typeof r.price === 'number' ? r.price.toFixed(4) : '-'}</div>
                    <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                      <div
                        className="h-full rounded-full bg-emerald-500/80 transition-[width] duration-300"
                        style={{ width: `${Math.round(getVolumeRatio(r.vol) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right opacity-90 font-mono text-[9px] truncate">{r.vol ?? '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-full bg-white dark:bg-gray-900 p-2" style={{ height: monitorDims.chartHeight }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
