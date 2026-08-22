import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '../../../shared/utils/logger';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { Theme } from '../../../lib/theme';
import { accountService, portfolioService } from '../../../lib/services';
import type { User, Account } from '../../../lib/services/types';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { landingTranslations, Language } from '../i18n';

const formatCompactNumber = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toFixed(0);
};

interface AnimatedChartProps {
  theme: Theme;
  lang?: Language;
  user?: User | null;
}

export function AnimatedChart({ theme, lang = 'zh', user }: AnimatedChartProps) {
  const t = landingTranslations[lang].marketAnalytics;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerReady, setContainerReady] = useState(false);
  const { getThemedColors } = useCurrency();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  const formatAxisValue = useCallback((value: number) => {
    return isMobile ? formatCompactNumber(value) : value.toFixed(2);
  }, [isMobile]);

  useEffect(() => {
    if (chartContainerRef.current) {
      setContainerReady(true);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!containerReady) {
      logger.debug('[AnimatedChart] Guard: container not ready');
      return;
    }

    let disposed = false;
    let animationFrame: number;

    async function initializeChart() {
      if (!chartContainerRef.current) {
        logger.debug('[AnimatedChart] Guard: chartContainerRef missing');
        return;
      }

      const themedColors = getThemedColors(theme);
      const chartColors = themedColors.chart;
      const isDark = theme === 'dark';
      
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: isDark ? '#e5e7eb' : '#374151',
          fontSize: 12,
        },
        localization: {
          priceFormatter: formatAxisValue,
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
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        rightPriceScale: {
          borderColor: isDark ? '#374151' : '#e5e7eb',
          textColor: isDark ? '#e5e7eb' : '#374151',
          autoScale: true,
          minimumWidth: isMobile ? 44 : 80,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        handleScroll: false,
        handleScale: false,
      });

      chartRef.current = chart;

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: chartColors.upColor,
        downColor: chartColors.downColor,
        borderVisible: false,
        wickUpColor: chartColors.upColor,
        wickDownColor: chartColors.downColor,
        priceFormat: {
          type: 'custom',
          formatter: formatAxisValue,
          minMove: 0.01,
        },
      });

      candlestickSeriesRef.current = candlestickSeries;

      try {
        setIsLoading(true);
        setError(null);
        
        const userId = user?.id || 'mock-user-id';
        
        // 1. Fetch user accounts to locate main account
        const accountsResponse = await accountService.getAccounts(userId);
        const accounts: Account[] = accountsResponse.data || [];
        const mainAccount = accounts.find((acc) => acc.is_default) || accounts[0];
        const accountKey = mainAccount ? (mainAccount.alias || mainAccount.id) : undefined;

        if (!accountKey) {
          throw new Error('No account found');
        }

        const endDate = new Date().toISOString().split('T')[0];
        const startDate = '2026-01-01'; // Fetch data starting from 2026
        const response = await portfolioService.getKlineData(userId, startDate, endDate, accountKey);
        
        if (!response.data) {
          throw new Error('Failed to load kline data');
        }

        const klineData = response.data;

        if (klineData.length > 0) {
          const candlestickData = klineData.map(item => ({
            time: item.date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
          }));

          // Progressive loading animation
          let currentIndex = 0;
          const animateData = () => {
            if (currentIndex < candlestickData.length && !disposed) {
              if (candlestickSeriesRef.current && chartRef.current) {
                const chunkSize = Math.max(1, Math.floor(candlestickData.length / 100));
                const nextIndex = Math.min(currentIndex + chunkSize, candlestickData.length);
                
                try {
                  candlestickSeriesRef.current.setData(candlestickData.slice(0, nextIndex));
                  chartRef.current.timeScale().fitContent();
                } catch (e) {
                  console.error('Error during animation:', e);
                  return;
                }
                
                currentIndex = nextIndex;
                
                setTimeout(() => {
                  if (!disposed) {
                    animationFrame = requestAnimationFrame(animateData);
                  }
                }, 50);
              }
            } else {
              if (!disposed) {
                setIsLoading(false);
              }
            }
          };

          animateData();
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error loading kline data:', err);
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to load chart data');
          setIsLoading(false);
        }
      }
    }

    initializeChart();

    // Handle window resize
    function handleResize() {
      if (chartContainerRef.current && chartRef.current && !disposed) {
        try {
          chartRef.current.applyOptions({ 
            width: chartContainerRef.current.clientWidth 
          });
          chartRef.current.timeScale().fitContent();
        } catch (e) {
          console.error('Error during resize:', e);
        }
      }
    }

    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch {
          // Ignore errors during cleanup
        }
        chartRef.current = null;
      }
      candlestickSeriesRef.current = null;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [theme, containerReady, getThemedColors, user, isMobile, formatAxisValue]);

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
          {t.shanghaiIndex}
        </div>
      </div>
    </div>
  );
}
