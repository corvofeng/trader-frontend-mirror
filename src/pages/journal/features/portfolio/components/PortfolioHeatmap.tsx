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

    // Calculate max value for color scaling
    const maxValue = Math.max(...holdings.map(h => Math.abs(h.profit_loss_percentage)));

    // Prepare treemap data with a root node
    const data = [{
      name: 'All',
      value: holdings.reduce((sum, h) => sum + h.total_value, 0),
      children: Array.from(groups.entries()).map(([groupName, groupHoldings]) => ({
        name: groupName,
        value: groupHoldings.reduce((sum, h) => sum + h.total_value, 0),
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
      }))
    }];

    const option = {
      tooltip: {
        formatter: (params: any) => {
          const holding = holdings.find(h => h.stock_code === params.name);
          if (!holding) {
            // Show group summary if not a holding
            const value = params.value;
            const percentage = (value / data[0].value * 100).toFixed(1);
            return `
              <div style="font-weight: 500">${params.name}</div>
              <div style="margin-top: 4px">
                <div>Total Value: ${formatCurrency(value, currencyConfig)}</div>
                <div>Portfolio %: ${percentage}%</div>
              </div>
            `;
          }

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
          height: 30,
          top: 'bottom',
          emptyItemWidth: 40,
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
          position: 'inside',
          formatter: (params: any) => {
            // For group nodes, show name and percentage
            if (params.data.children) {
              const percentage = (params.value / data[0].value * 100).toFixed(1);
              return `${params.name}\n${percentage}%`;
            }
            // For leaf nodes (holdings), use the default rich text formatter
            return params.name;
          }
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
      if (params.data.children) {
        setSelectedPath(prev => [...prev, params.name]);
      }
    });

    // Handle breadcrumb navigation
    chart.on('treeMapRootToNode', (params: any) => {
      const path = params.targetNode.path.slice(1);
      setSelectedPath(path);
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
            <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
              Portfolio Performance Heatmap
            </h2>
            <div className="flex items-center gap-2">
              <Filter className={`w-4 h-4 ${themes[theme].text}`} />
              <select
                value={groupingDimension}
                onChange={(e) => {
                  setGroupingDimension(e.target.value as GroupingDimension);
                  setSelectedPath([]); // Reset path when changing dimension
                }}
                className={`px-3 py-1.5 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="category">Group by Category</option>
                <option value="tags">Group by Tags</option>
              </select>
            </div>
          </div>
        </div>

        <div ref={chartRef} style={{ height: '400px' }} className="mt-4" />
      </div>
    </div>
  );
}