import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CrosshairMode, LineStyle, PriceScaleMode } from 'lightweight-charts';
import { format } from 'date-fns';
import { Theme, themes } from '../../../../../lib/theme';
import { stockService, authService, portfolioService } from '../../../../../lib/services';
import { formatCurrency } from '../../../../../lib/types';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';
import { ChevronDown, ChevronUp, ZoomIn, ZoomOut, RefreshCw, Lock, Unlock, Maximize2, Minimize2, Grid, LineChart, CandlestickChart, BarChart } from 'lucide-react';
import type { StockData, Trade, Stock } from '../../../../../lib/services/types';

type MarkerStyle = 'line' | 'bubble' | 'grid';
type ChartType = 'candlestick' | 'line' | 'bar';

interface StockChartProps {
  stockCode?: string;
  theme: Theme;
}

interface CostBasisPoint {
  time: number;
  value: number;
  quantity: number;
  totalCost: number;
}

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

export function StockChart({ stockCode, theme }: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const costBasisSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>('line');
  const [showCostBasis, setShowCostBasis] = useState(true);
  const { currencyConfig } = useCurrency();
  const [stockInfo, setStockInfo] = useState<Stock | null>(null);
  const isDisposed = useRef(false);

  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [isLocked, setIsLocked] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [chartData, setChartData] = useState<{
    candlestick: any[];
    volume: any[];
    trades: Trade[];
    costBasis: CostBasisPoint[];
  }>({ candlestick: [], volume: [], trades: [], costBasis: [] });

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
    if (!chartRef.current) return;
    
    const timeScale = chartRef.current.timeScale();
    const newZoom = direction === 'in' ? zoomLevel * 1.2 : zoomLevel / 1.2;
    setZoomLevel(newZoom);
    
    timeScale.zoom(newZoom);
  };

  const updateChartType = (type: ChartType) => {
    if (!chartRef.current || !chartData.candlestick.length || isDisposed.current) return;
    
    const chart = chartRef.current;
    
    if (candlestickSeriesRef.current) {
      chart.removeSeries(candlestickSeriesRef.current);
    }
    
    let newSeries;
    switch (type) {
      case 'line':
        newSeries = chart.addLineSeries({
          color: themes[theme].chart.upColor,
          lineWidth: 2,
        });
        newSeries.setData(chartData.candlestick.map(item => ({
          time: item.time,
          value: item.close,
        })));
        break;
      
      case 'bar':
        newSeries = chart.addBarSeries({
          upColor: themes[theme].chart.upColor,
          downColor: themes[theme].chart.downColor,
        });
        newSeries.setData(chartData.candlestick);
        break;
      
      default:
        newSeries = chart.addCandlestickSeries({
          upColor: themes[theme].chart.upColor,
          downColor: themes[theme].chart.downColor,
          borderVisible: false,
          wickUpColor: themes[theme].chart.upColor,
          wickDownColor: themes[theme].chart.downColor,
        });
        newSeries.setData(chartData.candlestick);
    }
    
    candlestickSeriesRef.current = newSeries;
    setChartType(type);

    if (chartData.trades.length > 0) {
      addTradeMarkers(newSeries, chartData.trades, themes[theme].chart, markerStyle);
    }
  };

  const addTradeMarkers = (
    candlestickSeries: ISeriesApi<any>,
    trades: Trade[],
    chartColors: { upColor: string; downColor: string },
    style: MarkerStyle
  ) => {
    if (isDisposed.current) return;

    trades.forEach(trade => {
      const isBuy = trade.operation === 'buy';
      const tradeColor = isBuy ? chartColors.upColor : chartColors.downColor;
      const time = Math.floor(new Date(trade.created_at).getTime() / 1000);

      switch (style) {
        case 'line':
          candlestickSeries.createPriceLine({
            price: trade.target_price,
            time,
            color: tradeColor,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `${isBuy ? '↑' : '↓'} ${trade.quantity}`,
          });
          break;

        case 'bubble':
          const bubbleSize = Math.max(20, Math.min(50, trade.quantity / 10));
          candlestickSeries.setMarkers([
            {
              time,
              position: isBuy ? 'belowBar' : 'aboveBar',
              color: tradeColor,
              shape: 'circle',
              size: bubbleSize / 10,
              text: `${isBuy ? '↑' : '↓'} ${trade.quantity}`,
            }
          ]);
          break;

        case 'grid':
          const gridWidth = 3;
          const gridHeight = 20;
          
          for (let i = 0; i < gridWidth; i++) {
            candlestickSeries.createPriceLine({
              price: trade.target_price - (gridHeight / 2) + (i * (gridHeight / (gridWidth - 1))),
              time,
              color: tradeColor,
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
            });
          }
          
          candlestickSeries.createPriceLine({
            price: trade.target_price,
            time,
            color: tradeColor,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `${isBuy ? '↑' : '↓'} ${trade.quantity}`,
          });
          break;
      }
    });
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Reset the disposed flag when creating a new chart
    isDisposed.current = false;

    const isDark = theme === 'dark';
    const chartColors = themes[theme].chart;

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
        const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [stockResponse, userResponse] = await Promise.all([
          stockService.getStockData(stockCode || '^SSEC'),
          stockCode ? authService.getUser() : Promise.resolve({ data: { user: null }, error: null })
        ]);

        if (isDisposed.current) return;

        if (!stockResponse.data) {
          throw new Error('Failed to load stock data');
        }

        const validStockData = stockResponse.data.filter(isValidDataPoint);

        const candlestickData = validStockData.map(item => ({
          time: Math.floor(new Date(item.date).getTime() / 1000),
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        }));

        const volumeData = validStockData.map((item) => ({
          time: Math.floor(new Date(item.date).getTime() / 1000),
          value: item.volume,
          color: item.close >= item.open ? chartColors.upColor : chartColors.downColor,
        }));

        let trades: Trade[] = [];
        let costBasisPoints: CostBasisPoint[] = [];

        if (stockCode && userResponse.data?.user) {
          const tradesResponse = await portfolioService.getRecentTrades(
            userResponse.data.user.id,
            startDate,
            endDate
          );
          if (tradesResponse.data && !isDisposed.current) {
            trades = tradesResponse.data.filter(trade => trade.stock_code === stockCode);
            
            if (trades.length > 0) {
              addTradeMarkers(candlestickSeries, trades, chartColors, markerStyle);
              costBasisPoints = calculateCostBasis(trades);
              
              if (costBasisPoints.length > 0 && showCostBasis) {
                costBasisSeries.setData(costBasisPoints.map(point => ({
                  time: point.time,
                  value: point.value,
                })));
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

          candlestickSeries.setData(candlestickData);
          volumeSeries.setData(volumeData);

          chart.timeScale().fitContent();
          setIsLoading(false);
        }

        const handleCrosshairMove = (param: any) => {
          if (isDisposed.current) return;

          if (!param.time || param.point === undefined) {
            const existingTooltip = chartContainerRef.current?.querySelector('.chart-tooltip');
            if (existingTooltip) {
              existingTooltip.remove();
            }
            return;
          }

          const trade = trades.find(t => 
            Math.floor(new Date(t.created_at).getTime() / 1000) === param.time
          );

          const costBasis = costBasisPoints?.find(p => p.time === param.time);

          if (trade || costBasis) {
            const existingTooltip = chartContainerRef.current?.querySelector('.chart-tooltip');
            if (existingTooltip) {
              existingTooltip.remove();
            }

            const tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.left = `${param.point.x + 15}px`;
            tooltip.style.top = `${param.point.y - 10}px`;
            tooltip.style.padding = '8px 12px';
            tooltip.style.backgroundColor = isDark ? '#1f2937dd' : '#ffffffdd';
            tooltip.style.border = `1px solid ${isDark ? '#ffffff33' : '#00000033'}`;
            tooltip.style.borderRadius = '4px';
            tooltip.style.zIndex = '1000';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.fontSize = '12px';
            tooltip.style.color = isDark ? '#e5e7eb' : '#111827';
            tooltip.style.whiteSpace = 'nowrap';

            let tooltipContent = '';

            if (trade) {
              const isBuy = trade.operation === 'buy';
              const tradeColor = isBuy ? chartColors.upColor : chartColors.downColor;
              const totalValue = trade.target_price * trade.quantity;
              const tradeDate = format(new Date(trade.created_at), 'MMM d, yyyy HH:mm');

              tooltipContent += `
                <div style="font-weight: 500">
                  <span style="color: ${tradeColor}">${isBuy ? '↑ Buy' : '↓ Sell'}</span> at ${formatCurrency(trade.target_price, currencyConfig)}
                </div>
                <div style="margin-top: 4px; opacity: 0.9">
                  Quantity: ${trade.quantity.toLocaleString()}
                </div>
                <div style="margin-top: 2px; opacity: 0.9">
                  Total: ${formatCurrency(totalValue, currencyConfig)}
                </div>
                <div style="margin-top: 4px; font-size: 11px; opacity: 0.7">
                  ${tradeDate}
                </div>
              `;

              if (trade.notes) {
                tooltipContent += `
                  <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid ${isDark ? '#ffffff33' : '#00000033'}; opacity: 0.8; max-width: 300px; white-space: normal">
                    ${trade.notes}
                  </div>
                `;
              }
            }

            if (costBasis) {
              if (tooltipContent) {
                tooltipContent += `<div style="margin-top: 8px; border-top: 1px solid ${isDark ? '#ffffff33' : '#00000033'}"></div>`;
              }
              tooltipContent += `
                <div style="color: ${isDark ? '#60a5fa' : '#3b82f6'}; font-weight: 500">
                  Cost Basis: ${formatCurrency(costBasis.value, currencyConfig)}
                </div>
                <div style="margin-top: 2px; opacity: 0.9">
                  Position: ${costBasis.quantity.toLocaleString()} shares
                </div>
                <div style="margin-top: 2px; opacity: 0.9">
                  Total Cost: ${formatCurrency(costBasis.totalCost, currencyConfig)}
                </div>
              `;
            }

            tooltip.innerHTML = tooltipContent;
            chartContainerRef.current?.appendChild(tooltip);
          }
        };

        chart.subscribeCrosshairMove(handleCrosshairMove);

      } catch (error) {
        console.error('Failed to load chart data:', error);
        if (!isDisposed.current) {
          setIsLoading(false);
        }
      }
    };

    loadChartData();

    const handleResize = () => {
      if (!isDisposed.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current?.clientWidth ?? 800,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed.current = true;
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeCrosshairMove();
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      costBasisSeriesRef.current = null;
    };
  }, [stockCode, theme, currencyConfig, markerStyle, showCostBasis, showGrid, showVolume, isLocked, autoScale]);

  useEffect(() => {
    if (volumeSeriesRef.current && !isDisposed.current) {
      volumeSeriesRef.current.applyOptions({
        visible: showVolume
      });
    }
  }, [showVolume]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md p-4`}>
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

        <div className="flex gap-2">
          <button
            onClick={() => setMarkerStyle('line')}
            className={`px-3 py-1 rounded text-sm ${
              markerStyle === 'line' ? themes[theme].primary : themes[theme].secondary
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setMarkerStyle('bubble')}
            className={`px-3 py-1 rounded text-sm ${
              markerStyle === 'bubble' ? themes[theme].primary : themes[theme].secondary
            }`}
          >
            Bubble
          </button>
          <button
            onClick={() => setMarkerStyle('grid')}
            className={`px-3 py-1 rounded text-sm ${
              markerStyle === 'grid' ? themes[theme].primary : themes[theme].secondary
            }`}
          >
            Grid
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-lg z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      <div 
        className={`h-[400px] sm:h-[500px] md:h-[600px] mt-4 ${
          isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : ''
        }`} 
        ref={chartContainerRef}
      />
    </div>
  );
}