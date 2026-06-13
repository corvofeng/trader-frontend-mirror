import { useEffect, useMemo, useRef, useState } from 'react';
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
import * as echarts from 'echarts';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';

interface OptionPayoffCalculatorChartProps {
  theme: Theme;
  payload: unknown;
  chartEngine?: PayoffChartEngine;
}

export type PayoffChartEngine = 'tradingview' | 'plotly' | 'echarts';

type ContractType = 'call' | 'put';

interface PayoffCalculatorLeg {
  contract_type?: ContractType;
  direction?: number;
  strike?: number;
  quantity?: number;
  multiplier?: number;
  cost_price?: number;
  volatility?: number;
  contract_name?: string;
}

interface PayoffCalculator {
  as_of_date?: string;
  expiry_date?: string;
  calendar_days_to_expiry?: number;
  underlying?: {
    code?: string;
    price?: number;
  };
  defaults?: {
    risk_free_rate?: number;
    fallback_volatility?: number;
  };
  axes?: {
    shock_pcts?: number[];
    eval_day_offsets?: number[];
  };
  legs?: PayoffCalculatorLeg[];
}

interface CurvePoint {
  shock: number;
  price: number;
  pnl: number;
}

interface ChartCurvePoint extends CurvePoint {
  time: UTCTimestamp;
}

interface HighlightMarker {
  time: UTCTimestamp;
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  position: 'aboveBar' | 'belowBar' | 'inBar';
  text: string;
}

interface PlotlyLike {
  newPlot: (
    root: HTMLElement,
    data: unknown[],
    layout?: Record<string, unknown>,
    config?: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  purge: (root: HTMLElement) => void;
  Plots?: {
    resize: (root: HTMLElement) => void;
  };
}

interface PlotlyPointEvent {
  pointIndex?: number;
}

interface PlotlyHoverEvent {
  points?: PlotlyPointEvent[];
}

interface PlotlyHTMLElement extends HTMLDivElement {
  on?: (event: 'plotly_hover' | 'plotly_unhover', handler: (event: PlotlyHoverEvent) => void) => void;
  removeAllListeners?: (event?: 'plotly_hover' | 'plotly_unhover') => void;
}

declare global {
  interface Window {
    Plotly?: PlotlyLike;
  }
}

const DEFAULT_SHOCKS = Array.from({ length: 121 }, (_, index) => Number((-0.3 + index * 0.005).toFixed(4)));
const SYNTHETIC_START_TS = Math.floor(Date.UTC(2024, 0, 1) / 1000) as UTCTimestamp;
const SYNTHETIC_STEP_SECONDS = 24 * 60 * 60;
const PLOTLY_SCRIPT_ID = 'plotly-cdn-script';
const PLOTLY_CDN_URL = 'https://cdn.plot.ly/plotly-2.35.2.min.js';
let plotlyLoaderPromise: Promise<PlotlyLike> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const uniqueSortedNumbers = (values: unknown, fallback: number[] = []) => {
  if (!Array.isArray(values)) return fallback;
  const normalized = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return Array.from(new Set(normalized)).sort((a, b) => a - b);
};

const getDateDiffInCalendarDays = (fromDate?: string, toDate?: string) => {
  if (!fromDate || !toDate) return 0;
  const startTs = Date.parse(`${fromDate}T00:00:00Z`);
  const endTs = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return 0;
  return Math.max(0, Math.round((endTs - startTs) / (24 * 60 * 60 * 1000)));
};

const extractPayoffCalculator = (payload: unknown): PayoffCalculator | null => {
  if (!isRecord(payload)) return null;

  if (Array.isArray(payload.legs)) {
    return payload as PayoffCalculator;
  }

  if (payload.payoff_calculator) {
    return extractPayoffCalculator(payload.payoff_calculator);
  }

  if (Array.isArray(payload.items)) {
    const firstWithCalculator = payload.items.find((item) => isRecord(item) && item.payoff_calculator);
    if (isRecord(firstWithCalculator) && firstWithCalculator.payoff_calculator) {
      return extractPayoffCalculator(firstWithCalculator.payoff_calculator);
    }
  }

  if (Array.isArray(payload.expiries)) {
    const firstWithCalculator = payload.expiries.find((item) => isRecord(item) && item.payoff_calculator);
    if (isRecord(firstWithCalculator) && firstWithCalculator.payoff_calculator) {
      return extractPayoffCalculator(firstWithCalculator.payoff_calculator);
    }
  }

  if (isRecord(payload.report) && Array.isArray(payload.report.expiries)) {
    const firstWithCalculator = payload.report.expiries.find((item) => isRecord(item) && item.payoff_calculator);
    if (isRecord(firstWithCalculator) && firstWithCalculator.payoff_calculator) {
      return extractPayoffCalculator(firstWithCalculator.payoff_calculator);
    }
  }

  return null;
};

function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const z = Math.abs(x);
  const t = 1 / (1 + p * z);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return sign * y;
}

