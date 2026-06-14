import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { format } from 'date-fns';
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
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsData, VerticalSpreadMonthlyPriceItem } from '../../../lib/services/types';
import type { OptionsChartEngine, PlotlyHTMLElement } from '../utils/chartEngine';
import { loadPlotly } from '../utils/chartEngine';

interface VerticalSpreadMonthlyPricesChartProps {
  theme: Theme;
  optionsData: OptionsData;
  selectedSymbol: string;
  chartEngine?: OptionsChartEngine;
  onChartEngineChange?: (engine: OptionsChartEngine) => void;
}

type SpreadType = 'call' | 'put';

type NormalizedPoint = {
  label: string;
  sortKey: number | null;
  price: number | null;
};

const toFiniteNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

const extractExpiryLabel = (raw: unknown): { label: string; sortKey: number | null } => {
  const text = typeof raw === 'string' ? raw : raw != null ? String(raw) : '';
  if (!text) return { label: '-', sortKey: null };
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    return { label: format(d, 'yyyy-MM'), sortKey: d.getTime() };
  }
  return { label: text, sortKey: null };
};

const pickPointPrice = (point: Record<string, unknown>): number | null => {
  const candidates = [
    point.price,
    point.value,
    point.mid,
    point.spread_price,
    point.last_price,
    point.close,
    point.mark,
    point.settle
  ];
  for (const c of candidates) {
    const n = toFiniteNumber(c);
    if (n != null) return n;
  }
  return null;
};

const normalizePricesByExpiry = (item: VerticalSpreadMonthlyPriceItem): NormalizedPoint[] => {
  const points: NormalizedPoint[] = [];
  (item.prices_by_expiry || []).forEach((p, idx) => {
    if (typeof p === 'number') {
      points.push({ label: `M${idx + 1}`, sortKey: idx, price: p });
      return;
    }
    if (p && typeof p === 'object') {
      const obj = p as Record<string, unknown>;
      const expiryRaw = obj.expiry ?? obj.expiry_date ?? obj.month ?? obj.date ?? obj.exp;
      const { label, sortKey } = extractExpiryLabel(expiryRaw);
      points.push({ label, sortKey, price: pickPointPrice(obj) });
      return;
    }
    points.push({ label: `M${idx + 1}`, sortKey: idx, price: null });
  });

  const haveSortable = points.some(p => p.sortKey != null && !Number.isNaN(p.sortKey));
  if (haveSortable) {
    return [...points].sort((a, b) => {
      const ak = a.sortKey ?? Number.POSITIVE_INFINITY;
      const bk = b.sortKey ?? Number.POSITIVE_INFINITY;
      return ak - bk;
    });
  }
  return points;
};

const formatSpreadLabel = (item: VerticalSpreadMonthlyPriceItem) => {
  const t = String(item.option_type || '').toUpperCase();
  const w = toFiniteNumber(item.spread_width);
  const widthText = w != null ? ` · W=${w}` : '';
  return `${t} ${item.lower_strike}-${item.upper_strike}${widthText}`;
};

type SpreadSeries = {
  name: string;
  isNearAtm: boolean;
  data: Array<number | null>;
};

const SYNTHETIC_START_TS = Math.floor(Date.UTC(2024, 0, 1) / 1000) as UTCTimestamp;
const SYNTHETIC_STEP_SECONDS = 24 * 60 * 60;
const SPOT_SELECTION_PCT = 0.25;
const SERIES_COLORS = ['#5b8ff9', '#8bd16f', '#f6bd16', '#f4664a', '#e8684a', '#6dc8ec', '#4ca26c', '#9270ca'];
const MIN_BAR_SPACING = 8;
const MAX_BAR_SPACING = 260;

const toSyntheticTime = (index: number) => (SYNTHETIC_START_TS + index * SYNTHETIC_STEP_SECONDS) as UTCTimestamp;
const toTimeKey = (time?: Time) => {
  if (typeof time === 'number') return time;
  if (!time || typeof time !== 'object' || !('year' in time)) return null;
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
};
const getAdaptiveBarSpacing = (width: number, points: number) => {
  if (!Number.isFinite(width) || width <= 0) return MIN_BAR_SPACING;
  if (!Number.isFinite(points) || points <= 1) {
    return Math.min(MAX_BAR_SPACING, Math.max(MIN_BAR_SPACING, Math.floor(width / 2)));
  }
  return Math.min(MAX_BAR_SPACING, Math.max(MIN_BAR_SPACING, Math.floor(width / points)));
};
const getSpreadMidpoint = (item: VerticalSpreadMonthlyPriceItem) => (item.lower_strike + item.upper_strike) / 2;
const hasFinitePriceForLabel = (points: NormalizedPoint[], label: string) =>
  points.some((point) => point.label === label && typeof point.price === 'number');
