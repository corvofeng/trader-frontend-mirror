import React from 'react';
import { format } from 'date-fns';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import { stockService } from '../../../lib/services';
import { InfoTooltip } from '../../../shared/components';
import type { PortfolioKlineMetrics, PortfolioKlinePoint, TrendData } from '../../../lib/services/types';
import { formatCurrency, formatCompactCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { PortfolioKlineChart } from './PortfolioKlineChart';

interface PortfolioTrendProps {
  trendData: TrendData[];
  klineData: PortfolioKlinePoint[];
  klineMetrics?: PortfolioKlineMetrics | null;
  theme: Theme;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

interface SSEPoint {
  date: string;
  close: number;
  returnRate: number;
}

export function PortfolioTrend({ trendData, klineData, klineMetrics, theme, dateRange }: PortfolioTrendProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currencyConfig, getThemedColors } = useCurrency();
  const themedColors = getThemedColors(theme);
  const [sseData, setSseData] = React.useState<SSEPoint[]>([]);
  const [isLoadingSSE, setIsLoadingSSE] = React.useState(false);
  const [showControls, setShowControls] = React.useState(false);
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
  const showComparison = searchParams.get('trendCompare') !== '0';
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

  // Fetch comparison index data for return comparison
  React.useEffect(() => {
    const fetchSSEData = async () => {
      setIsLoadingSSE(true);
      try {
        const { data } = await stockService.getStockData('^SSEC');
        if (data) {
          // Filter SSE data to match the date range
          const startDate = new Date(dateRange.startDate);
          const endDate = new Date(dateRange.endDate);
          
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
          
          // Calculate SSE return rates
          if (filteredData.length > 0) {
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
          }
        }
      } catch (error) {
        console.error('Error fetching SSE data:', error);
      } finally {
        setIsLoadingSSE(false);
      }
    };

    if (viewMode !== 'return' || !showComparison || trendData.length === 0) {
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
  }, [dateRange, showComparison, trendData.length, viewMode]);

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
          borderDash: [3, 3],
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
        display: false,
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

  const metricsItems = React.useMemo(() => {
    if (!klineMetrics) return [];
    return [
      {
        label: '年化收益',
        value: formatSignedPercent(klineMetrics.annualizedReturn),
        tooltip: '把当前统计区间的收益按全年口径折算后的预期收益率，便于和不同周期结果横向比较。',
      },
      {
        label: '年化波动',
        value: formatPercent(klineMetrics.annualizedVolatility),
        tooltip: '收益率波动幅度按全年口径折算后的结果。数值越高，代表组合净值起伏越大。',
      },
      {
        label: 'Sharpe',
        value: formatMetricNumber(klineMetrics.sharpeRatio),
        tooltip: '单位波动所获得的超额收益能力。一般越高越好，表示风险调整后的收益更优。',
      },
      {
        label: 'Calmar',
        value: formatMetricNumber(klineMetrics.calmarRatio),
        tooltip: '年化收益与最大回撤的比值，用来衡量收益相对回撤的效率。一般越高越好。',
      },
      {
        label: '区间收益',
        value: formatSignedPercent(klineMetrics.totalReturn),
        tooltip: '从统计起点到终点的累计收益率，直接反映当前观察区间内整体赚亏。',
      },
      {
        label: '最大回撤',
        value: formatSignedPercent(klineMetrics.maxDrawdown),
        tooltip: '区间内从阶段高点回落到随后低点的最大跌幅，用来衡量最差回撤风险。',
        subtitle: computedDrawdown && computedDrawdown.maxDrawdown < 0
          ? `${computedDrawdown.peakDate} ~ ${computedDrawdown.troughDate}`
          : undefined,
      },
      {
        label: '正收益日',
        value: formatPercent(klineMetrics.positiveDayRatio, 1),
        tooltip: '统计区间内收益为正的交易日占比，反映组合日度上涨天数的比例。',
      },
    ];
  }, [formatMetricNumber, formatPercent, formatSignedPercent, klineMetrics, computedDrawdown]);

  return (
    <>
      <div className="p-2 sm:p-3 md:p-6">
        <div className="relative mb-3 md:mb-4">
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
                {hasKlineFallback && (
                  <span className={`${themes[theme].text} opacity-60`}>
                    当前账户暂无 K 线接口数据，已自动回退到折线趋势视图。
                  </span>
                )}
              </div>
            </div>

            <button
              ref={controlsButtonRef}
              type="button"
              onClick={() => setShowControls((value) => !value)}
              className={`inline-flex shrink-0 items-center justify-center rounded-full border p-2 ${themes[theme].secondary} border-transparent`}
              aria-label="图表设置"
              title="图表设置"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

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
          <div className="space-y-3">
            <PortfolioKlineChart
              klineData={klineData}
              theme={theme}
              source={klineSource}
              priceMode={klinePriceMode}
            />
            {klineMetrics && metricsItems.length > 0 && (
              <div className={`rounded-2xl border ${themes[theme].border} ${themes[theme].card} p-3 shadow-sm`}>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`text-sm font-semibold ${themes[theme].text}`}>组合表现指标</div>
                    <InfoTooltip
                      theme={theme}
                      align="left"
                      content="这些指标基于当前 K 线统计窗口和有效交易日计算，用来帮助你从收益、波动和回撤几个角度评估组合表现。"
                    />
                  </div>
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
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                  {metricsItems.map((item) => (
                    <div
                      key={item.label}
                      className={`min-w-0 rounded-xl border ${themes[theme].border} ${themes[theme].secondary} px-3 py-2`}
                    >
                      <div className="flex items-start gap-1">
                        <div className={`min-w-0 flex-1 text-[11px] leading-tight whitespace-normal break-words ${themes[theme].text} opacity-60`}>
                          {item.label}
                        </div>
                        <InfoTooltip theme={theme} content={item.tooltip} align="left" className="shrink-0" />
                      </div>
                      <div className={`mt-1 break-words text-sm font-semibold ${themes[theme].text}`}>{item.value}</div>
                      {item.subtitle && (
                        <div className={`mt-0.5 text-[10px] font-mono leading-tight ${themes[theme].text} opacity-50 whitespace-nowrap`}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[250px] md:h-[300px]">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        )}
      </div>
    </>
  );
}