function normCdf(x: number) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function intrinsicValue(spot: number, strike: number, type: ContractType) {
  return type === 'call' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

function blackScholes(spot: number, strike: number, years: number, rate: number, volatility: number, type: ContractType) {
  if (years <= 0 || volatility <= 0 || spot <= 0 || strike <= 0) {
    return intrinsicValue(spot, strike, type);
  }

  const sqrtYears = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * volatility * volatility) * years) / (volatility * sqrtYears);
  const d2 = d1 - volatility * sqrtYears;

  if (type === 'call') {
    return spot * normCdf(d1) - strike * Math.exp(-rate * years) * normCdf(d2);
  }

  return strike * Math.exp(-rate * years) * normCdf(-d2) - spot * normCdf(-d1);
}

const getCalendarDaysToExpiry = (calculator: PayoffCalculator) => {
  const explicitDays = Math.round(toFiniteNumber(calculator.calendar_days_to_expiry, Number.NaN));
  if (Number.isFinite(explicitDays) && explicitDays >= 0) return explicitDays;
  return getDateDiffInCalendarDays(calculator.as_of_date, calculator.expiry_date);
};

const getSuggestedEvalDayOffsets = (calculator: PayoffCalculator) => {
  const axisOffsets = uniqueSortedNumbers(calculator.axes?.eval_day_offsets);
  if (axisOffsets.length > 0) return axisOffsets;

  const daysToExpiry = getCalendarDaysToExpiry(calculator);
  return Array.from({ length: daysToExpiry + 1 }, (_, index) => index);
};

const getShockPcts = (calculator: PayoffCalculator) => {
  const values = uniqueSortedNumbers(calculator.axes?.shock_pcts);
  return values.length > 0 ? values : DEFAULT_SHOCKS;
};

const buildCurveForOffset = (calculator: PayoffCalculator, offset: number) => {
  const spot = Math.max(0.0001, toFiniteNumber(calculator.underlying?.price, 0));
  const daysToExpiry = getCalendarDaysToExpiry(calculator);
  const remainingDays = Math.max(0, daysToExpiry - offset);
  const yearsToExpiry = remainingDays / 365.25;
  const rate = toFiniteNumber(calculator.defaults?.risk_free_rate, 0.02);
  const fallbackVolatility = toFiniteNumber(calculator.defaults?.fallback_volatility, 0.25);
  const legs = Array.isArray(calculator.legs) ? calculator.legs : [];

  return getShockPcts(calculator).map((shock) => {
    const scenarioSpot = Math.max(0.0001, spot * (1 + shock));
    const pnl = legs.reduce((total, leg) => {
      const type: ContractType = leg.contract_type === 'put' ? 'put' : 'call';
      const strike = toFiniteNumber(leg.strike, 0);
      const quantity = toFiniteNumber(leg.quantity, 0);
      const multiplier = toFiniteNumber(leg.multiplier, 10000);
      const direction = toFiniteNumber(leg.direction, 0);
      const costPrice = toFiniteNumber(leg.cost_price, 0);
      const volatility = Math.max(0, toFiniteNumber(leg.volatility, fallbackVolatility));
      const optionValue = blackScholes(scenarioSpot, strike, yearsToExpiry, rate, volatility, type);
      return total + direction * (optionValue - costPrice) * quantity * multiplier;
    }, 0);

    return {
      shock,
      price: scenarioSpot,
      pnl,
    };
  });
};

const getBreakevens = (points: CurvePoint[]) => {
  const result: number[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if ((previous.pnl <= 0 && current.pnl >= 0) || (previous.pnl >= 0 && current.pnl <= 0)) {
      const denominator = Math.abs(previous.pnl) + Math.abs(current.pnl);
      const ratio = denominator > 0 ? Math.abs(previous.pnl) / denominator : 0;
      result.push(previous.price + (current.price - previous.price) * ratio);
    }
  }

  return result;
};

const formatPrice = (value: number) => {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
};

const findClosestPointByPrice = <T extends { price: number }>(points: T[], targetPrice: number) => {
  if (points.length === 0) return null;
  return points.reduce((closest, point) => {
    if (!closest) return point;
    return Math.abs(point.price - targetPrice) < Math.abs(closest.price - targetPrice) ? point : closest;
  }, points[0]);
};

const toTimeKey = (time?: Time) => {
  if (typeof time === 'number') return time;
  if (!time || typeof time !== 'object' || !('year' in time)) return null;
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
};

const sortByTimeAsc = <T extends { time: UTCTimestamp }>(items: T[]) =>
  [...items].sort((a, b) => Number(a.time) - Number(b.time));

