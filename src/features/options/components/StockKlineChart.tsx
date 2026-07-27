import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { Theme, themes } from '../../../lib/theme';
import { stockService } from '../../../lib/services';

interface StockKlineChartProps {
  symbol: string;
  theme: Theme;
}

export function StockKlineChart({ symbol, theme }: StockKlineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol || !containerRef.current) return;

    const container = containerRef.current;
    const ac = new AbortController();

    setLoading(true);

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: theme === 'dark' ? '#9ca3af' : '#4b5563',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#2d2d2d' : '#e5e7eb' },
        horzLines: { color: theme === 'dark' ? '#2d2d2d' : '#e5e7eb' },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        visible: true,
        borderVisible: true,
        timeVisible: false,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: 300,
      handleScroll: true,
      handleScale: true,
      crosshair: {
        mode: 0,
        vertLine: {
          visible: true,
          labelVisible: true,
        },
        horzLine: {
          visible: true,
          labelVisible: true,
        },
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    stockService.getStockHistoryRaw(symbol, { signal: ac.signal })
      .then(({ data, error }) => {
        if (ac.signal.aborted) return;
        setLoading(false);
        if (error || !data) {
          console.error('Failed to fetch K-line data:', error);
          return;
        }
        const records = data as Array<{ date: string | number; open: number | string; high: number | string; low: number | string; close: number | string; volume?: number | string }>;
        const candlesticks = records
          .map((r) => ({
            time: Math.floor(new Date(r.date as string).getTime() / 1000) as UTCTimestamp,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
          }))
          .filter((d) => !isNaN(d.time) && !isNaN(d.open) && !isNaN(d.high) && !isNaN(d.low) && !isNaN(d.close))
          .sort((a, b) => a.time - b.time);
        series.setData(candlesticks);
        chart.timeScale().fitContent();
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error('Failed to fetch K-line data:', err);
          setLoading(false);
        }
      });

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      ac.abort();
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [symbol, theme]);

  if (!symbol) return null;

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md border ${themes[theme].border} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold ${themes[theme].text}`}>
          {symbol} 日 K 线
        </h3>
      </div>
      <div className="relative" style={{ height: 300 }}>
        <div ref={containerRef} className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded border border-dashed border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-900/80">
            <span className={`text-sm ${themes[theme].text} opacity-70`}>加载 K 线数据...</span>
          </div>
        )}
      </div>
    </div>
  );
}
