import React from 'react';
import { format } from 'date-fns';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Calendar,
  Camera,
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import { stockService, isCloudflareEnv } from '../../../lib/services';
import { InfoTooltip } from '../../../shared/components';
import type { PortfolioKlineMetrics, PortfolioKlinePoint, TrendData } from '../../../lib/services/types';
import { formatCurrency, formatCompactCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { PortfolioKlineChart } from './PortfolioKlineChart';
import { calculateBenchmarkMetrics, BenchmarkMetrics, calculateSMA, resolvePortfolioKlineRequestDates } from './portfolioUtils';
import { SvgBatteryGauge, getBatteryTheme } from './StatsGrid';

export interface PortfolioTrendProps {
  trendData: TrendData[];
  klineData: PortfolioKlinePoint[];
  klineMetrics?: PortfolioKlineMetrics | null;
  theme: Theme;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange?: (range: { startDate: string; endDate: string }) => void;
  latestTrendValue?: number;
  totalHoldingsValue?: number;
  positionRatio?: number;
  totalProfitLoss?: number;
  remainingCash?: number;
  onRefresh?: () => void;
  onScreenshot?: () => void;
  isLoggedIn?: boolean;
  isSharedView?: boolean;
  portfolioUuid?: string | null;
}

interface SSEPoint {
  date: string;
  close: number;
  returnRate: number;
}

export function PortfolioTrend({
  trendData,
  klineData,
  klineMetrics,
  theme,
  dateRange,
  onDateRangeChange,
  latestTrendValue,
  totalHoldingsValue,
  positionRatio,
  totalProfitLoss,
  remainingCash,
  onRefresh,
  onScreenshot,
  isLoggedIn = true,
  isSharedView = false,
  portfolioUuid,
}: PortfolioTrendProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currencyConfig, getThemedColors } = useCurrency();
  const themedColors = getThemedColors(theme);
  const [sseData, setSseData] = React.useState<SSEPoint[]>([]);
  const [sseMetrics, setSseMetrics] = React.useState<BenchmarkMetrics | null>(null);
  const [isLoadingSSE, setIsLoadingSSE] = React.useState(false);
  const [showControls, setShowControls] = React.useState(false);
  const [showAllMetrics, setShowAllMetrics] = React.useState(false);
  const controlsRef = React.useRef<HTMLDivElement | null>(null);
  const controlsButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const searchParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedViewMode = (() => {
    const value = searchParams.get('trendView');
    return value === 'absolute' || value === 'return' || value === 'kline' ? value : 'kline';
  })();
  const klineSource = searchParams.get('trendSource') === 'position' ? 'position' : 'asset';
  const klinePriceMode = (() => {
    const value = searchParams.get('trendAdjust');
    return value === 'raw' || value === 'nav' || value === 'adjusted' ? value : 'adjusted';
  })();
  const showComparison = !isCloudflareEnv && searchParams.get('trendCompare') !== '0';
  const viewMode = requestedViewMode === 'kline' && klineData.length === 0 ? 'absolute' : requestedViewMode;

  const updateTrendParams = React.useCallback((updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });
    const query = nextParams.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  // Get active date range based on viewMode
  const activeSseRange = React.useMemo(() => {
    const { klineStartDate, klineEndDate } = resolvePortfolioKlineRequestDates(dateRange, location.search);
    return {
      startDate: viewMode === 'kline' ? klineStartDate : dateRange.startDate,
      endDate: viewMode === 'kline' ? klineEndDate : dateRange.endDate,
    };
  }, [dateRange, location.search, viewMode]);

  // Fetch comparison index data for return comparison
  React.useEffect(() => {
    if (isCloudflareEnv) {
      setIsLoadingSSE(false);
      setSseData([]);
      setSseMetrics(null);
      return;
    }

    const fetchSSEData = async () => {
      setIsLoadingSSE(true);
      try {
        const { data } = await stockService.getStockData('^SSEC');
        if (data) {
          // Filter SSE data to match the date range
          const startDate = new Date(activeSseRange.startDate);
          const endDate = new Date(activeSseRange.endDate);
          
          const filteredData = data.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate && itemDate <= endDate;
          });
          
          // Helper function to fill missing trading days for SSE data
          const fillMissingSSEDays = (input: SSEPoint[]): SSEPoint[] => {
            if (input.length === 0) return input;
            
            const filledData: SSEPoint[] = [];
            const sortedData = [...input].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            for (let i = 0; i < sortedData.length; i++) {
              filledData.push(sortedData[i]);
              
              // Fill gaps between current and next data point
              if (i < sortedData.length - 1) {
                const currentDate = new Date(sortedData[i].date);
                const nextDate = new Date(sortedData[i + 1].date);
                const daysDiff = Math.ceil((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                
                // If there's a gap of more than 1 day, fill with interpolated values
                if (daysDiff > 1) {
                  const currentPoint = sortedData[i];
                  const nextPoint = sortedData[i + 1];
                  
                  for (let j = 1; j < daysDiff; j++) {
                    const interpolationRatio = j / daysDiff;
                    const interpolatedDate = new Date(currentDate);
                    interpolatedDate.setDate(currentDate.getDate() + j);
                    
                    // Linear interpolation for smooth transitions
                    const interpolatedClose = currentPoint.close + 
                      (nextPoint.close - currentPoint.close) * interpolationRatio;
                    
                    filledData.push({
                      date: interpolatedDate.toISOString().split('T')[0],
                      close: interpolatedClose,
                      returnRate: 0 // Will be calculated later
                    });
                  }
                }
              }
            }
            
            return filledData;
          };
          
          // Calculate SSE metrics and return rates
          if (filteredData.length > 0) {
            // Calculate metrics using raw trading days
            const metrics = calculateBenchmarkMetrics(filteredData);
            setSseMetrics(metrics);
            
            // First fill missing days, then calculate returns
            const sseInputData: SSEPoint[] = filteredData.map(item => ({
              date: item.date,
              close: item.close,
              returnRate: 0,
            }));
            const smoothedSSEData = fillMissingSSEDays(sseInputData);
            const basePrice = filteredData[0].close;
            const sseReturnData = smoothedSSEData.map(item => ({
              date: item.date,
              close: item.close,
              returnRate: ((item.close - basePrice) / basePrice) * 100
            }));
            setSseData(sseReturnData);
          } else {
            setSseMetrics(null);
            setSseData([]);
          }
        }
      } catch (error) {
        console.error('Error fetching SSE data:', error);
        setSseMetrics(null);
      } finally {
        setIsLoadingSSE(false);
      }
    };

    if (trendData.length === 0) {
      return;
    }

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      fetchSSEData();
    };

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const id = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(run, { timeout: 2500 })
      : window.setTimeout(run, 0);

    return () => {
      cancelled = true;
      if (typeof w.cancelIdleCallback === 'function' && typeof id === 'number') {
        w.cancelIdleCallback(id);
      } else {
        clearTimeout(id);
      }
    };
  }, [activeSseRange, trendData.length]);

  React.useEffect(() => {
    if (!showControls) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (controlsRef.current?.contains(target) || controlsButtonRef.current?.contains(target)) {
        return;
      }
      setShowControls(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowControls(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showControls]);

  // Prepare chart data based on view mode
  const getChartData = () => {
    if (viewMode === 'return') {
      // Return rate view
      // Calculate portfolio returns based on first data point as baseline
      const portfolioReturns = trendData.length > 0 
        ? trendData.map(point => {
            const baseValue = trendData[0].value;
            return baseValue > 0 ? ((point.value - baseValue) / baseValue) * 100 : 0;
          })
        : [];
      
      const datasets: any[] = [
        {
          label: '总资产收益率',
          data: portfolioReturns,
          borderColor: themedColors.chart.upColor,
          backgroundColor: themedColors.chart.upColor + '33',
          fill: false,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 6,
          borderWidth: 2,
        }
      ];

      if (!isCloudflareEnv && portfolioReturns.length > 0) {
        const portfolioMA20 = calculateSMA(portfolioReturns, 20);
        datasets.push({
          label: '总资产收益率 (MA20)',
          data: portfolioMA20,
          borderColor: '#f59e0b', // Amber/orange
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [5, 5],
        });
      }

      // Add SSE comparison if available
      if (showComparison && sseData.length > 0) {
        // Match SSE data points with portfolio data points
        const matchedSSEReturns = trendData.map(portfolioPoint => {
          const portfolioDate = new Date(portfolioPoint.date).toISOString().split('T')[0];
          const ssePoint = sseData.find(sse => sse.date === portfolioDate);
          return ssePoint ? ssePoint.returnRate : null;
        });

        datasets.push({
          label: '上证指数收益率',
          data: matchedSSEReturns as Array<number | null>,
          borderColor: '#9ca3af',
          backgroundColor: '#9ca3af33',
          fill: false,
          tension: 0.4,
          pointRadius: 1,
          pointHoverRadius: 4,
          borderWidth: 1.5,
        });

        const sseMA20 = calculateSMA(matchedSSEReturns, 20);
        datasets.push({
          label: '上证指数收益率 (MA20)',
          data: sseMA20,
          borderColor: '#60a5fa', // Light blue
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [5, 5],
        });
      }

      return {
        labels: trendData.map(point => format(new Date(point.date), 'MMM d, yyyy')),
        datasets
      };
    } else {
      // Absolute value view (original)
      return {
        labels: trendData.map(point => format(new Date(point.date), 'MMM d, yyyy')),
        datasets: [
          {
            label: '总资产',
            data: trendData.map(point => point.value),
            borderColor: themedColors.chart.upColor,
            backgroundColor: themedColors.chart.upColor + '33',
            fill: false,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2,
          },
          {
            label: '持仓市值',
            data: trendData.map(point => point.position_value || 0),
            borderColor: themedColors.chart.downColor,
            backgroundColor: themedColors.chart.downColor + '33',
            fill: false,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2,
            borderDash: [5, 5],
          }
        ]
      };
    }
  };

  const lineChartData = viewMode === 'kline' ? null : getChartData() as any;

  const isDarkTheme = theme === 'dark';
  const isBlueTheme = theme === 'blue';
  const lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: viewMode === 'return',
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          boxWidth: 12,
          usePointStyle: true,
          pointStyle: 'rectRounded' as const,
          color: isDarkTheme ? '#cbd5e1' : (isBlueTheme ? '#334155' : '#475569'),
          font: {
            size: 11,
          },
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: isDarkTheme ? '#1f2937' : '#ffffff',
        titleColor: isDarkTheme ? '#f3f4f6' : (isBlueTheme ? '#1e293b' : '#374151'),
        bodyColor: isDarkTheme ? '#f3f4f6' : (isBlueTheme ? '#1e293b' : '#374151'),
        borderColor: isDarkTheme ? '#4b5563' : (isBlueTheme ? '#bfdbfe' : '#e5e7eb'),
        borderWidth: 1,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            if (viewMode === 'return') {
              const value = context.raw;
              return `${label}: ${value !== null ? (value >= 0 ? '+' : '') + value.toFixed(2) + '%' : 'N/A'}`;
            } else {
              const raw = typeof context.raw === 'number' ? context.raw : null;
              return `${label}: ${raw !== null ? formatCurrency(raw, currencyConfig) : 'N/A'}`;
            }
          },
          afterBody: (tooltipItems: any[]) => {
            if (viewMode === 'absolute' && tooltipItems.length >= 2) {
              const assetValue = typeof tooltipItems[0]?.raw === 'number' ? tooltipItems[0].raw : null;
              const positionValue = typeof tooltipItems[1]?.raw === 'number' ? tooltipItems[1].raw : null;
              if (assetValue !== null && positionValue !== null && assetValue > 0 && positionValue > 0) {
                const ratio = ((positionValue / assetValue) * 100).toFixed(2);
                return [`持仓比例: ${ratio}%`];
              }
            }
            return [];
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: isDarkTheme ? '#374151' : (isBlueTheme ? '#e0e7ff' : '#f1f5f9')
        },
        ticks: {
          color: isDarkTheme ? '#cbd5e1' : (isBlueTheme ? '#334155' : '#475569')
        }
      },
      y: {
        grid: {
          color: isDarkTheme ? '#374151' : (isBlueTheme ? '#e0e7ff' : '#f1f5f9')
        },
        ticks: {
          color: isDarkTheme ? '#cbd5e1' : (isBlueTheme ? '#334155' : '#475569'),
          callback: (value: number) => {
            if (viewMode === 'return') {
              return value.toFixed(1) + '%';
            } else {
              return formatCompactCurrency(value, currencyConfig);
            }
          }
        }
      }
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    hover: {
      mode: 'index' as const,
      intersect: false,
    }
  };

  const title = (() => {
    if (viewMode === 'kline') {
      return klineSource === 'position' ? '持仓市值 K 线' : '总资产 K 线';
    }
    return viewMode === 'return' ? '收益率趋势' : '资产趋势';
  })();
  const mobileTitle = (() => {
    if (viewMode === 'kline') {
      return klineSource === 'position' ? '持仓K线' : '总资产K线';
    }
    return viewMode === 'return' ? '收益率' : '趋势';
  })();

  const hasKlineFallback = requestedViewMode === 'kline' && klineData.length === 0;
  const toolbarPanelClass = `rounded-2xl border ${themes[theme].border} ${themes[theme].card} p-3 shadow-xl`;
  const segmentedGroupClass = `flex flex-wrap items-center gap-1 rounded-xl border ${themes[theme].border} ${themes[theme].card} p-1`;
  const toolbarLabelClass = `text-[11px] font-medium uppercase tracking-wide ${themes[theme].text} opacity-50`;
  const toolbarContextLabel = viewMode === 'kline' ? 'K 线设置' : '当前视图';
  const modeSummary = (() => {
    if (viewMode === 'kline') {
      if (klineSource === 'position') {
        return '持仓市值';
      }
      if (klinePriceMode === 'nav') {
        return '总资产 · NAV';
      }
      if (klinePriceMode === 'raw') {
        return '总资产 · 原始';
      }
      return '总资产 · 复权';
    }
    if (viewMode === 'return') {
      return showComparison ? '收益率 · 上证对比' : '收益率';
    }
    return '总资产 / 持仓双线';
  })();

  const formatSignedPercent = React.useCallback((value: number, digits = 2) => {
    if (!Number.isFinite(value)) return '--';
    const percent = value * 100;
    const sign = percent > 0 ? '+' : '';
    return `${sign}${percent.toFixed(digits)}%`;
  }, []);

  const formatPercent = React.useCallback((value: number, digits = 2) => {
    if (!Number.isFinite(value)) return '--';
    return `${(value * 100).toFixed(digits)}%`;
  }, []);

  const formatMetricNumber = React.useCallback((value: number, digits = 2) => {
    if (!Number.isFinite(value)) return '--';
    return value.toFixed(digits);
  }, []);

  const computedDrawdown = React.useMemo(() => {
    if (klineData.length === 0) return null;

    const series = klineData
      .map((point) => {
        let value: number | undefined;
        if (klineSource === 'position') {
          value = point.position_close ?? point.position_value;
        } else if (klinePriceMode === 'nav') {
          value = point.nav_close ?? point.nav_value ?? point.close;
        } else if (klinePriceMode === 'adjusted') {
          value = point.adjusted_close ?? point.adjusted_value;
        } else {
          value = point.close ?? point.value;
        }

        if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) {
          return null;
        }
        return {
          date: point.date,
          value: value,
        };
      })
      .filter((item): item is { date: string; value: number } => item !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (series.length === 0) return null;

    let maxDd = 0;
    let peakValue = series[0].value;
    let peakDate = series[0].date;

    let currentPeakValue = series[0].value;
    let currentPeakDate = series[0].date;

    let troughDate = series[0].date;
    let troughValue = series[0].value;

    for (let i = 1; i < series.length; i++) {
      const value = series[i].value;
      const date = series[i].date;

      if (value > currentPeakValue) {
        currentPeakValue = value;
        currentPeakDate = date;
      } else {
        const drawdown = (value - currentPeakValue) / currentPeakValue;
        if (drawdown < maxDd) {
          maxDd = drawdown;
          peakValue = currentPeakValue;
          peakDate = currentPeakDate;
          troughValue = value;
          troughDate = date;
        }
      }
    }

    return {
      maxDrawdown: maxDd,
      peakDate,
      troughDate,
      peakValue,
      troughValue,
    };
  }, [klineData, klinePriceMode, klineSource]);

  const getReturnColorClass = React.useCallback((val: number) => {
    if (val > 0) return 'text-green-600 dark:text-green-400';
    if (val < 0) return 'text-red-600 dark:text-red-400';
    return '';
  }, []);

  const metricsItems = React.useMemo(() => {
    if (!klineMetrics) return [];

    const allItems = [
      {
        label: '年化收益',
        value: formatSignedPercent(klineMetrics.annualizedReturn),
        valueClass: getReturnColorClass(klineMetrics.annualizedReturn),
        tooltip: '把当前统计区间的收益按全年口径折算后的预期收益率，便于和不同周期结果横向比较。',
        sseValue: sseMetrics ? formatSignedPercent(sseMetrics.annualizedReturn) : undefined,
        sseValueClass: sseMetrics ? getReturnColorClass(sseMetrics.annualizedReturn) : undefined,
      },
      {
        label: '年化波动',
        value: formatPercent(klineMetrics.annualizedVolatility),
        tooltip: '收益率波动幅度按全年口径折算后的结果。数值越高，代表组合净值起伏越大。',
        sseValue: sseMetrics ? formatPercent(sseMetrics.annualizedVolatility) : undefined,
      },
      {
        label: 'Sharpe',
        value: formatMetricNumber(klineMetrics.sharpeRatio),
        tooltip: '单位波动所获得的超额收益能力。一般越高越好，表示风险调整后的收益更优。',
        sseValue: sseMetrics ? formatMetricNumber(sseMetrics.sharpeRatio) : undefined,
      },
      {
        label: 'Calmar',
        value: formatMetricNumber(klineMetrics.calmarRatio),
        tooltip: '年化收益与最大回撤的比值，用来衡量收益相对回撤的效率。一般越高越好。',
        sseValue: sseMetrics ? formatMetricNumber(sseMetrics.calmarRatio) : undefined,
      },
      {
        label: '区间收益',
        value: formatSignedPercent(klineMetrics.totalReturn),
        valueClass: getReturnColorClass(klineMetrics.totalReturn),
        tooltip: '从统计起点到终点的累计收益率，直接反映当前观察区间内整体赚亏。',
        sseValue: sseMetrics ? formatSignedPercent(sseMetrics.totalReturn) : undefined,
        sseValueClass: sseMetrics ? getReturnColorClass(sseMetrics.totalReturn) : undefined,
      },
      {
        label: '最大回撤',
        value: formatSignedPercent(klineMetrics.maxDrawdown),
        valueClass: getReturnColorClass(klineMetrics.maxDrawdown),
        tooltip: '区间内从阶段高点回落到随后低点的最大跌幅，用来衡量最差回撤风险。',
        subtitle: computedDrawdown && computedDrawdown.maxDrawdown < 0
          ? `${computedDrawdown.peakDate} ~ ${computedDrawdown.troughDate}`
          : undefined,
        sseValue: sseMetrics ? formatSignedPercent(sseMetrics.maxDrawdown) : undefined,
        sseValueClass: sseMetrics ? getReturnColorClass(sseMetrics.maxDrawdown) : undefined,
      },
      {
        label: '正收益日',
        value: formatPercent(klineMetrics.positiveDayRatio, 1),
        tooltip: '统计区间内收益为正的交易日占比，反映组合日度上涨天数的比例。',
        sseValue: sseMetrics ? formatPercent(sseMetrics.positiveDayRatio, 1) : undefined,
      },
    ];

    if (!showAllMetrics) {
      return allItems.filter(item => item.label === '区间收益' || item.label === '最大回撤');
    }
    return allItems;
  }, [formatMetricNumber, formatPercent, formatSignedPercent, klineMetrics, computedDrawdown, sseMetrics, showAllMetrics]);

  const isMergedOverview = latestTrendValue !== undefined;
  const estimatedCost = (totalHoldingsValue ?? 0) - (totalProfitLoss ?? 0);
  const pnlPercentage =
    estimatedCost > 0 && totalProfitLoss !== undefined
      ? (totalProfitLoss / estimatedCost) * 100
      : null;
  const clampedRatio = positionRatio !== undefined ? Math.min(100, Math.max(0, positionRatio)) : 0;
  const cashRatio = Math.max(0, 100 - clampedRatio);
  const batteryConfig = getBatteryTheme(clampedRatio, theme);

  const dateCapsuleBg =
    theme === 'dark'
      ? 'bg-gray-800/70 border-gray-700/80 text-gray-200'
      : theme === 'blue'
      ? 'bg-blue-900/40 border-blue-800/80 text-blue-100'
      : 'bg-slate-100/90 border-slate-200/90 text-slate-700';

  const dateInputStyle =
    theme === 'dark'
      ? 'text-gray-100 focus:text-white'
      : theme === 'blue'
      ? 'text-blue-50 focus:text-white'
      : 'text-slate-800 focus:text-slate-900';

  return (
    <>
      <div className="p-2 sm:p-3 md:p-6">
        <div className="relative mb-3 md:mb-4">
          {isMergedOverview ? (
            <div>
              {/* 移动端专属优雅紧凑看板 (< md) */}
              <div className="md:hidden space-y-2">
                {/* 第 1 行：左侧“总资产”微标签 + 右侧日期微胶囊与紧凑快捷操作 */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wider opacity-60">总资产</span>
                    <InfoTooltip
                      theme={theme}
                      content="优先使用最新一条总资产趋势数据，表示组合在当前时点的总资产估值。"
                      align="left"
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* 紧凑日期胶囊 */}
                    {onDateRangeChange && isLoggedIn && (!isSharedView || portfolioUuid) && (
                      <div
                        className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg border text-[10px] shadow-2xs ${dateCapsuleBg}`}
                      >
                        <Calendar className="w-2.5 h-2.5 opacity-50 shrink-0" />
                        <input
                          type="date"
                          value={dateRange.startDate}
                          onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
                          className={`bg-transparent border-0 p-0 text-[10px] font-medium font-mono focus:ring-0 focus:outline-none cursor-pointer w-[68px] text-center ${dateInputStyle}`}
                          title="开始日期"
                        />
                        <span className="opacity-40 text-[9px] select-none">~</span>
                        <input
                          type="date"
                          value={dateRange.endDate}
                          onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
                          className={`bg-transparent border-0 p-0 text-[10px] font-medium font-mono focus:ring-0 focus:outline-none cursor-pointer w-[68px] text-center ${dateInputStyle}`}
                          title="结束日期"
                        />
                      </div>
                    )}

                    {/* 刷新按钮 / 静态同步状态 */}
                    {onRefresh && (
                      <button
                        type="button"
                        onClick={onRefresh}
                        className={`p-1 rounded-lg border text-xs btn-tactile ${themes[theme].secondary} border-slate-200/80 dark:border-gray-800 hover:opacity-90 active:scale-95 transition-all shadow-2xs hide-in-screenshot`}
                        title="刷新数据"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )}

                    {/* 截图按钮 */}
                    {onScreenshot && (
                      <button
                        type="button"
                        onClick={onScreenshot}
                        className={`p-1 rounded-lg border text-xs btn-tactile ${themes[theme].secondary} border-slate-200/80 dark:border-gray-800 hover:opacity-90 active:scale-95 transition-all shadow-2xs hide-in-screenshot`}
                        title="分享截图"
                      >
                        <Camera className="w-3 h-3" />
                      </button>
                    )}

                    {/* 图表设置抽屉按钮 */}
                    <button
                      ref={controlsButtonRef}
                      type="button"
                      onClick={() => setShowControls((value) => !value)}
                      className={`inline-flex shrink-0 items-center justify-center rounded-lg border p-1 ${themes[theme].secondary} border-slate-200/80 dark:border-gray-800`}
                      aria-label="图表设置"
                      title="图表设置"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* 第 2 行：总资产大数字 + 紧随其后的浮盈胶囊 */}
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <div
                    className={`text-2xl font-extrabold font-mono tracking-tight tabular-nums leading-none ${themes[theme].text}`}
                    title={formatCurrency(latestTrendValue, currencyConfig)}
                  >
                    {formatCurrency(latestTrendValue, currencyConfig)}
                  </div>
                  {totalProfitLoss !== undefined && (
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono border ${
                        totalProfitLoss >= 0
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {totalProfitLoss >= 0 ? (
                        <TrendingUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <TrendingDown className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {totalProfitLoss >= 0 ? '+' : ''}
                        {formatCurrency(totalProfitLoss, currencyConfig)}
                      </span>
                      {pnlPercentage !== null && (
                        <span>
                          ({pnlPercentage >= 0 ? '+' : ''}
                          {pnlPercentage.toFixed(2)}%)
                        </span>
                      )}
                      <span className="text-[9px] font-normal opacity-70 ml-0.5">浮动盈亏</span>
                    </div>
                  )}
                </div>

                {/* 第 3 行：精工 3 列资产微看板 (告别换行与多余管道符号) */}
                <div className="pt-2 border-t border-dashed border-slate-200/80 dark:border-gray-800 grid grid-cols-3 gap-1.5 text-left">
                  {/* 持仓市值 */}
                  <div className="min-w-0 pr-1">
                    <div className="text-[10px] text-slate-500 dark:text-gray-400 truncate">持仓市值</div>
                    <div
                      className={`text-xs font-bold font-mono truncate mt-0.5 ${themes[theme].text}`}
                      title={totalHoldingsValue !== undefined ? formatCurrency(totalHoldingsValue, currencyConfig) : '--'}
                    >
                      {totalHoldingsValue !== undefined ? formatCurrency(totalHoldingsValue, currencyConfig) : '--'}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                      {clampedRatio.toFixed(1)}% 仓位
                    </div>
                  </div>

                  {/* 可用现金 */}
                  <div className="min-w-0 border-l border-slate-200/60 dark:border-gray-800 pl-1.5 pr-1">
                    <div className="text-[10px] text-slate-500 dark:text-gray-400 truncate">可用现金</div>
                    <div
                      className={`text-xs font-bold font-mono truncate mt-0.5 ${themes[theme].text}`}
                      title={remainingCash !== undefined ? formatCurrency(remainingCash, currencyConfig) : '--'}
                    >
                      {remainingCash !== undefined ? formatCurrency(remainingCash, currencyConfig) : '--'}
                    </div>
                    <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-medium">
                      {cashRatio.toFixed(1)}% 现金
                    </div>
                  </div>

                  {/* 仓位水平 */}
                  <div className="min-w-0 border-l border-slate-200/60 dark:border-gray-800 pl-1.5">
                    <div className="text-[10px] text-slate-500 dark:text-gray-400 truncate">仓位水平</div>
                    <div className="flex items-center gap-1 mt-1">
                      <SvgBatteryGauge ratio={clampedRatio} config={batteryConfig} theme={theme} />
                      <span className={`text-[11px] font-semibold ${batteryConfig.textClass}`}>
                        {batteryConfig.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 桌面端高密度金融看板 (md:block) */}
              <div className="hidden md:block">
                {/* 第一行：左侧总资产金额与浮动盈亏 + 右侧操作工具栏与主视图切换 */}
                <div className="flex items-center justify-between gap-3">
                  {/* 左侧：总资产与浮动盈亏 */}
                  <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
                    <div className="flex items-center gap-1.5 mr-1">
                      <span className="text-xs font-semibold uppercase tracking-wider opacity-60">总资产</span>
                      <InfoTooltip
                        theme={theme}
                        content="优先使用最新一条总资产趋势数据，表示组合在当前时点的总资产估值。"
                        align="left"
                      />
                    </div>
                    <div
                      className={`text-2xl lg:text-3xl font-extrabold font-mono tracking-tight tabular-nums ${themes[theme].text}`}
                      title={formatCurrency(latestTrendValue, currencyConfig)}
                    >
                      {formatCurrency(latestTrendValue, currencyConfig)}
                    </div>
                    {totalProfitLoss !== undefined && (
                      <div
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono border ${
                          totalProfitLoss >= 0
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {totalProfitLoss >= 0 ? (
                          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {totalProfitLoss >= 0 ? '+' : ''}
                          {formatCurrency(totalProfitLoss, currencyConfig)}
                        </span>
                        {pnlPercentage !== null && (
                          <span>
                            ({pnlPercentage >= 0 ? '+' : ''}
                            {pnlPercentage.toFixed(2)}%)
                          </span>
                        )}
                        <span className="text-[10px] font-normal opacity-70 ml-0.5">浮动盈亏</span>
                      </div>
                    )}
                  </div>

                  {/* 右侧：视图切换、时间范围胶囊、刷新与截图 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 桌面端内联视图切换 */}
                    <div className="flex items-center gap-1 rounded-xl border p-1 bg-black/5 dark:bg-white/5 border-slate-200/80 dark:border-gray-800">
                      <button
                        onClick={() => updateTrendParams({ trendView: 'kline' })}
                        disabled={klineData.length === 0}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          viewMode === 'kline' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                        } ${klineData.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        K 线
                      </button>
                      <button
                        onClick={() => updateTrendParams({ trendView: 'absolute' })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          viewMode === 'absolute' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        绝对值
                      </button>
                      <button
                        onClick={() => updateTrendParams({ trendView: 'return' })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          viewMode === 'return' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        收益率
                      </button>
                    </div>

                    {/* 日期选择胶囊 */}
                    {onDateRangeChange && isLoggedIn && (!isSharedView || portfolioUuid) && (
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs shadow-2xs ${dateCapsuleBg}`}
                      >
                        <Calendar className="w-3.5 h-3.5 opacity-50 shrink-0" />
                        <input
                          type="date"
                          value={dateRange.startDate}
                          onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
                          className={`bg-transparent border-0 p-0 text-xs font-medium font-mono focus:ring-0 focus:outline-none cursor-pointer ${dateInputStyle}`}
                          title="开始日期"
                        />
                        <span className="opacity-40 text-xs select-none">至</span>
                        <input
                          type="date"
                          value={dateRange.endDate}
                          onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
                          className={`bg-transparent border-0 p-0 text-xs font-medium font-mono focus:ring-0 focus:outline-none cursor-pointer ${dateInputStyle}`}
                          title="结束日期"
                        />
                      </div>
                    )}

                    {/* 操作按钮组 */}
                    <div className="flex items-center gap-1.5">
                      {onRefresh && (
                        <button
                          type="button"
                          onClick={onRefresh}
                          className={`p-1.5 rounded-xl border text-xs btn-tactile ${themes[theme].secondary} border-slate-200/80 dark:border-gray-800 hover:opacity-90 active:scale-95 transition-all shadow-2xs hide-in-screenshot`}
                          title="刷新数据"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onScreenshot && (
                        <button
                          type="button"
                          onClick={onScreenshot}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs btn-tactile ${themes[theme].secondary} border-slate-200/80 dark:border-gray-800 hover:opacity-90 active:scale-95 transition-all shadow-2xs hide-in-screenshot`}
                          title="分享截图"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>截图</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 第二行：紧凑型资产构成指标条 (持仓市值 + 剩余现金 + 仓位电池 + 桌面端子选项) */}
                <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200/80 dark:border-gray-800 flex items-center justify-between gap-4 text-xs">
                  {/* 左侧三大微指标 */}
                  <div className="flex items-center gap-x-4">
                    {totalHoldingsValue !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 dark:text-gray-400">持仓市值</span>
                        <span className={`font-semibold font-mono ${themes[theme].text}`}>
                          {formatCurrency(totalHoldingsValue, currencyConfig)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {clampedRatio.toFixed(1)}%
                        </span>
                      </div>
                    )}

                    {remainingCash !== undefined && (
                      <>
                        <span className="text-zinc-300 dark:text-zinc-700 select-none">|</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 dark:text-gray-400">可用现金</span>
                          <span className={`font-semibold font-mono ${themes[theme].text}`}>
                            {formatCurrency(remainingCash, currencyConfig)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md font-mono font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            {cashRatio.toFixed(1)}%
                          </span>
                        </div>
                      </>
                    )}

                    {positionRatio !== undefined && (
                      <>
                        <span className="text-zinc-300 dark:text-zinc-700 select-none">|</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 dark:text-gray-400">仓位水平</span>
                          <SvgBatteryGauge ratio={clampedRatio} config={batteryConfig} theme={theme} />
                          <span className={`text-[11px] font-semibold ${batteryConfig.textClass}`}>
                            {batteryConfig.label}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 右侧：K线子选项 (总资产/持仓市值/复权) 或 上证对比 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {viewMode === 'kline' && (
                      <div className="flex items-center gap-1 rounded-xl border p-0.5 bg-black/5 dark:bg-white/5 border-slate-200/80 dark:border-gray-800 text-[11px]">
                        <button
                          onClick={() => updateTrendParams({ trendSource: 'asset' })}
                          className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                            klineSource === 'asset' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          总资产
                        </button>
                        <button
                          onClick={() => updateTrendParams({ trendSource: 'position' })}
                          className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                            klineSource === 'position' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          持仓市值
                        </button>
                        {klineSource === 'asset' && (
                          <button
                            onClick={() => updateTrendParams({ trendAdjust: klinePriceMode === 'adjusted' ? 'raw' : 'adjusted' })}
                            className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                              klinePriceMode === 'adjusted' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                            }`}
                          >
                            复权
                          </button>
                        )}
                      </div>
                    )}

                    {viewMode === 'return' && !isCloudflareEnv && (
                      <button
                        onClick={() => updateTrendParams({ trendCompare: showComparison ? '0' : '1' })}
                        disabled={isLoadingSSE}
                        className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-all ${
                          showComparison ? themes[theme].primary : `${themes[theme].secondary} border-slate-200/80 dark:border-gray-800`
                        } ${isLoadingSSE ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isLoadingSSE ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <BarChart3 className="w-3 h-3" />
                            上证对比
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={`text-base sm:text-lg md:text-xl font-semibold ${themes[theme].text} whitespace-nowrap`}>
                  <span className="sm:hidden">{mobileTitle}</span>
                  <span className="hidden sm:inline">{title}</span>
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                  <span className={`rounded-full px-2 py-0.5 whitespace-nowrap ${themes[theme].secondary}`}>
                    {modeSummary}
                  </span>
                  {!isCloudflareEnv && hasKlineFallback && (
                    <span className={`${themes[theme].text} opacity-60`}>
                      当前账户暂无 K 线接口数据，已自动回退到折线趋势视图。
                    </span>
                  )}
                </div>
              </div>

              {/* 桌面端内联工具栏 */}
              <div className="hidden md:flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 rounded-xl border p-1 bg-black/5 dark:bg-white/5 border-slate-200/80 dark:border-gray-800">
                  <button
                    onClick={() => updateTrendParams({ trendView: 'kline' })}
                    disabled={klineData.length === 0}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      viewMode === 'kline' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                    } ${klineData.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    K 线
                  </button>
                  <button
                    onClick={() => updateTrendParams({ trendView: 'absolute' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      viewMode === 'absolute' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    绝对值
                  </button>
                  <button
                    onClick={() => updateTrendParams({ trendView: 'return' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      viewMode === 'return' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    收益率
                  </button>
                </div>

                {viewMode === 'kline' && (
                  <div className="flex items-center gap-1 rounded-xl border p-1 bg-black/5 dark:bg-white/5 border-slate-200/80 dark:border-gray-800">
                    <button
                      onClick={() => updateTrendParams({ trendSource: 'asset' })}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                        klineSource === 'asset' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      总资产
                    </button>
                    <button
                      onClick={() => updateTrendParams({ trendSource: 'position' })}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                        klineSource === 'position' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      持仓市值
                    </button>
                    {klineSource === 'asset' && (
                      <button
                        onClick={() => updateTrendParams({ trendAdjust: klinePriceMode === 'adjusted' ? 'raw' : 'adjusted' })}
                        className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                          klinePriceMode === 'adjusted' ? themes[theme].primary : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        复权
                      </button>
                    )}
                  </div>
                )}

                {viewMode === 'return' && !isCloudflareEnv && (
                  <button
                    onClick={() => updateTrendParams({ trendCompare: showComparison ? '0' : '1' })}
                    disabled={isLoadingSSE}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1 transition-all ${
                      showComparison ? themes[theme].primary : `${themes[theme].secondary} border-slate-200/80 dark:border-gray-800`
                    } ${isLoadingSSE ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isLoadingSSE ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <BarChart3 className="w-3.5 h-3.5" />
                        上证对比
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* 移动端菜单按钮 (< md) */}
              <button
                ref={controlsButtonRef}
                type="button"
                onClick={() => setShowControls((value) => !value)}
                className={`md:hidden inline-flex shrink-0 items-center justify-center rounded-full border p-2 ${themes[theme].secondary} border-transparent`}
                aria-label="图表设置"
                title="图表设置"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          )}

          {showControls && (
            <div
              ref={controlsRef}
              className="absolute left-0 right-0 top-full z-20 mt-3 sm:left-auto sm:w-[22rem]"
            >
              <div className={toolbarPanelClass}>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className={toolbarLabelClass}>图表类型</div>
                    <div className={segmentedGroupClass}>
                      <button
                        onClick={() => updateTrendParams({ trendView: 'kline' })}
                        disabled={klineData.length === 0}
                        className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
                          viewMode === 'kline' ? themes[theme].primary : themes[theme].secondary
                        } ${klineData.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        K 线
                      </button>
                      <button
                        onClick={() => updateTrendParams({ trendView: 'absolute' })}
                        className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
                          viewMode === 'absolute' ? themes[theme].primary : themes[theme].secondary
                        }`}
                      >
                        绝对值
                      </button>
                      <button
                        onClick={() => updateTrendParams({ trendView: 'return' })}
                        className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
                          viewMode === 'return' ? themes[theme].primary : themes[theme].secondary
                        }`}
                      >
                        收益率
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className={toolbarLabelClass}>{toolbarContextLabel}</div>
                    {viewMode === 'kline' ? (
                      <div className={segmentedGroupClass}>
                        <button
                          onClick={() => updateTrendParams({ trendSource: 'asset' })}
                          className={`px-3 py-1.5 rounded-lg text-sm ${
                            klineSource === 'asset' ? themes[theme].primary : themes[theme].secondary
                          }`}
                        >
                          总资产
                        </button>
                        <button
                          onClick={() => updateTrendParams({ trendSource: 'position' })}
                          className={`px-3 py-1.5 rounded-lg text-sm ${
                            klineSource === 'position' ? themes[theme].primary : themes[theme].secondary
                          }`}
                        >
                          持仓市值
                        </button>
                        {klineSource === 'asset' && (
                          <button
                            onClick={() => updateTrendParams({ trendAdjust: klinePriceMode === 'adjusted' ? 'raw' : 'adjusted' })}
                            className={`px-3 py-1.5 rounded-lg text-sm ${
                              klinePriceMode === 'adjusted' ? themes[theme].primary : themes[theme].secondary
                            }`}
                          >
                            复权
                          </button>
                        )}
                      </div>
                    ) : viewMode === 'return' ? (
                      !isCloudflareEnv ? (
                        <div className={segmentedGroupClass}>
                          <button
                            onClick={() => updateTrendParams({ trendCompare: showComparison ? '0' : '1' })}
                            disabled={isLoadingSSE}
                            className={`px-3 py-1.5 rounded-lg text-sm inline-flex items-center ${
                              showComparison ? themes[theme].primary : themes[theme].secondary
                            } ${isLoadingSSE ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isLoadingSSE ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <BarChart3 className="w-4 h-4 mr-1" />
                                上证对比
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className={`rounded-xl border border-dashed ${themes[theme].border} px-3 py-2 text-sm ${themes[theme].text} opacity-60`}>
                          总资产累计收益走势
                        </div>
                      )
                    ) : (
                      <div className={`rounded-xl border border-dashed ${themes[theme].border} px-3 py-2 text-sm ${themes[theme].text} opacity-60`}>
                        显示总资产与持仓市值双线
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        {viewMode === 'kline' ? (
          <div className="-mx-2 sm:mx-0">
            <PortfolioKlineChart
              klineData={klineData}
              theme={theme}
              source={klineSource}
              priceMode={klinePriceMode}
              sseData={showComparison ? sseData : []}
            />
          </div>
        ) : (
          <div className="h-[250px] md:h-[300px]">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        )}

        {klineMetrics && metricsItems.length > 0 && (
          <div className={`mt-3 rounded-xl border ${themes[theme].border} ${themes[theme].card} p-3 ${!showAllMetrics ? 'border-dashed' : 'shadow-sm'} no-print transition-all duration-200`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${themes[theme].text} whitespace-nowrap`}>
                    <span className="hidden sm:inline">组合表现指标</span>
                    <span className="inline sm:hidden">表现</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllMetrics(!showAllMetrics)}
                    className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 hover:underline text-[11px] sm:text-xs font-medium select-none whitespace-nowrap"
                  >
                    <span className="hidden sm:inline">{showAllMetrics ? "收起指标" : "展开全部"}</span>
                    <span className="inline sm:hidden">{showAllMetrics ? "收起" : "展开"}</span>
                    {showAllMetrics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <InfoTooltip
                    theme={theme}
                    align="left"
                    content="这些指标基于当前 K 线统计窗口和有效交易日计算，用来帮助你从收益、波动和回撤几个角度评估组合表现。"
                  />
                </div>
                
                {!showAllMetrics && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <span className={`${themes[theme].text} opacity-70 text-[11px] sm:text-xs whitespace-nowrap`}>
                      <span className="hidden sm:inline">区间收益 </span>
                      <span className="inline sm:hidden">收益 </span>
                      <span className={`font-bold ${getReturnColorClass(klineMetrics.totalReturn)}`}>
                        {formatSignedPercent(klineMetrics.totalReturn)}
                      </span>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <span className={`${themes[theme].text} opacity-70 text-[11px] sm:text-xs whitespace-nowrap`}>
                      <span className="hidden sm:inline">最大回撤 </span>
                      <span className="inline sm:hidden">回撤 </span>
                      <span className={`font-bold ${getReturnColorClass(klineMetrics.maxDrawdown)}`}>
                        {formatSignedPercent(klineMetrics.maxDrawdown)}
                      </span>
                    </span>
                    <span className={`text-[10px] ${themes[theme].text} opacity-40 hidden md:inline`}>
                      ({klineMetrics.calculationStartDate} ~ {klineMetrics.calculationEndDate} · {klineMetrics.tradingDays} 交易日)
                    </span>
                  </>
                )}
              </div>

              {showAllMetrics && (
                <div className={`text-[11px] ${themes[theme].text} opacity-60`}>
                  {klineMetrics.calculationStartDate} ~ {klineMetrics.calculationEndDate}
                  {' · '}
                  {klineMetrics.calculationDays} 天
                  {' · '}
                  {klineMetrics.tradingDays} 交易日
                  {' · '}
                  {klineMetrics.observations} 点
                  {(klineMetrics.calculationStartDate !== klineMetrics.startDate ||
                    klineMetrics.calculationEndDate !== klineMetrics.endDate) && (
                    <>
                      {' · '}
                      有效区间 {klineMetrics.startDate} ~ {klineMetrics.endDate}
                    </>
                  )}
                  {(klineMetrics.annualizedCalculationStartDate !== klineMetrics.calculationStartDate ||
                    klineMetrics.annualizedCalculationEndDate !== klineMetrics.calculationEndDate ||
                    klineMetrics.annualizedCalculationDays !== klineMetrics.calculationDays) && (
                    <>
                      {' · '}
                      年化窗口 {klineMetrics.annualizedCalculationStartDate} ~ {klineMetrics.annualizedCalculationEndDate}
                    </>
                  )}
                </div>
              )}
            </div>

            {showAllMetrics && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                {metricsItems.map((item) => (
                  <div
                    key={item.label}
                    className={`min-w-0 rounded-xl border ${themes[theme].border} ${themes[theme].secondary} px-3 py-2 flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-start gap-1">
                        <div className={`min-w-0 flex-1 text-[11px] leading-tight whitespace-normal break-words ${themes[theme].text} opacity-60`}>
                          {item.label}
                        </div>
                        <InfoTooltip theme={theme} content={item.tooltip} align="left" className="shrink-0" />
                      </div>

                      {item.sseValue !== undefined ? (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-baseline justify-between gap-1.5">
                            <span className={`text-[10px] ${themes[theme].text} opacity-50`}>组合</span>
                            <span className={`break-words text-sm font-semibold ${item.valueClass || themes[theme].text}`}>{item.value}</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-1.5 border-t border-dashed border-gray-500/10 pt-1">
                            <span className={`text-[10px] ${themes[theme].text} opacity-50`}>上证</span>
                            <span className={`break-words text-xs font-semibold ${item.sseValueClass || themes[theme].text}`}>{item.sseValue}</span>
                          </div>
                        </div>
                      ) : (
                        <div className={`mt-1.5 break-words text-base font-bold ${item.valueClass || themes[theme].text}`}>{item.value}</div>
                      )}
                    </div>

                    {item.subtitle && (
                      <div className={`mt-1.5 text-[9px] font-mono leading-tight ${themes[theme].text} opacity-50 whitespace-normal break-all`}>
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