const loadPlotly = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Plotly can only be loaded in the browser.'));
  }

  if (window.Plotly) {
    return Promise.resolve(window.Plotly);
  }

  if (plotlyLoaderPromise) {
    return plotlyLoaderPromise;
  }

  plotlyLoaderPromise = new Promise<PlotlyLike>((resolve, reject) => {
    const existingScript = document.getElementById(PLOTLY_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };

    const handleLoad = () => {
      cleanup();
      if (window.Plotly) {
        resolve(window.Plotly);
        return;
      }
      plotlyLoaderPromise = null;
      reject(new Error('Plotly loaded but window.Plotly is unavailable.'));
    };

    const handleError = () => {
      cleanup();
      plotlyLoaderPromise = null;
      reject(new Error('Failed to load Plotly from CDN.'));
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    if (!existingScript) {
      script.id = PLOTLY_SCRIPT_ID;
      script.src = PLOTLY_CDN_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return plotlyLoaderPromise;
};

const getQuickOffsetOptions = (offsets: number[], maxDays: number) => {
  const source = offsets.length > 0 ? offsets : [0, maxDays];
  if (source.length <= 6) return source;

  const sampled = [
    source[0],
    source[Math.floor(source.length * 0.25)],
    source[Math.floor(source.length * 0.5)],
    source[Math.floor(source.length * 0.75)],
    source[source.length - 1],
    maxDays,
  ];

  return Array.from(new Set(sampled))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= maxDays)
    .sort((a, b) => a - b);
};

const buildSegmentValues = (
  points: CurvePoint[],
  predicate: (point: CurvePoint) => boolean,
) => points.map((point) => (predicate(point) ? point.pnl : null));

export function OptionPayoffCalculatorChart({
  theme,
  payload,
  chartEngine = 'tradingview',
}: OptionPayoffCalculatorChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const echartsInstanceRef = useRef<echarts.ECharts | null>(null);
  const { currencyConfig } = useCurrency();
  const calculator = useMemo(() => extractPayoffCalculator(payload), [payload]);
  const calendarDaysToExpiry = useMemo(() => (calculator ? getCalendarDaysToExpiry(calculator) : 0), [calculator]);
  const suggestedEvalDayOffsets = useMemo(
    () => (calculator ? getSuggestedEvalDayOffsets(calculator) : []),
    [calculator],
  );
  const [selectedOffset, setSelectedOffset] = useState(0);

  useEffect(() => {
    setSelectedOffset((previous) => clamp(previous, 0, Math.max(calendarDaysToExpiry, 0)));
  }, [calendarDaysToExpiry]);

  const curvePoints = useMemo(
    () => (calculator ? buildCurveForOffset(calculator, selectedOffset) : []),
    [calculator, selectedOffset],
  );

  const chartPoints = useMemo<ChartCurvePoint[]>(
    () => sortByTimeAsc(curvePoints.map((point, index) => ({
      ...point,
      time: (SYNTHETIC_START_TS + index * SYNTHETIC_STEP_SECONDS) as UTCTimestamp,
    }))),
    [curvePoints],
  );

  const stats = useMemo(() => {
    if (!calculator || chartPoints.length === 0) {
      return null;
    }

    const currentSpot = Math.max(0.0001, toFiniteNumber(calculator.underlying?.price, 0));
    const spotPoint = findClosestPointByPrice(chartPoints, currentSpot);
    if (!spotPoint) return null;

    const maxPoint = chartPoints.reduce((best, point) => (point.pnl > best.pnl ? point : best), chartPoints[0]);
    const minPoint = chartPoints.reduce((best, point) => (point.pnl < best.pnl ? point : best), chartPoints[0]);

    return {
      currentSpot,
      remainingDays: Math.max(0, calendarDaysToExpiry - selectedOffset),
      spotPnl: spotPoint.pnl,
      spotPoint,
      maxPnl: maxPoint.pnl,
      minPnl: minPoint.pnl,
      maxPoint,
      minPoint,
      breakevens: getBreakevens(curvePoints),
    };
  }, [calculator, calendarDaysToExpiry, chartPoints, curvePoints, selectedOffset]);

  const quickOffsets = useMemo(
    () => getQuickOffsetOptions(suggestedEvalDayOffsets, Math.max(calendarDaysToExpiry, 0)),
    [calendarDaysToExpiry, suggestedEvalDayOffsets],
  );

  const chartPointMap = useMemo(
    () => new Map(chartPoints.map((point) => [Number(point.time), point])),
    [chartPoints],
  );

  const highlightMarkers = useMemo<HighlightMarker[]>(() => {
    if (!stats || chartPoints.length === 0) return [];

    const markers: HighlightMarker[] = [];
    const usedTimes = new Set<number>();
    const addMarker = (
      point: ChartCurvePoint | null,
      marker: Omit<HighlightMarker, 'time'>,
    ) => {
      if (!point || usedTimes.has(Number(point.time))) return;
      usedTimes.add(Number(point.time));
      markers.push({ ...marker, time: point.time });
    };

    addMarker(stats.spotPoint, {
      color: '#3b82f6',
      shape: 'circle',
      position: stats.spotPoint.pnl >= 0 ? 'aboveBar' : 'belowBar',
      text: 'Spot',
    });

    addMarker(stats.maxPoint, {
      color: '#10b981',
      shape: 'arrowUp',
      position: 'aboveBar',
      text: 'Max',
    });

    addMarker(stats.minPoint, {
      color: '#f43f5e',
      shape: 'arrowDown',
      position: 'belowBar',
      text: 'Min',
    });

    stats.breakevens.forEach((price, index) => {
      addMarker(findClosestPointByPrice(chartPoints, price), {
        color: '#f59e0b',
        shape: 'square',
        position: 'inBar',
        text: index === 0 ? 'BE' : `BE${index + 1}`,
      });
    });

    return sortByTimeAsc(markers);
  }, [chartPoints, stats]);

  const [hoveredPoint, setHoveredPoint] = useState<ChartCurvePoint | null>(null);
  const [plotlyError, setPlotlyError] = useState<string | null>(null);
  const [isPlotlyLoading, setIsPlotlyLoading] = useState(false);

  useEffect(() => {
    setHoveredPoint(stats?.spotPoint ?? chartPoints[0] ?? null);
  }, [chartPoints, stats]);

  useEffect(() => {
    if (chartEngine !== 'tradingview') {
      return;
    }

    if (!chartRef.current || !calculator || chartPoints.length === 0 || !stats) {
      return;
    }

    const isDark = theme === 'dark';
    const palette = {
      axis: isDark ? '#e5e7eb' : '#111827',
      muted: isDark ? '#94a3b8' : '#6b7280',
      grid: isDark ? '#334155' : '#e5e7eb',
      zero: isDark ? '#64748b' : '#94a3b8',
      upLine: '#10b981',
      downLine: '#f43f5e',
      upFillTop: 'rgba(16, 185, 129, 0.32)',
      upFillBottom: 'rgba(16, 185, 129, 0.05)',
      downFillTop: 'rgba(244, 63, 94, 0.08)',
      downFillBottom: 'rgba(244, 63, 94, 0.28)',
      crosshair: isDark ? '#64748b' : '#9ca3af',
    };

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: palette.axis,
        fontSize: 12,
      },
      grid: {
        vertLines: {
          color: palette.grid,
          style: LineStyle.Dotted,
          visible: true,
        },
        horzLines: {
          color: palette.grid,
          style: LineStyle.Dotted,
          visible: true,
        },
      },
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: palette.crosshair,
          style: LineStyle.Dashed,
          width: 1,
          labelVisible: false,
          labelBackgroundColor: isDark ? '#1e293b' : '#f8fafc',
        },
        horzLine: {
          color: palette.crosshair,
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: isDark ? '#1e293b' : '#f8fafc',
        },
      },
      rightPriceScale: {
        borderColor: palette.grid,
        scaleMargins: {
          top: 0.18,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderColor: palette.grid,
        rightOffset: 6,
        barSpacing: 10,
        fixLeftEdge: true,
        fixRightEdge: true,
        tickMarkFormatter: (time: Time) => {
          const key = toTimeKey(time);
          if (key == null) return '';
          const point = chartPointMap.get(key);
          return point ? formatPrice(point.price) : '';
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartInstanceRef.current = chart;

    const series = chart.addBaselineSeries({
      baseValue: {
        type: 'price',
        price: 0,
      },
      lineWidth: 3,
      topLineColor: palette.upLine,
      topFillColor1: palette.upFillTop,
      topFillColor2: palette.upFillBottom,
      bottomLineColor: palette.downLine,
      bottomFillColor1: palette.downFillTop,
      bottomFillColor2: palette.downFillBottom,
      crosshairMarkerRadius: 6,
      crosshairMarkerBorderColor: isDark ? '#0f172a' : '#ffffff',
      crosshairMarkerBackgroundColor: '#3b82f6',
      priceFormat: {
        type: 'price',
        precision: 0,
        minMove: 1,
      },
      lastValueVisible: false,
    });
    seriesRef.current = series;

    series.setData(chartPoints.map((point) => ({
      time: point.time,
      value: point.pnl,
    })));
    series.setMarkers(highlightMarkers);
    series.createPriceLine({
      price: 0,
      color: palette.zero,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'BE',
    });

    chart.timeScale().fitContent();

    const handleCrosshairMove = (param: { time?: Time }) => {
      const key = toTimeKey(param.time);
      if (key == null) {
        setHoveredPoint(stats.spotPoint);
        return;
      }
      const point = chartPointMap.get(key);
      if (point) {
        setHoveredPoint(point);
      }
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
      chart.timeScale().fitContent();
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      seriesRef.current = null;
      chart.remove();
      chartInstanceRef.current = null;
    };
  }, [calculator, chartEngine, chartPointMap, chartPoints, currencyConfig, highlightMarkers, selectedOffset, stats, theme]);

  useEffect(() => {
    if (chartEngine !== 'plotly') {
      setPlotlyError(null);
      setIsPlotlyLoading(false);
      return;
    }

    if (!chartRef.current || !calculator || curvePoints.length === 0 || !stats) {
      return;
    }

    let cancelled = false;
    const root = chartRef.current as PlotlyHTMLElement;
    const isDark = theme === 'dark';
    const palette = {
      axis: isDark ? '#e5e7eb' : '#111827',
      muted: isDark ? '#94a3b8' : '#6b7280',
      grid: isDark ? '#334155' : '#e5e7eb',
      zero: isDark ? '#64748b' : '#94a3b8',
      line: '#3b82f6',
      lineGlow: '#60a5fa',
      marker: '#f59e0b',
      profit: '#10b981',
      loss: '#f43f5e',
      paper: 'rgba(0,0,0,0)',
      plot: 'rgba(0,0,0,0)',
    };

    const renderPlotly = async () => {
      setPlotlyError(null);
      setIsPlotlyLoading(true);

      try {
        const Plotly = await loadPlotly();
        if (cancelled || !chartRef.current) return;

        const background = isDark ? 'rgba(15,23,42,0.82)' : 'rgba(255,255,255,0.92)';
        const border = isDark ? 'rgba(148,163,184,0.28)' : 'rgba(15,23,42,0.08)';
        const profitValues = buildSegmentValues(curvePoints, (point) => point.pnl >= 0);
        const lossValues = buildSegmentValues(curvePoints, (point) => point.pnl <= 0);
        const priceValues = curvePoints.map((point) => point.price);
        const pnlValues = curvePoints.map((point) => point.pnl);

        const annotations = [
          {
            x: stats.currentSpot,
            y: stats.spotPnl,
            text: 'Spot',
            showarrow: true,
            arrowhead: 3,
            ax: 0,
            ay: stats.spotPnl >= 0 ? -36 : 36,
            arrowcolor: palette.line,
            font: { color: palette.axis, size: 11 },
            bgcolor: background,
            bordercolor: palette.line,
            borderpad: 5,
          },
          ...stats.breakevens.map((value, index) => ({
            x: value,
            y: 0,
            text: index === 0 ? 'BE' : `BE${index + 1}`,
            showarrow: true,
            arrowhead: 2,
            ax: 0,
            ay: -28,
            arrowcolor: palette.marker,
            font: { color: palette.axis, size: 10 },
            bgcolor: background,
            bordercolor: palette.marker,
            borderpad: 4,
          })),
        ];

        await Plotly.newPlot(
          chartRef.current,
          [
            {
              type: 'scatter',
              mode: 'lines',
              x: priceValues,
              y: profitValues,
              line: {
                color: palette.profit,
                width: 0,
              },
              fill: 'tozeroy',
              fillcolor: isDark ? 'rgba(16, 185, 129, 0.28)' : 'rgba(16, 185, 129, 0.18)',
              hoverinfo: 'skip',
              showlegend: false,
            },
            {
              type: 'scatter',
              mode: 'lines',
              x: priceValues,
              y: lossValues,
              line: {
                color: palette.loss,
                width: 0,
              },
              fill: 'tozeroy',
              fillcolor: isDark ? 'rgba(244, 63, 94, 0.22)' : 'rgba(244, 63, 94, 0.14)',
              hoverinfo: 'skip',
              showlegend: false,
            },
            {
              type: 'scatter',
              mode: 'lines',
              x: priceValues,
              y: pnlValues,
              customdata: curvePoints.map((point) => [
                (point.shock * 100).toFixed(1),
                formatCurrency(point.pnl, currencyConfig),
              ]),
              line: {
                color: palette.line,
                width: 3.5,
                shape: 'linear',
              },
              hovertemplate: [
                '<b>标的价格</b> %{x:.3f}',
                '<b>价格变动</b> %{customdata[0]}%',
                '<b>PnL</b> %{customdata[1]}',
                '<extra></extra>',
              ].join('<br>'),
              name: 'Payoff',
            },
            {
              type: 'scatter',
              mode: 'markers+text',
              x: [stats.currentSpot, stats.maxPoint.price, stats.minPoint.price, ...stats.breakevens],
              y: [stats.spotPnl, stats.maxPnl, stats.minPnl, ...stats.breakevens.map(() => 0)],
              text: ['Spot', 'Max', 'Min', ...stats.breakevens.map((_, index) => (index === 0 ? 'BE' : `BE${index + 1}`))],
              textposition: ['top center', 'top center', 'bottom center', ...stats.breakevens.map(() => 'top center')],
              textfont: {
                color: palette.axis,
                size: 10,
              },
              marker: {
                size: [10, 10, 10, ...stats.breakevens.map(() => 8)],
                color: [palette.line, palette.profit, palette.loss, ...stats.breakevens.map(() => palette.marker)],
                line: {
                  color: isDark ? '#0f172a' : '#ffffff',
                  width: 1.5,
                },
              },
              hoverinfo: 'skip',
              showlegend: false,
            },
          ],
          {
            paper_bgcolor: palette.paper,
            plot_bgcolor: palette.plot,
            margin: { l: 64, r: 28, t: 24, b: 48 },
            hovermode: 'closest',
            dragmode: 'pan',
            showlegend: false,
            font: {
              color: palette.axis,
              family: 'Inter, ui-sans-serif, system-ui, sans-serif',
            },
            hoverlabel: {
              bgcolor: background,
              bordercolor: border,
              font: {
                color: palette.axis,
                size: 12,
              },
            },
            xaxis: {
              title: { text: '标的价格' },
              color: palette.axis,
              gridcolor: palette.grid,
              zeroline: false,
              tickformat: '.3f',
              showline: true,
              linecolor: palette.grid,
              showspikes: true,
              spikemode: 'toaxis',
              spikesnap: 'cursor',
              spikedash: 'dot',
              spikecolor: isDark ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.35)',
              spikethickness: 1,
            },
            yaxis: {
              title: { text: 'PnL' },
              color: palette.axis,
              gridcolor: palette.grid,
              zeroline: true,
              zerolinecolor: palette.zero,
              showline: true,
              linecolor: palette.grid,
              showspikes: false,
            },
            shapes: [
              {
                type: 'line',
                x0: curvePoints[0]?.price,
                x1: curvePoints[curvePoints.length - 1]?.price,
                y0: 0,
                y1: 0,
                line: {
                  color: palette.zero,
                  width: 1,
                  dash: 'dash',
                },
              },
              {
                type: 'line',
                x0: stats.currentSpot,
                x1: stats.currentSpot,
                y0: stats.minPnl,
                y1: stats.maxPnl,
                line: {
                  color: palette.line,
                  width: 1,
                  dash: 'dot',
                },
              },
            ],
            annotations,
          },
          {
            displayModeBar: true,
            responsive: true,
            scrollZoom: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d', 'toggleSpikelines'],
          },
        );

        if (cancelled || !chartRef.current) return;

        root.on?.('plotly_hover', (event) => {
          const pointIndex = event.points?.[0]?.pointIndex;
          if (typeof pointIndex !== 'number') return;
          setHoveredPoint(chartPoints[pointIndex] ?? stats.spotPoint);
        });
        root.on?.('plotly_unhover', () => {
          setHoveredPoint(stats.spotPoint);
        });

        const resizeObserver = new ResizeObserver(() => {
          Plotly.Plots?.resize(chartRef.current as HTMLElement);
        });
        resizeObserver.observe(chartRef.current);

        if (!cancelled) {
          setIsPlotlyLoading(false);
        }

        return () => {
          resizeObserver.disconnect();
        };
      } catch (error) {
        if (!cancelled) {
          setIsPlotlyLoading(false);
          setPlotlyError(error instanceof Error ? error.message : '加载 Plotly 图表失败。');
        }
      }
      return undefined;
    };

    let disposePlotlyResize: (() => void) | undefined;
    void renderPlotly().then((cleanup) => {
      disposePlotlyResize = cleanup;
    });

    return () => {
      cancelled = true;
      disposePlotlyResize?.();
      root.removeAllListeners?.('plotly_hover');
      root.removeAllListeners?.('plotly_unhover');
      if (window.Plotly && chartRef.current) {
        window.Plotly.purge(chartRef.current);
      }
    };
  }, [calculator, chartEngine, chartPoints, curvePoints, currencyConfig, stats, theme]);

  useEffect(() => {
    if (chartEngine !== 'echarts') {
      return;
    }

    if (!chartRef.current || !calculator || curvePoints.length === 0 || !stats) {
      return;
    }

    const chart = echartsInstanceRef.current ?? echarts.init(chartRef.current);
    echartsInstanceRef.current = chart;
    const isDark = theme === 'dark';
    const palette = {
      axis: isDark ? '#e5e7eb' : '#111827',
      muted: isDark ? '#94a3b8' : '#6b7280',
      grid: isDark ? '#334155' : '#e5e7eb',
      zero: isDark ? '#64748b' : '#94a3b8',
      line: '#3b82f6',
      profit: '#10b981',
      loss: '#f43f5e',
      marker: '#f59e0b',
      panel: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.96)',
    };

    const option: echarts.EChartsOption = {
      animation: false,
      backgroundColor: 'transparent',
      grid: {
        left: 64,
        right: 24,
        top: 22,
        bottom: 46,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: palette.zero,
            type: 'dashed',
          },
        },
        backgroundColor: palette.panel,
        borderColor: palette.grid,
        textStyle: {
          color: palette.axis,
        },
        formatter: (params) => {
          const first = Array.isArray(params) ? params.find((item) => item.seriesName === 'Payoff') : params;
          const index = typeof first?.dataIndex === 'number' ? first.dataIndex : -1;
          const point = index >= 0 ? curvePoints[index] : null;
          if (!point) return '';
          return [
            `<div style="font-weight:600;margin-bottom:6px;">标的价格 ${formatPrice(point.price)}</div>`,
            `<div>价格变动 ${(point.shock * 100).toFixed(1)}%</div>`,
            `<div>PnL ${formatCurrency(point.pnl, currencyConfig)}</div>`,
          ].join('');
        },
      },
      xAxis: {
        type: 'value',
        name: '标的价格',
        nameLocation: 'middle',
        nameGap: 28,
        axisLine: {
          lineStyle: { color: palette.grid },
        },
        axisLabel: {
          color: palette.muted,
          formatter: (value: number) => formatPrice(value),
        },
        splitLine: {
          lineStyle: { color: palette.grid, type: 'dashed' },
        },
      },
      yAxis: {
        type: 'value',
        name: 'PnL',
        nameGap: 18,
        axisLine: {
          lineStyle: { color: palette.grid },
        },
        axisLabel: {
          color: palette.muted,
          formatter: (value: number) => formatCurrency(value, currencyConfig),
        },
        splitLine: {
          lineStyle: { color: palette.grid, type: 'dashed' },
        },
      },
      series: [
        {
          name: 'Profit Area',
          type: 'line',
          data: curvePoints.map((point) => [point.price, point.pnl >= 0 ? point.pnl : null]),
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: {
            color: 'rgba(16, 185, 129, 0.22)',
          },
          tooltip: { show: false },
        },
        {
          name: 'Loss Area',
          type: 'line',
          data: curvePoints.map((point) => [point.price, point.pnl <= 0 ? point.pnl : null]),
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: {
            color: 'rgba(244, 63, 94, 0.18)',
          },
          tooltip: { show: false },
        },
        {
          name: 'Payoff',
          type: 'line',
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: palette.line,
            width: 3,
          },
          data: curvePoints.map((point) => [point.price, point.pnl]),
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            lineStyle: {
              color: palette.zero,
              type: 'dashed',
            },
            data: [
              { yAxis: 0 },
              { xAxis: stats.currentSpot, lineStyle: { color: palette.line, type: 'dotted' } },
            ],
          },
          markPoint: {
            symbolSize: 42,
            label: {
              color: '#fff',
              fontSize: 10,
              formatter: ({ data }: { data?: { label?: string } }) => data?.label ?? '',
            },
            data: [
              { coord: [stats.currentSpot, stats.spotPnl], value: stats.spotPnl, itemStyle: { color: palette.line }, label: 'Spot' },
              { coord: [stats.maxPoint.price, stats.maxPnl], value: stats.maxPnl, itemStyle: { color: palette.profit }, label: 'Max' },
              { coord: [stats.minPoint.price, stats.minPnl], value: stats.minPnl, itemStyle: { color: palette.loss }, label: 'Min' },
              ...stats.breakevens.map((value, index) => ({
                coord: [value, 0],
                value: 0,
                itemStyle: { color: palette.marker },
                label: index === 0 ? 'BE' : `BE${index + 1}`,
              })),
            ],
          },
        },
      ] as echarts.SeriesOption[],
    };

    chart.setOption(option, true);

    const handleMouseMove = (params: { dataIndex?: number; seriesName?: string }) => {
      if (params.seriesName !== 'Payoff') return;
      const index = typeof params.dataIndex === 'number' ? params.dataIndex : -1;
      if (index < 0) return;
      setHoveredPoint(chartPoints[index] ?? stats.spotPoint);
    };
    const handleGlobalOut = () => setHoveredPoint(stats.spotPoint);
    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });

    resizeObserver.observe(chartRef.current);
    chart.on('mousemove', handleMouseMove);
    chart.on('globalout', handleGlobalOut);

    return () => {
      resizeObserver.disconnect();
      chart.off('mousemove', handleMouseMove);
      chart.off('globalout', handleGlobalOut);
      chart.dispose();
      echartsInstanceRef.current = null;
    };
  }, [calculator, chartEngine, chartPoints, curvePoints, currencyConfig, stats, theme]);

  if (!calculator) {
    return (
      <div className={`rounded-lg border ${themes[theme].border} p-4`}>
        <div className={`text-sm ${themes[theme].text} opacity-70`}>暂无 payoff_calculator 图表数据。</div>
      </div>
    );
  }

  if (curvePoints.length === 0 || !stats) {
    return (
      <div className={`rounded-lg border ${themes[theme].border} p-4`}>
        <div className={`text-sm ${themes[theme].text} opacity-70`}>payoff_calculator 数据不完整，暂时无法绘图。</div>
      </div>
    );
  }

  const activePoint = hoveredPoint ?? stats.spotPoint;

  return (
    <div className={`rounded-xl border ${themes[theme].border} p-4 sm:p-5 space-y-4 bg-gradient-to-b from-white/60 to-transparent dark:from-gray-900/40`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.18em] ${themes[theme].text} opacity-50`}>
            Expiry Risk Payoff
          </div>
          <div className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${themes[theme].text}`}>
            <div className="text-lg font-semibold">
              {calculator.underlying?.code || '标的组合'}
            </div>
            <div className={`rounded-full px-2.5 py-0.5 text-[11px] border ${themes[theme].border} bg-black/5 dark:bg-white/5`}>
              {chartEngine === 'plotly' ? 'Plotly' : chartEngine === 'echarts' ? 'ECharts' : 'TradingView'}
            </div>
            <div className="text-sm opacity-70">
              Spot {formatPrice(stats.currentSpot)}
            </div>
            {calculator.expiry_date ? (
              <div className="text-sm opacity-70">
                Expiry {calculator.expiry_date}
              </div>
            ) : null}
          </div>
        </div>

        <div className={`grid grid-cols-3 gap-2 rounded-xl border ${themes[theme].border} p-3 min-w-0 w-full lg:w-auto bg-black/5 dark:bg-white/5`}>
          <div>
            <div className={`text-[11px] uppercase tracking-wide ${themes[theme].text} opacity-55`}>Price</div>
            <div className={`mt-1 text-sm font-semibold ${themes[theme].text}`}>
              {formatPrice(activePoint.price)}
            </div>
          </div>
          <div>
            <div className={`text-[11px] uppercase tracking-wide ${themes[theme].text} opacity-55`}>PnL</div>
            <div className={`mt-1 text-sm font-semibold ${
              activePoint.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {formatCurrency(activePoint.pnl, currencyConfig)}
            </div>
          </div>
          <div>
            <div className={`text-[11px] uppercase tracking-wide ${themes[theme].text} opacity-55`}>Shock</div>
            <div className={`mt-1 text-sm font-semibold ${themes[theme].text}`}>
              {(activePoint.shock * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <div
        ref={chartRef}
        className="h-[380px] w-full rounded-xl"
      />

      {chartEngine === 'plotly' && isPlotlyLoading ? (
        <div className={`text-xs ${themes[theme].text} opacity-70`}>
          正在加载 Plotly 图表资源...
        </div>
      ) : null}

      {chartEngine === 'plotly' && plotlyError ? (
        <div className="text-sm text-rose-600 dark:text-rose-400">
          {plotlyError}
        </div>
      ) : null}

      <div className={`flex flex-wrap items-center gap-2 text-xs ${themes[theme].text} opacity-75`}>
        <span className={`rounded-full border ${themes[theme].border} px-3 py-1 bg-black/5 dark:bg-white/5`}>
          横轴价格: {formatPrice(activePoint.price)}
        </span>
        <span className={`rounded-full border ${themes[theme].border} px-3 py-1 bg-black/5 dark:bg-white/5`}>
          价格变动: {(activePoint.shock * 100).toFixed(1)}%
        </span>
      </div>

      {calendarDaysToExpiry > 0 ? (
        <div className="space-y-2">
          {quickOffsets.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {quickOffsets.map((offset) => (
                <button
                  key={offset}
                  type="button"
                  onClick={() => setSelectedOffset(offset)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    selectedOffset === offset
                      ? 'bg-blue-600 text-white'
                      : `${themes[theme].secondary}`
                  }`}
                >
                  +{offset}d
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-center">
            <input
              type="range"
              min={0}
              max={Math.max(calendarDaysToExpiry, 0)}
              step={1}
              value={selectedOffset}
              onChange={(event) => setSelectedOffset(Number(event.target.value))}
              className="w-full accent-blue-600"
            />
            <div className={`text-right text-xs ${themes[theme].text} opacity-70`}>
              评估日 +{selectedOffset}d / 到期 {calendarDaysToExpiry}d
            </div>
          </div>
          {quickOffsets.length > 0 ? (
            <div className={`text-xs ${themes[theme].text} opacity-60`}>
              快捷评估点: {quickOffsets.map((value) => `+${value}d`).join(', ')}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className={`rounded-xl border ${themes[theme].border} p-3 bg-black/5 dark:bg-white/5`}>
          <div className={`text-xs ${themes[theme].text} opacity-70`}>Spot PnL</div>
          <div className={`mt-1 text-sm font-semibold ${themes[theme].text}`}>
            {formatCurrency(stats.spotPnl, currencyConfig)}
          </div>
        </div>
        <div className={`rounded-xl border ${themes[theme].border} p-3 bg-black/5 dark:bg-white/5`}>
          <div className={`text-xs ${themes[theme].text} opacity-70`}>Max PnL</div>
          <div className={`mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400`}>
            {formatCurrency(stats.maxPnl, currencyConfig)}
          </div>
        </div>
        <div className={`rounded-xl border ${themes[theme].border} p-3 bg-black/5 dark:bg-white/5`}>
          <div className={`text-xs ${themes[theme].text} opacity-70`}>Min PnL</div>
          <div className="mt-1 text-sm font-semibold text-rose-600 dark:text-rose-400">
            {formatCurrency(stats.minPnl, currencyConfig)}
          </div>
        </div>
        <div className={`rounded-xl border ${themes[theme].border} p-3 bg-black/5 dark:bg-white/5`}>
          <div className={`text-xs ${themes[theme].text} opacity-70`}>Breakeven</div>
          <div className={`mt-1 text-sm font-semibold ${themes[theme].text}`}>
            {stats.breakevens.length > 0 ? stats.breakevens.map((value) => formatPrice(value)).join(', ') : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}
