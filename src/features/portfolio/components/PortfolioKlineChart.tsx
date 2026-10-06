import React from 'react';
import { createPortal } from 'react-dom';
import {
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineStyle,
  Time,
  UTCTimestamp,
  createChart,
} from 'lightweight-charts';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import type { PortfolioKlinePoint } from '../../../lib/services/types';
import { formatCurrency, formatCompactNumber } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { Maximize2, Minimize2 } from 'lucide-react';

interface PortfolioKlineChartProps {
  theme: Theme;
  klineData: PortfolioKlinePoint[];
  source: 'asset' | 'position';
  priceMode?: 'adjusted' | 'raw' | 'nav';
  sseData?: Array<{ date: string; close: number; returnRate: number }>;
}

type MovingAveragePeriod = 5 | 10 | 20;

type PreparedPoint = {
  time: UTCTimestamp;
  labelDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type MovingAveragePoint = {
  time: UTCTimestamp;
  value: number;
};

const MA_PERIODS: MovingAveragePeriod[] = [20];
const MA_COLORS: Record<MovingAveragePeriod, string> = {
  5: 'rgba(245, 158, 11, 0.80)',
  10: 'rgba(167, 139, 250, 0.72)',
  20: '#f59e0b',
};

const toTimestamp = (date: string) => {
  const ts = Date.parse(date.length <= 10 ? `${date}T00:00:00` : date);
  return Math.floor(ts / 1000) as UTCTimestamp;
};



export function PortfolioKlineChart({ theme, klineData, source, priceMode, sseData = [] }: PortfolioKlineChartProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const areaSeriesRef = React.useRef<ISeriesApi<'Area'> | null>(null);
  const seriesRef = React.useRef<ISeriesApi<'Candlestick'> | null>(null);
  const maSeriesRefs = React.useRef<Partial<Record<MovingAveragePeriod, ISeriesApi<'Line'>>>>({});
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const [hoveredPoint, setHoveredPoint] = React.useState<PreparedPoint | null>(null);
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 640);
  const [isInteractive, setIsInteractive] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
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
  const { currencyConfig, getThemedColors } = useCurrency();

  const effectivePriceMode = source === 'position' ? 'raw' : (priceMode ?? 'adjusted');

  const preparedData = React.useMemo<PreparedPoint[]>(() => {
    return klineData
      .map((point) => {
        const selectValue = (key: 'open' | 'high' | 'low' | 'close') => {
          if (source === 'position') {
            const positionKey = (`position_${key}` as const);
            return point[positionKey] ?? point.position_value;
          }
          if (effectivePriceMode === 'nav') {
            const navKey = (`nav_${key}` as const);
            const candidate = point[navKey] ?? (key === 'close' ? point.nav_value : undefined);
            return Number.isFinite(candidate) ? candidate : point[key];
          }
          if (effectivePriceMode === 'adjusted') {
            const adjKey = (`adjusted_${key}` as const);
            const candidate = point[adjKey];
            return Number.isFinite(candidate) ? candidate : Number.NaN;
          }
          return point[key];
        };

        const open = selectValue('open');
        const high = selectValue('high');
        const low = selectValue('low');
        const close = selectValue('close');
        if (
          !point.date ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          return null;
        }
        return {
          time: toTimestamp(point.date),
          labelDate: point.date,
          open,
          high,
          low,
          close,
        };
      })
      .filter((point): point is PreparedPoint => point !== null)
      .sort((a, b) => a.time - b.time);
  }, [effectivePriceMode, klineData, source]);

  const movingAverages = React.useMemo<Record<MovingAveragePeriod, MovingAveragePoint[]>>(() => {
    const result = {} as Record<MovingAveragePeriod, MovingAveragePoint[]>;

    MA_PERIODS.forEach((period) => {
      result[period] = preparedData
        .map((point, index) => {
          if (index + 1 < period) return null;
          const window = preparedData.slice(index + 1 - period, index + 1);
          const sum = window.reduce((acc, item) => acc + item.close, 0);
          return {
            time: point.time,
            value: sum / period,
          };
        })
        .filter((point): point is MovingAveragePoint => point !== null);
    });

    return result;
  }, [preparedData]);

  const scaledSseData = React.useMemo(() => {
    if (!sseData || sseData.length === 0 || preparedData.length === 0) {
      return [];
    }

    let basePortfolioClose = 0;
    let baseSseClose = 0;
    
    for (const point of preparedData) {
      const ssePoint = sseData.find(s => s.date === point.labelDate);
      if (ssePoint && ssePoint.close > 0 && point.close > 0) {
        basePortfolioClose = point.close;
        baseSseClose = ssePoint.close;
        break;
      }
    }

    if (basePortfolioClose === 0 || baseSseClose === 0) {
      return [];
    }

    return preparedData.map(point => {
      const ssePoint = sseData.find(s => s.date === point.labelDate);
      if (!ssePoint) return null;
      
      const scaledClose = (ssePoint.close / baseSseClose) * basePortfolioClose;
      return {
        time: point.time,
        close: scaledClose
      };
    }).filter((item): item is { time: UTCTimestamp; close: number } => item !== null);
  }, [preparedData, sseData]);

  const sseMA20 = React.useMemo(() => {
    if (scaledSseData.length === 0) return [];
    
    const period = 20;
    return scaledSseData.map((point, index) => {
      if (index + 1 < period) return null;
      const window = scaledSseData.slice(index + 1 - period, index + 1);
      const sum = window.reduce((acc, item) => acc + item.close, 0);
      return {
        time: point.time,
        value: sum / period
      };
    }).filter((item): item is { time: UTCTimestamp; value: number } => item !== null);
  }, [scaledSseData]);


  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (!isInteractive) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) {
        return;
      }
      setIsInteractive(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInteractive(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isInteractive]);

  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    chart.applyOptions({
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: isInteractive,
        horzTouchDrag: isInteractive,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: isInteractive,
        pinch: isInteractive,
      },
    });
  }, [isInteractive, isFullscreen]);

  const formatDisplayValue = (value: number) => {
    if (effectivePriceMode === 'nav') {
      return value.toFixed(6);
    }
    return formatCurrency(value, currencyConfig);
  };

  const formatCompactDisplayValue = (value: number) => {
    if (effectivePriceMode === 'nav') {
      return value.toFixed(4);
    }
    return formatCompactNumber(value, currencyConfig?.region);
  };

  const formatAxisValue = React.useCallback((value: number) => {
    if (effectivePriceMode === 'nav') {
      return isMobile ? value.toFixed(3) : value.toFixed(4);
    }
    if (isMobile) {
      const abs = Math.abs(value);
      if (abs >= 1e8) {
        const val = value / 1e8;
        return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}亿`;
      }
      if (abs >= 1e4) {
        const val = value / 1e4;
        return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}万`;
      }
      return value.toFixed(0);
    }
    return formatCompactNumber(value, currencyConfig?.region);
  }, [effectivePriceMode, currencyConfig?.region, isMobile]);

  React.useEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport || preparedData.length === 0) {
      return;
    }

    const isDark = theme === 'dark';
    const isBlue = theme === 'blue';
    const themedColors = getThemedColors(theme);
    const verticalGridColor = isDark ? 'rgba(255, 255, 255, 0.04)' : (isBlue ? 'rgba(224, 231, 255, 0.4)' : 'rgba(241, 245, 249, 0.6)');
    const horizontalGridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : (isBlue ? 'rgba(224, 231, 255, 0.7)' : 'rgba(241, 245, 249, 0.8)');
    const borderColor = isDark ? '#3f3f46' : (isBlue ? '#dbeafe' : '#e2e8f0');
    const textColor = isDark ? '#C3BCDB' : (isBlue ? '#1e293b' : '#64748b');
    const areaTopColor = isDark ? 'rgba(56, 33, 110, 0.60)' : (isBlue ? 'rgba(37, 99, 235, 0.15)' : 'rgba(99, 102, 241, 0.14)');
    const areaBottomColor = isDark ? 'rgba(56, 33, 110, 0.10)' : (isBlue ? 'rgba(37, 99, 235, 0.02)' : 'rgba(99, 102, 241, 0.02)');
    const candleUpColor = themedColors.chart.upColor;
    const candleDownColor = themedColors.chart.downColor;
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#18181b' : '#ffffff' },
        textColor,
        fontSize: isMobile ? 10 : 12,
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: isInteractive,
        horzTouchDrag: isInteractive,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: isInteractive,
        pinch: isInteractive,
      },
      localization: {
        priceFormatter: formatAxisValue,
        dateFormat: 'yyyy-MM-dd',
      },
      grid: {
        vertLines: {
          color: verticalGridColor,
          style: LineStyle.Dotted,
          visible: false,
        },
        horzLines: {
          color: horizontalGridColor,
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(0, 0, 0, 0)',
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: isDark ? '#9B7DFF' : '#8b5cf6',
        },
        horzLine: {
          color: isDark ? '#9B7DFF' : '#8b5cf6',
          style: LineStyle.Solid,
          labelBackgroundColor: isDark ? '#9B7DFF' : '#8b5cf6',
        },
      },
      rightPriceScale: {
        borderColor,
        minimumWidth: isMobile ? 38 : 64,
      },
      timeScale: {
        borderColor,
        timeVisible: false,
        secondsVisible: false,
        rightOffset: 0,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
    });

    const scaleMargins = {
      top: 0.08,
      bottom: 0.04,
    };

    const areaSeries = chart.addAreaSeries({
      lineColor: 'transparent',
      topColor: areaTopColor,
      bottomColor: areaBottomColor,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const series = chart.addCandlestickSeries({
      upColor: candleUpColor,
      downColor: candleDownColor,
      borderVisible: false,
      wickUpColor: candleUpColor,
      wickDownColor: candleDownColor,
      priceFormat: {
        type: 'custom',
        formatter: formatAxisValue,
        minMove: effectivePriceMode === 'nav' ? 0.0001 : 0.01,
      },
    });

    chartRef.current = chart;
    areaSeriesRef.current = areaSeries;
    seriesRef.current = series;
    maSeriesRefs.current = {};
    areaSeries.setData(preparedData.map((point) => ({
      time: point.time,
      value: (point.open + point.close) / 2,
    })));
    series.priceScale().applyOptions({
      scaleMargins,
    });
    series.setData(preparedData);

    MA_PERIODS.forEach((period) => {
      const maSeries = chart.addLineSeries({
        color: MA_COLORS[period],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: {
          type: 'custom',
          formatter: formatAxisValue,
          minMove: effectivePriceMode === 'nav' ? 0.0001 : 0.01,
        },
      });
      maSeries.priceScale().applyOptions({
        scaleMargins,
      });
      maSeries.setData(movingAverages[period]);
      maSeriesRefs.current[period] = maSeries;
    });

    if (scaledSseData.length > 0) {
      // Note: We hid the SSE raw close price line per user request to keep K-line chart clean.

      if (sseMA20.length > 0) {
        const sseMaSeries = chart.addLineSeries({
          color: '#3b82f6', // Clear blue matching 🔹
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: {
            type: 'custom',
            formatter: formatAxisValue,
            minMove: effectivePriceMode === 'nav' ? 0.0001 : 0.01,
          },
        });
        sseMaSeries.priceScale().applyOptions({
          scaleMargins,
        });
        sseMaSeries.setData(sseMA20);
      }
    }

    chart.timeScale().fitContent();
    requestAnimationFrame(() => {
      chart.timeScale().fitContent();
    });
    setHoveredPoint(preparedData[preparedData.length - 1] ?? null);

    const pointMap = new Map(preparedData.map((point) => [point.time, point]));
    const handleCrosshairMove = (param: { time?: Time }) => {
      if (!param.time) {
        setHoveredPoint(preparedData[preparedData.length - 1] ?? null);
        return;
      }
      const time = typeof param.time === 'number'
        ? param.time
        : typeof param.time === 'string'
          ? (Math.floor(Date.parse(`${param.time}T00:00:00`) / 1000) as UTCTimestamp)
        : (Math.floor(Date.UTC(param.time.year, param.time.month - 1, param.time.day) / 1000) as UTCTimestamp);
      const nextPoint = pointMap.get(time) ?? preparedData[preparedData.length - 1] ?? null;
      setHoveredPoint(nextPoint);
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    resizeObserverRef.current = new ResizeObserver(() => {
      chart.timeScale().fitContent();
    });
    resizeObserverRef.current.observe(viewport);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      maSeriesRefs.current = {};
      areaSeriesRef.current = null;
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [effectivePriceMode, formatAxisValue, getThemedColors, isInteractive, isMobile, movingAverages, preparedData, theme, scaledSseData, sseMA20, isFullscreen]);

  if (preparedData.length === 0) {
    return (
      <div className={`h-[280px] flex items-center justify-center rounded-md border border-dashed ${themes[theme].border}`}>
        <span className={`${themes[theme].text} opacity-70 text-sm`}>暂无可用的 K 线数据</span>
      </div>
    );
  }

  const referencePoint = hoveredPoint ?? preparedData[preparedData.length - 1];
  const changeValue = referencePoint.close - referencePoint.open;
  const changeRate = referencePoint.open > 0 ? (changeValue / referencePoint.open) * 100 : 0;
  const changeClass = changeValue >= 0 ? 'text-emerald-500' : 'text-rose-500';

  const movingAverageDisplay = React.useMemo(() => {
    const targetTime = referencePoint.time;
    return MA_PERIODS.map((period) => {
      const value = movingAverages[period].find((point) => point.time === targetTime)?.value ?? null;
      return { period, value };
    });
  }, [movingAverages, referencePoint.time]);

  const sseDisplay = React.useMemo(() => {
    if (scaledSseData.length === 0) return null;
    const targetTime = referencePoint.time;
    const close = scaledSseData.find(point => point.time === targetTime)?.close ?? null;
    const ma = sseMA20.find(point => point.time === targetTime)?.value ?? null;
    return { close, ma };
  }, [scaledSseData, sseMA20, referencePoint.time]);

  const overlayPanelClass = theme === 'dark'
    ? 'bg-slate-900/56 border border-slate-700/45 text-slate-200'
    : theme === 'blue'
      ? 'bg-white/74 border border-blue-100/55 text-slate-900'
      : 'bg-white/74 border border-slate-200/60 text-slate-900';
  const overlayMutedClass = theme === 'dark' ? 'text-slate-400/80' : 'text-slate-500/85';
  const overlayDate = isMobile ? referencePoint.labelDate.slice(5) : referencePoint.labelDate;

  const chartContent = (
    <div
      className={
        isFullscreen
          ? `fixed inset-0 z-[9999] w-full h-full flex flex-col p-4 md:p-6 overflow-hidden ${themes[theme].card}`
          : isMobile
            ? 'relative'
            : `relative overflow-hidden rounded-2xl border ${themes[theme].border} ${themes[theme].card}`
      }
    >
      <div className={`pointer-events-none absolute left-3 top-3 z-10 ${isMobile ? 'right-16' : 'right-28'}`}>
        <div className={`${overlayPanelClass} inline-flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3 py-1.5 text-[10px] sm:text-[11px] backdrop-blur-sm`}>
          <span className={overlayMutedClass}>{overlayDate}</span>
          <span>C {isMobile ? formatCompactDisplayValue(referencePoint.close) : formatDisplayValue(referencePoint.close)}</span>
          <span className={changeClass}>
            {changeValue >= 0 ? '+' : ''}
            {isMobile ? formatCompactDisplayValue(changeValue) : formatDisplayValue(changeValue)}
            {isMobile ? ' ' : ' ('}
            {changeValue >= 0 ? '+' : ''}
            {changeRate.toFixed(isMobile ? 1 : 2)}%
            {!isMobile && ')'}
          </span>
          {movingAverageDisplay.slice(0, isMobile ? 1 : 3).map(({ period, value }) => (
            <span key={period} style={{ color: MA_COLORS[period] }}>
              M{period} {value !== null ? (isMobile ? formatCompactDisplayValue(value) : formatDisplayValue(value)) : '--'}
            </span>
          ))}
          {sseDisplay && sseDisplay.ma !== null && (
            <span style={{ color: '#60a5fa' }}>
              上证 M20 {isMobile ? formatCompactDisplayValue(sseDisplay.ma) : formatDisplayValue(sseDisplay.ma)}
            </span>
          )}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        {sseDisplay && (
          <div className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[10px] sm:text-[11px] backdrop-blur-sm ${overlayPanelClass}`}>
            <span className="flex items-center gap-1 cursor-help" title="MA20：20日收盘价简单移动平均线（现价与前19日收盘价均值）">
              <span>🔸</span>
              <span>MA20</span>
            </span>
            <span className="flex items-center gap-1 cursor-help" title="上证 MA20：上证指数的20日收盘价归一化移动平均线">
              <span>🔹</span>
              <span>上证 MA20</span>
            </span>
          </div>
        )}
        <button
          onClick={() => setIsFullscreen(prev => !prev)}
          className={`flex items-center justify-center rounded-xl p-1.5 backdrop-blur-sm border transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${
            theme === 'dark'
              ? 'bg-slate-900/56 border-slate-700/45 text-slate-200 hover:bg-slate-800/60'
              : theme === 'blue'
                ? 'bg-white/74 border-blue-100/55 text-slate-900 hover:bg-blue-50/80'
                : 'bg-white/74 border-slate-200/60 text-slate-900 hover:bg-slate-50/80'
          }`}
          title={isFullscreen ? "退出全屏" : "全屏图表"}
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          )}
        </button>
      </div>

      <div
        ref={viewportRef}
        className={`relative overflow-hidden ${
          isFullscreen
            ? 'flex-1 min-h-0 mt-4'
            : isMobile
              ? 'h-[300px]'
              : 'rounded-2xl h-[350px] md:h-[380px]'
        }`}
        style={{ touchAction: 'pan-y' }}
        onPointerDownCapture={() => setIsInteractive(true)}
        role="application"
        aria-label="K线图表"
      >
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );

  if (isFullscreen) {
    return createPortal(chartContent, document.body);
  }

  return chartContent;
}
