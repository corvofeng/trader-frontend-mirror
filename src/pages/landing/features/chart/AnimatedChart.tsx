import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { themes, Theme } from '../../../../lib/theme';
import { stockService } from '../../../../lib/services';
import type { StockData } from '../../../../lib/services/types';

interface AnimatedChartProps {
  theme: Theme;
}

export function AnimatedChart({ theme }: AnimatedChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerReady, setContainerReady] = useState(false);

  useEffect(() => {
    if (chartContainerRef.current) {
      setContainerReady(true);
    }
  }, []);

  useEffect(() => {
    if (!containerReady) return;

    let chart: IChartApi | null = null;
    let candlestickSeries: ISeriesApi<"Candlestick"> | null = null;
    let animationFrame: number;

    async function initializeChart() {
      if (!chartContainerRef.current) return;

      const chartColors = themes[theme].chart;
      const isDark = theme === 'dark';
      
      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: isDark ? '#e5e7eb' : '#374151',
          fontSize: 12,
        },
        grid: {
          vertLines: { color: isDark ? '#374151' : '#e5e7eb' },
          horzLines: { color: isDark ? '#374151' : '#e5e7eb' },
        },
        crosshair: {
          vertLine: {
            color: isDark ? '#6b7280' : '#9ca3af',
            width: 1,
            style: 3,
            labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
          },
          horzLine: {
            color: isDark ? '#6b7280' : '#9ca3af',
            width: 1,
            style: 3,
            labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
          },
        },
        width: chartContainerRef.current.clientWidth,
        height: 400,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: isDark ? '#374151' : '#e5e7eb',
          textColor: isDark ? '#e5e7eb' : '#374151',
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        rightPriceScale: {
          borderColor: isDark ? '#374151' : '#e5e7eb',
          textColor: isDark ? '#e5e7eb' : '#374151',
          autoScale: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        handleScroll: false,
        handleScale: false,
      });

      chartRef.current = chart;

      candlestickSeries = chart.addCandlestickSeries({
        upColor: chartColors.upColor,
        downColor: chartColors.downColor,
        borderVisible: false,
        wickUpColor: chartColors.upColor,
        wickDownColor: chartColors.downColor,
      });

      candlestickSeriesRef.current = candlestickSeries;

      try {
        setIsLoading(true);
        setError(null);
        
        const response = await stockService.getStockData('^SSEC');
        
        if (!response.data) {
          throw new Error('Failed to load stock data');
        }

        const stockData = response.data;

        if (stockData.length > 0) {
          const candlestickData = stockData.map(item => ({
            time: item.date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
          }));

          // Progressive loading animation with slower speed
          let currentIndex = 0;
          const animateData = () => {
            if (currentIndex < candlestickData.length) {
              if (candlestickSeries) {
                // Add data in chunks for smoother animation
                const chunkSize = Math.max(1, Math.floor(candlestickData.length / 100));
                const nextIndex = Math.min(currentIndex + chunkSize, candlestickData.length);
                
                candlestickSeries.setData(candlestickData.slice(0, nextIndex));
                
                // Auto-scale and fit content for smooth animation
                chart.timeScale().fitContent();
                
                currentIndex = nextIndex;
                
                // Slow down the animation
                setTimeout(() => {
                  animationFrame = requestAnimationFrame(animateData);
                }, 50); // Add delay between frames
              }
            } else {
              setIsLoading(false);
            }
          };

          // Start animation
          animateData();
        }
      } catch (err) {
        console.error('Error loading stock data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
        setIsLoading(false);
      }
    }

    initializeChart();

    // Handle window resize
    function handleResize() {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
        chartRef.current.timeScale().fitContent();
      }
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [theme, containerReady]);

  return (
    <div className="w-full h-[400px] relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-lg z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-lg z-10">
          <div className="text-red-500 text-center">
            <p className="font-medium">Failed to load chart</p>
            <p className="text-sm opacity-75">{error}</p>
          </div>
        </div>
      )}

      <div 
        ref={chartContainerRef} 
        className="w-full h-full"
      >
        <div className={`absolute top-4 left-4 text-sm ${
          theme === 'dark' ? 'text-gray-200 bg-gray-800/80' : 'text-gray-800 bg-white/80'
        } backdrop-blur-sm px-3 py-1 rounded-full z-20`}>
          Shanghai Composite Index
        </div>
      </div>
    </div>
  );
}