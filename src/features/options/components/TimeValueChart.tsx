import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { format, differenceInDays } from 'date-fns';
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
import type { OptionsData } from '../../../lib/services/types';
import type { OptionsChartEngine, PlotlyHTMLElement } from '../utils/chartEngine';
import { loadPlotly } from '../utils/chartEngine';

interface TimeValueChartProps {
  theme: Theme;
  optionsData: OptionsData;
  selectedSymbol: string;
  chartEngine?: OptionsChartEngine;
  onChartEngineChange?: (engine: OptionsChartEngine) => void;
}

type TimeValueMeta = {
  expiry: string;
  daysToExpiry: number;
  timePercentage: number;
};

type TimeValueSeries = {
  strike: number;
  name: string;
  isAtm: boolean;
  data: Array<number | null>;
};

type TradingViewHoverState = {
  index: number;
  line: { name: string; value: number | null };
};

const SYNTHETIC_START_TS = Math.floor(Date.UTC(2024, 0, 1) / 1000) as UTCTimestamp;
const SYNTHETIC_STEP_SECONDS = 24 * 60 * 60;
const MAX_LINE_SERIES = 7;
const SERIES_COLORS = ['#5b8ff9', '#8bd16f', '#f6bd16', '#f4664a', '#e8684a', '#6dc8ec', '#4ca26c', '#9270ca'];
const MIN_BAR_SPACING = 8;
const MAX_BAR_SPACING = 260;

const formatStrike = (strike: number) => (Number.isInteger(strike) ? `${strike}` : strike.toFixed(2));
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

