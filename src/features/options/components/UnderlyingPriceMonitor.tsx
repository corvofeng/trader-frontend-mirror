import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAutoRefresh, useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { AnimatedFlash } from './AnimatedFlash';
import { Theme, themes } from '../../../lib/theme';
import { ChevronLeft, ChevronRight, Hourglass, RefreshCw, Activity } from 'lucide-react';

interface UnderlyingPriceMonitorProps {
  symbol: string;
  theme: Theme;
  refreshNonce?: number;
  isMobile?: boolean;
}

export function UnderlyingPriceMonitor({ symbol, theme, refreshNonce = 0, isMobile: isMobileProp }: UnderlyingPriceMonitorProps) {
  const { prices, isConnected, queryPrice } = useOptionPriceWebSocket();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeDragPointerIdRef = useRef<number | null>(null);
  const [recentPrices, setRecentPrices] = useState<number[]>([]);
  const [isFreshTick, setIsFreshTick] = useState(false);

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
    const width = compact ? Math.max(232, Math.min(252, size.width - 16)) : 288;
    const approxHeight = compact ? 340 : 360;
    return { width, approxHeight, compact };
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

  useEffect(() => {
    setRecentPrices([]);
    setIsFreshTick(false);
    if (symbol && isConnected) {
      triggerNow();
    }
  }, [symbol, isConnected, triggerNow]);

  const priceData = prices[symbol];
  const currentPrice = priceData?.price;
  const lastUpdated = priceData?.timestamp ? new Date(priceData.timestamp).toLocaleTimeString() : null;

  useEffect(() => {
    if (!priceData?.timestamp) return;
    setIsFreshTick(true);
    const timer = window.setTimeout(() => setIsFreshTick(false), 1200);
    return () => window.clearTimeout(timer);
  }, [priceData?.timestamp]);

  useEffect(() => {
    if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice)) return;
    setRecentPrices((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === currentPrice) {
        return prev;
      }
      const next = [...prev, currentPrice];
      return next.slice(-24);
    });
  }, [currentPrice]);

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
  const sparklineData = useMemo(() => {
    if (recentPrices.length < 1) return null;
    const min = Math.min(...recentPrices);
    const max = Math.max(...recentPrices);
    const range = max - min || 1;
    const width = 100;
    const height = 48;
    if (recentPrices.length === 1) {
      const y = height / 2;
      return {
        points: `0,${y} ${width},${y}`,
        min,
        max,
        up: true,
        latestX: width,
        latestY: y,
      };
    }
    const plotPoints = recentPrices.map((price, index) => {
      const x = recentPrices.length === 1 ? 0 : (index / (recentPrices.length - 1)) * width;
      const y = height - ((price - min) / range) * height;
      return { x, y: Number.isFinite(y) ? y : height / 2 };
    });
    const points = plotPoints.map((point) => `${point.x},${point.y}`).join(' ');
    const up = recentPrices[recentPrices.length - 1] >= recentPrices[0];
    const latestPoint = plotPoints[plotPoints.length - 1];
    return {
      points,
      min,
      max,
      up,
      latestX: latestPoint.x,
      latestY: latestPoint.y,
    };
  }, [recentPrices]);

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

  const startCollapsedDrag = useCallback((e: React.PointerEvent) => {
    if (!collapsed) return;
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
    dragOffsetRef.current = { x: e.clientX, y: e.clientY };
    const onDrag = (ev: PointerEvent) => {
      if (activeDragPointerIdRef.current != null && ev.pointerId !== activeDragPointerIdRef.current) return;
      ev.preventDefault();
      const dx = ev.clientX - dragOffsetRef.current.x;
      const dy = ev.clientY - dragOffsetRef.current.y;
      dragOffsetRef.current = { x: ev.clientX, y: ev.clientY };
      setPanelPos((prev) => {
        const next = clampPanelPos({ top: prev.top + dy, left: prev.left + dx });
        persistPanelPos(next);
        return next;
      });
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

  // ==================== COLLAPSED STATE (unified for mobile & desktop) ====================
  if (collapsed) {
    if (isMobileMode) {
      // Mobile collapsed: bottom-right floating widget ~80px wide
      return (
        <div
          ref={containerRef}
          className={`${themes[theme].card} shadow-lg border ${themes[theme].border} rounded-lg overflow-hidden`}
          style={{
            position: 'fixed',
            zIndex: 48,
            bottom: 8,
            right: 8,
            width: 80,
            transition: dragging
              ? 'none'
              : 'top 240ms ease, left 240ms ease, opacity 240ms ease',
            ...(dragging ? { top: panelPos.top, left: panelPos.left, bottom: 'auto', right: 'auto' } : {}),
          }}
          onPointerDown={startCollapsedDrag}
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`w-full flex flex-col items-center p-1.5 ${themes[theme].secondary}`}
            aria-label="展开价格窗口"
            title="展开"
          >
            <div className={`text-[9px] font-mono opacity-70 ${themes[theme].text} truncate w-full text-center`}>
              {symbol}
            </div>
            <div className={`text-sm font-bold font-mono ${themes[theme].text} leading-tight`}>
              <AnimatedFlash value={typeof currentPrice === 'number' ? currentPrice.toFixed(4) : '-'} type="price" />
            </div>
          </button>
        </div>
      );
    }

    // Desktop collapsed: right-side thin strip with price
    const collapsedStyle: React.CSSProperties = {
      position: 'fixed',
      zIndex: 48,
      right: 0,
      width: 48,
      height: 156,
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      transition: `top 240ms ease, bottom 240ms ease, width 240ms ease, opacity 240ms ease, transform 240ms ease`
    };
    collapsedStyle.top = clampPanelPos(panelPos).top;

    return (
      <div
        ref={containerRef}
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
          <div className="flex flex-col items-center gap-1.5">
            <ChevronLeft className="w-4 h-4" />
            <div
              className={`text-[9px] font-semibold ${themes[theme].text}`}
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              价格
            </div>
            <div
              className={`text-[9px] font-mono font-bold ${themes[theme].text}`}
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              {typeof currentPrice === 'number' ? currentPrice.toFixed(2) : '--'}
            </div>
          </div>
        </button>
      </div>
    );
  }

  // ==================== EXPANDED STATE (unified for mobile & desktop) ====================
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
      {/* Title bar (draggable) */}
      <div
        className={`p-3 border-b ${themes[theme].border} bg-opacity-50 backdrop-blur select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={startDrag}
        style={{ touchAction: 'none' }}
        title="拖动移动位置"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={`text-[10px] ${themes[theme].text} opacity-50`}>
              标的
            </div>
            <div className={`mt-1 break-all font-semibold ${monitorDims.compact ? 'text-[13px]' : 'text-[15px]'} leading-snug ${themes[theme].text}`}>
              {symbol}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                  isConnected
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
              >
                <Activity className="mr-0.5 h-2.5 w-2.5" />
                {isConnected ? 'WS' : '···'}
              </span>
              {lastUpdated ? (
                <span className={`text-[10px] ${themes[theme].text} opacity-50`}>
                  {lastUpdated}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              className={`${themes[theme].secondary} rounded-md p-1`}
              aria-label="折叠到右侧"
              title="折叠到右侧"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="rounded-md bg-black/5 px-2 py-1 text-right dark:bg-white/5">
              <div className={`text-[9px] ${themes[theme].text} opacity-45`}>
                最新价
              </div>
              <div className={`font-mono font-bold ${monitorDims.compact ? 'text-base' : 'text-lg'}`}>
                <AnimatedFlash value={typeof currentPrice === 'number' ? currentPrice.toFixed(4) : '-'} type="price" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
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

      {/* Depth 5-level order book */}
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

      <div className="px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`text-[11px] font-medium ${themes[theme].text} opacity-75`}>最近走势</div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                isFreshTick
                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              } ${isFreshTick ? 'animate-pulse' : ''}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  isFreshTick ? 'bg-sky-500' : (isConnected ? 'bg-emerald-500' : 'bg-amber-500')
                }`}
              />
              {isFreshTick ? '刚刷新' : (isConnected ? '实时' : '等待连接')}
            </span>
          </div>
          <div className={`text-[11px] ${themes[theme].text} opacity-50 text-right`}>
            {sparklineData
              ? `${sparklineData.min.toFixed(4)} - ${sparklineData.max.toFixed(4)}`
              : (isConnected ? '--' : '等待连接...')}
          </div>
        </div>
        {sparklineData ? (
          <div>
            <svg viewBox="0 0 100 48" className="block h-12 w-full overflow-visible rounded">
              <polyline
                fill="none"
                stroke={sparklineData.up ? '#10b981' : '#ef4444'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparklineData.points}
              />
              <circle
                cx={sparklineData.latestX}
                cy={sparklineData.latestY}
                r="2.2"
                fill={sparklineData.up ? '#10b981' : '#ef4444'}
              />
              <circle
                cx={sparklineData.latestX}
                cy={sparklineData.latestY}
                r="2.2"
                fill="none"
                stroke={sparklineData.up ? '#10b981' : '#ef4444'}
                strokeWidth="1.25"
                opacity="0.7"
              >
                <animate attributeName="r" values="2.2;5.8;2.2" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0;0.7" dur="1.8s" repeatCount="indefinite" />
              </circle>
            </svg>
            <div className={`mt-1 flex items-start justify-between text-[10px] ${themes[theme].text} opacity-45`}>
              <span>较早</span>
              <div className="flex flex-1 items-start px-2 pt-0.5">
                <div className="h-1 w-px bg-current" />
                <div className="mt-0.5 h-px flex-1 bg-current" />
                <div className="h-1 w-px bg-current" />
                <div className="mt-0.5 h-px flex-1 bg-current" />
                <div className="h-1 w-px bg-current" />
              </div>
              <span>刚刚</span>
            </div>
          </div>
        ) : (
          <div className="flex h-12 w-full items-center justify-center rounded bg-gray-100 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {isConnected ? '--' : '等待连接...'}
          </div>
        )}
      </div>

    </div>
  );
}
