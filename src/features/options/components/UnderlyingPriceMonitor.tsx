import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { AnimatedFlash } from './AnimatedFlash';
import { Theme, themes } from '../../../lib/theme';
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
}

export function UnderlyingPriceMonitor({ symbol, theme }: UnderlyingPriceMonitorProps) {
  const { prices, isConnected, queryPrice } = useOptionPriceWebSocket();
  const [history, setHistory] = useState<{ time: string; price: number }[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
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

  // Poll for price if not connected via other means or just to be sure
  useEffect(() => {
    if (!symbol) return;
    
    // Initial query
    if (isConnected) {
      queryPrice([symbol]);
    }

    const interval = setInterval(() => {
      if (isConnected) {
        queryPrice([symbol]);
      }
    }, 1000); // Poll every second for high frequency updates

    return () => clearInterval(interval);
  }, [symbol, isConnected, queryPrice]);

  const currentPrice = prices[symbol]?.price;

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
  const style: React.CSSProperties = { position: 'fixed', zIndex: 50, width: '16rem' };
  if (positionMode === 'corner') {
    if (corner === 'top-right') { style.top = 96; style.right = 16; }
    if (corner === 'bottom-right') { style.bottom = 80; style.right = 16; }
    if (corner === 'top-left') { style.top = 96; style.left = 16; }
    if (corner === 'bottom-left') { style.bottom = 80; style.left = 16; }
  } else {
    style.top = Math.max(16, Math.min(customPos.top, window.innerHeight - 160));
    style.left = Math.max(16, Math.min(customPos.left, window.innerWidth - 280));
  }

  const startDrag = (e: React.MouseEvent) => {
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
      const clampedTop = Math.max(8, Math.min(top, window.innerHeight - 160));
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

  return (
    <div ref={containerRef} className={baseClass} style={style}>
      <div
        className={`p-3 border-b ${themes[theme].border} flex justify-between items-center bg-opacity-50 backdrop-blur select-none`}
        onMouseDown={startDrag}
        title={positionMode === 'custom' ? '拖动移动位置' : '点击右侧按钮选择位置'}
      >
        <div className="font-bold text-sm">{symbol}</div>
        <div className="flex items-center gap-2">
          <div className="font-mono text-lg font-bold">
            <AnimatedFlash value={currentPrice} type="price" />
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
