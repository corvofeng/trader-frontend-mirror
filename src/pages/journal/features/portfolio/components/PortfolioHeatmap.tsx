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
}

export function PortfolioHeatmap({ holdings, theme, currencyConfig }: PortfolioHeatmapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [groupingDimension, setGroupingDimension] = useState<GroupingDimension>('category');
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [groupStats, setGroupStats] = useState<Map<string, GroupStats>>(new Map());

  const calculateGroupStats = (groups: Map<string, Holding[]>) => {
    const stats = new Map<string, GroupStats>();
    
    groups.forEach((groupHoldings, groupName) => {
      const totalValue = groupHoldings.reduce((sum, h) => sum + h.total_value, 0);
      const profitLoss = groupHoldings.reduce((sum, h) => sum + h.profit_loss, 0);
      const costBasis = totalValue - profitLoss;
      const profitLossPercentage = (profitLoss / costBasis) * 100;
      
      stats.set(groupName, {
        totalValue,
        profitLoss,
        profitLossPercentage
      });
    });

    return stats;
  };

  useEffect(() => {
    if (!chartRef.current || holdings.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const isDark = theme === 'dark';

    // Group holdings based on dimension
    const groups = new Map<string, Holding[]>();
    
    if (groupingDimension === 'category') {
      holdings.forEach(holding => {
        const category = holding.category || 'Other';
        if (!groups.has(category)) {
          groups.set(category, []);
        }
        groups.get(category)?.push(holding);
      });
    } else {
      holdings.forEach(holding => {
        const tags = holding.tags || ['Untagged'];
        tags.forEach(tag => {
          if (!groups.has(tag)) {
            groups.set(tag, []);
          }
          groups.get(tag)?.push(holding);
        });
      });
    }

    // Calculate and update group stats
    const stats = calculateGroupStats(groups);
    setGroupStats(stats);

    // Calculate max value for color scaling
    const maxValue = Math.max(...holdings.map(h => Math.abs(h.profit_loss_percentage)));

    // Prepare treemap data
    const data = Array.from(groups.entries()).map(([groupName, groupHoldings]) => {
      const groupStat = stats.get(groupName)!;
      const intensity = Math.min(0.9, Math.abs(groupStat.profitLossPercentage) / maxValue) + 0.1;
      
      return {
        name: groupName,
        value: groupStat.totalValue,
        itemStyle: {
          color: groupStat.profitLossPercentage >= 0
            ? `rgba(38, 166, 154, ${intensity})`
            : `rgba(239, 83, 80, ${intensity})`
        },
        children: groupHoldings.map(holding => {
          const intensity = Math.min(0.9, Math.abs(holding.profit_loss_percentage) / maxValue) + 0.1;
          const color = holding.profit_loss_percentage >= 0 
            ? `rgba(38, 166, 154, ${intensity})`
            : `rgba(239, 83, 80, ${intensity})`;

          return {
            name: holding.stock_code,
            value: holding.total_value,
            itemStyle: {
              color,
            },
            label: {
              show: true,
              formatter: [
                `{name|${holding.stock_code}}`,
                `{value|${holding.profit_loss_percentage >= 0 ? '+' : ''}${holding.profit_loss_percentage.toFixed(2)}%}`,
                `{price|${formatCurrency(holding.total_value, currencyConfig)}}`
              ].join('\n'),
              rich: {
                name: {
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: isDark ? '#e5e7eb' : '#111827'
                },
                value: {
                  fontSize: 12,
                  color: holding.profit_loss_percentage >= 0 
                    ? '#34d399' 
                    : '#f87171'
                },
                price: {
                  fontSize: 12,
                  color: isDark ? '#9ca3af' : '#6b7280'
                }
              }
            }
          };
        })
      };
    });

    const option = {
      title: {
        text: `Portfolio Distribution by ${groupingDimension === 'category' ? 'Category' : 'Tags'}`,
        subtext: Array.from(stats.entries()).map(([group, stat]) => 
          `${group}: ${formatCurrency(stat.totalValue, currencyConfig)} (${stat.profitLossPercentage >= 0 ? '+' : ''}${stat.profitLossPercentage.toFixed(2)}%)`
        ).join('\n'),
        left: 'center',
        top: 0,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16
        },
        subtextStyle: {
          color: isDark ? '#9ca3af' : '#6b7280',
          fontSize: 12
        }
      },
      tooltip: {
        formatter: (params: any) => {
          if (!params || !params.name) return '';

          const holding = holdings.find(h => h.stock_code === params.name);
          
          if (!holding && params.data) {
            const groupStat = stats.get(params.name);
            if (!groupStat) return '';
            
            return `
              <div style="font-weight: 500">${params.name}</div>
              <div style="margin-top: 4px">
                <div>Total Value: ${formatCurrency(groupStat.totalValue, currencyConfig)}</div>
                <div>Profit/Loss: ${formatCurrency(groupStat.profitLoss, currencyConfig)}</div>
                <div>Return: ${groupStat.profitLossPercentage >= 0 ? '+' : ''}${groupStat.profitLossPercentage.toFixed(2)}%</div>
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
        top: 80,
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: {
          show: true,
          height: 30,
          bottom: 0,
          itemStyle: {
            color: isDark ? '#374151' : '#f3f4f6',
            borderColor: isDark ? '#4b5563' : '#e5e7eb',
            textStyle: {
              color: isDark ? '#e5e7eb' : '#111827'
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
            borderWidth: 1,
            gapWidth: 2
          },
          emphasis: {
            itemStyle: {
              borderColor: isDark ? '#60a5fa' : '#3b82f6',
              borderWidth: 2
            }
          }
        }],
        label: {
          show: true,
          position: 'inside'
        },
        upperLabel: {
          show: true,
          height: 30,
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
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
                Portfolio Performance Heatmap
              </h2>
              <div className="flex items-center gap-2 bg-opacity-50 rounded-lg px-3 py-1.5">
                <select
                  value={groupingDimension}
                  onChange={(e) => setGroupingDimension(e.target.value as GroupingDimension)}
                  className={`text-sm bg-transparent border-none focus:ring-0 ${themes[theme].text}`}
                >
                  <option value="category">By Category</option>
                  <option value="tags">By Tags</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div ref={chartRef} style={{ height: '400px' }} className="mt-4" />
      </div>
    </div>
  );
}