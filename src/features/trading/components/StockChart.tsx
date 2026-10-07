import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { logger } from '../../../shared/utils/logger';
import { createChart, ColorType, IChartApi, ISeriesApi, CrosshairMode, LineStyle, PriceScaleMode, UTCTimestamp } from 'lightweight-charts';
import { format } from 'date-fns';
import { themes } from '../../../shared/constants/theme';
import { stockService, authService, portfolioService } from '../../../lib/services';
import { formatCurrency } from '../../../shared/utils/format';
import { isBuyOperation } from '../../../shared/utils/trade';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { ZoomIn, ZoomOut, Lock, Unlock, Maximize2, Minimize2, Grid, LineChart, CandlestickChart, BarChart } from 'lucide-react';
import type { StockData, Trade, Stock } from '../../../lib/services/types';
import type { Theme } from '../../../shared/types/ui';

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
  compactMode?: boolean;
  defaultVisibleMonths?: number;
}

interface CostBasisPoint {
  time: UTCTimestamp;
  value: number;
  quantity: number;
  totalCost: number;
}

interface CandlestickPoint {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VolumePoint {
  time: UTCTimestamp;
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

const findClosestIndex = (points: Array<{ time: UTCTimestamp }>, targetTime: UTCTimestamp): number => {
  if (points.length === 0) return 0;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time < targetTime) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].time - targetTime) <= Math.abs(points[lo].time - targetTime)) return lo - 1;
  return lo;
};

const getChartVisualPalette = (theme: Theme, fallback: { upColor: string; downColor: string }) => {
  if (theme === 'dark') {
    return {
      background: '#18181b',
      textColor: '#d1d5db',
      gridColor: '#27272a',
      scaleBorderColor: '#3f3f46',
      crosshairLineColor: '#71717a',
      crosshairLabelColor: '#3f3f46',
      upColor: fallback.upColor,
      downColor: fallback.downColor,
    };
  }

  const isBlue = theme === 'blue';
  return {
    background: '#ffffff',
    textColor: '#0f172a',
    gridColor: isBlue ? '#e0e7ff' : '#f1f5f9',
    scaleBorderColor: isBlue ? '#c7d2fe' : '#e2e8f0',
    crosshairLineColor: isBlue ? '#60a5fa' : '#94a3b8',
    crosshairLabelColor: isBlue ? '#60a5fa' : '#94a3b8',
    upColor: fallback.upColor,
    downColor: fallback.downColor,
  };
};