export function TimeValueChart({
  theme,
  optionsData,
  selectedSymbol,
  chartEngine = 'tradingview',
  onChartEngineChange,
}: TimeValueChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<echarts.ECharts | null>(null);
  const tradingViewRef = useRef<IChartApi | null>(null);
  const tradingSeriesRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const [timeDisplayMode, setTimeDisplayMode] = useState<'days' | 'percentage'>('days');
  const [hoveredIndex, setHoveredIndex] = useState(0);
  const [hoveredSeriesIndex, setHoveredSeriesIndex] = useState<number>(0);
  const [plotlyError, setPlotlyError] = useState<string | null>(null);
  const [isPlotlyLoading, setIsPlotlyLoading] = useState(false);
  const { currencyConfig, getThemedColors } = useCurrency();

  const prepared = useMemo(() => {
    const expiryDates = Array.from(new Set(optionsData.quotes.map((quote) => quote.expiry)))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const now = new Date();
    const metaData: TimeValueMeta[] = expiryDates.map((expiry) => {
      const expiryDate = new Date(expiry);
      const daysToExpiry = differenceInDays(expiryDate, now);
      const timePercentage = Math.max(0, Math.min(100, (daysToExpiry / 365) * 100));
      return { expiry, daysToExpiry, timePercentage };
    });

    const strikeSet = new Set<number>();
    const timeValueByExpiryStrike = new Map<string, number>();
    let globalAtmStrike: number | null = null;
    let globalMaxTimeValue = Number.NEGATIVE_INFINITY;

    optionsData.quotes.forEach((quote) => {
      if (typeof quote.strike !== 'number' || !Number.isFinite(quote.strike)) return;
      strikeSet.add(quote.strike);
      timeValueByExpiryStrike.set(`${quote.expiry}::${quote.strike}`, quote.callTimeValue || 0);
      const totalTimeValue = (quote.callTimeValue || 0) + (quote.putTimeValue || 0);
      if (totalTimeValue > globalMaxTimeValue) {
        globalMaxTimeValue = totalTimeValue;
        globalAtmStrike = quote.strike;
      }
    });

    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    const effectiveAtmStrike = globalAtmStrike ?? strikes[0] ?? null;
    const filteredStrikes = effectiveAtmStrike == null || strikes.length <= MAX_LINE_SERIES
      ? strikes
      : [...strikes]
          .sort((a, b) => Math.abs(a - effectiveAtmStrike) - Math.abs(b - effectiveAtmStrike))
          .slice(0, MAX_LINE_SERIES)
          .sort((a, b) => a - b);

    const xAxisData = metaData.map((item) => (
      timeDisplayMode === 'days'
        ? `${item.daysToExpiry}天`
        : `${item.timePercentage.toFixed(1)}%`
    ));

    const series: TimeValueSeries[] = filteredStrikes.map((strike) => ({
      strike,
      name: `K=${formatStrike(strike)}`,
      isAtm: strike === effectiveAtmStrike,
      data: expiryDates.map((expiry) => timeValueByExpiryStrike.get(`${expiry}::${strike}`) ?? null),
    }));

    return {
      expiryDates,
      metaData,
      filteredStrikes,
      globalAtmStrike: effectiveAtmStrike,
      xAxisData,
      series,
    };
  }, [optionsData, timeDisplayMode]);

  useEffect(() => {
    setHoveredIndex((current) => Math.min(current, Math.max(prepared.metaData.length - 1, 0)));
  }, [prepared.metaData.length]);

  const hoverState = useMemo<TradingViewHoverState | null>(() => {
    const item = prepared.metaData[hoveredIndex];
    if (!item) return null;
    const series = prepared.series[hoveredSeriesIndex];
    if (!series) return null;
    const value = series.data[hoveredIndex] ?? null;
    return { index: hoveredIndex, line: { name: series.name, value } };
  }, [hoveredIndex, hoveredSeriesIndex, prepared.metaData, prepared.series]);

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

    if (!chartRef.current || prepared.metaData.length === 0 || prepared.series.length === 0) {
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
      symbol: 'circle',
      symbolSize: item.isAtm ? 6 : 4,
      triggerLineEvent: true,
      lineStyle: {
        width: item.isAtm ? 3 : 1.5,
        opacity: item.isAtm ? 1 : 0.7,
        color: item.isAtm ? getThemedColors(theme).chart.upColor : SERIES_COLORS[index % SERIES_COLORS.length],
      },
      itemStyle: {
        color: item.isAtm ? getThemedColors(theme).chart.upColor : SERIES_COLORS[index % SERIES_COLORS.length],
      },
      emphasis: {
        focus: 'series',
      },
    }));

    const option: echarts.EChartsOption = {
      animation: false,
      title: {
        text: `${selectedSymbol} 平值附近Call期权时间价值（按行权价）`,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16,
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
        trigger: 'item',
        backgroundColor: isDark ? '#374151' : '#ffffff',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
        },
        formatter: (params: unknown) => {
          const itemParam = params as { dataIndex?: number; data?: unknown; value?: unknown; seriesName?: string };
          const dataIndex = itemParam.dataIndex ?? 0;
          const item = prepared.metaData[dataIndex];
          if (!item) return '';
          const rawValue = itemParam.value ?? itemParam.data;
          if (rawValue == null) return '';
          return `
            <div>
              <div style="font-weight: bold; margin-bottom: 4px;">${itemParam.seriesName ?? ''}</div>
              <div style="font-weight: bold; margin-bottom: 4px;">到期日: ${format(new Date(item.expiry), 'yyyy-MM-dd')}</div>
              <div>剩余天数: ${item.daysToExpiry}天</div>
              <div>时间比例: ${item.timePercentage.toFixed(1)}%</div>
              <div>时间价值: ${formatCurrency(Number(rawValue), currencyConfig)}</div>
            </div>
          `;
        },
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '25%',
      },
      xAxis: {
        type: 'category',
        data: prepared.xAxisData,
        name: timeDisplayMode === 'days' ? '剩余天数' : '时间比例',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 12,
        },
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
        name: '时间价值',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 12,
        },
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
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(chartRef.current);
    return () => {
      resizeObserver.disconnect();
      disposeEChartsInstance(chart);
      echartsRef.current = null;
    };
  }, [chartEngine, currencyConfig, getThemedColors, prepared, selectedSymbol, theme, timeDisplayMode]);

  useEffect(() => {
    if (chartEngine !== 'tradingview') {
      removeTradingViewChart(tradingViewRef.current);
      tradingViewRef.current = null;
      tradingSeriesRefs.current = [];
      return;
    }

    if (!chartRef.current || prepared.metaData.length === 0 || prepared.series.length === 0) {
      return;
    }

    const isDark = theme === 'dark';
    const palette = {
      axis: isDark ? '#e5e7eb' : '#111827',
      muted: isDark ? '#94a3b8' : '#6b7280',
      grid: isDark ? '#334155' : '#e5e7eb',
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
      },
      timeScale: {
        borderColor: palette.grid,
        rightOffset: 0,
        barSpacing: getAdaptiveBarSpacing(chartRef.current.clientWidth, prepared.metaData.length),
        fixLeftEdge: true,
        fixRightEdge: true,
        tickMarkFormatter: (time: Time) => {
          const key = toTimeKey(time);
          if (key == null) return '';
          const index = Math.round((key - Number(SYNTHETIC_START_TS)) / SYNTHETIC_STEP_SECONDS);
          return prepared.xAxisData[index] ?? '';
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
      const color = item.isAtm ? getThemedColors(theme).chart.upColor : SERIES_COLORS[index % SERIES_COLORS.length];
      const series = chart.addLineSeries({
        color,
        lineWidth: item.isAtm ? 3 : 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      series.setData(item.data.map((value, pointIndex) => ({
        time: toSyntheticTime(pointIndex),
        value: value ?? NaN,
      })).filter((point) => Number.isFinite(point.value)));
      tradingSeriesRefs.current.push(series);
    });

    chart.timeScale().fitContent();

    const getHoveredSeriesValue = (seriesApi: ISeriesApi<'Line'>, seriesIdx: number, param: any, index: number) => {
      const seriesData = param?.seriesData?.get?.(seriesApi);
      if (seriesData && typeof seriesData === 'object') {
        if ('value' in seriesData && typeof seriesData.value === 'number') {
          return seriesData.value;
        }
        if ('close' in seriesData && typeof seriesData.close === 'number') {
          return seriesData.close;
        }
      }
      const fallback = prepared.series[seriesIdx]?.data[index];
      return typeof fallback === 'number' ? fallback : null;
    };
    const handleCrosshairMove = (param: any) => {
      const key = toTimeKey(param?.time);
      if (key == null) {
        return;
      }
      const rawIndex = Math.round((key - Number(SYNTHETIC_START_TS)) / SYNTHETIC_STEP_SECONDS);
      const index = Math.max(0, Math.min(prepared.metaData.length - 1, rawIndex));
      setHoveredIndex(index);
      const hovered = (param?.hoveredSeries as unknown) ?? null;
      if (hovered) {
        const seriesIndex = tradingSeriesRefs.current.findIndex((s) => s === hovered);
        if (seriesIndex >= 0) {
          setHoveredSeriesIndex(seriesIndex);
          return;
        }
      }

      const y = typeof param?.point?.y === 'number' ? param.point.y : null;
      if (y == null) {
        return;
      }

      let bestIndex: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      tradingSeriesRefs.current.forEach((seriesApi, seriesIdx) => {
        const value = getHoveredSeriesValue(seriesApi, seriesIdx, param, index);
        if (value == null) return;
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
          barSpacing: getAdaptiveBarSpacing(entry.contentRect.width, prepared.metaData.length),
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
  }, [chartEngine, getThemedColors, prepared, theme]);

  useEffect(() => {
    if (chartEngine !== 'plotly') {
      setPlotlyError(null);
      setIsPlotlyLoading(false);
      return;
    }

    if (!chartRef.current || prepared.metaData.length === 0 || prepared.series.length === 0) {
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
            x: prepared.xAxisData,
            y: item.data,
            customdata: prepared.metaData.map((meta) => [meta.expiry, meta.daysToExpiry, meta.timePercentage.toFixed(1)]),
            line: {
              color: item.isAtm ? getThemedColors(theme).chart.upColor : SERIES_COLORS[index % SERIES_COLORS.length],
              width: item.isAtm ? 3.5 : 2,
              shape: 'linear',
            },
            marker: {
              size: item.isAtm ? 7 : 5,
            },
            hovertemplate: [
              '<b>%{fullData.name}</b>',
              '<b>到期日</b> %{customdata[0]}',
              '<b>剩余天数</b> %{customdata[1]}天',
              '<b>时间比例</b> %{customdata[2]}%',
              '<b>时间价值</b> %{y}',
              '<extra></extra>',
            ].join('<br>'),
          })),
          {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 68, r: 28, t: 24, b: 56 },
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
              title: { text: timeDisplayMode === 'days' ? '剩余天数' : '时间比例' },
              type: 'category',
            },
            yaxis: {
              title: { text: '时间价值' },
              zeroline: false,
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

        if (!cancelled) setIsPlotlyLoading(false);
        return () => resizeObserver.disconnect();
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
  }, [chartEngine, getThemedColors, prepared, theme, timeDisplayMode]);

  const engineHint = '三种引擎都展示同一批 strike 的时间价值趋势，只是交互能力不同';
  const hoveredMeta = prepared.metaData[hoverState?.index ?? 0] ?? null;

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
          <div>
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              平值附近Call期权时间价值趋势（按行权价） - {selectedSymbol}
            </h2>
            <p className={`mt-1 text-sm ${themes[theme].text} opacity-70`}>
              {engineHint}
            </p>
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
            <select
              value={timeDisplayMode}
              onChange={(e) => setTimeDisplayMode(e.target.value as 'days' | 'percentage')}
              className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
            >
              <option value="days">按天数</option>
              <option value="percentage">按比例</option>
            </select>
          </div>
        </div>

        {chartEngine === 'tradingview' && hoveredMeta && hoverState ? (
          <div className={`mb-4 rounded-lg border ${themes[theme].border} px-3 py-2 bg-black/5 dark:bg-white/5`}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className={`text-sm font-semibold ${themes[theme].text}`}>
                到期日: {hoveredMeta.expiry}
              </div>
              <div className={`text-xs ${themes[theme].text} opacity-70`}>
                {hoverState.line.name}
              </div>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-1">
              <div className={`text-xs ${themes[theme].text} opacity-70`}>
                剩余天数: {hoveredMeta.daysToExpiry}天 · 时间比例: {hoveredMeta.timePercentage.toFixed(1)}%
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

        <div ref={chartRef} className="h-[420px] w-full" />
      </div>
    </div>
  );
}
