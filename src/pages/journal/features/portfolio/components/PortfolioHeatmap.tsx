import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Filter, X } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';
import type { Holding, StockConfig } from '../../../../../lib/services/types';
import { formatCurrency } from '../../../../../lib/types';
import type { CurrencyConfig } from '../../../../../lib/types';
import { stockConfigService } from '../../../../../lib/services';

interface PortfolioHeatmapProps {
  holdings: Holding[];
  theme: Theme;
  currencyConfig: CurrencyConfig;
}

type GroupingDimension = 'category' | 'tags';

interface GroupStats {
  totalValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  dailyProfitLoss: number;
  dailyProfitLossPercentage: number;
  holdings: Holding[];
}

function getColorByPercentage(percentage: number, isDark: boolean): string {
  const colors = {
    positive: {
      veryStrong: isDark ? '#047857' : '#059669',  // >3%
      strong: isDark ? '#059669' : '#10b981',      // 2-3%
      medium: isDark ? '#10b981' : '#34d399',      // 1-2%
      weak: isDark ? '#34d399' : '#6ee7b7',        // 0.5-1%
      veryWeak: isDark ? '#6ee7b7' : '#a7f3d0',    // 0-0.5%
    },
    negative: {
      veryStrong: isDark ? '#b91c1c' : '#dc2626',  // <-3%
      strong: isDark ? '#dc2626' : '#ef4444',      // -2-3%
      medium: isDark ? '#ef4444' : '#f87171',      // -1-2%
      weak: isDark ? '#f87171' : '#fca5a5',        // -0.5-1%
      veryWeak: isDark ? '#fca5a5' : '#fee2e2',    // 0-0.5%
    },
    neutral: isDark ? '#374151' : '#f3f4f6'
  };

  const thresholds = {
    veryStrong: 3.0,
    strong: 2.0,
    medium: 1.0,
    weak: 0.5,
    neutral: 0.2
  };

  const getOpacity = (value: number): number => {
    const absValue = Math.abs(value);
    if (absValue >= thresholds.veryStrong) return 0.95;
    if (absValue >= thresholds.strong) return 0.85;
    if (absValue >= thresholds.medium) return 0.75;
    if (absValue >= thresholds.weak) return 0.65;
    return 0.55;
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

export function PortfolioHeatmap({ holdings, theme, currencyConfig }: PortfolioHeatmapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [groupingDimension, setGroupingDimension] = useState<GroupingDimension>('category');
  const [stockConfigs, setStockConfigs] = useState<StockConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const fetchStockConfigs = async () => {
      try {
        const { data, error } = await stockConfigService.getStockConfigs();
        if (error) throw error;
        if (data) {
          setStockConfigs(data);
        }
      } catch (error) {
        console.error('Failed to fetch stock configs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStockConfigs();
  }, []);

  useEffect(() => {
    if (!chartRef.current || holdings.length === 0 || isLoading) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const isDark = theme === 'dark';
    const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.total_value, 0);

    const prepareTreemapData = () => {
      if (groupingDimension === 'tags') {
        const tagGroups = new Map<string, {
          value: number,
          dailyPL: number,
          holdings: Holding[]
        }>();

        holdings.forEach(holding => {
          const config = stockConfigs.find(c => c.stock_code === holding.stock_code);
          const tags = config?.tags || ['Untagged'];
          
          tags.forEach(tag => {
            if (!tagGroups.has(tag)) {
              tagGroups.set(tag, {
                value: 0,
                dailyPL: 0,
                holdings: []
              });
            }
            const group = tagGroups.get(tag)!;
            group.value += holding.total_value;
            group.dailyPL += holding.daily_profit_loss;
            group.holdings.push(holding);
          });
        });

        return Array.from(tagGroups.entries()).map(([tag, group]) => {
          const dailyPLPercentage = group.value > 0 ? (group.dailyPL / group.value) * 100 : 0;
          const color = getColorByPercentage(dailyPLPercentage, isDark);

          return {
            name: tag,
            value: group.value,
            dailyPLPercentage,
            itemStyle: {
              color,
              borderWidth: 2,
              borderColor: isDark ? '#4b5563' : '#e5e7eb'
            },
            children: group.holdings.map(holding => ({
              name: holding.stock_code,
              value: holding.total_value,
              dailyPLPercentage: holding.daily_profit_loss_percentage || 0,
              itemStyle: {
                color: getColorByPercentage(holding.daily_profit_loss_percentage || 0, isDark),
                borderWidth: 1,
                borderColor: isDark ? '#374151' : '#e5e7eb'
              }
            }))
          };
        });
      } else {
        const categoryGroups = new Map<string, {
          value: number,
          dailyPL: number,
          holdings: Holding[]
        }>();

        holdings.forEach(holding => {
          const config = stockConfigs.find(c => c.stock_code === holding.stock_code);
          const category = config?.category || 'Other';
          
          if (!categoryGroups.has(category)) {
            categoryGroups.set(category, {
              value: 0,
              dailyPL: 0,
              holdings: []
            });
          }
          const group = categoryGroups.get(category)!;
          group.value += holding.total_value;
          group.dailyPL += holding.daily_profit_loss;
          group.holdings.push(holding);
        });

        return Array.from(categoryGroups.entries()).map(([category, group]) => {
          const dailyPLPercentage = group.value > 0 ? (group.dailyPL / group.value) * 100 : 0;
          const color = getColorByPercentage(dailyPLPercentage, isDark);

          return {
            name: category,
            value: group.value,
            dailyPLPercentage,
            itemStyle: {
              color,
              borderWidth: 2,
              borderColor: isDark ? '#4b5563' : '#e5e7eb'
            },
            children: group.holdings.map(holding => ({
              name: holding.stock_code,
              value: holding.total_value,
              dailyPLPercentage: holding.daily_profit_loss_percentage || 0,
              itemStyle: {
                color: getColorByPercentage(holding.daily_profit_loss_percentage || 0, isDark),
                borderWidth: 1,
                borderColor: isDark ? '#374151' : '#e5e7eb'
              }
            }))
          };
        });
      }
    };

    const option = {
      tooltip: {
        formatter: (params: any) => {
          const { name, value, dailyPLPercentage } = params.data;
          const percentage = formatPercentage(dailyPLPercentage);
          const formattedValue = formatCurrency(value, currencyConfig);
          const percentageOfTotal = totalPortfolioValue > 0 
            ? ((value / totalPortfolioValue) * 100).toFixed(1)
            : '0.0';

          return `
            <div style="font-weight: 500; font-size: ${isMobile ? '14px' : '16px'}">${name}</div>
            <div style="margin-top: 8px">
              <div>Value: ${formattedValue} (${percentageOfTotal}% of portfolio)</div>
              <div style="color: ${dailyPLPercentage >= 0 ? '#34d399' : '#f87171'}; font-weight: 500">
                Daily Return: ${dailyPLPercentage >= 0 ? '+' : ''}${percentage}%
              </div>
            </div>
          `;
        }
      },
      series: [{
        name: groupingDimension === 'tags' ? 'Tags' : 'Categories',
        type: 'treemap',
        data: prepareTreemapData(),
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
            }
          },
          {
            itemStyle: {
              borderColor: isDark ? '#374151' : '#e5e7eb',
              borderWidth: 2,
              gapWidth: isMobile ? 2 : 4,
              borderRadius: 4
            }
          }
        ],
        label: {
          show: true,
          formatter: (params: any) => {
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
            } else {
              return [
                `${params.name}`,
                `${percentage}%`,
                value
              ].join('\n');
            }
          }
        },
        upperLabel: {
          show: true,
          height: isMobile ? 30 : 40,
          color: isDark ? '#e5e7eb' : '#111827'
        }
      }]
    };

    chart.setOption(option);

    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }
    };
  }, [holdings, theme, currencyConfig, groupingDimension, stockConfigs, isLoading, isMobile]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
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

        {isLoading ? (
          <div className="h-[400px] sm:h-[600px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div ref={chartRef} style={{ height: isMobile ? '400px' : '600px' }} className="mt-4" />
        )}
      </div>
    </div>
  );
}