import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  Time,
  LineStyle,
  type LineData,
} from 'lightweight-charts';
import { Theme, themes } from '../../../lib/theme';
import { optionsService, stockService } from '../../../lib/services';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import type { OptionsData, PriceDistributionData } from '../../../lib/services/types';
import {
  buildConeFromPriceDistribution,
  type ConeDeltaLevel,
  type ConePoint,
} from '../utils/impliedPriceDistribution';
import { ConeSummaryChip, DeltaLevelPicker } from './ImpliedConeOverlay';

interface StockKlineChartProps {
  symbol: string;
  theme: Theme;
  optionsData?: OptionsData | null;
  currentUnderlyingPrice?: number | null;
}

type KlineRecord = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

type LinePoint = {
  time: UTCTimestamp;
  value: number;
};

const toStartOfDayUTC = (ts: number): UTCTimestamp => {
  const d = new Date(ts * 1000);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000) as UTCTimestamp;
};

const todayUTCTimestamp = (): UTCTimestamp => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000) as UTCTimestamp;
};

type RangeMode = '6M' | '1Y' | 'ALL';

const applyChartVisibleRange = (
  chart: IChartApi,
  data: KlineRecord[],
  mode: RangeMode,
  cone: ConePoint[],
  coneVisible: boolean
) => {
  if (data.length === 0) return;
  const ts = chart.timeScale();
  if (mode === 'ALL') {
    ts.fitContent();
    return;
  }
  const lastTs = data[data.length - 1].time;
  const d = new Date((lastTs as number) * 1000);
  if (mode === '6M') {
    d.setMonth(d.getMonth() - 6);
  } else if (mode === '1Y') {
    d.setFullYear(d.getFullYear() - 1);
  }
  const fromTs = Math.floor(d.getTime() / 1000) as UTCTimestamp;
  let toTs = lastTs;
  if (coneVisible && cone.length > 0) {
    const fut = Number(cone[cone.length - 1].pointTs ?? cone[cone.length - 1].expiryTs);
    toTs = (fut > (lastTs as number) ? (fut as unknown as UTCTimestamp) : lastTs) as UTCTimestamp;
  }
  ts.setVisibleRange({ from: fromTs as Time, to: toTs as Time });
};

