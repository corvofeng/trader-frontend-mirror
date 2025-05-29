import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Filter } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';
import type { Holding } from '../../../../../lib/services/types';
import { formatCurrency } from '../../../../../lib/types';
import type { CurrencyConfig } from '../../../../../lib/types';

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
  holdings: Holding[];
}

function getColorByPercentage(percentage: number, isDark: boolean): string {
  // Define base colors for different percentage ranges
  const colors = {
    positive: {
      strong: isDark ? '#059669' : '#10b981', // Strong gain
      medium: isDark ? '#34d399' : '#6ee7b7', // Medium gain
      weak: isDark ? '#6ee7b7' : '#a7f3d0',   // Weak gain
    },
    negative: {
      strong: isDark ? '#dc2626' : '#ef4444', // Strong loss
      medium: isDark ? '#f87171' : '#fca5a5', // Medium loss
      weak: isDark ? '#fca5a5' : '#fee2e2',   // Weak loss
    },
    neutral: isDark ? '#374151' : '#f3f4f6'    // Near zero
  };

  // Define percentage thresholds
  const thresholds = {
    strong: 10,   // ±10% or more
    medium: 5,    // ±5% to 10%
    weak: 2,      // ±2% to 5%
    neutral: 2    // Between -2% and 2%
  };

  // Calculate opacity based on absolute percentage
  const getOpacity = (value: number): number => {
    const absValue = Math.abs(value);
    if (absValue >= thresholds.strong) return 0.9;
    if (absValue >= thresholds.medium) return 0.7;
    if (absValue >= thresholds.weak) return 0.5;
    return 0.3;
  };

  // Get base color
  let baseColor: string;
  const absPercentage = Math.abs(percentage);

  if (absPercentage < thresholds.neutral) {
    return colors.neutral;
  } else if (percentage > 0) {
    if (absPercentage >= thresholds.strong) baseColor = colors.positive.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.positive.medium;
    else baseColor = colors.positive.weak;
  } else {
    if (absPercentage >= thresholds.strong) baseColor = colors.negative.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.negative.medium;
    else baseColor = colors.negative.weak;
  }

  // Convert hex to rgba
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

export function PortfolioHeatmap({ holdings, theme, currencyConfig }: PortfolioHeatmapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [groupingDimension, setGroupingDimension] = useState<GroupingDimension>('category');

  useEffect(() => {
    if (!chartRef.current || holdings.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current, {
      useDirtyRect: true
    });
    chartInstance.current = chart;

    const isDark = theme === 'dark';

    // Group holdings and calculate stats
    const groups = new Map<string, GroupStats>();
    
    if (groupingDimension === 'category') {
      holdings.forEach(holding => {
        const category = holding.category || 'Other';
        if (!groups.has(category)) {
          groups.set(category, {
            totalValue: 0,
            profitLoss: 0,
            profitLossPercentage: 0,
            holdings: []
          });
        }
        const stats = groups.get(category)!;
        stats.totalValue += holding.total_value;
        stats.profitLoss += holding.profit_loss;
        stats.holdings.push(holding);
      });
    } else {
      holdings.forEach(holding => {
        const tags = holding.tags || ['Untagged'];
        tags.forEach(tag => {
          if (!groups.has(tag)) {
            groups.set(tag, {
              totalValue: 0,
              profitLoss: 0,
              profitLossPercentage: 0,
              holdings: []
            });
          }
          const stats = groups.get(tag)!;
          stats.totalValue += holding.total_value;
          stats.profitLoss += holding.profit_loss;
          stats.holdings.push(holding);
        });
      });
    }

    // Calculate profit/loss percentages for groups
    groups.forEach(stats => {
      const costBasis = stats.totalValue - stats.profitLoss;
      stats.profitLossPercentage = (stats.profitLoss / costBasis) * 100;
    });

    // Convert data to disk treemap format
    const data = {
      name: 'Portfolio',
      children: Array.from(groups.entries()).map(([groupName, stats]) => ({
        name: groupName,
        value: stats.totalValue,
        itemStyle: {
          color: getColorByPercentage(stats.profitLossPercentage, isDark)
        },
        label: {
          formatter: (params: any) => {
            const value = formatCurrency(stats.totalValue, currencyConfig);
            return [
              `{name|${params.name}}`,
              `{value|${value}}`,
              `{percent|${stats.profitLossPercentage >= 0 ? '+' : ''}${stats.profitLossPercentage.toFixed(2)}%}`,
              `{holdings|${stats.holdings.length} holdings}`
            ].join('\n');
          },
          rich: {
            name: {
              fontSize: 14,
              fontWeight: 'bold',
              color: isDark ? '#e5e7eb' : '#111827',
              padding: [0, 0, 5, 0]
            },
            value: {
              fontSize: 12,
              color: isDark ? '#9ca3af' : '#6b7280',
              padding: [0, 0, 5, 0]
            },
            percent: {
              fontSize: 12,
              color: (params: any) => {
                const stats = groups.get(params.name)!;
                return stats.profitLossPercentage >= 0 ? '#34d399' : '#f87171';
              },
              padding: [0, 0, 5, 0],
              fontWeight: 'bold'
            },
            holdings: {
              fontSize: 12,
              color: isDark ? '#9ca3af' : '#6b7280'
            }
          }
        },
        children: stats.holdings.map(holding => ({
          name: holding.stock_code,
          value: holding.total_value,
          itemStyle: {
            color: getColorByPercentage(holding.profit_loss_percentage, isDark)
          },
          label: {
            formatter: (params: any) => {
              const value = formatCurrency(holding.total_value, currencyConfig);
              return [
                `{code|${holding.stock_code}}`,
                `{name|${holding.stock_name}}`,
                `{value|${value}}`,
                `{percent|${holding.profit_loss_percentage >= 0 ? '+' : ''}${holding.profit_loss_percentage.toFixed(2)}%}`
              ].join('\n');
            },
            rich: {
              code: {
                fontSize: 12,
                fontWeight: 'bold',
                color: isDark ? '#e5e7eb' : '#111827',
                padding: [0, 0, 5, 0]
              },
              name: {
                fontSize: 11,
                color: isDark ? '#9ca3af' : '#6b7280',
                padding: [0, 0, 5, 0]
              },
              value: {
                fontSize: 11,
                color: isDark ? '#9ca3af' : '#6b7280',
                padding: [0, 0, 5, 0]
              },
              percent: {
                fontSize: 11,
                color: holding.profit_loss_percentage >= 0 ? '#34d399' : '#f87171',
                fontWeight: 'bold'
              }
            }
          }
        }))
      }))
    };

    const option = {
      title: {
        text: 'Portfolio Performance',
        subtext: groupingDimension === 'category' ? 'Grouped by Sector' : 'Grouped by Tags',
        left: '20',
        top: '20',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16,
          fontWeight: 'bold'
        },
        subtextStyle: {
          color: isDark ? '#9ca3af' : '#6b7280',
          fontSize: 12
        }
      },
      tooltip: {
        formatter: (params: any) => {
          if (!params.data) return '';

          const value = formatCurrency(params.value, currencyConfig);
          let content = `<div style="font-weight: bold">${params.name}</div>`;

          if (params.treePathInfo.length === 2) {
            // Group level
            const stats = groups.get(params.name)!;
            content += `
              <div style="margin-top: 8px">
                <div>Total Value: ${value}</div>
                <div>Holdings: ${stats.holdings.length}</div>
                <div style="color: ${stats.profitLossPercentage >= 0 ? '#34d399' : '#f87171'}">
                  Return: ${stats.profitLossPercentage >= 0 ? '+' : ''}${stats.profitLossPercentage.toFixed(2)}%
                </div>
              </div>
            `;
          } else {
            // Stock level
            const holding = holdings.find(h => h.stock_code === params.name)!;
            content += `
              <div style="margin-top: 8px">
                <div>${holding.stock_name}</div>
                <div>Value: ${value}</div>
                <div style="color: ${holding.profit_loss_percentage >= 0 ? '#34d399' : '#f87171'}">
                  Return: ${holding.profit_loss_percentage >= 0 ? '+' : ''}${holding.profit_loss_percentage.toFixed(2)}%
                </div>
              </div>
            `;
          }

          return content;
        }
      },
      series: [{
        name: 'Portfolio',
        type: 'treemap',
        data: data.children,
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        visualMin: 0,
        visualMax: 1,
        visualDimension: 1,
        levels: [{
          itemStyle: {
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 2,
            gapWidth: 2,
            borderRadius: 4
          }
        }, {
          itemStyle: {
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 1,
            gapWidth: 1,
            borderRadius: 2
          }
        }],
        label: {
          show: true,
          position: 'inside',
          padding: 5
        },
        upperLabel: {
          show: true,
          height: 30
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
  }, [holdings, theme, currencyConfig, groupingDimension]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Filter className={`w-4 h-4 ${themes[theme].text}`} />
              <select
                value={groupingDimension}
                onChange={(e) => setGroupingDimension(e.target.value as GroupingDimension)}
                className={`px-3 py-1.5 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="category">Group by Category</option>
                <option value="tags">Group by Tags</option>
              </select>
            </div>
          </div>
        </div>

        <div ref={chartRef} style={{ height: '600px' }} className="mt-4" />
      </div>
    </div>
  );
}