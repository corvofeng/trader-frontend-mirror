import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAutoRefresh, useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { AnimatedFlash } from './AnimatedFlash';
import { Theme, themes } from '../../../lib/theme';
import { ChevronLeft, ChevronRight, Hourglass, RefreshCw } from 'lucide-react';
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
}

export function UnderlyingPriceMonitor({ symbol, theme, refreshNonce = 0 }: UnderlyingPriceMonitorProps) {
  const { prices, isConnected, queryPrice } = useOptionPriceWebSocket();
  const [history, setHistory] = useState<{ time: string; price: number }[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeDragPointerIdRef = useRef<number | null>(null);
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

  useEffect(() => {
    if (currentPrice !== undefined && currentPrice !== null) {
      // Only add if price changed or enough time passed? 
      // User wants "recent points", so maybe every update or every X seconds.
      // If we poll every second, we might get same price.
      // Let's just add it if it's new or update the last one if it's the same minute?
      // User wants "recent points", let's just keep last 50 points.
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString();

      setHistory(prev => {
        const newEntry = { time: timeStr, price: currentPrice };
        // Avoid duplicate consecutive entries if needed, but for chart "flow" duplicates are okay to show flat line.
        // But to save memory/rendering, maybe limit to changes or time intervals.
        // Let's limit to max 50 points.
        const newHistory = [...prev, newEntry];
        if (newHistory.length > 50) {
          return newHistory.slice(newHistory.length - 50);
        }
        return newHistory;
      });
    }
  }, [currentPrice]);

  const chartData: ChartData<'line'> = useMemo(() => {
    return {
      labels: history.map(h => h.time),
      datasets: [
        {
          label: symbol,
          data: history.map(h => h.price),
          borderColor: 'rgb(59, 130, 246)', // blue-500
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          tension: 0.1,
          pointRadius: 2,
        },
      ],
    };
  }, [history, symbol]);

  const chartOptions: ChartOptions<'line'> = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
        }
      },
      scales: {
        x: {
          display: false, // Hide x axis labels to save space
        },
        y: {
          position: 'right',
          ticks: {
             color: theme === 'dark' ? '#9ca3af' : '#4b5563',
             callback: (value) => Number(value).toFixed(3)
          },
          grid: {
             color: theme === 'dark' ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)'
          }
        }
      },
      animation: {
        duration: 0 // Disable animation for performance
      }
    };
  }, [theme]);

  if (!symbol) return null;

  const baseClass = `${themes[theme].card} shadow-lg rounded-lg border ${themes[theme].border} overflow-hidden opacity-90 hover:opacity-100 transition-opacity ${dragging ? 'cursor-grabbing' : 'cursor-move'}`;
  const motionMs = 240;
  const monitorDims = getMonitorDims();
  const clampedPanelPos = clampPanelPos(panelPos);

  const readTodayPanelState = (includeClosed: boolean) => {
    try {
      const open = localStorage.getItem('options_portfolio_today_combo_open') === '1';
      const posStr = localStorage.getItem('options_portfolio_today_combo_pos');
      const sizeStr = localStorage.getItem('options_portfolio_today_combo_size');
      const pos = posStr ? JSON.parse(posStr) : { top: 120, left: viewportSize.width - 16 - 860 };

      if (!open) {
        if (!includeClosed) {
          return null;
        }
        const headerHeight = 52;
        const collapsedWidth = 56;
        const topRaw = Number(pos.top ?? 120);
        const top = Math.max(8, Math.min(topRaw, viewportSize.height - headerHeight - 8));
        const left = viewportSize.width - collapsedWidth - 8;
        return {
          open: false,
          top,
          left,
          width: collapsedWidth,
          height: headerHeight
        };
      }
      const size = sizeStr ? JSON.parse(sizeStr) : { width: 860, height: 360 };
      const width = Math.max(640, Math.min(size.width ?? 860, Math.max(320, viewportSize.width - 16)));
      const height = Math.max(180, Math.min(size.height ?? 360, Math.max(160, viewportSize.height - 16)));
      const topRaw = Number(pos.top ?? 120);
      const leftRaw = Number(pos.left ?? (viewportSize.width - 16 - width));
      const top = Math.max(8, Math.min(topRaw, viewportSize.height - height - 8));
      const left = Math.max(8, Math.min(leftRaw, viewportSize.width - width - 8));
      return { open: true, top, left, width, height };
    } catch {
      return null;
    }
  };

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

  const collapsedStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 48,
    right: 0,
    width: 36,
    height: 156,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    transition: `top ${motionMs}ms ease, bottom ${motionMs}ms ease, width ${motionMs}ms ease, opacity ${motionMs}ms ease, transform ${motionMs}ms ease`
  };
  collapsedStyle.top = clampedPanelPos.top;
  const todayAny = readTodayPanelState(true);
  if (todayAny) {
    const collapsedHeight = Number(collapsedStyle.height ?? 160);
    const currentTop = typeof collapsedStyle.top === 'number'
      ? collapsedStyle.top
      : (typeof collapsedStyle.bottom === 'number'
          ? viewportSize.height - (collapsedStyle.bottom + collapsedHeight)
          : 96);

    const todayBottom = todayAny.top + todayAny.height;
    const overlapVertically = !(currentTop + collapsedHeight < todayAny.top || currentTop > todayBottom);
    const monitorLeft = viewportSize.width - Number(collapsedStyle.width ?? 34);
    const overlapHorizontally = (todayAny.left + todayAny.width) > monitorLeft;

    if (overlapVertically && overlapHorizontally) {
      const gap = 10;
      const below = todayBottom + gap;
      const above = todayAny.top - gap - collapsedHeight;
      const clampedBelow = Math.max(8, Math.min(below, viewportSize.height - collapsedHeight - 8));
      const nextTop = below + collapsedHeight <= viewportSize.height - 8
        ? below
        : (above >= 8 ? above : clampedBelow);
      collapsedStyle.top = nextTop;
      delete collapsedStyle.bottom;
    }
  }

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

  if (collapsed) {
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
              <AnimatedFlash value={currentPrice} type="price" />
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
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2">
            <span className={`${themes[theme].text} opacity-75`}>买一</span>
            <span className="font-mono text-red-500 font-semibold">{typeof bestBid === 'number' ? bestBid.toFixed(4) : '-'}</span>
            <span className={`${themes[theme].text} opacity-75`}>卖一</span>
            <span className="font-mono text-green-500 font-semibold">{typeof bestAsk === 'number' ? bestAsk.toFixed(4) : '-'}</span>
          </div>
          <div className={`${themes[theme].text} opacity-75`}>
            {spread != null ? `Spread ${spread.toFixed(4)}` : 'Spread -'}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
          <div className="flex flex-col">
            <div className={`text-center font-medium border-b ${themes[theme].border} mb-1 text-red-500`}>买盘</div>
            <div className="grid grid-cols-3 gap-1 px-1 opacity-70 mb-1">
              <div className="text-left">档位</div>
              <div className="text-right">价格</div>
              <div className="text-right">量</div>
            </div>
            <div className="space-y-0.5">
              {bidRows.map((r) => (
                <div key={`bid-${r.level}`} className="grid grid-cols-3 gap-1 px-1 rounded">
                  <div className="text-left opacity-75">{r.level}</div>
                  <div className="text-right text-red-500 font-medium">{typeof r.price === 'number' ? r.price.toFixed(4) : '-'}</div>
                  <div className="text-right opacity-90">{r.vol ?? '-'}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <div className={`text-center font-medium border-b ${themes[theme].border} mb-1 text-green-500`}>卖盘</div>
            <div className="grid grid-cols-3 gap-1 px-1 opacity-70 mb-1">
              <div className="text-left">档位</div>
              <div className="text-right">价格</div>
              <div className="text-right">量</div>
            </div>
            <div className="space-y-0.5">
              {askRows.map((r) => (
                <div key={`ask-${r.level}`} className="grid grid-cols-3 gap-1 px-1 rounded">
                  <div className="text-left opacity-75">{r.level}</div>
                  <div className="text-right text-green-500 font-medium">{typeof r.price === 'number' ? r.price.toFixed(4) : '-'}</div>
                  <div className="text-right opacity-90">{r.vol ?? '-'}</div>
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
