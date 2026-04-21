import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('underlying_price_monitor_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [positionMode, setPositionMode] = useState<'corner' | 'custom'>(() => {
    try {
      const saved = localStorage.getItem('underlying_price_monitor_pos_mode');
      return saved === 'custom' ? 'custom' : 'corner';
    } catch {
      return 'corner';
    }
  });
  const [corner, setCorner] = useState<'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'>(() => {
    try {
      const saved = localStorage.getItem('underlying_price_monitor_corner');
      if (saved === 'bottom-right' || saved === 'top-left' || saved === 'bottom-left') return saved;
      return 'top-right';
    } catch {
      return 'top-right';
    }
  });
  const [customPos, setCustomPos] = useState<{ top: number; left: number }>(() => {
    try {
      const saved = localStorage.getItem('underlying_price_monitor_custom');
      if (saved) {
        const obj = JSON.parse(saved);
        if (typeof obj?.top === 'number' && typeof obj?.left === 'number') {
          return { top: obj.top, left: obj.left };
        }
      }
    } catch {
      void 0;
    }
    return { top: 96, left: window.innerWidth - 16 - 256 }; // approx: top-24, right-4 for 16rem width
  });

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
  const monitorWidth = 256; // 16rem
  const approximateHeight = 360; // 用于重叠规避的近似高度

  const readTodayPanelState = (includeClosed: boolean) => {
    try {
      const open = localStorage.getItem('options_portfolio_today_combo_open') === '1';
      const posStr = localStorage.getItem('options_portfolio_today_combo_pos');
      const sizeStr = localStorage.getItem('options_portfolio_today_combo_size');
      const pos = posStr ? JSON.parse(posStr) : { top: 120, left: window.innerWidth - 16 - 860 };

      if (!open) {
        if (!includeClosed) {
          return null;
        }
        const headerHeight = 52;
        const collapsedWidth = 56;
        const topRaw = Number(pos.top ?? 120);
        const top = Math.max(8, Math.min(topRaw, window.innerHeight - headerHeight - 8));
        const left = window.innerWidth - collapsedWidth - 8;
        return {
          open: false,
          top,
          left,
          width: collapsedWidth,
          height: headerHeight
        };
      }
      const size = sizeStr ? JSON.parse(sizeStr) : { width: 860, height: 360 };
      const width = Math.max(640, Math.min(size.width ?? 860, Math.max(320, window.innerWidth - 16)));
      const height = Math.max(180, Math.min(size.height ?? 360, Math.max(160, window.innerHeight - 16)));
      const topRaw = Number(pos.top ?? 120);
      const leftRaw = Number(pos.left ?? (window.innerWidth - 16 - width));
      const top = Math.max(8, Math.min(topRaw, window.innerHeight - height - 8));
      const left = Math.max(8, Math.min(leftRaw, window.innerWidth - width - 8));
      return { open: true, top, left, width, height };
    } catch {
      return null;
    }
  };

  const style: React.CSSProperties = { position: 'fixed', zIndex: 60, width: monitorWidth, transition: `top ${motionMs}ms ease, left ${motionMs}ms ease, right ${motionMs}ms ease, bottom ${motionMs}ms ease, width ${motionMs}ms ease, opacity ${motionMs}ms ease, transform ${motionMs}ms ease` };
  if (positionMode === 'corner') {
    if (corner === 'top-right') { style.top = 96; style.right = 16; }
    if (corner === 'bottom-right') { style.bottom = 80; style.right = 16; }
    if (corner === 'top-left') { style.top = 96; style.left = 16; }
    if (corner === 'bottom-left') { style.bottom = 80; style.left = 16; }
  } else {
    style.top = Math.max(16, Math.min(customPos.top, window.innerHeight - 360));
    style.left = Math.max(16, Math.min(customPos.left, window.innerWidth - 280));
  }

  // 避免与「今日组合」面板重叠（该面板使用 localStorage 持久化位置与开启状态）
  const todayOpen = readTodayPanelState(false);
  if (todayOpen && todayOpen.open) {
    const monitorLeft = typeof style.left === 'number' ? style.left : (typeof style.right === 'number' ? window.innerWidth - (style.right + monitorWidth) : (window.innerWidth - monitorWidth - 16));
    const monitorTop = typeof style.top === 'number'
      ? style.top
      : (typeof style.bottom === 'number' ? Math.max(16, window.innerHeight - (style.bottom + approximateHeight)) : 96);

    const overlapHorizontally = (todayOpen.left + todayOpen.width) > monitorLeft;
    const todayBottom = todayOpen.top + todayOpen.height;
    const monitorBottom = monitorTop + approximateHeight;
    const overlapVertically = !(monitorBottom < todayOpen.top || monitorTop > todayBottom);

    if (overlapHorizontally && overlapVertically) {
      const gap = 12;
      if (positionMode === 'corner') {
        if (typeof style.top === 'number' && typeof style.right === 'number') {
          style.top = Math.min(
            Math.max(16, todayBottom + gap),
            Math.max(16, window.innerHeight - approximateHeight - 16)
          );
        } else if (typeof style.bottom === 'number' && typeof style.right === 'number') {
          const newBottom = Math.max(80, Math.max(16, window.innerHeight - (todayOpen.top - gap)));
          style.bottom = newBottom;
        }
      } else {
        style.top = Math.min(
          Math.max(16, todayBottom + gap),
          Math.max(16, window.innerHeight - approximateHeight - 16)
        );
        delete style.bottom;
      }
    }
  }

  const collapsedStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 60,
    right: 0,
    width: 34,
    height: 160,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    transition: `top ${motionMs}ms ease, bottom ${motionMs}ms ease, width ${motionMs}ms ease, opacity ${motionMs}ms ease, transform ${motionMs}ms ease`
  };
  if (typeof style.top === 'number') {
    collapsedStyle.top = style.top;
  } else if (typeof style.bottom === 'number') {
    collapsedStyle.bottom = style.bottom;
  } else {
    collapsedStyle.top = 96;
  }
  const todayAny = readTodayPanelState(true);
  if (todayAny) {
    const collapsedHeight = Number(collapsedStyle.height ?? 160);
    const currentTop = typeof collapsedStyle.top === 'number'
      ? collapsedStyle.top
      : (typeof collapsedStyle.bottom === 'number'
          ? window.innerHeight - (collapsedStyle.bottom + collapsedHeight)
          : 96);

    const todayBottom = todayAny.top + todayAny.height;
    const overlapVertically = !(currentTop + collapsedHeight < todayAny.top || currentTop > todayBottom);
    const monitorLeft = window.innerWidth - Number(collapsedStyle.width ?? 34);
    const overlapHorizontally = (todayAny.left + todayAny.width) > monitorLeft;

    if (overlapVertically && overlapHorizontally) {
      const gap = 10;
      const below = todayBottom + gap;
      const above = todayAny.top - gap - collapsedHeight;
      const clampedBelow = Math.max(8, Math.min(below, window.innerHeight - collapsedHeight - 8));
      const nextTop = below + collapsedHeight <= window.innerHeight - 8
        ? below
        : (above >= 8 ? above : clampedBelow);
      collapsedStyle.top = nextTop;
      delete collapsedStyle.bottom;
    }
  }

  const startDrag = (e: React.MouseEvent) => {
    if (collapsed) return;
    if (positionMode !== 'custom') return;
    setDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    const offsetX = e.clientX - (rect?.left ?? 0);
    const offsetY = e.clientY - (rect?.top ?? 0);
    dragOffsetRef.current = { x: offsetX, y: offsetY };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
  };
  const onDrag = (e: MouseEvent) => {
    setCustomPos(() => {
      const top = e.clientY - dragOffsetRef.current.y;
      const left = e.clientX - dragOffsetRef.current.x;
      const clampedTop = Math.max(8, Math.min(top, window.innerHeight - 360));
      const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - 280));
      try {
        localStorage.setItem('underlying_price_monitor_custom', JSON.stringify({ top: clampedTop, left: clampedLeft }));
      } catch {
        void 0;
      }
      return { top: clampedTop, left: clampedLeft };
    });
  };
  const endDrag = () => {
    setDragging(false);
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  };

  const setCornerMode = (c: typeof corner) => {
    setPositionMode('corner');
    setCorner(c);
    try {
      localStorage.setItem('underlying_price_monitor_pos_mode', 'corner');
      localStorage.setItem('underlying_price_monitor_corner', c);
    } catch {
      void 0;
    }
  };
  const setCustomMode = () => {
    setPositionMode('custom');
    try {
      localStorage.setItem('underlying_price_monitor_pos_mode', 'custom');
    } catch {
      void 0;
    }
  };

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
        className={`p-3 border-b ${themes[theme].border} flex justify-between items-center bg-opacity-50 backdrop-blur select-none`}
        onMouseDown={startDrag}
        title={positionMode === 'custom' ? '拖动移动位置' : '点击右侧按钮选择位置'}
      >
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{symbol}</div>
          <div className={`text-[10px] ${themes[theme].text} opacity-60`}>
            {lastUpdated ? `更新 ${lastUpdated}` : '未更新'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-lg font-bold">
            <AnimatedFlash value={currentPrice} type="price" />
          </div>
          <div className="flex items-center gap-1">
            <Hourglass className={`w-4 h-4 ${themes[theme].text} opacity-60`} />
            <div className="w-16 h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-1 bg-blue-500" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className={`text-[10px] ${themes[theme].text} opacity-60 w-8 text-right`}>
              {isConnected ? `${Math.ceil(remainingMs / 1000)}s` : '--'}
            </div>
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
      <div className="h-32 w-full bg-white dark:bg-gray-900 p-2">
        <Line data={chartData} options={chartOptions} />
      </div>
      <div className={`px-2 py-2 border-t ${themes[theme].border} flex items-center justify-between`}>
        <div className="flex gap-2">
          <button
            className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
            onClick={() => setCornerMode('top-right')}
          >右上</button>
          <button
            className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
            onClick={() => setCornerMode('bottom-right')}
          >右下</button>
          <button
            className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
            onClick={() => setCornerMode('top-left')}
          >左上</button>
          <button
            className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
            onClick={() => setCornerMode('bottom-left')}
          >左下</button>
        </div>
        <button
          className="px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700"
          onClick={setCustomMode}
          title="切换到拖动模式"
        >
          拖动
        </button>
      </div>
    </div>
  );
}
