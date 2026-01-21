import React, { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '../../../shared/utils/logger';
import { createChart, ColorType, IChartApi, ISeriesApi, CrosshairMode, LineStyle, PriceScaleMode } from 'lightweight-charts';
import { format } from 'date-fns';
import { Theme, themes } from '../../../shared/constants/theme';
import { stockService, authService, portfolioService, accountService } from '../../../lib/services';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { ZoomIn, ZoomOut, Lock, Unlock, Maximize2, Minimize2, Grid, LineChart, CandlestickChart, BarChart } from 'lucide-react';
import type { StockData, Trade, Stock } from '../../../lib/services/types';

type ChartType = 'candlestick' | 'line' | 'bar';

interface StockChartProps {
  stockCode?: string;
  theme: Theme;
  pendingTrades?: Trade[];
  userId?: string;
  accountId?: string | null;
  onTradesLoaded?: (trades: Trade[]) => void;
  className?: string;
  fillContainer?: boolean;
}

interface CostBasisPoint {
  time: number;
  value: number;
  quantity: number;
  totalCost: number;
}

interface CandlestickPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VolumePoint {
  time: number;
  value: number;
  color?: string;
}

type PriceLineHandle = ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>;

const isValidDataPoint = (item: StockData) => {
  return (
    typeof item.open === 'number' && !isNaN(item.open) &&
    typeof item.high === 'number' && !isNaN(item.high) &&
    typeof item.low === 'number' && !isNaN(item.low) &&
    typeof item.close === 'number' && !isNaN(item.close) &&
    typeof item.volume === 'number' && !isNaN(item.volume) &&
    item.date != null &&
    item.open !== 0 && item.high !== 0 && item.low !== 0 && item.close !== 0
  );
};

export function StockChart({ stockCode, theme, pendingTrades, userId, accountId, onTradesLoaded, className, fillContainer = false }: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const costBasisSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<PriceLineHandle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCostBasis, setShowCostBasis] = useState(true);
  const { currencyConfig, getThemedColors } = useCurrency();
  const [stockInfo, setStockInfo] = useState<Stock | null>(null);
  const isDisposed = useRef(false);
  const isInitializing = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [isLocked, setIsLocked] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [chartData, setChartData] = useState<{
    candlestick: CandlestickPoint[];
    volume: VolumePoint[];
    trades: Trade[];
    costBasis: CostBasisPoint[];
  }>({ candlestick: [], volume: [], trades: [], costBasis: [] });

  const disposeChart = () => {
    isDisposed.current = true;

    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    if (chartRef.current) {
      // Clear all series references before removing the chart
      if (candlestickSeriesRef.current) {
        try {
          chartRef.current.removeSeries(candlestickSeriesRef.current);
        } catch (error) {
          logger.debug('[StockChart] Error removing candlestick series during dispose', { error });
        }
        candlestickSeriesRef.current = null;
      }
      if (volumeSeriesRef.current) {
        try {
          chartRef.current.removeSeries(volumeSeriesRef.current);
        } catch (error) {
          logger.debug('[StockChart] Error removing volume series during dispose', { error });
        }
        volumeSeriesRef.current = null;
      }
      if (costBasisSeriesRef.current) {
        try {
          chartRef.current.removeSeries(costBasisSeriesRef.current);
        } catch (error) {
          logger.debug('[StockChart] Error removing cost basis series during dispose', { error });
        }
        costBasisSeriesRef.current = null;
      }
      
      try {
        chartRef.current.remove();
      } catch (error) {
        logger.debug('[StockChart] Error removing chart instance during dispose', { error });
      }
      chartRef.current = null;
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !isDisposed.current) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const calculateCostBasis = (trades: Trade[]): CostBasisPoint[] => {
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let currentQuantity = 0;
    let totalCost = 0;
    const costBasisPoints: CostBasisPoint[] = [];

    sortedTrades.forEach(trade => {
      const time = Math.floor(new Date(trade.created_at).getTime() / 1000);
      
      if (trade.operation === 'buy') {
        totalCost += trade.quantity * trade.target_price;
        currentQuantity += trade.quantity;
      } else {
        const sellRatio = trade.quantity / currentQuantity;
        totalCost *= (1 - sellRatio);
        currentQuantity -= trade.quantity;
      }

      if (currentQuantity > 0) {
        costBasisPoints.push({
          time,
          value: totalCost / currentQuantity,
          quantity: currentQuantity,
          totalCost,
        });
      }
    });

    return costBasisPoints;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      chartContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (!chartRef.current || isDisposed.current) {
      logger.debug('[StockChart] Guard: chartRef missing or disposed', {
        hasChart: !!chartRef.current,
        disposed: isDisposed.current,
      });
      return;
    }
    
    const timeScale = chartRef.current.timeScale();
    const newZoom = direction === 'in' ? zoomLevel * 1.2 : zoomLevel / 1.2;
    setZoomLevel(newZoom);
    
    timeScale.applyOptions({ barSpacing: 12 * newZoom });
  };

  const updateChartType = (type: ChartType) => {
    if (!chartRef.current || !candlestickSeriesRef.current || !chartData.candlestick.length || isDisposed.current) {
      logger.debug('[StockChart] Guard: series/chart/data invalid or disposed', {
        hasChart: !!chartRef.current,
        hasSeries: !!candlestickSeriesRef.current,
        hasData: !!chartData.candlestick.length,
        disposed: isDisposed.current,
      });
      return;
    }
    
    const chart = chartRef.current;
    
    // Remove existing series
    try {
      chart.removeSeries(candlestickSeriesRef.current);
    } catch {
      return;
    }
    candlestickSeriesRef.current = null;
    
    let newSeries;
    try {
      switch (type) {
        case 'line': {
          newSeries = chartRef.current.addLineSeries({
            color: themes[theme].chart.upColor,
            lineWidth: 2,
          });
          const sortedLineData = [...chartData.candlestick]
            .sort((a, b) => a.time - b.time)
            .map(item => ({
              time: item.time,
              value: item.close,
            }));
          newSeries.setData(sortedLineData);
          break;
        }
        
        case 'bar': {
          newSeries = chartRef.current.addBarSeries({
            upColor: themes[theme].chart.upColor,
            downColor: themes[theme].chart.downColor,
          });
          const sortedBarData = [...chartData.candlestick].sort((a, b) => a.time - b.time);
          newSeries.setData(sortedBarData);
          break;
        }
        
        default: {
          newSeries = chartRef.current.addCandlestickSeries({
            upColor: themes[theme].chart.upColor,
            downColor: themes[theme].chart.downColor,
            borderVisible: false,
            wickUpColor: themes[theme].chart.upColor,
            wickDownColor: themes[theme].chart.downColor,
          });
          const sortedCandlestickData = [...chartData.candlestick].sort((a, b) => a.time - b.time);
          newSeries.setData(sortedCandlestickData);
        }
      }
      
      candlestickSeriesRef.current = newSeries;
      setChartType(type);

      if (chartData.trades.length > 0 && !isDisposed.current && candlestickSeriesRef.current) {
        const sortedTrades = [...chartData.trades].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        addTradeMarkers(candlestickSeriesRef.current, sortedTrades, themes[theme].chart);
      }
    } catch (e) {
      console.error('Error updating chart type:', e);
    }
  };

  const addTradeMarkers = useCallback((
    candlestickSeries: ISeriesApi<"Candlestick">,
    trades: Trade[],
    chartColors: { upColor: string; downColor: string }
  ) => {
    if (isDisposed.current || !candlestickSeries) return;

    const markers = trades.map(trade => {
      const isBuy = trade.operation === 'buy';
      const tradeColor = isBuy ? chartColors.upColor : chartColors.downColor;
      const time = Math.floor(new Date(trade.created_at).getTime() / 1000);
      const formattedPrice = formatCurrency(trade.target_price, currencyConfig);
      const formattedDate = format(new Date(trade.created_at), 'MMM d, yyyy HH:mm');

      return {
        time,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: tradeColor,
        shape: 'circle',
        text: `${isBuy ? '↑' : '↓'} ${trade.quantity}`,
        size: 1.5,
        tooltip: `${isBuy ? 'Buy' : 'Sell'} ${trade.quantity} @ ${formattedPrice}\n${formattedDate}${trade.notes ? '\n' + trade.notes : ''}`
      };
    });

    try {
      if (!isDisposed.current && candlestickSeries) {
        candlestickSeries.setMarkers(markers);
      }
    } catch (e) {
      console.error('Error setting markers:', e);
    }
  }, [currencyConfig]);

  // Add pending trade price lines
  useEffect(() => {
    if (isLoading || !candlestickSeriesRef.current || !pendingTrades) return;

    // Clear existing price lines
    priceLinesRef.current.forEach(line => {
      candlestickSeriesRef.current?.removePriceLine(line);
    });
    priceLinesRef.current = [];

    // Add new price lines
    pendingTrades.forEach(trade => {
      const isBuy = trade.operation === 'buy';
      const color = isBuy ? '#22c55e' : '#ef4444'; // green-500 : red-500
      
      const priceLine = candlestickSeriesRef.current?.createPriceLine({
        price: trade.target_price,
        color: color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${isBuy ? 'BUY' : 'SELL'} PLAN @ ${trade.quantity}`,
      });

      if (priceLine) {
        priceLinesRef.current.push(priceLine);
      }
    });

    return () => {
      if (candlestickSeriesRef.current && !isDisposed.current) {
        priceLinesRef.current.forEach(line => {
          try {
            candlestickSeriesRef.current?.removePriceLine(line);
          } catch (error) {
            logger.debug('[StockChart] Error removing pending trade price line', { error });
          }
        });
        priceLinesRef.current = [];
      }
    };
  }, [pendingTrades, theme, isLoading]);

  useEffect(() => {
    const fetchStockInfo = async () => {
      if (!stockCode) {
        setStockInfo({ stock_code: '^SSEC', stock_name: 'Shanghai Composite Index' });
        return;
      }

      try {
        const { data: stocks } = await stockService.getStocks();
        if (stocks && !isDisposed.current) {
          const stock = stocks.find(s => s.stock_code === stockCode);
          if (stock) {
            setStockInfo(stock);
          } else {
            setStockInfo({ stock_code: stockCode, stock_name: stockCode });
          }
        }
      } catch (error) {
        console.error('Error fetching stock info:', error);
        if (!isDisposed.current) {
          setStockInfo({ stock_code: stockCode, stock_name: stockCode });
        }
      }
    };

    fetchStockInfo();
  }, [stockCode]);

  useEffect(() => {
    if (!chartContainerRef.current || isInitializing.current) {
      logger.debug('[StockChart] Guard: container missing or initializing', {
        hasContainer: !!chartContainerRef.current,
        isInitializing: isInitializing.current,
      });
      return;
    }

    // Clean up any existing chart
    disposeChart();
    
    // Reset disposed flag as we're creating a new chart
    isDisposed.current = false;
    isInitializing.current = true;

    const isDark = theme === 'dark';
    const themedColors = getThemedColors(theme);
    const chartColors = themedColors.chart;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#e5e7eb' : '#374151',
        fontSize: 12,
      },
      grid: {
        vertLines: { 
          color: isDark ? '#374151' : '#e5e7eb',
          style: LineStyle.Dotted,
          visible: showGrid,
        },
        horzLines: { 
          color: isDark ? '#374151' : '#e5e7eb',
          style: LineStyle.Dotted,
          visible: showGrid,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#6b7280' : '#9ca3af',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
        },
        horzLine: {
          color: isDark ? '#6b7280' : '#9ca3af',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textColor: isDark ? '#e5e7eb' : '#374151',
        mode: autoScale ? PriceScaleMode.Normal : PriceScaleMode.Logarithmic,
        autoScale: autoScale,
      },
      timeScale: {
        borderColor: isDark ? '#374151' : '#e5e7eb',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 12,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return format(date, window.innerWidth < 768 ? 'MM-dd' : 'yyyy-MM-dd');
        },
      },
      handleScroll: {
        mouseWheel: !isLocked,
        pressedMouseMove: !isLocked,
        horzTouchDrag: !isLocked,
        vertTouchDrag: !isLocked,
      },
      handleScale: {
        axisPressedMouseMove: !isLocked,
        mouseWheel: !isLocked,
        pinch: !isLocked,
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: chartColors.upColor,
      downColor: chartColors.downColor,
      borderVisible: false,
      wickUpColor: chartColors.upColor,
      wickDownColor: chartColors.downColor,
    });

    candlestickSeriesRef.current = candlestickSeries;

    const volumeSeries = chart.addHistogramSeries({
      color: chartColors.upColor,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      visible: showVolume,
    });

    volumeSeriesRef.current = volumeSeries;

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    const costBasisSeries = chart.addLineSeries({
      color: isDark ? '#60a5fa' : '#3b82f6',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      title: 'Cost Basis',
      priceLineVisible: false,
      lastValueVisible: false,
    });

    costBasisSeriesRef.current = costBasisSeries;

    const loadChartData = async () => {
      if (isDisposed.current) return;

      try {
        setIsLoading(true);

        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 5 years

        const [stockResponse, userResponse] = await Promise.all([
          stockService.getStockData(stockCode || '^SSEC'),
          // Only fetch user if userId is not provided
          !userId ? authService.getUser() : Promise.resolve({ data: { user: null }, error: null })
        ]);

        if (isDisposed.current) return;

        if (!stockResponse.data) {
          throw new Error('Failed to load stock data');
        }

        const validStockData = stockResponse.data.filter(isValidDataPoint);

        const candlestickData = validStockData
          .map(item => ({
            time: Math.floor(new Date(item.date).getTime() / 1000),
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
          }))
          .sort((a, b) => a.time - b.time);

        const volumeData = validStockData
          .map((item) => ({
            time: Math.floor(new Date(item.date).getTime() / 1000),
            value: item.volume,
            color: item.close >= item.open ? chartColors.upColor : chartColors.downColor,
          }))
          .sort((a, b) => a.time - b.time);

        let trades: Trade[] = [];
        let costBasisPoints: CostBasisPoint[] = [];

        // Determine effective userId and accountId
        const effectiveUserId = userId || userResponse.data?.user?.id;
        const effectiveAccountId = accountId || userResponse.data?.user?.selectedAccountId;

        if (stockCode && effectiveUserId && effectiveAccountId) {
          const tradesResponse = await portfolioService.getRecentTrades(
            effectiveUserId,
            startDate,
            endDate,
            effectiveAccountId,
            stockCode
          );
          if (tradesResponse.data && !isDisposed.current) {
            trades = tradesResponse.data
              .filter(trade => trade.stock_code === stockCode)
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            
            if (trades.length > 0) {
              if (candlestickSeriesRef.current && !isDisposed.current) {
                addTradeMarkers(candlestickSeriesRef.current, trades, chartColors);
              }
              onTradesLoaded?.(trades);
              costBasisPoints = calculateCostBasis(trades);
              
              if (costBasisPoints.length > 0 && showCostBasis && !isDisposed.current && costBasisSeriesRef.current) {
                try {
                  costBasisSeriesRef.current.setData(costBasisPoints.map(point => ({
                    time: point.time,
                    value: point.value,
                  })));
                } catch (e) {
                  console.error('Error setting cost basis data:', e);
                }
              }
            }
          }
        }

        if (!isDisposed.current) {
          setChartData({
            candlestick: candlestickData,
            volume: volumeData,
            trades,
            costBasis: costBasisPoints,
          });

          try {
            if (candlestickSeriesRef.current && !isDisposed.current) {
              candlestickSeriesRef.current.setData(candlestickData);
            }
            if (volumeSeriesRef.current && !isDisposed.current) {
              volumeSeriesRef.current.setData(volumeData);
            }
            if (chartRef.current && !isDisposed.current) {
              chartRef.current.timeScale().fitContent();
            }
          } catch (e) {
            console.error('Error setting chart data:', e);
          }
          
          setIsLoading(false);
        }

      } catch (error) {
        console.error('Failed to load chart data:', error);
        if (!isDisposed.current) {
          setIsLoading(false);
        }
      }
    };

    loadChartData();

    // Use ResizeObserver instead of window resize event
    if (chartContainerRef.current) {
      resizeObserverRef.current = new ResizeObserver(entries => {
        if (!isDisposed.current && chartRef.current) {
          try {
            chartRef.current.applyOptions({
              width: entries[0].contentRect.width,
              height: entries[0].contentRect.height,
            });
          } catch (e) {
            console.error('Error resizing chart:', e);
          }
        }
      });
      
      resizeObserverRef.current.observe(chartContainerRef.current);
    }

    return () => {
      disposeChart();
      isInitializing.current = false;
    };
  }, [stockCode, theme, currencyConfig, showCostBasis, showGrid, showVolume, isLocked, autoScale, getThemedColors, addTradeMarkers, userId, accountId, onTradesLoaded]);

  useEffect(() => {
    if (volumeSeriesRef.current && !isDisposed.current) {
      try {
        volumeSeriesRef.current.applyOptions({
          visible: showVolume
        });
      } catch (e) {
        console.error('Error updating volume visibility:', e);
      }
    }
  }, [showVolume]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md p-4 ${fillContainer ? 'h-full flex flex-col' : ''} ${className || ''}`}>
      <div className="flex flex-col gap-4">
        <div className={`flex items-baseline gap-2 ${themes[theme].text}`}>
          <h2 className="text-xl font-bold">{stockInfo?.stock_code}</h2>
          <span className="text-sm opacity-75">{stockInfo?.stock_name}</span>
        </div>

        <div className="flex flex-wrap justify-between items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCostBasis(!showCostBasis)}
              className={`px-3 py-1 rounded text-sm ${
                showCostBasis ? themes[theme].primary : themes[theme].secondary
              }`}
            >
              Cost Basis
            </button>
            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`px-3 py-1 rounded text-sm ${
                showVolume ? themes[theme].primary : themes[theme].secondary
              }`}
            >
              Volume
            </button>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`px-3 py-1 rounded text-sm ${
                showGrid ? themes[theme].primary : themes[theme].secondary
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateChartType('candlestick')}
              className={`p-2 rounded ${
                chartType === 'candlestick' ? themes[theme].primary : themes[theme].secondary
              }`}
            >
              <CandlestickChart className="w-4 h-4" />
            </button>
            <button
              onClick={() => updateChartType('line')}
              className={`p-2 rounded ${
                chartType === 'line' ? themes[theme].primary : themes[theme].secondary
              }`}
            >
              <LineChart className="w-4 h-4" />
            </button>
            <button
              onClick={() => updateChartType('bar')}
              className={`p-2 rounded ${
                chartType === 'bar' ? themes[theme].primary : themes[theme].secondary
              }`}
            >
              <BarChart className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleZoom('in')}
              className={`p-2 rounded ${themes[theme].secondary}`}
              disabled={isLocked}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className={`p-2 rounded ${themes[theme].secondary}`}
              disabled={isLocked}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsLocked(!isLocked)}
              className={`p-2 rounded ${isLocked ? themes[theme].primary : themes[theme].secondary}`}
            >
              {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScale(!autoScale)}
              className={`px-3 py-1 rounded text-sm ${
                autoScale ? themes[theme].primary : themes[theme].secondary
              }`}
            >
              Auto Scale
            </button>
            <button
              onClick={toggleFullscreen}
              className={`p-2 rounded ${themes[theme].secondary}`}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-lg z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      <div 
        className={`mt-4 ${
          isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : 
          fillContainer ? 'flex-1 min-h-0' : 'h-[400px] sm:h-[500px] md:h-[600px]'
        }`} 
        ref={chartContainerRef}
      />
    </div>
  );
}
