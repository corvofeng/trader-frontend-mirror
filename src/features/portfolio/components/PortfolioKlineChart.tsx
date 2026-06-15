import React from 'react';
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
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';

interface PortfolioKlineChartProps {
  theme: Theme;
  klineData: PortfolioKlinePoint[];
  source: 'asset' | 'position';
  priceMode?: 'adjusted' | 'raw' | 'nav';
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

const MA_PERIODS: MovingAveragePeriod[] = [5, 10, 20];
const MA_COLORS: Record<MovingAveragePeriod, string> = {
  5: '#f59e0b',
  10: '#7c83fd',
  20: '#38bdf8',
};

const toTimestamp = (date: string) => {
  const ts = Date.parse(date.length <= 10 ? `${date}T00:00:00` : date);
  return Math.floor(ts / 1000) as UTCTimestamp;
};

const formatCompactNumber = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toFixed(0);
};

export function PortfolioKlineChart({ theme, klineData, source, priceMode }: PortfolioKlineChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<'Candlestick'> | null>(null);
  const maSeriesRefs = React.useRef<Partial<Record<MovingAveragePeriod, ISeriesApi<'Line'>>>>({});
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const [hoveredPoint, setHoveredPoint] = React.useState<PreparedPoint | null>(null);
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 640);
  const [isInteractive, setIsInteractive] = React.useState(false);
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
            const raw = point[navKey];
            return raw ?? point.nav_value;
          }
          if (effectivePriceMode === 'adjusted') {
            const adjKey = (`adjusted_${key}` as const);
            return point[adjKey];
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
  }, [isInteractive]);

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
    return formatCompactNumber(value);
  };

  const formatAxisValue = React.useCallback((value: number) => {
    if (effectivePriceMode === 'nav') {
      return isMobile ? value.toFixed(4) : value.toFixed(6);
    }
    return isMobile ? formatCompactNumber(value) : value.toFixed(2);
  }, [effectivePriceMode, isMobile]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || preparedData.length === 0) {
      return;
    }

    const isDark = theme === 'dark';
    const themedColors = getThemedColors(theme);
    const gridColor = isDark ? '#273142' : '#eef2f7';
    const borderColor = isDark ? '#334155' : '#e2e8f0';
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#cbd5e1' : '#64748b',
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
      },
      grid: {
        vertLines: {
          color: gridColor,
          style: LineStyle.Dotted,
        },
        horzLines: {
          color: gridColor,
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#6b7280' : '#9ca3af',
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
        },
        horzLine: {
          color: isDark ? '#6b7280' : '#9ca3af',
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
        },
      },
      rightPriceScale: {
        borderColor,
        minimumWidth: isMobile ? 44 : 80,
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: isMobile ? 1 : 0,
        barSpacing: isMobile ? 8 : 10,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: themedColors.chart.upColor,
      downColor: themedColors.chart.downColor,
      borderVisible: false,
      wickUpColor: themedColors.chart.upColor,
      wickDownColor: themedColors.chart.downColor,
      priceFormat: {
        type: 'custom',
        formatter: formatAxisValue,
        minMove: effectivePriceMode === 'nav' ? 0.0001 : 0.01,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    maSeriesRefs.current = {};
    series.priceScale().applyOptions({
      scaleMargins: {
        top: isMobile ? 0.22 : 0.18,
        bottom: 0.08,
      },
    });
    series.setData(preparedData);

    MA_PERIODS.forEach((period) => {
      const maSeries = chart.addLineSeries({
        color: MA_COLORS[period],
        lineWidth: period === 5 ? 2 : 1,
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
        scaleMargins: {
          top: isMobile ? 0.22 : 0.18,
          bottom: 0.08,
        },
      });
      maSeries.setData(movingAverages[period]);
      maSeriesRefs.current[period] = maSeries;
    });

    chart.timeScale().fitContent();
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
      setHoveredPoint(pointMap.get(time) ?? preparedData[preparedData.length - 1] ?? null);
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    resizeObserverRef.current = new ResizeObserver(() => {
      chart.timeScale().fitContent();
    });
    resizeObserverRef.current.observe(container);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      maSeriesRefs.current = {};
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [effectivePriceMode, formatAxisValue, getThemedColors, isInteractive, isMobile, movingAverages, preparedData, theme]);

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

  const overlayPanelClass = theme === 'dark'
    ? 'bg-slate-900/78 border border-slate-700/70 text-slate-100'
    : theme === 'blue'
      ? 'bg-white/88 border border-blue-100/90 text-slate-900'
      : 'bg-white/88 border border-slate-200/90 text-slate-900';
  const overlayMutedClass = theme === 'dark' ? 'text-slate-400' : 'text-slate-500';
  const overlayDate = isMobile ? referencePoint.labelDate.slice(5) : referencePoint.labelDate;

  return (
    <div className={isMobile ? 'relative' : `relative overflow-hidden rounded-2xl border ${themes[theme].border} ${themes[theme].card} shadow-sm`}>
      <div className={`pointer-events-none absolute left-3 top-3 z-10 ${isMobile ? 'right-16' : 'right-28'}`}>
        <div className={`${overlayPanelClass} inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-[11px] sm:text-xs backdrop-blur-sm`}>
          <span className={overlayMutedClass}>{overlayDate}</span>
          {!isMobile && (
            <>
              <span>O {formatDisplayValue(referencePoint.open)}</span>
              <span>H {formatDisplayValue(referencePoint.high)}</span>
              <span>L {formatDisplayValue(referencePoint.low)}</span>
            </>
          )}
          <span>C {isMobile ? formatCompactDisplayValue(referencePoint.close) : formatDisplayValue(referencePoint.close)}</span>
          <span className={changeClass}>
            {changeValue >= 0 ? '+' : ''}
            {isMobile ? formatCompactDisplayValue(changeValue) : formatDisplayValue(changeValue)}
            {isMobile ? ' ' : ' ('}
            {changeValue >= 0 ? '+' : ''}
            {changeRate.toFixed(isMobile ? 1 : 2)}%
            {!isMobile && ')'}
          </span>
          {movingAverageDisplay.slice(0, isMobile ? 2 : 3).map(({ period, value }) => (
            <span key={period} style={{ color: MA_COLORS[period] }}>
              M{period} {value !== null ? (isMobile ? formatCompactDisplayValue(value) : formatDisplayValue(value)) : '--'}
            </span>
          ))}
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-[390px] sm:h-[410px] md:h-[430px]"
        style={{ touchAction: 'pan-y' }}
        onPointerDownCapture={() => setIsInteractive(true)}
        role="application"
        aria-label="K线图表"
      />
    </div>
  );
}
