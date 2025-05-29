import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Filter, X } from 'lucide-react';
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
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

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

    // Sort groups by profit/loss percentage for visual comparison
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => 
      b[1].profitLossPercentage - a[1].profitLossPercentage
    );

    // Prepare treemap data
    const data = sortedGroups.map(([groupName, stats]) => {
      const groupColor = getColorByPercentage(stats.profitLossPercentage, isDark);

      return {
        name: groupName,
        value: stats.totalValue,
        profitLoss: stats.profitLoss,
        profitLossPercentage: stats.profitLossPercentage,
        itemStyle: {
          color: groupColor,
          borderWidth: 4,
          borderRadius: 8,
          borderColor: isDark ? '#4b5563' : '#e5e7eb',
          shadowBlur: 10,
          shadowColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'
        },
        label: {
          show: true,
          position: 'inside',
          formatter: (params: any) => {
            const stats = groups.get(params.name)!;
            const holdingsCount = stats.holdings.length;
            const formattedValue = formatCurrency(params.value, currencyConfig)
              .replace(/,(\d{3})+$/, 'M')
              .replace(/,(\d{3})/, 'K');
            
            return [
              // ``,
              `${params.name} ${stats.profitLossPercentage >= 0 ? '▲' : '▼'} ${Math.abs(stats.profitLossPercentage).toFixed(2)}%`,
              // formattedValue,
              // `(${holdingsCount})`
            ].join('\n');
          },
          rich: {
            sectionStyle: {
              fontSize: 16,
              color: isDark ? '#9ca3af' : '#6b7280',
              padding: [0, 0, 8, 0],
              align: 'center',
              width: '100%'
            },
            titleStyle: {
              fontSize: 24,
              fontWeight: 'bold',
              color: isDark ? '#e5e7eb' : '#111827',
              padding: [0, 0, 12, 0],
              align: 'center',
              width: '100%',
              lineHeight: 32
            },
            percentStyle: {
              fontSize: 20,
              fontWeight: 'bold',
              color: (params: any) => {
                const stats = groups.get(params.name)!;
                return stats.profitLossPercentage >= 0 ? '#34d399' : '#f87171';
              },
              padding: [0, 0, 8, 0],
              align: 'center',
              width: '100%'
            },
            valueStyle: {
              fontSize: 16,
              color: isDark ? '#9ca3af' : '#6b7280',
              align: 'center',
              width: '100%'
            }
          }
        },
        children: stats.holdings
          .sort((a, b) => b.profit_loss_percentage - a.profit_loss_percentage)
          .map(holding => {
            const color = getColorByPercentage(holding.profit_loss_percentage, isDark);

            return {
              name: holding.stock_code,
              value: holding.total_value,
              profitLoss: holding.profit_loss,
              profitLossPercentage: holding.profit_loss_percentage,
              itemStyle: {
                color,
                borderWidth: 1,
                borderColor: isDark ? '#374151' : '#e5e7eb'
              },
              label: {
                show: true,
                position: 'inside',
                formatter: (params: any) => {
                  const value = formatCurrency(params.value, currencyConfig);
                  const percentage = holding.profit_loss_percentage;
                  const percentageStr = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
                  
                  return [
                    `{titleStyle|${params.name}}`,
                    `{nameStyle|${holding.stock_name}}`,
                    `{percentStyle|${percentageStr}}`,
                    `{valueStyle|${value}}`
                  ].join('\n');
                },
                rich: {
                  titleStyle: {
                    fontSize: 16,
                    fontWeight: 'bold',
                    color: isDark ? '#e5e7eb' : '#111827',
                    padding: [0, 0, 8, 0],
                    align: 'center',
                    width: '100%'
                  },
                  nameStyle: {
                    fontSize: 14,
                    color: isDark ? '#9ca3af' : '#6b7280',
                    padding: [0, 0, 8, 0],
                    align: 'center',
                    width: '100%'
                  },
                  percentStyle: {
                    fontSize: 14,
                    fontWeight: 'bold',
                    color: holding.profit_loss_percentage >= 0 ? '#34d399' : '#f87171',
                    padding: [0, 0, 8, 0],
                    align: 'center',
                    width: '100%'
                  },
                  valueStyle: {
                    fontSize: 14,
                    color: isDark ? '#9ca3af' : '#6b7280',
                    align: 'center',
                    width: '100%'
                  }
                }
              }
            };
          })
      };
    });

    const option = {
      tooltip: {
        formatter: (params: any) => {
          if (!params || !params.name) return '';

          const holding = holdings.find(h => h.stock_code === params.name);
          
          // Group node tooltip
          if (!holding && params.data) {
            const { value, profitLoss, profitLossPercentage } = params.data;
            const profitLossColor = profitLossPercentage >= 0 ? '#34d399' : '#f87171';
            const stats = groups.get(params.name)!;
            
            return `
              <div style="font-weight: 500; font-size: 16px">${groupingDimension === 'category' ? 'Category' : 'Tag'}: ${params.name}</div>
              <div style="margin-top: 8px">
                <div>Holdings: ${stats.holdings.length}</div>
                <div>Total Value: ${formatCurrency(value, currencyConfig)}</div>
                <div>Profit/Loss: ${formatCurrency(profitLoss, currencyConfig)}</div>
                <div style="color: ${profitLossColor}; font-weight: 500">
                  Return: ${profitLossPercentage >= 0 ? '+' : ''}${profitLossPercentage.toFixed(2)}%
                </div>
              </div>
            `;
          }
          
          if (!holding) return '';

          const groupInfo = groupingDimension === 'category'
            ? `Category: ${holding.category || 'Other'}`
            : `Tags: ${holding.tags?.join(', ') || 'Untagged'}`;

          return `
            <div style="font-weight: 500">${holding.stock_code} - ${holding.stock_name}</div>
            <div style="margin-top: 4px">
              <div>${groupInfo}</div>
              <div>Current Price: ${formatCurrency(holding.current_price, currencyConfig)}</div>
              <div>Total Value: ${formatCurrency(holding.total_value, currencyConfig)}</div>
              <div>Quantity: ${holding.quantity}</div>
            </div>
            <div style="margin-top: 4px; color: ${holding.profit_loss_percentage >= 0 ? '#34d399' : '#f87171'}">
              ${holding.profit_loss_percentage >= 0 ? '+' : ''}${holding.profit_loss_percentage.toFixed(2)}%
              (${formatCurrency(holding.profit_loss, currencyConfig)})
            </div>
          `;
        }
      },
      series: [{
        type: 'treemap',
        data: data,
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: {
          show: true,
          height: 20,
          top: 'bottom',
          itemStyle: {
            color: isDark ? '#374151' : '#f3f4f6',
            borderColor: isDark ? '#4b5563' : '#e5e7eb',
            textStyle: {
              color: isDark ? '#e5e7eb' : '#111827',
              fontWeight: 'bold',
              fontSize: 14
            }
          },
          emphasis: {
            itemStyle: {
              color: isDark ? '#4b5563' : '#e5e7eb'
            }
          }
        },
        levels: [{
          itemStyle: {
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 4,
            gapWidth: 8,
            borderRadius: 8
          },
          emphasis: {
            itemStyle: {
              borderColor: isDark ? '#60a5fa' : '#3b82f6',
              borderWidth: 4
            }
          },
        }],
        label: {
          show: true,
          position: 'inside'
        },
        upperLabel: {
          show: true,
          height: 40,
          color: isDark ? '#e5e7eb' : '#111827'
        }
      }]
    };

    chart.setOption(option);

    // Handle drill down events
    chart.on('click', (params: any) => {
      if (params.data && params.data.children) {
        setSelectedPath(prev => [...prev, params.name]);
      }
    });

    // Handle breadcrumb navigation
    chart.on('treeMapRootToNode', (params: any) => {
      if (params.targetNode && params.targetNode.path) {
        const path = params.targetNode.path.slice(1);
        setSelectedPath(path);
      }
    });

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
          <div className="flex justify-end items-center gap-2">
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

        <div ref={chartRef} style={{ height: '600px' }} className="mt-4" />
      </div>
    </div>
  );
}