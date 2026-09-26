import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineStyle,
  LineType,
  createChart,
} from 'lightweight-charts';
import {
  ChevronDown,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Calendar,
  AlertCircle,
  Layers,
  ExternalLink,
  FileSpreadsheet,
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { portfolioService } from '../../../lib/services';
import type { PortfolioHistoryItem } from '../../../lib/services/types';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { getAccountAliasFromSearch } from '../../../shared/utils/accountSelection';

export const GOOGLE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1GIEYV35WYDs7yqjiCBycGmuD8FG-ZXKyhI2sd8B9TFA/edit?gid=690486552#gid=690486552';
export const MAIN_ACCOUNT_ALIAS = 'gjzq_option';

export type TimeRangeOption = 'all' | '1y' | '6m' | '3m' | 'ytd';

export interface OptionPortfolioHistoryChartProps {
  theme: Theme;
  accountAlias?: string;
  className?: string;
  defaultExpanded?: boolean;
  showHeader?: boolean;
  defaultRange?: TimeRangeOption;
  onLatestPointChange?: (point: PortfolioHistoryItem | null) => void;
}

const TIME_RANGES: { label: string; value: TimeRangeOption }[] = [
  { label: '全部', value: 'all' },
  { label: '1年', value: '1y' },
  { label: '6个月', value: '6m' },
  { label: '3个月', value: '3m' },
  { label: 'YTD', value: 'ytd' },
];

/**
 * 清洗并排序数据，确保 time 严格单调递增，且 calculated_profit 有效
 */
export function cleanPortfolioHistoryPoints(items: PortfolioHistoryItem[]): PortfolioHistoryItem[] {
  if (!items || !items.length) return [];

  // 1. 过滤掉没有有效 calculated_profit 的点
  const valid = items.filter(
    (item) =>
      item.date &&
      item.calculated_profit !== null &&
      item.calculated_profit !== undefined &&
      !isNaN(Number(item.calculated_profit))
  );

  // 2. 按日期升序排序，同一天按 id 升序
  valid.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.id || 0) - (b.id || 0);
  });

  // 3. 同一日期去重，保留最新一条记录（保证 lightweight-charts 严格递增）
  const map = new Map<string, PortfolioHistoryItem>();
  for (const item of valid) {
    map.set(item.date, item);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 根据时间范围过滤数据
 */
export function filterHistoryByRange(
  items: PortfolioHistoryItem[],
  range: TimeRangeOption
): PortfolioHistoryItem[] {
  if (range === 'all' || !items.length) return items;

  const lastItem = items[items.length - 1];
  const lastDate = new Date(lastItem.date);
  if (isNaN(lastDate.getTime())) return items;

  const targetDate = new Date(lastDate);

  if (range === '1y') {
    targetDate.setFullYear(targetDate.getFullYear() - 1);
  } else if (range === '6m') {
    targetDate.setMonth(targetDate.getMonth() - 6);
  } else if (range === '3m') {
    targetDate.setMonth(targetDate.getMonth() - 3);
  } else if (range === 'ytd') {
    targetDate.setMonth(0, 1); // 当年 1 月 1 日
  }

  const targetDateStr = targetDate.toISOString().split('T')[0];
  const filtered = items.filter((it) => it.date >= targetDateStr);
  return filtered.length > 0 ? filtered : items;
}

export function OptionPortfolioHistoryChart({
  theme,
  accountAlias: propAccountAlias,
  className = '',
  defaultExpanded = false,
  showHeader = true,
  defaultRange = '6m',
  onLatestPointChange,
}: OptionPortfolioHistoryChartProps) {
  const location = useLocation();
  const { currencyConfig } = useCurrency();
  const formatMoney = useCallback(
    (amount: number) => formatCurrency(amount, currencyConfig),
    [currencyConfig]
  );

  const effectiveAccountAlias = useMemo(() => {
    return propAccountAlias || getAccountAliasFromSearch(location.search) || 'gjzq_option';
  }, [propAccountAlias, location.search]);

  // 判断是否为主账户（主账户标注 Google Sheet 来源）
  const isMainAccount = effectiveAccountAlias === MAIN_ACCOUNT_ALIAS;

  // 折叠状态（默认折叠）
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // 数据加载状态
  const [historyItems, setHistoryItems] = useState<PortfolioHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 过滤控制（默认显示最近 6 个月）
  const [timeRange, setTimeRange] = useState<TimeRangeOption>(defaultRange);
  const [hoveredPoint, setHoveredPoint] = useState<PortfolioHistoryItem | null>(null);

  // 图表 DOM 与实例引用
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 加载数据
  const fetchData = useCallback(async () => {
    if (!effectiveAccountAlias) return;
    setIsLoading(true);
    setError(null);
    try {
      const resp = await portfolioService.getPortfolioHistory(effectiveAccountAlias);
      if (resp.error) {
        setError(resp.error.message || '获取历史资产数据失败');
        setHistoryItems([]);
      } else {
        const rawHistory = resp.data?.history || [];
        setHistoryItems(rawHistory);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络请求错误');
      setHistoryItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveAccountAlias]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 清洗有效数据
  const cleanedPoints = useMemo(() => cleanPortfolioHistoryPoints(historyItems), [historyItems]);

  // 根据时间范围筛选出的点
  const displayPoints = useMemo(() => filterHistoryByRange(cleanedPoints, timeRange), [cleanedPoints, timeRange]);

  // 最新点与统计指标
  const latestPoint = useMemo(() => {
    return cleanedPoints.length > 0 ? cleanedPoints[cleanedPoints.length - 1] : null;
  }, [cleanedPoints]);

  useEffect(() => {
    onLatestPointChange?.(latestPoint);
  }, [latestPoint, onLatestPointChange]);

  const effectiveExpanded = showHeader ? isExpanded : true;

  const stats = useMemo(() => {
    if (!displayPoints.length) {
      return { min: 0, max: 0, start: 0, end: 0, diff: 0, positiveCount: 0 };
    }
    const profits = displayPoints.map((p) => Number(p.calculated_profit ?? 0));
    const min = Math.min(...profits);
    const max = Math.max(...profits);
    const start = profits[0];
    const end = profits[profits.length - 1];
    const diff = end - start;
    const positiveCount = profits.filter((v) => v > 0).length;
    return { min, max, start, end, diff, positiveCount };
  }, [displayPoints]);

  // 当鼠标未悬停时默认展示最新点
  const activePoint = hoveredPoint || latestPoint;

  // 主题与色彩配置
  const isDark = theme === 'dark';
  const isBlue = theme === 'blue';

  const chartTheme = useMemo(() => {
    const textColor = isDark ? '#94a3b8' : isBlue ? '#64748b' : '#6b7280';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.04)' : isBlue ? 'rgba(30, 64, 175, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const borderColor = isDark ? '#334155' : isBlue ? '#cbd5e1' : '#e5e7eb';

    const isPositive = (latestPoint?.calculated_profit ?? 0) >= 0;
    const lineColor = isPositive ? '#10b981' : '#3b82f6';
    const topColor = isPositive ? 'rgba(16, 185, 129, 0.28)' : 'rgba(59, 130, 246, 0.28)';
    const bottomColor = isPositive ? 'rgba(16, 185, 129, 0.00)' : 'rgba(59, 130, 246, 0.00)';

    return {
      textColor,
      gridColor,
      borderColor,
      lineColor,
      topColor,
      bottomColor,
    };
  }, [isDark, isBlue, latestPoint]);

  // 初始化 TradingView lightweight-charts 图表实例
  useEffect(() => {
    if (!effectiveExpanded || !containerRef.current) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
      return;
    }

    const container = containerRef.current;
    const initialWidth = container.clientWidth > 0 ? container.clientWidth : 600;
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 640;
    const initialHeight = isMobileViewport ? 240 : 320;

    // 创建图表
    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: chartTheme.textColor,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: chartTheme.gridColor, style: LineStyle.Dotted },
        horzLines: { color: chartTheme.gridColor, style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: chartTheme.textColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1e293b' : '#334155',
        },
        horzLine: {
          color: chartTheme.textColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1e293b' : '#334155',
        },
      },
      rightPriceScale: {
        borderColor: chartTheme.borderColor,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: chartTheme.borderColor,
        timeVisible: false,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    // 添加 AreaSeries 并启用平滑曲线（LineType.Curved）
    const series = chart.addAreaSeries({
      lineType: LineType.Curved,
      lineWidth: 2,
      lineColor: chartTheme.lineColor,
      topColor: chartTheme.topColor,
      bottomColor: chartTheme.bottomColor,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });
    seriesRef.current = series;

    // 添加 0.00 盈亏平衡参考基线
    series.createPriceLine({
      price: 0,
      color: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '0.00',
    });

    // 若已有数据点，直接注入
    if (displayPoints.length > 0) {
      const chartData = displayPoints.map((p) => ({
        time: p.date,
        value: Number(p.calculated_profit ?? 0),
      }));
      series.setData(chartData);
      chart.timeScale().fitContent();
    }

    // 监听光标移动 crosshairMove
    chart.subscribeCrosshairMove((param) => {
      if (
        param === undefined ||
        param.time === undefined ||
        param.point === undefined ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        setHoveredPoint(null);
        return;
      }

      const pointDate = typeof param.time === 'string' ? param.time : '';
      if (pointDate) {
        const found = displayPoints.find((it) => it.date === pointDate);
        if (found) {
          setHoveredPoint(found);
        }
      }
    });

    // 响应式监听容器尺寸
    const handleResize = () => {
      if (!containerRef.current || !chartRef.current) return;
      const w = containerRef.current.clientWidth;
      const isMobile = window.innerWidth < 640;
      const h = isMobile ? 220 : 250;
      if (w > 0) {
        chartRef.current.applyOptions({ width: w, height: h });
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && chartRef.current) {
          const isMobile = window.innerWidth < 640;
          const h = isMobile ? 220 : 250;
          chartRef.current.applyOptions({ width: entry.contentRect.width, height: h });
        }
      }
    });

    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;
    window.addEventListener('resize', handleResize);

    // 布局落定后做二次校验 fitContent
    const timer = setTimeout(() => {
      handleResize();
      if (chartRef.current && displayPoints.length > 0) {
        chartRef.current.timeScale().fitContent();
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [effectiveExpanded, isDark, isBlue]);

  // 当筛选时间范围或点数据更新时平滑注入数据，无需销毁重建图表
  useEffect(() => {
    if (seriesRef.current && chartRef.current) {
      if (displayPoints.length > 0) {
        const chartData = displayPoints.map((p) => ({
          time: p.date,
          value: Number(p.calculated_profit ?? 0),
        }));
        seriesRef.current.setData(chartData);
        chartRef.current.timeScale().fitContent();
      } else {
        seriesRef.current.setData([]);
      }
    }
  }, [displayPoints]);

  // 当主题或颜色变化时平滑更新 series 与布局选项
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.applyOptions({
        lineColor: chartTheme.lineColor,
        topColor: chartTheme.topColor,
        bottomColor: chartTheme.bottomColor,
      });
    }
    if (chartRef.current) {
      chartRef.current.applyOptions({
        layout: {
          textColor: chartTheme.textColor,
        },
        grid: {
          vertLines: { color: chartTheme.gridColor },
          horzLines: { color: chartTheme.gridColor },
        },
      });
    }
  }, [chartTheme]);

  const cardShadow = useMemo(() => {
    if (theme === 'dark') return 'shadow-[0_1px_2px_rgba(0,0,0,0.25),0_12px_28px_-16px_rgba(0,0,0,0.45)]';
    if (theme === 'blue') return 'shadow-[0_1px_2px_rgba(30,64,175,0.04),0_10px_28px_-16px_rgba(37,99,235,0.10)]';
    return 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.08)]';
  }, [theme]);

  const isProfitPositive = (latestPoint?.calculated_profit ?? 0) >= 0;

  const renderContent = () => (

        <div className={`px-4 sm:px-6 pb-6 pt-2 ${showHeader ? `border-t ${themes[theme].border}` : ''} space-y-4`}>
          {/* 工具栏与时间范围选择 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100/80 dark:bg-zinc-800/80 backdrop-blur-sm">
              {TIME_RANGES.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setTimeRange(tab.value)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                    timeRange === tab.value
                      ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm font-semibold'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {isMainAccount && (
                <a
                  href={GOOGLE_SHEET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden md:inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                  title="查看 Google Sheet 资金与快照底表"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Google Sheet 底表</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              )}
              <span className={`text-xs ${themes[theme].text} opacity-60 hidden sm:inline-flex items-center gap-1`}>
                <Layers className="w-3.5 h-3.5" />
                共 {cleanedPoints.length} 个快照点
              </span>
              <button
                type="button"
                onClick={fetchData}
                disabled={isLoading}
                className={`p-1.5 rounded-lg border ${themes[theme].border} hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                  isLoading ? 'opacity-60 cursor-wait' : ''
                }`}
                title="重新加载数据"
              >
                <RefreshCw
                  className={`w-4 h-4 ${themes[theme].text} ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* 交互悬停数据详情栏 (Crosshair Info) */}
          {activePoint && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-40">日期</div>
                <div className={`text-xs sm:text-sm font-medium ${themes[theme].text}`}>
                  {activePoint.date}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-40">
                  计算利润 (calculated_profit)
                </div>
                <div
                  className={`text-xs sm:text-sm font-bold font-mono ${
                    (activePoint.calculated_profit ?? 0) >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {(activePoint.calculated_profit ?? 0) >= 0 ? '+' : ''}
                  {formatMoney(activePoint.calculated_profit ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-40">期权总资产</div>
                <div className={`text-xs sm:text-sm font-mono ${themes[theme].text}`}>
                  {activePoint.option_account_assets !== null
                    ? formatMoney(activePoint.option_account_assets)
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-40">纯现金投入</div>
                <div className={`text-xs sm:text-sm font-mono ${themes[theme].text}`}>
                  {formatMoney(activePoint.pure_cash_investment)}
                </div>
              </div>
            </div>
          )}

          {/* 图表主容器与状态反馈 */}
          <div className="relative min-h-[220px] sm:min-h-[250px]">
            {isLoading && !cleanedPoints.length && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-inherit/80 backdrop-blur-sm z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2" />
                <span className={`text-xs ${themes[theme].text} opacity-70`}>
                  正在加载历史利润数据...
                </span>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!isLoading && !error && cleanedPoints.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center opacity-60">
                <Calendar className="w-10 h-10 mb-2 stroke-[1.5]" />
                <p className="text-sm font-medium">暂无历史利润数据</p>
                <p className="text-xs mt-1">当前账户尚未同步或生成计算利润快照</p>
              </div>
            )}

            <div
              ref={containerRef}
              className="w-full h-[220px] sm:h-[250px] relative transition-opacity duration-300"
              style={{ opacity: isLoading && !cleanedPoints.length ? 0.3 : 1 }}
            />
          </div>

          {/* 底部汇总指标统计 */}
          {displayPoints.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="p-2.5 rounded-xl bg-black/[0.015] dark:bg-white/[0.015] border border-black/5 dark:border-white/5">
                <div className="text-[10px] text-gray-500 dark:text-zinc-400">区间峰值收益</div>
                <div className="font-semibold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                  +{formatMoney(stats.max)}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-black/[0.015] dark:bg-white/[0.015] border border-black/5 dark:border-white/5">
                <div className="text-[10px] text-gray-500 dark:text-zinc-400">区间最低收益</div>
                <div className="font-semibold font-mono text-rose-600 dark:text-rose-400 mt-0.5">
                  {formatMoney(stats.min)}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-black/[0.015] dark:bg-white/[0.015] border border-black/5 dark:border-white/5">
                <div className="text-[10px] text-gray-500 dark:text-zinc-400">区间收益变动</div>
                <div
                  className={`font-semibold font-mono mt-0.5 ${
                    stats.diff >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {stats.diff >= 0 ? '+' : ''}
                  {formatMoney(stats.diff)}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-black/[0.015] dark:bg-white/[0.015] border border-black/5 dark:border-white/5">
                <div className="text-[10px] text-gray-500 dark:text-zinc-400">正收益占比</div>
                <div className={`font-semibold font-mono mt-0.5 ${themes[theme].text}`}>
                  {((stats.positiveCount / displayPoints.length) * 100).toFixed(1)}% (
                  {stats.positiveCount}/{displayPoints.length})
                </div>
              </div>
            </div>
          )}
        </div>
  );

  if (!showHeader) {
    return <div className={className}>{renderContent()}</div>;
  }

  return (
    <div
      className={`${themes[theme].card} ${themes[theme].border} border rounded-2xl ${cardShadow} transition-all duration-300 overflow-hidden ${className}`}
    >
      {/* 折叠卡片头部（默认处于此状态） */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="px-4 sm:px-6 py-4 flex items-center justify-between cursor-pointer select-none hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
              isProfitPositive
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            }`}
          >
            {isProfitPositive ? (
              <TrendingUp className="w-5 h-5" strokeWidth={2} />
            ) : (
              <TrendingDown className="w-5 h-5" strokeWidth={2} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-base font-semibold tracking-tight ${themes[theme].text}`}>
                历史盈亏走势
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                TradingView
              </span>
              {effectiveAccountAlias && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40">
                  {effectiveAccountAlias}
                </span>
              )}
              {isMainAccount && (
                <a
                  href={GOOGLE_SHEET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors shadow-xs"
                  title="数据同步来源: Google Sheet (点击打开原表格)"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Google Sheet 数据源</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              )}
            </div>
            <p className={`text-xs ${themes[theme].text} opacity-60 mt-0.5 truncate`}>
              平滑连接资金占用与期权收益快照流水 (calculated_profit)
            </p>
          </div>
        </div>

        {/* 右侧：最新关键指标徽章与展开箭头 */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 ml-3">
          {latestPoint && (
            <div className="text-right hidden xs:block">
              <div className="text-[10px] uppercase font-bold tracking-wider opacity-40">
                最新累计利润
              </div>
              <div
                className={`text-sm sm:text-base font-bold font-mono ${
                  (latestPoint.calculated_profit ?? 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {(latestPoint.calculated_profit ?? 0) >= 0 ? '+' : ''}
                {formatMoney(latestPoint.calculated_profit ?? 0)}
              </div>
            </div>
          )}

          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300 ${
              isExpanded ? 'rotate-180 bg-black/5 dark:bg-white/10' : 'bg-transparent'
            } ${themes[theme].text}`}
          >
            <ChevronDown className="w-5 h-5 opacity-70" />
          </div>
        </div>
      </div>

      {/* 展开后的主体内容 */}
      {isExpanded && renderContent()}
    </div>
  );
}