export function StockChart({ stockCode, theme, pendingTrades, userId, accountId, onTradesLoaded, className, fillContainer = false, compactMode = false, defaultVisibleMonths }: StockChartProps) {
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const onTradesLoadedRef = useRef<typeof onTradesLoaded>(onTradesLoaded);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<any> | null>(null);
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
  const [showVolume, setShowVolume] = useState(false);
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
  const chartDataRef = useRef<{
    candlestick: CandlestickPoint[];
    volume: VolumePoint[];
    trades: Trade[];
    costBasis: CostBasisPoint[];
  }>({ candlestick: [], volume: [], trades: [], costBasis: [] });
  const prevStockCodeRef = useRef<string | null | undefined>(stockCode);

  if (prevStockCodeRef.current !== stockCode) {
    prevStockCodeRef.current = stockCode;
    chartDataRef.current = { candlestick: [], volume: [], trades: [], costBasis: [] };
  }

  const isCompact = compactMode && !isFullscreen;

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
    onTradesLoadedRef.current = onTradesLoaded;
  }, [onTradesLoaded]);

  // Lock body scroll and handle Escape key for CSS-based fullscreen mode
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const calculateCostBasis = (trades: Trade[]): CostBasisPoint[] => {
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let currentQuantity = 0;
    let totalCost = 0;
    const costBasisPoints: CostBasisPoint[] = [];

    sortedTrades.forEach(trade => {
      const time = Math.floor(new Date(trade.created_at).getTime() / 1000) as UTCTimestamp;
      
      if (isBuyOperation(trade.operation)) {
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
    setIsFullscreen(!isFullscreen);
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
    
    let newSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Bar'> | ISeriesApi<'Line'>;
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
          const nextPalette = getChartVisualPalette(theme, themes[theme].chart);
          newSeries = chartRef.current.addCandlestickSeries({
            upColor: nextPalette.upColor,
            downColor: nextPalette.downColor,
            borderVisible: false,
            wickUpColor: nextPalette.upColor,
            wickDownColor: nextPalette.downColor,
          });
          newSeries.priceScale().applyOptions({
            autoScale: autoScale,
            scaleMargins: {
              top: isCompact ? 0.05 : 0.1,
              bottom: showVolume ? (isCompact ? 0.12 : 0.2) : (isCompact ? 0.05 : 0.08),
            },
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
    candlestickSeries: ISeriesApi<any>,
    trades: Trade[],
    chartColors: { upColor: string; downColor: string }
  ) => {
    if (isDisposed.current || !candlestickSeries) return;

    const markers = trades.map(trade => {
      const isBuy = isBuyOperation(trade.operation);
      const tradeColor = isBuy ? chartColors.upColor : chartColors.downColor;
      const time = Math.floor(new Date(trade.created_at).getTime() / 1000) as UTCTimestamp;
      const formattedPrice = formatCurrency(trade.target_price, currencyConfig);
      const formattedDate = format(new Date(trade.created_at), 'MMM d, yyyy HH:mm');

      return {
        time,
        position: isBuy ? 'belowBar' as const : 'aboveBar' as const,
        color: tradeColor,
        shape: 'circle' as const,
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
      const isBuy = isBuyOperation(trade.operation);
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

    const themedColors = getThemedColors(theme);
    const chartColors = themedColors.chart;
    const visualPalette = getChartVisualPalette(theme, chartColors);

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: visualPalette.background },
        textColor: visualPalette.textColor,
        fontSize: 12,
      },
      localization: {
        priceFormatter: (value: number) => formatCurrency(value, currencyConfig),
      },
      grid: {
        vertLines: { 
          color: visualPalette.gridColor,
          style: LineStyle.Solid,
          visible: showGrid,
        },
        horzLines: { 
          color: visualPalette.gridColor,
          style: LineStyle.Solid,
          visible: showGrid,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: visualPalette.crosshairLineColor,
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: visualPalette.crosshairLabelColor,
        },
        horzLine: {
          color: visualPalette.crosshairLineColor,
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: visualPalette.crosshairLabelColor,
        },
      },
      rightPriceScale: {
        borderColor: visualPalette.scaleBorderColor,
        textColor: visualPalette.textColor,
        mode: autoScale ? PriceScaleMode.Normal : PriceScaleMode.Logarithmic,
        autoScale: autoScale,
      },
      timeScale: {
        borderColor: visualPalette.scaleBorderColor,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: window.innerWidth < 768 ? 8 : 10,
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

    let mainSeries: ISeriesApi<any>;
    if (chartType === 'line') {
      mainSeries = chart.addLineSeries({
        color: themes[theme].chart.upColor,
        lineWidth: 2,
      });
    } else if (chartType === 'bar') {
      mainSeries = chart.addBarSeries({
        upColor: themes[theme].chart.upColor,
        downColor: themes[theme].chart.downColor,
      });
    } else {
      mainSeries = chart.addCandlestickSeries({
        upColor: visualPalette.upColor,
        downColor: visualPalette.downColor,
        borderVisible: false,
        wickUpColor: visualPalette.upColor,
        wickDownColor: visualPalette.downColor,
      });
    }

    mainSeries.priceScale().applyOptions({
      autoScale: autoScale,
      scaleMargins: {
        top: isCompact ? 0.05 : 0.1,
        bottom: showVolume ? (isCompact ? 0.12 : 0.2) : (isCompact ? 0.05 : 0.08),
      },
    });

    candlestickSeriesRef.current = mainSeries;

    const volumeSeries = chart.addHistogramSeries({
      color: chartColors.upColor,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      visible: showVolume,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    volumeSeriesRef.current = volumeSeries;

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: isCompact ? 0.88 : 0.8,
        bottom: 0,
      },
    });

    const costBasisSeries = chart.addLineSeries({
      color: theme === 'dark' ? '#60a5fa' : '#3b82f6',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      title: 'Cost Basis',
      priceLineVisible: false,
      lastValueVisible: false,
    });

    costBasisSeriesRef.current = costBasisSeries;

    const applyDataToSeries = (
      candlestickData: CandlestickPoint[],
      volumeData: VolumePoint[],
      costBasisPoints: CostBasisPoint[],
      trades: Trade[]
    ) => {
      if (isDisposed.current || !candlestickSeriesRef.current) return;

      try {
        if (chartType === 'line') {
          candlestickSeriesRef.current.setData(
            candlestickData.map(item => ({ time: item.time, value: item.close }))
          );
        } else {
          candlestickSeriesRef.current.setData(candlestickData);
        }

        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(volumeData);
        }

        if (costBasisSeriesRef.current && costBasisPoints.length > 0 && showCostBasis) {
          costBasisSeriesRef.current.setData(
            costBasisPoints.map(point => ({ time: point.time, value: point.value }))
          );
        }

        if (trades.length > 0 && candlestickSeriesRef.current) {
          addTradeMarkers(candlestickSeriesRef.current, trades, chartColors);
        }

        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
          if (defaultVisibleMonths && candlestickData.length > 0) {
            const lastTime = candlestickData[candlestickData.length - 1].time;
            const fromMs = lastTime * 1000 - defaultVisibleMonths * 30 * 24 * 60 * 60 * 1000;
            let fromTime = Math.floor(fromMs / 1000) as UTCTimestamp;
            if (candlestickData[0].time > fromTime) {
              fromTime = candlestickData[0].time;
            }
            chartRef.current.timeScale().setVisibleLogicalRange({
              from: findClosestIndex(candlestickData, fromTime),
              to: candlestickData.length - 1,
            });
          }
        }
      } catch (e) {
        console.error('Error setting chart data:', e);
      }
    };

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
            time: Math.floor(new Date(item.date).getTime() / 1000) as UTCTimestamp,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
          }))
          .sort((a, b) => a.time - b.time);

        const volumeData = validStockData
          .map((item) => ({
            time: Math.floor(new Date(item.date).getTime() / 1000) as UTCTimestamp,
            value: item.volume,
            color: item.close >= item.open ? chartColors.upColor : chartColors.downColor,
          }))
          .sort((a, b) => a.time - b.time);

        let trades: Trade[] = [];
        let costBasisPoints: CostBasisPoint[] = [];
        const userWithSelectedAccount = userResponse.data?.user as ({ id?: string | null; selectedAccountId?: string | null } | null | undefined);

        // Determine effective userId and accountId
        const effectiveUserId = userId || userWithSelectedAccount?.id;
        const effectiveAccountId = accountId || userWithSelectedAccount?.selectedAccountId;

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
              costBasisPoints = calculateCostBasis(trades);
            }
          }
        }

        if (!isDisposed.current) {
          onTradesLoadedRef.current?.(trades);
          const nextData = {
            candlestick: candlestickData,
            volume: volumeData,
            trades,
            costBasis: costBasisPoints,
          };
          chartDataRef.current = nextData;
          setChartData(nextData);
          applyDataToSeries(candlestickData, volumeData, costBasisPoints, trades);
          setIsLoading(false);
        }

      } catch (error) {
        console.error('Failed to load chart data:', error);
        if (!isDisposed.current) {
          setIsLoading(false);
        }
      }
    };

    if (chartDataRef.current.candlestick.length > 0) {
      applyDataToSeries(
        chartDataRef.current.candlestick,
        chartDataRef.current.volume,
        chartDataRef.current.costBasis,
        chartDataRef.current.trades
      );
      setIsLoading(false);
    } else {
      loadChartData();
    }

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
      
      resizeObserverRef.current.observe(chartViewportRef.current || chartContainerRef.current);
    }

    return () => {
      disposeChart();
      isInitializing.current = false;
    };
  }, [stockCode, theme, currencyConfig, showCostBasis, showGrid, showVolume, isLocked, autoScale, getThemedColors, addTradeMarkers, userId, accountId, isCompact, defaultVisibleMonths, isFullscreen, chartType]);

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

  const btnTextClass = 'h-7 sm:h-8 px-2.5 sm:px-3 text-xs sm:text-sm font-medium rounded-md flex items-center justify-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none';
  const btnIconClass = 'h-7 sm:h-8 w-7 sm:w-8 rounded-md flex items-center justify-center transition-all duration-200 hover:scale-[1.05] active:scale-[0.94] disabled:opacity-50 disabled:pointer-events-none';

  const chartContent = (
    <div 
      className={`${themes[theme].card} ${
        isFullscreen 
          ? 'fixed inset-0 z-[9999] w-full h-full flex flex-col p-4 md:p-6 bg-white dark:bg-zinc-950 overflow-hidden' 
          : `rounded-lg shadow-md ${isCompact ? 'p-1.5' : 'p-2 sm:p-4'} ${fillContainer ? 'h-full flex flex-col' : ''} ${className || ''}`
      }`}
    >
      {!isCompact && (
        <div className="flex flex-col gap-2 sm:gap-4 mb-2 flex-none">
          <div className={`flex items-center justify-between gap-2 ${themes[theme].text}`}>
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg sm:text-xl font-bold">{stockInfo?.stock_code || stockCode}</h2>
              <span className="text-sm opacity-75">{stockInfo?.stock_name}</span>
            </div>

            {isFullscreen && (
              <button
                onClick={toggleFullscreen}
                className={`h-7 sm:h-8 px-2.5 sm:px-3 text-xs sm:text-sm font-medium rounded-md flex items-center gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.96] ${themes[theme].secondary}`}
                title="退出全屏 (Esc)"
              >
                <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>退出全屏</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap justify-between items-center gap-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCostBasis(!showCostBasis)}
                className={`${btnTextClass} ${
                  showCostBasis ? themes[theme].primary : themes[theme].secondary
                }`}
              >
                Cost Basis
              </button>
              <button
                onClick={() => setShowVolume(!showVolume)}
                className={`${btnTextClass} ${
                  showVolume ? themes[theme].primary : themes[theme].secondary
                }`}
              >
                Volume
              </button>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`${btnIconClass} ${
                  showGrid ? themes[theme].primary : themes[theme].secondary
                }`}
              >
                <Grid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateChartType('candlestick')}
                className={`${btnIconClass} ${
                  chartType === 'candlestick' ? themes[theme].primary : themes[theme].secondary
                }`}
                title="Candlestick Chart"
              >
                <CandlestickChart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={() => updateChartType('line')}
                className={`${btnIconClass} ${
                  chartType === 'line' ? themes[theme].primary : themes[theme].secondary
                }`}
                title="Line Chart"
              >
                <LineChart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={() => updateChartType('bar')}
                className={`${btnIconClass} ${
                  chartType === 'bar' ? themes[theme].primary : themes[theme].secondary
                }`}
                title="Bar Chart"
              >
                <BarChart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleZoom('in')}
                className={`${btnIconClass} ${themes[theme].secondary}`}
                disabled={isLocked}
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={() => handleZoom('out')}
                className={`${btnIconClass} ${themes[theme].secondary}`}
                disabled={isLocked}
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={() => setIsLocked(!isLocked)}
                className={`${btnIconClass} ${isLocked ? themes[theme].primary : themes[theme].secondary}`}
                title={isLocked ? "Unlock Chart Controls" : "Lock Chart Controls"}
              >
                {isLocked ? <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Unlock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScale(!autoScale)}
                className={`${btnTextClass} ${
                  autoScale ? themes[theme].primary : themes[theme].secondary
                }`}
              >
                Auto Scale
              </button>
              <button
                onClick={toggleFullscreen}
                className={`${btnIconClass} ${themes[theme].secondary}`}
                title={isFullscreen ? "退出全屏" : "全屏"}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      <div 
        className={`relative ${isCompact ? '' : 'mt-2 sm:mt-4'} overflow-hidden rounded-md ${
          isFullscreen ? 'flex-1 min-h-0' : 
          fillContainer ? 'flex-1 min-h-0' : 'h-[400px] sm:h-[500px] md:h-[600px]'
        }`} 
        ref={chartViewportRef}
      >
        <div
          className="absolute inset-0 z-0"
          ref={chartContainerRef}
        />
        {isCompact && (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 bg-slate-100/90 dark:bg-zinc-900/90 backdrop-blur-xs p-1 rounded-md border border-slate-200/50 dark:border-zinc-800/50 shadow-sm opacity-65 hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                showVolume ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800'
              }`}
            >
              量
            </button>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className="p-1 rounded text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
              title="网格"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1 rounded text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
              title={isFullscreen ? "退出全屏" : "全屏"}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-lg z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <>
        <div 
          className={`${themes[theme].card} rounded-lg border border-dashed ${themes[theme].border} flex items-center justify-center text-xs opacity-60 ${compactMode ? 'p-1.5' : 'p-2 sm:p-4'} ${fillContainer ? 'h-full w-full' : 'h-[400px] sm:h-[500px] md:h-[600px]'} ${className || ''}`}
        >
          <span>图表已全屏显示（按 Esc 键退出）</span>
        </div>
        {createPortal(chartContent, document.body)}
      </>
    );
  }

  return chartContent;
}
