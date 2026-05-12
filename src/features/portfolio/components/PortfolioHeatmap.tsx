import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Filter } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import type { Holding, StockConfig } from '../../../lib/services/types';
import { formatCurrency } from '../../../shared/utils/format';
import type { RegionalColorConfig } from '../../../shared/types';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { stockConfigService } from '../../../lib/services';

interface PortfolioHeatmapProps {
  holdings: Holding[];
  theme: Theme;
}

type GroupingDimension = 'category' | 'tags';

interface TreemapTooltipData {
  name: string;
  value: number;
  dailyPLPercentage: number;
  stock_code?: string;
}

interface TreemapLabelData extends TreemapTooltipData {
  children?: TreemapLabelData[];
}

interface TreemapTooltipParams {
  data: TreemapTooltipData;
  value: number;
  name: string;
}

interface TreemapLabelParams {
  data: TreemapLabelData;
  value: number;
  name: string;
  depth: number;
}

function getColorByPercentage(percentage: number, isDark: boolean, regionalColors: RegionalColorConfig): string {
  const colors = {
    positive: {
      veryStrong: regionalColors.upColor,
      strong: regionalColors.upColor + 'dd',
      medium: regionalColors.upColor + 'bb',
      weak: regionalColors.upColor + '99',
      veryWeak: regionalColors.upColor + '77',
    },
    negative: {
      veryStrong: regionalColors.downColor,
      strong: regionalColors.downColor + 'dd',
      medium: regionalColors.downColor + 'bb',
      weak: regionalColors.downColor + '99',
      veryWeak: regionalColors.downColor + '77',
    },
    neutral: isDark ? '#374151' : '#f3f4f6'
  };

  const thresholds = {
    veryStrong: 5.0,
    strong: 3.0,
    medium: 2.0,
    weak: 1.0,
    neutral: 0.2
  };

  const getOpacity = (value: number): number => {
    const absValue = Math.abs(value);
    if (absValue >= thresholds.veryStrong) return 1.0;
    if (absValue >= thresholds.strong) return 0.9;
    if (absValue >= thresholds.medium) return 0.8;
    if (absValue >= thresholds.weak) return 0.7;
    return 0.6;
  };

  let baseColor: string;
  const absPercentage = Math.abs(percentage);

  if (absPercentage < thresholds.neutral) {
    return colors.neutral;
  } else if (percentage > 0) {
    if (absPercentage >= thresholds.veryStrong) baseColor = colors.positive.veryStrong;
    else if (absPercentage >= thresholds.strong) baseColor = colors.positive.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.positive.medium;
    else if (absPercentage >= thresholds.weak) baseColor = colors.positive.weak;
    else baseColor = colors.positive.veryWeak;
  } else {
    if (absPercentage >= thresholds.veryStrong) baseColor = colors.negative.veryStrong;
    else if (absPercentage >= thresholds.strong) baseColor = colors.negative.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.negative.medium;
    else if (absPercentage >= thresholds.weak) baseColor = colors.negative.weak;
    else baseColor = colors.negative.veryWeak;
  }

  const opacity = getOpacity(percentage);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(baseColor);
  if (!result) return baseColor;
  
  const rgb = {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

function formatPercentage(value: number | undefined): string {
  if (typeof value !== 'number' || !isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

export function PortfolioHeatmap({ holdings, theme }: PortfolioHeatmapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [groupingDimension, setGroupingDimension] = useState<GroupingDimension>('category');
  const [stockConfigs, setStockConfigs] = useState<StockConfig[]>(() => {
    try {
      const raw = localStorage.getItem('journal:stockConfigs');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { ts?: number; data?: StockConfig[] } | StockConfig[];
      if (Array.isArray(parsed)) return parsed;
      if (!Array.isArray(parsed.data)) return [];
      const ts = typeof parsed.ts === 'number' ? parsed.ts : 0;
      if (ts > 0 && Date.now() - ts > 30 * 60_000) return [];
      return parsed.data;
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(() => stockConfigs.length === 0);
  const { currencyConfig, regionalColors } = useCurrency();
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const fetchStockConfigs = async () => {
      try {
        const { data, error } = await stockConfigService.getStockConfigs();
        if (error) throw error;
        if (data) {
          setStockConfigs(data);
          try {
            localStorage.setItem('journal:stockConfigs', JSON.stringify({ ts: Date.now(), data }));
          } catch {}
        }
      } catch (error) {
        console.error('Failed to fetch stock configs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStockConfigs();
  }, []);

  const stockConfigByCode = useMemo(() => {
    const map = new Map<string, StockConfig>();
    for (const cfg of stockConfigs) {
      if (cfg?.stock_code) map.set(cfg.stock_code, cfg);
    }
    return map;
  }, [stockConfigs]);

  const isDark = theme === 'dark';
  const totalPortfolioValue = useMemo(() => holdings.reduce((sum, h) => sum + h.total_value, 0), [holdings]);

  const treemapData = useMemo(() => {
    if (groupingDimension === 'tags') {
      const tagGroups = new Map<string, { value: number; dailyPL: number; holdings: Holding[] }>();

      for (const holding of holdings) {
        const config = stockConfigByCode.get(holding.stock_code);
        const tags = config?.tags?.length ? config.tags : ['Untagged'];

        for (const tag of tags) {
          if (!tag) continue;
          let group = tagGroups.get(tag);
          if (!group) {
            group = { value: 0, dailyPL: 0, holdings: [] };
            tagGroups.set(tag, group);
          }
          group.value += holding.total_value;
          group.dailyPL += holding.daily_profit_loss;
          group.holdings.push(holding);
        }
      }

      return Array.from(tagGroups.entries()).map(([tag, group]) => {
        const dailyPLPercentage = group.value > 0 ? (group.dailyPL / group.value) * 100 : 0;
        const color = getColorByPercentage(dailyPLPercentage, isDark, regionalColors);

        return {
          name: tag,
          value: group.value,
          dailyPLPercentage,
          itemStyle: {
            color,
            borderWidth: 2,
            borderColor: isDark ? '#4b5563' : '#e5e7eb'
          },
          label: {
            color: isDark ? '#e5e7eb' : '#111827',
            fontWeight: 500
          },
          children: group.holdings.map(holding => ({
            name: holding.stock_name || holding.stock_code,
            stock_code: holding.stock_code,
            value: holding.total_value,
            dailyPLPercentage: holding.daily_profit_loss_percentage || 0,
            itemStyle: {
              color: getColorByPercentage(holding.daily_profit_loss_percentage || 0, isDark, regionalColors),
              borderWidth: 1,
              borderColor: isDark ? '#374151' : '#e5e7eb'
            },
            label: {
              color: isDark ? '#e5e7eb' : '#111827',
              fontWeight: 500
            }
          }))
        };
      });
    }

    const categoryGroups = new Map<string, { value: number; dailyPL: number; holdings: Holding[] }>();

    for (const holding of holdings) {
      const config = stockConfigByCode.get(holding.stock_code);
      const category = config?.category || 'Other';
      let group = categoryGroups.get(category);
      if (!group) {
        group = { value: 0, dailyPL: 0, holdings: [] };
        categoryGroups.set(category, group);
      }
      group.value += holding.total_value;
      group.dailyPL += holding.daily_profit_loss;
      group.holdings.push(holding);
    }

    return Array.from(categoryGroups.entries()).map(([category, group]) => {
      const dailyPLPercentage = group.value > 0 ? (group.dailyPL / group.value) * 100 : 0;
      const color = getColorByPercentage(dailyPLPercentage, isDark, regionalColors);

      return {
        name: category,
        value: group.value,
        dailyPLPercentage,
        itemStyle: {
          color,
          borderWidth: 2,
          borderColor: isDark ? '#4b5563' : '#e5e7eb'
        },
        label: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontWeight: 500
        },
        children: group.holdings.map(holding => ({
          name: holding.stock_name || holding.stock_code,
          stock_code: holding.stock_code,
          value: holding.total_value,
          dailyPLPercentage: holding.daily_profit_loss_percentage || 0,
          itemStyle: {
            color: getColorByPercentage(holding.daily_profit_loss_percentage || 0, isDark, regionalColors),
            borderWidth: 1,
            borderColor: isDark ? '#374151' : '#e5e7eb'
          },
          label: {
            color: isDark ? '#e5e7eb' : '#111827',
            fontWeight: 500
          }
        }))
      };
    });
  }, [groupingDimension, holdings, isDark, regionalColors, stockConfigByCode]);

  const option = useMemo(() => {
    return {
      grid: { left: 24, right: 24, top: 24, bottom: 24, containLabel: true },
      animation: false,
      tooltip: {
        formatter: (params: TreemapTooltipParams) => {
          const { name, value, dailyPLPercentage, stock_code } = params.data;
          const percentage = formatPercentage(dailyPLPercentage);
          const formattedValue = formatCurrency(value, currencyConfig);
          const percentageOfTotal = totalPortfolioValue > 0 
            ? ((value / totalPortfolioValue) * 100).toFixed(1)
            : '0.0';

          return `
            <div style="font-weight: 500; font-size: ${isMobile ? '14px' : '16px'}">${name}</div>
            ${stock_code ? `<div style="font-size: ${isMobile ? '12px' : '14px'}; opacity: 0.75">${stock_code}</div>` : ''}
            <div style="margin-top: 8px">
              <div>Value: ${formattedValue} (${percentageOfTotal}% of portfolio)</div>
              <div style="color: ${dailyPLPercentage >= 0 ? regionalColors.upColor : regionalColors.downColor}; font-weight: 500">
                Daily Return: ${dailyPLPercentage >= 0 ? '+' : ''}${percentage}%
              </div>
            </div>
          `;
        }
      },
      series: [{
        name: groupingDimension === 'tags' ? 'Tags' : 'Categories',
        type: 'treemap',
        data: treemapData,
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: 'zoomToNode',
        leafDepth: 1,
        drillDownIcon: '▶',
        breadcrumb: {
          show: true,
          height: isMobile ? 24 : 30,
          top: 'bottom',
          itemStyle: {
            color: isDark ? '#374151' : '#f3f4f6',
            borderColor: isDark ? '#4b5563' : '#e5e7eb',
            textStyle: {
              color: isDark ? '#e5e7eb' : '#111827',
              fontWeight: 'bold',
              fontSize: isMobile ? 12 : 14
            }
          }
        },
        levels: [
          {
            itemStyle: {
              borderColor: isDark ? '#374151' : '#e5e7eb',
              borderWidth: 4,
              gapWidth: isMobile ? 4 : 8,
              borderRadius: 8
            },
            label: {
              color: isDark ? '#e5e7eb' : '#111827',
              fontWeight: 500
            }
          },
          {
            itemStyle: {
              borderColor: isDark ? '#374151' : '#e5e7eb',
              borderWidth: 2,
              gapWidth: isMobile ? 2 : 4,
              borderRadius: 4
            },
            label: {
              color: isDark ? '#e5e7eb' : '#111827',
              fontWeight: 500
            }
          }
        ],
        label: {
          show: true,
          formatter: (params: TreemapLabelParams) => {
            const value = formatCurrency(params.value, currencyConfig)
              .replace(/,(\d{3})+$/, 'M')
              .replace(/,(\d{3})/, 'K');
            const percentage = formatPercentage(params.data.dailyPLPercentage);
            
            if (params.depth === 0) {
              return [
                `${params.name}`,
                `${percentage}%`,
                value,
                `(${params.data.children?.length || 0} holdings)`
              ].join('\n');
            } else if (params.data.stock_code) {
              return [
                `${params.name}`,
                `${params.data.stock_code}`,
                `${percentage}%`,
                value
              ].join('\n');
            }
            return [
              `${params.name}`,
              `${percentage}%`,
              value
            ].join('\n');
          },
          color: isDark ? '#e5e7eb' : '#111827',
          fontWeight: 500
        },
        upperLabel: {
          show: true,
          height: isMobile ? 30 : 40,
          color: isDark ? '#e5e7eb' : '#111827'
        }
      }]
    };
  }, [currencyConfig, groupingDimension, isDark, isMobile, regionalColors, totalPortfolioValue, treemapData]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    if (chartInstance.current) return;

    chartInstance.current = echarts.init(el);

    const ro = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;
    if (holdings.length === 0) return;
    chart.setOption(option, { notMerge: true, lazyUpdate: true });
    try {
      performance.mark('portfolioHeatmap:rendered');
    } catch {}
  }, [holdings.length, option]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md`}>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
              Daily Performance Heatmap
            </h2>
            <div className="flex items-center gap-2">
              <Filter className={`w-4 h-4 ${themes[theme].text}`} />
              <select
                value={groupingDimension}
                onChange={(e) => setGroupingDimension(e.target.value as GroupingDimension)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="category">Group by Category</option>
                <option value="tags">Group by Tags</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 relative">
          <div ref={chartRef} style={{ height: isMobile ? '400px' : '600px' }} />
          {holdings.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            </div>
          ) : null}
          {holdings.length > 0 && isLoading ? (
            <div className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-gray-100/80 dark:bg-gray-900/70 text-gray-700 dark:text-gray-200">
              正在加载分类…
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