const spreadOverlapsRange = (item: VerticalSpreadMonthlyPriceItem, minStrike: number, maxStrike: number) =>
  item.upper_strike >= minStrike && item.lower_strike <= maxStrike;
const disposeEChartsInstance = (instance: echarts.ECharts | null) => {
  if (!instance) return;
  try {
    instance.dispose();
  } catch {
    // Ignore duplicate dispose during rapid engine switches / unmounts.
  }
};
const removeTradingViewChart = (instance: IChartApi | null) => {
  if (!instance) return;
  try {
    instance.remove();
  } catch {
    // Ignore duplicate remove during React cleanup.
  }
};

export function VerticalSpreadMonthlyPricesChart({
  theme,
  optionsData,
  selectedSymbol,
  chartEngine = 'tradingview',
  onChartEngineChange,
}: VerticalSpreadMonthlyPricesChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<echarts.ECharts | null>(null);
  const tradingViewRef = useRef<IChartApi | null>(null);
  const tradingSeriesRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const { currencyConfig } = useCurrency();
  const [hoveredIndex, setHoveredIndex] = useState(0);
  const [hoveredSeriesIndex, setHoveredSeriesIndex] = useState<number>(0);
  const [plotlyError, setPlotlyError] = useState<string | null>(null);
  const [isPlotlyLoading, setIsPlotlyLoading] = useState(false);

  const spreads = useMemo(
    () => (optionsData.vertical_spread_monthly_prices || []).filter(s => s && Array.isArray(s.prices_by_expiry)),
    [optionsData]
  );

  const initialType: SpreadType = useMemo(() => {
    const hasCall = spreads.some(s => String(s.option_type).toLowerCase() === 'call');
    const hasPut = spreads.some(s => String(s.option_type).toLowerCase() === 'put');
    if (hasCall) return 'call';
    if (hasPut) return 'put';
    return 'call';
  }, [spreads]);

  const [spreadType, setSpreadType] = useState<SpreadType>(initialType);
  const prepared = useMemo(() => {
    const typed = spreads
      .filter((spread) => String(spread.option_type).toLowerCase() === spreadType)
      .map((spread) => ({
        spread,
        label: formatSpreadLabel(spread),
        midpoint: getSpreadMidpoint(spread),
        normalized: normalizePricesByExpiry(spread),
      }))
      .sort((a, b) => a.midpoint - b.midpoint);

    let referenceSpot = typed[0]?.midpoint ?? 0;
    let maxTimeValue = Number.NEGATIVE_INFINITY;
    optionsData.quotes.forEach((quote) => {
      const combinedTimeValue = (quote.callTimeValue || 0) + (quote.putTimeValue || 0);
      if (combinedTimeValue > maxTimeValue) {
        maxTimeValue = combinedTimeValue;
        referenceSpot = quote.strike;
      }
    });

    const collectXAxisLabels = (
      entries: typeof typed,
    ) => {
      const labelMeta = new Map<string, { sortKey: number | null; firstIndex: number }>();
      entries.forEach(({ normalized }) => {
        normalized.forEach((point, index) => {
          const existing = labelMeta.get(point.label);
          if (!existing) {
            labelMeta.set(point.label, { sortKey: point.sortKey, firstIndex: index });
            return;
          }
          if (existing.sortKey == null && point.sortKey != null) {
            labelMeta.set(point.label, { sortKey: point.sortKey, firstIndex: existing.firstIndex });
            return;
          }
          if (existing.sortKey != null && point.sortKey != null && point.sortKey < existing.sortKey) {
            labelMeta.set(point.label, { sortKey: point.sortKey, firstIndex: existing.firstIndex });
          }
        });
      });

      const labelEntries = Array.from(labelMeta.entries()).map(([label, meta]) => ({ label, ...meta }));
      const hasSortable = labelEntries.some((entry) => entry.sortKey != null && Number.isFinite(entry.sortKey));
      return hasSortable
        ? labelEntries
            .sort((a, b) => (a.sortKey ?? Number.POSITIVE_INFINITY) - (b.sortKey ?? Number.POSITIVE_INFINITY))
            .map((entry) => entry.label)
        : labelEntries.sort((a, b) => a.firstIndex - b.firstIndex).map((entry) => entry.label);
    };

    const minStrike = referenceSpot * (1 - SPOT_SELECTION_PCT);
    const maxStrike = referenceSpot * (1 + SPOT_SELECTION_PCT);
    const strikePool = typed.filter(({ spread }) => spreadOverlapsRange(spread, minStrike, maxStrike));
    const strikePoolFallback = strikePool.length > 0 ? strikePool : typed;

    const baselineLabels = collectXAxisLabels(strikePoolFallback);
    const baselineStats = baselineLabels.map((label) => ({
      label,
      count: strikePoolFallback.reduce((acc, entry) => (hasFinitePriceForLabel(entry.normalized, label) ? acc + 1 : acc), 0),
    }));
    const desiredBaselineCount = Math.min(
      strikePoolFallback.length,
      Math.max(3, Math.floor(strikePoolFallback.length * 0.25)),
    );
    const baselineByThreshold = baselineStats.find((s) => s.count >= desiredBaselineCount)?.label ?? null;
    const baselineByMax = baselineStats.reduce<{ label: string | null; count: number }>(
      (best, current) => (current.count > best.count ? { label: current.label, count: current.count } : best),
      { label: null, count: -1 },
    ).label;
    const baselineLabel = baselineByThreshold ?? baselineByMax;

    const baselinePool = baselineLabel
      ? strikePoolFallback.filter((entry) => hasFinitePriceForLabel(entry.normalized, baselineLabel))
      : strikePoolFallback;

    const allDisplayLabels = collectXAxisLabels(strikePoolFallback);
    const xLabels = allDisplayLabels;
    const lineSpreads = strikePoolFallback;

    const series: SpreadSeries[] = lineSpreads.map(({ spread, normalized, label, midpoint }) => {
      const map = new Map(normalized.map((point) => [point.label, point.price]));
      return {
        name: label,
        isNearAtm: Math.abs(midpoint - referenceSpot) <= (spread.spread_width || 0),
        data: xLabels.map((xLabel) => map.get(xLabel) ?? null),
      };
    });

    return {
      referenceSpot,
      minStrike,
      maxStrike,
      xLabels,
      typed,
      lineSpreads,
      series,
      baselineLabel,
      desiredBaselineCount,
      strikePoolCount: strikePoolFallback.length,
      baselinePoolCount: baselinePool.length,
    };
  }, [spreads, spreadType]);

  useEffect(() => {
    setSpreadType(initialType);
  }, [initialType]);

  useEffect(() => {
    setHoveredIndex((current) => Math.min(current, Math.max(prepared.xLabels.length - 1, 0)));
  }, [prepared.xLabels.length]);

  const hoverState = useMemo(() => {
    const label = prepared.xLabels[hoveredIndex];
    if (!label) return null;
    const series = prepared.series[hoveredSeriesIndex];
    if (!series) return null;
    const value = series.data[hoveredIndex] ?? null;
    return { label, line: { name: series.name, value } };
  }, [hoveredIndex, hoveredSeriesIndex, prepared.series, prepared.xLabels]);

  useEffect(() => {
    setHoveredSeriesIndex((current) => {
      if (!prepared.series.length) return 0;
      return current >= 0 && current < prepared.series.length ? current : 0;
    });
  }, [prepared.series.length]);

  useEffect(() => {
    return () => {
      disposeEChartsInstance(echartsRef.current);
      echartsRef.current = null;
      removeTradingViewChart(tradingViewRef.current);
      tradingViewRef.current = null;
      tradingSeriesRefs.current = [];
    };
  }, []);

  useEffect(() => {
    if (chartEngine !== 'echarts') {
      disposeEChartsInstance(echartsRef.current);
      echartsRef.current = null;
      return;
    }

    if (!chartRef.current || !prepared.series.length) {
      return;
    }

    const chart = echartsRef.current ?? echarts.init(chartRef.current);
    echartsRef.current = chart;
    const isDark = theme === 'dark';

    const series: echarts.SeriesOption[] = prepared.series.map((item, index) => ({
        name: item.name,
        type: 'line' as const,
        data: item.data,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: item.isNearAtm ? 2.5 : 1.5,
          opacity: item.isNearAtm ? 1 : 0.8,
          color: SERIES_COLORS[index % SERIES_COLORS.length],
        },
        itemStyle: {
          color: SERIES_COLORS[index % SERIES_COLORS.length],
        },
        emphasis: {
          focus: 'series',
        },
      }));

    const option: echarts.EChartsOption = {
      animation: false,
      title: {
        text: `${selectedSymbol} 垂直价差跨月价格对比`,
        subtext: `${String(spreadType).toUpperCase()}`,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16,
        },
        subtextStyle: {
          color: isDark ? '#cbd5e1' : '#334155',
          fontSize: 11,
        },
      },
      legend: {
        type: 'scroll',
        top: 40,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11,
        },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#374151' : '#ffffff',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
        },
        formatter: (params: unknown) => {
          const arr = (Array.isArray(params) ? params : [params]) as Array<{
            dataIndex?: number;
            data?: unknown;
            seriesName?: string;
          }>;
          const first = arr[0];
          const idx = first?.dataIndex ?? 0;
          const label = prepared.xLabels[idx] || '';
          const lines = arr
            .filter((item) => item.data != null)
            .sort((a, b) => {
              const av = typeof a.data === 'number' ? a.data : Number(a.data || 0);
              const bv = typeof b.data === 'number' ? b.data : Number(b.data || 0);
              return bv - av;
            })
            .map((item) => {
              const value = typeof item.data === 'number' ? item.data : Number(item.data || 0);
              return `<div>${item.seriesName}: ${formatCurrency(value, currencyConfig)}</div>`;
            })
            .join('');
          return `
            <div>
              <div style="font-weight:bold;margin-bottom:4px;">${label}</div>
              <div>展示范围: 覆盖标的 ${prepared.referenceSpot.toFixed(3)} 上下 ${(SPOT_SELECTION_PCT * 100).toFixed(0)}% 价格带的 ${prepared.series.length} 组价差</div>
              <div>基准月份: ${prepared.baselineLabel || '-'}（覆盖价格带候选 ${prepared.strikePoolCount} 组，基准月有报价 ${prepared.baselinePoolCount} 组；当前已展示全部候选曲线）</div>
              ${lines || '<div>-</div>'}
            </div>
          `;
        },
      },
      grid: {
        left: '10%',
        right: '8%',
        top: '28%',
        bottom: '14%',
      },
      xAxis: {
        type: 'category',
        data: prepared.xLabels,
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db',
          },
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value, currencyConfig),
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db',
          },
        },
        splitLine: {
          lineStyle: {
            color: isDark ? '#374151' : '#f3f4f6',
          },
        },
      },
      series,
    };

    chart.setOption(option, true);
    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(chartRef.current);
    return () => {
      resizeObserver.disconnect();
      disposeEChartsInstance(chart);
      echartsRef.current = null;
    };
  }, [chartEngine, currencyConfig, prepared, selectedSymbol, spreadType, theme]);

  useEffect(() => {
    if (chartEngine !== 'tradingview') {
      removeTradingViewChart(tradingViewRef.current);
      tradingViewRef.current = null;
      tradingSeriesRefs.current = [];
      return;
    }

    if (!chartRef.current || prepared.xLabels.length === 0 || prepared.series.length === 0) {
      return;
    }

    const isDark = theme === 'dark';
    const isCompact = chartRef.current.clientWidth < 640;
    const palette = {
      axis: isDark ? '#e5e7eb' : '#111827',
      muted: isDark ? '#94a3b8' : '#6b7280',
      grid: isDark ? '#334155' : '#e5e7eb',
      positive: '#10b981',
      negative: '#f43f5e',
      baseline: isDark ? '#64748b' : '#94a3b8',
    };

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: palette.axis,
      },
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      grid: {
        vertLines: { color: palette.grid, style: LineStyle.Dotted },
        horzLines: { color: palette.grid, style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: palette.grid,
        scaleMargins: {
          top: isCompact ? 0.14 : 0.18,
          bottom: isCompact ? 0.1 : 0.14,
        },
      },
      timeScale: {
        borderColor: palette.grid,
        rightOffset: 0,
        barSpacing: getAdaptiveBarSpacing(chartRef.current.clientWidth, prepared.xLabels.length),
        fixLeftEdge: true,
        fixRightEdge: true,
        tickMarkFormatter: (time: Time) => {
          const key = toTimeKey(time);
          if (key == null) return '';
          const index = Math.round((key - Number(SYNTHETIC_START_TS)) / SYNTHETIC_STEP_SECONDS);
          return prepared.xLabels[index] ?? '';
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: palette.muted,
          style: LineStyle.Dashed,
          labelVisible: false,
        },
        horzLine: {
          color: palette.muted,
          style: LineStyle.Dashed,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });
    tradingViewRef.current = chart;
    tradingSeriesRefs.current = [];
    prepared.series.forEach((item, index) => {
      const series = chart.addLineSeries({
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        lineWidth: item.isNearAtm ? 3 : 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      series.setData(item.data.map((value, pointIndex) => (
        typeof value === 'number'
          ? { time: toSyntheticTime(pointIndex), value }
          : { time: toSyntheticTime(pointIndex) }
      )) as any);
      tradingSeriesRefs.current.push(series);
    });
    chart.timeScale().fitContent();

    let lastStableSeriesIndex: number | null = null;
    let lastStableDistance = Number.POSITIVE_INFINITY;
    let lastStableXIndex = -1;
    const handleCrosshairMove = (param: any) => {
      const key = toTimeKey(param?.time);
      if (key == null) {
        return;
      }
      const rawIndex = Math.floor((key - Number(SYNTHETIC_START_TS)) / SYNTHETIC_STEP_SECONDS);
      const index = Math.max(0, Math.min(prepared.xLabels.length - 1, rawIndex));
      if (index >= 0 && index < prepared.xLabels.length) {
        setHoveredIndex(index);
      }
      const hovered = (param?.hoveredSeries as unknown) ?? null;
      if (hovered) {
        const seriesIndex = tradingSeriesRefs.current.findIndex((s) => s === hovered);
        setHoveredSeriesIndex(seriesIndex >= 0 ? seriesIndex : hoveredSeriesIndex);
        lastStableSeriesIndex = seriesIndex >= 0 ? seriesIndex : null;
        lastStableDistance = 0;
        lastStableXIndex = index;
        return;
      }

      const y = typeof param?.point?.y === 'number' ? param.point.y : null;
      if (y == null) {
        return;
      }

      let bestIndex: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      tradingSeriesRefs.current.forEach((seriesApi, seriesIdx) => {
        const value = prepared.series[seriesIdx]?.data[index];
        if (typeof value !== 'number') return;
        const coord = typeof seriesApi.priceToCoordinate === 'function' ? seriesApi.priceToCoordinate(value) : null;
        if (typeof coord !== 'number') return;
        const distance = Math.abs(coord - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = seriesIdx;
        }
      });
      if (bestIndex == null || bestDistance > 24) {
        return;
      }

      if (lastStableXIndex === index && lastStableSeriesIndex != null && bestIndex !== lastStableSeriesIndex) {
        const improved = lastStableDistance - bestDistance;
        if (improved < 6) {
          setHoveredSeriesIndex(lastStableSeriesIndex);
          return;
        }
      }

      lastStableSeriesIndex = bestIndex;
      lastStableDistance = bestDistance;
      lastStableXIndex = index;
      setHoveredSeriesIndex(bestIndex);
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
        timeScale: {
          rightOffset: 0,
          barSpacing: getAdaptiveBarSpacing(entry.contentRect.width, prepared.xLabels.length),
        },
      });
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      removeTradingViewChart(chart);
      tradingViewRef.current = null;
      tradingSeriesRefs.current = [];
    };
  }, [chartEngine, prepared, theme]);

  useEffect(() => {
    if (chartEngine !== 'plotly') {
      setPlotlyError(null);
      setIsPlotlyLoading(false);
      return;
    }

    if (!chartRef.current || prepared.series.length === 0 || prepared.xLabels.length === 0) {
      return;
    }

    let cancelled = false;
    const root = chartRef.current as PlotlyHTMLElement;
    const isDark = theme === 'dark';

    const renderPlotly = async () => {
      setPlotlyError(null);
      setIsPlotlyLoading(true);

      try {
        const Plotly = await loadPlotly();
        if (cancelled || !chartRef.current) return;

        await Plotly.newPlot(
          chartRef.current,
          prepared.series.map((item, index) => ({
            type: 'scatter',
            mode: 'lines+markers',
            name: item.name,
            x: prepared.xLabels,
            y: item.data,
            line: {
              color: SERIES_COLORS[index % SERIES_COLORS.length],
              width: item.isNearAtm ? 3.5 : 2,
              shape: 'linear',
            },
            marker: {
              size: item.isNearAtm ? 7 : 5,
            },
            hovertemplate: [
              '<b>%{fullData.name}</b>',
              '<b>跨月点位</b> %{x}',
              '<b>价差价格</b> %{y}',
              '<extra></extra>',
            ].join('<br>'),
          })),
          {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 88, r: 28, t: 24, b: 56 },
            hovermode: 'x unified',
            showlegend: true,
            legend: {
              orientation: 'h',
              y: 1.12,
            },
            font: {
              color: isDark ? '#e5e7eb' : '#111827',
              family: 'Inter, ui-sans-serif, system-ui, sans-serif',
            },
            xaxis: {
              title: { text: '跨月点位 / 到期月份' },
              type: 'category',
            },
            yaxis: {
              title: { text: '价差价格' },
              automargin: true,
            },
          },
          {
            responsive: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          },
        );

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

    let disposeResize: (() => void) | undefined;
    void renderPlotly().then((cleanup) => {
      disposeResize = cleanup;
    });

    return () => {
      cancelled = true;
      disposeResize?.();
      root.removeAllListeners?.('plotly_hover');
      root.removeAllListeners?.('plotly_unhover');
      if (window.Plotly && chartRef.current) {
        window.Plotly.purge(chartRef.current);
      }
    };
  }, [chartEngine, prepared, theme]);

  if (!spreads.length) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>垂直价差跨月价格对比 - {selectedSymbol}</h2>
          <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">暂无垂直价差跨月价格数据</div>
        </div>
      </div>
    );
  }

  const engineHint = '三种引擎都展示同一批价差组合的跨月价格趋势，只是交互能力不同';

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>垂直价差跨月价格对比 - {selectedSymbol}</h2>
            <p className={`mt-1 text-sm ${themes[theme].text} opacity-70`}>{engineHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={chartEngine}
              onChange={(e) => onChartEngineChange?.(e.target.value as OptionsChartEngine)}
              className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
            >
              <option value="tradingview">TradingView</option>
              <option value="plotly">Plotly</option>
              <option value="echarts">ECharts</option>
            </select>
            <div className="inline-flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setSpreadType('call')}
                className={`px-3 py-2 text-sm ${
                  spreadType === 'call'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Call
              </button>
              <button
                type="button"
                onClick={() => setSpreadType('put')}
                className={`px-3 py-2 text-sm ${
                  spreadType === 'put'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Put
              </button>
            </div>
          </div>
        </div>
        {!prepared.typed.length ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">当前类型暂无可展示的价差数据</div>
        ) : null}
        {chartEngine === 'tradingview' && hoverState ? (
          <div className={`mb-4 rounded-lg border ${themes[theme].border} px-3 py-2 bg-black/5 dark:bg-white/5`}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className={`text-sm font-semibold ${themes[theme].text}`}>
                跨月点位: {hoverState.label}
              </div>
              <div className={`text-xs ${themes[theme].text} opacity-70`}>
                {hoverState.line.name}
              </div>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-1">
              <div className={`text-xs ${themes[theme].text} opacity-70`}>
                基准月份: {prepared.baselineLabel || '-'} · 已展示候选 {prepared.strikePoolCount} 组 / 其中基准月有报价 {prepared.baselinePoolCount} 组
              </div>
              <div className={`text-sm font-semibold ${themes[theme].text}`}>
                {typeof hoverState.line.value === 'number' ? formatCurrency(hoverState.line.value, currencyConfig) : '-'}
              </div>
            </div>
          </div>
        ) : null}
        {chartEngine === 'plotly' && isPlotlyLoading ? (
          <div className={`mb-3 text-xs ${themes[theme].text} opacity-70`}>
            正在加载 Plotly 图表资源...
          </div>
        ) : null}
        {chartEngine === 'plotly' && plotlyError ? (
          <div className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {plotlyError}
          </div>
        ) : null}
        <div ref={chartRef} className="h-[400px] w-full" />
      </div>
    </div>
  );
}