export function StockKlineChart({ symbol, theme, optionsData, currentUnderlyingPrice }: StockKlineChartProps) {
  const { getThemedColors } = useCurrency();
  const themedColors = getThemedColors(theme);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lowSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const midSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const highSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const fillSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const klineDataRef = useRef<KlineRecord[]>([]);
  const rangeModeRef = useRef<RangeMode>('1Y');
  const coneVisibleRef = useRef(true);
  const lastKlineTsRef = useRef<UTCTimestamp | null>(null);
  const hasAppliedConeRangeRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>('1Y');
  const [coneVisible, setConeVisible] = useState(true);
  const [deltaLevel, setDeltaLevel] = useState<ConeDeltaLevel>(0.8);
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const [, forceRender] = useState(0);
  const [priceDistribution, setPriceDistribution] = useState<PriceDistributionData | null>(null);
  const [priceDistributionLoading, setPriceDistributionLoading] = useState(false);
  const priceDistributionReqIdRef = useRef(0);

  useEffect(() => {
    rangeModeRef.current = rangeMode;
    const chart = chartRef.current;
    if (!chart) return;
    try {
      applyChartVisibleRange(chart, klineDataRef.current, rangeMode, coneRef.current, coneVisibleRef.current);
    } catch (_) {
      /* ignore */
    }
  }, [rangeMode]);

  const coneRef = useRef<ConePoint[]>([]);
  const anchorTsRef = useRef<UTCTimestamp | null>(null);
  const coneAllPointsRef = useRef<{ ts: UTCTimestamp; low: number; mid: number; high: number }[]>([]);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 640);
      forceRender((v) => v + 1);
    };
    window.addEventListener('resize', onResize);
    const t = window.setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 60 * 1000);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearInterval(t);
    };
  }, []);

  const underlyingForCone = useMemo<number>(() => {
    if (currentUnderlyingPrice && currentUnderlyingPrice > 0) return currentUnderlyingPrice;
    const fromPd = Number(priceDistribution?.spot);
    if (fromPd > 0) return fromPd;
    const d = klineDataRef.current;
    if (d.length > 0) return d[d.length - 1].close;
    return 0;
  }, [currentUnderlyingPrice, priceDistribution, nowTs, loading, symbol]);

  // 拉取后端 price-distribution：symbol + expiry=all + bands=deltaLevel + point_step_days=5 + density_points=0
  useEffect(() => {
    if (!coneVisible) return;
    const reqId = ++priceDistributionReqIdRef.current;
    const abort = { current: false };
    setPriceDistributionLoading(true);
    let settled = false;
    (async () => {
      try {
        const bandsVal = Number(deltaLevel) || 0.8;
        const { data, error } = await optionsService.getPriceDistribution(symbol, {
          expiry: 'all',
          bands: bandsVal,
          pointStepDays: 5,
        });
        if (abort.current || settled) return;
        settled = true;
        if (!error && data) {
          setPriceDistribution(data);
        } else {
          // API 失败：显式清空，确保不画任何通道（不再做本地 fallback）
          setPriceDistribution(null);
        }
      } catch (_) {
        if (!settled && !abort.current) setPriceDistribution(null);
      } finally {
        if (!abort.current) setPriceDistributionLoading(false);
      }
    })();
    return () => {
      abort.current = true;
    };
  }, [symbol, deltaLevel, coneVisible, nowTs]);

  coneRef.current = useMemo<ConePoint[]>(() => {
    if (!coneVisible || !underlyingForCone) return [];
    // 严格只使用后端 /api/options/price-distribution 返回的数据；
    // 接口失败/空时不再做任何本地 fallback 计算。
    if (!priceDistribution) return [];
    const viaApi = buildConeFromPriceDistribution(priceDistribution, {
      probability: Number(deltaLevel) || 0.8,
      anchorPrice: underlyingForCone,
    });
    return viaApi.length > 0 ? viaApi : [];
  }, [underlyingForCone, coneVisible, deltaLevel, priceDistribution]);

  const applyConeToSeries = useCallback((cone: ConePoint[], anchorPrice: number) => {
    const lowS = lowSeriesRef.current;
    const midS = midSeriesRef.current;
    const highS = highSeriesRef.current;
    const chart = chartRef.current;
    if (!lowS || !midS || !highS || !chart) return;

    if (!cone.length || !anchorPrice || !coneVisibleRef.current) {
      lowS.setData([]);
      midS.setData([]);
      highS.setData([]);
      try {
        chart.timeScale().applyOptions({ rightOffset: isMobile ? 18 : 26 });
      } catch (_) {
        /* ignore */
      }
      coneAllPointsRef.current = [];
      return;
    }

    const lastK = lastKlineTsRef.current ?? todayUTCTimestamp();
    const todayStart = todayUTCTimestamp();
    const anchorTs = (lastK > todayStart ? lastK : todayStart) as UTCTimestamp;

    const stepDay = 24 * 3600;
    const ptsLow: LinePoint[] = [];
    const ptsMid: LinePoint[] = [];
    const ptsHigh: LinePoint[] = [];
    const allPts: { ts: UTCTimestamp; low: number; mid: number; high: number }[] = [];

    // cone 里每一项都带 ts=某一天（通常每 5 天一个节点）已经是铺好的 lower/mid/upper 时间序列，直接拿来 setData。
    // 为了在"现价锚点 → 第一个未来点"做到平滑从现价起步，而不是一跳到首日目标价，
    // 我们在 anchorTs → cone[0] 之间额外插 2 个过渡点，权重 w=p^0.6。
    const push3 = (ts: UTCTimestamp, low: number, mid: number, high: number) => {
      const numericTs = Number(ts);
      if (![numericTs, low, mid, high].every(Number.isFinite)) return;

      // lightweight-charts 要求 time 严格递增。过渡点和后端点都会被归一化到
      // UTC 当天 00:00，因此可能与锚点或相邻点落在同一秒。保留先到的点，
      // 同时拦截任何逆序数据，避免 setData 抛出断言并崩溃组件。
      const previous = allPts[allPts.length - 1];
      if (previous && numericTs <= Number(previous.ts)) return;

      ptsLow.push({ time: ts, value: Math.max(1e-6, low) });
      ptsMid.push({ time: ts, value: Math.max(1e-6, mid) });
      ptsHigh.push({ time: ts, value: Math.max(1e-6, high) });
      allPts.push({ ts, low, mid, high });
    };

    push3(anchorTs, anchorPrice, anchorPrice, anchorPrice);

    // 先把 cone 的点按实际 ts 排序（再次保险）
    const sorted = [...cone].sort((a, b) => {
      const ta = Number(a.pointTs ?? a.expiryTs) || 0;
      const tb = Number(b.pointTs ?? b.expiryTs) || 0;
      return ta - tb;
    });
    // 去掉 ts < anchorTs 的历史重复点（后端可能包含今天以前的历史密度）
    const futureOnly = sorted.filter((p) => {
      const t = Number(p.pointTs ?? p.expiryTs) || 0;
      return t >= Number(anchorTs) - stepDay;
    });
    if (futureOnly.length === 0) {
      coneAllPointsRef.current = allPts;
      lowS.setData(ptsLow as unknown as LineData<'Line'>[]);
      midS.setData(ptsMid as unknown as LineData<'Line'>[]);
      highS.setData(ptsHigh as unknown as LineData<'Line'>[]);
      try {
        chart.timeScale().applyOptions({ rightOffset: isMobile ? 12 : 20 });
      } catch (_) { /* ignore */ }
      return;
    }

    // 锚点过渡段：anchorTs → firstFuture
    const first = futureOnly[0];
    const firstTs = Number(first.pointTs ?? first.expiryTs);
    if (firstTs > Number(anchorTs)) {
      const nTrans = 3;
      for (let i = 1; i < nTrans; i++) {
        const w = Math.pow(i / nTrans, 0.6);
        const tsVal = Number(anchorTs) + Math.floor((firstTs - Number(anchorTs)) * (i / nTrans));
        const ts = toStartOfDayUTC(tsVal);
        const lo = anchorPrice * (1 - w) + first.lower * w;
        const md = anchorPrice * (1 - w) + first.mid * w;
        const hi = anchorPrice * (1 - w) + first.upper * w;
        push3(ts, lo, md, hi);
      }
    }
    for (const p of futureOnly) {
      const t = Number(p.pointTs ?? p.expiryTs);
      if (!isFinite(t) || t <= 0) continue;
      const ts = toStartOfDayUTC(t);
      push3(ts, p.lower, p.mid ?? (p.lower + p.upper) * 0.5, p.upper);
    }
    // 末尾 3 天外推尾垫，让 lastValue 标签不被截断：上下轨宽度单调不减（风险中性扩散）
    const lastP = futureOnly[futureOnly.length - 1];
    const lastTs = Number(lastP.pointTs ?? lastP.expiryTs);
    const lastLo = lastP.lower;
    const lastMid = lastP.mid ?? lastLo;
    const lastHi = lastP.upper;
    const prev2 = futureOnly[Math.max(0, futureOnly.length - 2)];
    const prev2Ts = Number(prev2.pointTs ?? prev2.expiryTs);
    const dt = Math.max(stepDay, lastTs - prev2Ts);
    const dwLow = Math.max(0, (lastLo - Number(prev2.lower))) / dt;
    const dwMid = Math.max(-1e6, Math.min(1e6, (lastMid - (prev2.mid ?? lastMid)) / dt));
    const dwHigh = Math.max(0, (lastHi - Number(prev2.upper))) / dt;
    const padTs = (lastTs + 3 * stepDay) as UTCTimestamp;
    push3(
      padTs,
      Math.max(1e-6, lastLo + dwLow * 3 * stepDay),
      Math.max(1e-6, lastMid + dwMid * 3 * stepDay),
      Math.max(1e-6, lastHi + dwHigh * 3 * stepDay),
    );

    anchorTsRef.current = anchorTs;
    coneAllPointsRef.current = allPts;

    lowS.setData(ptsLow as unknown as LineData<'Line'>[]);
    midS.setData(ptsMid as unknown as LineData<'Line'>[]);
    highS.setData(ptsHigh as unknown as LineData<'Line'>[]);

    try {
      const desiredOff = isMobile ? 12 : 20;
      chart.timeScale().applyOptions({ rightOffset: desiredOff });
      if (!hasAppliedConeRangeRef.current && cone.length > 0) {
        hasAppliedConeRangeRef.current = true;
        applyChartVisibleRange(chart, klineDataRef.current, rangeModeRef.current, cone, coneVisibleRef.current);
      } else if (rangeModeRef.current === 'ALL') {
        chart.timeScale().fitContent();
      }
    } catch (_) {
      /* ignore */
    }
  }, [isMobile]);

  useEffect(() => {
    coneVisibleRef.current = coneVisible;
    applyConeToSeries(coneRef.current, underlyingForCone);
  }, [coneVisible, coneRef.current, underlyingForCone, applyConeToSeries]);

  useEffect(() => {
    const lowS = lowSeriesRef.current;
    const highS = highSeriesRef.current;
    if (!lowS || !highS) return;
    const bandPct = Math.round(Number(deltaLevel) * 100);
    try {
      lowS.applyOptions({ title: `${bandPct}% 下轨` });
      highS.applyOptions({ title: `${bandPct}% 上轨` });
    } catch (_) {
      /* ignore */
    }
  }, [deltaLevel]);

  useEffect(() => {
    if (!symbol || !containerRef.current) return;
    const container = containerRef.current;
    const ac = new AbortController();
    setLoading(true);
    hasAppliedConeRangeRef.current = false;

    const isDark = theme === 'dark';
    const isBlue = theme === 'blue';
    const chartHeight = isMobile ? 320 : 360;
    const initRightOff = isMobile ? 18 : 26;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#9ca3af' : isBlue ? '#475569' : '#6b7280',
      },
      grid: {
        vertLines: {
          color: isDark ? '#27272a' : isBlue ? 'rgba(219, 234, 254, 0.7)' : '#f1f5f9',
          visible: true,
        },
        horzLines: {
          color: isDark ? '#27272a' : isBlue ? 'rgba(219, 234, 254, 0.9)' : '#f1f5f9',
        },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: isDark ? '#3f3f46' : isBlue ? '#dbeafe' : '#e2e8f0',
        minimumWidth: isMobile ? 44 : 64,
        scaleMargins: { top: 0.08, bottom: 0.1 },
      },
      timeScale: {
        visible: true,
        borderVisible: true,
        borderColor: isDark ? '#3f3f46' : isBlue ? '#dbeafe' : '#e2e8f0',
        timeVisible: false,
        secondsVisible: false,
        rightOffset: initRightOff,
        barSpacing: isMobile ? 7 : 9,
      },
      width: Math.round(container.getBoundingClientRect().width),
      height: chartHeight,
      handleScroll: true,
      handleScale: true,
      crosshair: {
        mode: 0,
        vertLine: { visible: true, labelVisible: true },
        horzLine: { visible: true, labelVisible: true },
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: themedColors.chart.upColor,
      downColor: themedColors.chart.downColor,
      borderUpColor: themedColors.chart.upColor,
      borderDownColor: themedColors.chart.downColor,
      wickUpColor: themedColors.chart.upColor,
      wickDownColor: themedColors.chart.downColor,
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });

    const lowLineColor = isDark ? '#34d399' : '#059669';
    const midLineColor = isDark ? '#93c5fd' : '#2563eb';
    const highLineColor = isDark ? '#fb7185' : '#e11d48';
    const bandPct = Math.round(Number(deltaLevel) * 100);

    const lowS = chart.addLineSeries({
      color: lowLineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      lineStyle: LineStyle.Solid,
      title: `${bandPct}% 下轨`,
      crosshairMarkerVisible: true,
    });
    const midS = chart.addLineSeries({
      color: midLineColor,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      lineStyle: LineStyle.Dashed,
      title: '远期线',
      crosshairMarkerVisible: true,
    });
    const highS = chart.addLineSeries({
      color: highLineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      lineStyle: LineStyle.Solid,
      title: `${bandPct}% 上轨`,
      crosshairMarkerVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    lowSeriesRef.current = lowS;
    midSeriesRef.current = midS;
    highSeriesRef.current = highS;
    fillSeriesRef.current = null;

    stockService
      .getStockHistoryRaw(symbol, { signal: ac.signal })
      .then(({ data, error }) => {
        if (ac.signal.aborted) return;
        setLoading(false);
        if (error || !data) {
          console.error('Failed to fetch K-line data:', error);
          return;
        }
        const records = data as Array<{
          date: string | number;
          open: number | string;
          high: number | string;
          low: number | string;
          close: number | string;
          volume?: number | string;
        }>;
        const parsedCandlesticks = records
          .map((r) => ({
            time: Math.floor(new Date(r.date as string).getTime() / 1000) as UTCTimestamp,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
          }))
          .filter(
            (d) =>
              !isNaN(d.time) &&
              !isNaN(d.open) &&
              !isNaN(d.high) &&
              !isNaN(d.low) &&
              !isNaN(d.close)
          );
        // API 偶尔会返回同一时间戳的多条记录。后到的记录覆盖先到的记录，
        // 再排序后交给 lightweight-charts，保证 time 严格递增。
        const candlesticksByTime = new Map<UTCTimestamp, KlineRecord>();
        parsedCandlesticks.forEach((item) => candlesticksByTime.set(item.time, item));
        const candlesticks = Array.from(candlesticksByTime.values())
          .sort((a, b) => a.time - b.time);
        klineDataRef.current = candlesticks;
        series.setData(candlesticks);
        if (candlesticks.length > 0) {
          lastKlineTsRef.current = candlesticks[candlesticks.length - 1].time;
        }
        try {
          const applyInitial = () => {
            if (!chart) return;
            applyChartVisibleRange(chart, candlesticks, rangeModeRef.current, coneRef.current, coneVisibleRef.current);
          };
          applyInitial();
          setTimeout(applyInitial, 80);
        } catch (_) {
          /* ignore */
        }
        forceRender((v) => v + 1);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error('Failed to fetch K-line data:', err);
          setLoading(false);
        }
      });

    const handleResize = () => {
      if (containerRef.current) {
        const w = Math.round(containerRef.current.getBoundingClientRect().width);
        chart.applyOptions({ width: w });
      }
    };
    window.addEventListener('resize', handleResize);

    const onCrosshair = (param: { time?: Time; seriesData?: Map<ISeriesApi<unknown>, unknown> }) => {
      const sd = param.seriesData?.get(series) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      setHoveredPrice(sd?.close ?? null);
    };
    chart.subscribeCrosshairMove(onCrosshair);

    const onVisibleRange = (() => {
      forceRender((v) => v + 1);
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRange);
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRange);

    return () => {
      ac.abort();
      window.removeEventListener('resize', handleResize);
      try {
        chart.unsubscribeCrosshairMove(onCrosshair);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRange);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRange);
      } catch (_) {
        /* ignore */
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lowSeriesRef.current = null;
      midSeriesRef.current = null;
      highSeriesRef.current = null;
      fillSeriesRef.current = null;
      klineDataRef.current = [];
    };
  }, [symbol, theme, isMobile, themedColors.chart.upColor, themedColors.chart.downColor]);

  const fmtP = (v: number): string => {
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(2);
    return v.toFixed(3);
  };

  type LabelItem = {
    expiry: string;
    x: number;
    yLo: number | null;
    yMid: number | null;
    yHi: number | null;
    lo: number;
    mid: number;
    hi: number;
  };
  const EMPTY_LABELS: LabelItem[] = [];

  const tickForOverlay = forceRender;
  void tickForOverlay;

  const overlayData = useMemo(() => {
    if (!coneVisible) return { fill: null, labels: EMPTY_LABELS };
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return { fill: null, labels: EMPTY_LABELS };

    const pts = coneAllPointsRef.current;
    let fill: { d: string; bandFill: string; bandEdge: string } | null = null;
    if (pts.length >= 2) {
      const lowXY: Array<[number, number]> = [];
      const highXY: Array<[number, number]> = [];
      for (const p of pts) {
        const x = chart.timeScale().timeToCoordinate(p.ts as unknown as Time);
        const ylo = series.priceToCoordinate(p.low);
        const yhi = series.priceToCoordinate(p.high);
        if (x == null || !isFinite(x) || ylo == null || !isFinite(ylo) || yhi == null || !isFinite(yhi)) continue;
        lowXY.push([x, ylo]);
        highXY.push([x, yhi]);
      }
      if (lowXY.length >= 2) {
        const isDark = theme === 'dark';
        const isBlue = theme === 'blue';
        const bandFill = isDark
          ? 'rgba(139, 92, 246, 0.10)'
          : isBlue
          ? 'rgba(59, 130, 246, 0.10)'
          : 'rgba(99, 102, 241, 0.10)';
        const bandEdge = isDark
          ? 'rgba(167, 139, 250, 0.35)'
          : isBlue
          ? 'rgba(37, 99, 235, 0.35)'
          : 'rgba(99, 102, 241, 0.35)';
        let d = `M ${lowXY[0][0].toFixed(2)} ${lowXY[0][1].toFixed(2)}`;
        for (let i = 1; i < lowXY.length; i++) {
          const x0 = lowXY[i - 1][0];
          const y0 = lowXY[i - 1][1];
          const x1 = lowXY[i][0];
          const y1 = lowXY[i][1];
          const cx = (x0 + x1) * 0.5;
          d += ` C ${cx.toFixed(2)} ${y0.toFixed(2)}, ${cx.toFixed(2)} ${y1.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
        }
        d += ' L';
        for (let i = highXY.length - 1; i >= 0; i--) {
          d += ` ${highXY[i][0].toFixed(2)} ${highXY[i][1].toFixed(2)}`;
        }
        d += ' Z';
        fill = { d, bandFill, bandEdge };
      }
    }

    const labels: LabelItem[] = [];
    const cone = coneRef.current;
    for (const p of cone) {
      if (!p.isExpiryPoint) continue;
      const x = chart.timeScale().timeToCoordinate(
        (p.pointTs ?? p.expiryTs) as unknown as Time
      );
      if (x == null || !isFinite(x)) continue;
      labels.push({
        expiry: p.expiry,
        x,
        yLo: series.priceToCoordinate(p.lower),
        yMid: series.priceToCoordinate(p.mid),
        yHi: series.priceToCoordinate(p.upper),
        lo: p.lower,
        mid: p.mid,
        hi: p.upper,
      });
    }
    return { fill, labels };
  }, [coneVisible, nowTs, forceRender, theme, EMPTY_LABELS]);


  if (!symbol) return null;

  const isDark = theme === 'dark';
  const isBlue = theme === 'blue';
  const muted = isDark ? 'text-zinc-400' : isBlue ? 'text-slate-500' : 'text-slate-500';

  const rangeBtn = (key: RangeMode, label: string, title: string, pos: 'first' | 'middle' | 'last') => {
    const active = rangeMode === key;
    const activeCls =
      theme === 'dark'
        ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
        : theme === 'blue'
        ? 'bg-blue-50 border-blue-200 text-blue-700'
        : 'bg-indigo-50 border-indigo-200 text-indigo-700';
    const idleCls =
      theme === 'dark'
        ? 'bg-zinc-800/50 border-zinc-700/40 text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100'
        : theme === 'blue'
        ? 'bg-white/60 border-blue-100/60 text-slate-600 hover:bg-blue-50 hover:text-blue-900'
        : 'bg-white/60 border-slate-200/60 text-slate-600 hover:bg-slate-100 hover:text-slate-900';
    const posCls =
      pos === 'first'
        ? 'rounded-l-lg rounded-r-none border-r-0'
        : pos === 'last'
        ? 'rounded-r-lg rounded-l-none'
        : 'rounded-none border-r-0';
    return (
      <button
        key={key}
        type="button"
        onClick={() => setRangeMode(key)}
        title={title}
        className={`px-2.5 py-1 text-[11px] font-semibold border transition-all duration-150 cursor-pointer select-none ${posCls} ${
          active ? activeCls : idleCls
        }`}
      >
        {label}
      </button>
    );
  };

  const coneBtnActive =
    theme === 'dark'
      ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
      : theme === 'blue'
      ? 'bg-blue-50 border-blue-200 text-blue-700'
      : 'bg-indigo-50 border-indigo-200 text-indigo-700';
  const coneBtnIdle =
    theme === 'dark'
      ? 'bg-zinc-800/60 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/60'
      : theme === 'blue'
      ? 'bg-white/60 border-blue-100 text-slate-600 hover:bg-blue-50'
      : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-slate-100';

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md border ${themes[theme].border} p-3 md:p-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`text-sm font-semibold ${themes[theme].text}`}>{symbol} 日 K 线</h3>
          <ConeSummaryChip
            theme={theme}
            cone={coneRef.current.filter((p) => p.isExpiryPoint)}
            deltaLevel={deltaLevel}
            underlyingPrice={underlyingForCone}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg overflow-hidden">
            {rangeBtn('6M', '6 个月', '显示最近 6 个月走势', 'first')}
            {rangeBtn('1Y', '1 年', '只显示最近 1 年走势（默认）', 'middle')}
            {rangeBtn('ALL', '全部', '显示全部历史走势，同时包含未来到期日', 'last')}
          </div>

          <DeltaLevelPicker theme={theme} value={deltaLevel} onChange={setDeltaLevel} />

          <button
            type="button"
            onClick={() => setConeVisible((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
              coneVisible ? coneBtnActive : coneBtnIdle
            }`}
            title="显示/隐藏期权隐含预期通道（共享 K 线横轴时间）"
          >
            {coneVisible ? '✓ 预期通道' : '预期通道'}
          </button>

          {hoveredPrice != null && (
            <span className={`text-[11px] ${muted}`}>
              悬停价 {hoveredPrice.toFixed(hoveredPrice >= 100 ? 2 : 3)}
            </span>
          )}
        </div>
      </div>

      <div className="relative" style={{ height: isMobile ? 320 : 360 }}>
        <div ref={containerRef} className="w-full h-full" />
        {coneVisible && overlayData && (overlayData.fill || overlayData.labels.length > 0) && (
          <svg
            key={symbol}
            className="pointer-events-none absolute inset-0 z-[2]"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            viewBox={`0 0 ${containerRef.current?.getBoundingClientRect().width ?? 0} ${containerRef.current?.getBoundingClientRect().height ?? 0}`}
          >
            {overlayData.fill && (
              <path
                d={overlayData.fill.d}
                fill={overlayData.fill.bandFill}
                stroke={overlayData.fill.bandEdge}
                strokeWidth={0.6}
              />
            )}
            {overlayData.labels.map((l, i) => {
              const cardBg = isDark ? 'rgba(24, 24, 27, 0.92)' : 'rgba(255, 255, 255, 0.96)';
              const cardBorder = isDark ? 'rgba(250, 204, 21, 0.25)' : 'rgba(250, 204, 21, 0.4)';
              const lowLine = isDark ? '#34d399' : '#059669';
              const highLine = isDark ? '#fb7185' : '#e11d48';
              const midLine = isDark ? '#93c5fd' : '#2563eb';
              return (
                <g key={`lbl-${i}`} transform={`translate(${l.x.toFixed(2)}, 0)`}>
                  <line
                    x1={0}
                    y1={4}
                    x2={0}
                    y2={(containerRef.current?.getBoundingClientRect().height ?? 0) - 16}
                    stroke={isDark ? 'rgba(250, 204, 21, 0.35)' : 'rgba(250, 204, 21, 0.35)'}
                    strokeWidth={0.8}
                    strokeDasharray="2 3"
                  />
                  <g transform={`translate(3, 4)`}>
                    <rect
                      x={0}
                      y={0}
                      width={76}
                      height={14}
                      rx={3}
                      fill={cardBg}
                      stroke={cardBorder}
                    />
                    <text x={4} y={10} fontSize={9.5} fill={isDark ? '#fde68a' : '#b45309'} fontWeight={700}>
                      {l.expiry.slice(5)}
                    </text>
                  </g>
                  {!isMobile &&
                    l.yHi != null &&
                    l.yHi > 18 &&
                    l.yHi < (containerRef.current?.getBoundingClientRect().height ?? 0) - 18 && (
                      <g transform={`translate(4, ${(l.yHi - 7).toFixed(2)})`}>
                        <rect x={0} y={0} width={72} height={14} rx={3} fill={cardBg} stroke={cardBorder} />
                        <text x={4} y={10} fontSize={9} fill={highLine} fontWeight={700}>
                          阻 {fmtP(l.hi)}
                        </text>
                      </g>
                    )}
                  {!isMobile &&
                    l.yMid != null &&
                    l.yMid > 38 &&
                    l.yMid < (containerRef.current?.getBoundingClientRect().height ?? 0) - 38 && (
                      <g transform={`translate(4, ${(l.yMid - 7).toFixed(2)})`}>
                        <rect x={0} y={0} width={72} height={14} rx={3} fill={cardBg} stroke={cardBorder} />
                        <text x={4} y={10} fontSize={9} fill={midLine} fontWeight={700}>
                          远 {fmtP(l.mid)}
                        </text>
                      </g>
                    )}
                  {!isMobile &&
                    l.yLo != null &&
                    l.yLo > 58 &&
                    l.yLo < (containerRef.current?.getBoundingClientRect().height ?? 0) - 18 && (
                      <g transform={`translate(4, ${(l.yLo - 7).toFixed(2)})`}>
                        <rect x={0} y={0} width={72} height={14} rx={3} fill={cardBg} stroke={cardBorder} />
                        <text x={4} y={10} fontSize={9} fill={lowLine} fontWeight={700}>
                          支 {fmtP(l.lo)}
                        </text>
                      </g>
                    )}
                </g>
              );
            })}
          </svg>
        )}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded border border-dashed border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-900/80">
            <span className={`text-sm ${themes[theme].text} opacity-70`}>加载 K 线数据...</span>
          </div>
        )}
      </div>
    </div>
  );
}
