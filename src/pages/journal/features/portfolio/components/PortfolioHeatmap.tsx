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

export function PortfolioHeatmap({ holdings, theme, currencyConfig }: PortfolioHeatmapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [groupingDimension, setGroupingDimension] = useState<GroupingDimension>('category');

  useEffect(() => {
    if (!chartRef.current || holdings.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
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

    // Sort groups by total value
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => b[1].totalValue - a[1].totalValue);

    // Calculate max value for color scaling
    const maxValue = Math.max(...holdings.map(h => Math.abs(h.profit_loss_percentage)));

    // Prepare treemap data
    const data = sortedGroups.map(([groupName, stats]) => {
      const intensity = Math.min(0.9, Math.abs(stats.profitLossPercentage) / maxValue) + 0.1;
      const headerColor = stats.profitLossPercentage >= 0 
        ? `rgba(38, 166, 154, ${intensity})`
        : `rgba(239, 83, 80, ${intensity})`;

      return {
        name: groupName,
        value: stats.totalValue,
        label: {
          show: true,
          formatter: groupName,
          fontSize: 16,
          fontWeight: 'bold',
          color: '#ffffff',
          position: 'insideTopLeft',
          padding: 8
        },
        itemStyle: {
          color: headerColor
        },
        emphasis: {
          itemStyle: {
            color: headerColor
          }
        },
        children: stats.holdings.map(holding => {
          const holdingIntensity = Math.min(0.9, Math.abs(holding.profit_loss_percentage) / maxValue) + 0.1;
          const holdingColor = holding.profit_loss_percentage >= 0 
            ? `rgba(38, 166, 154, ${holdingIntensity})`
            : `rgba(239, 83, 80, ${holdingIntensity})`;

          return {
            name: holding.stock_code,
            value: holding.total_value,
            itemStyle: {
              color: holdingColor,
              borderColor: isDark ? '#374151' : '#e5e7eb',
              borderWidth: 1
            },
            label: {
              show: true,
              position: 'inside',
              formatter: [
                `{name|${holding.stock_code}}`,
                `{value|${holding.profit_loss_percentage >= 0 ? '+' : ''}${holding.profit_loss_percentage.toFixed(2)}%}`,
                `{price|${formatCurrency(holding.total_value, currencyConfig)}}`
              ].join('\n'),
              rich: {
                name: {
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: '#ffffff',
                  padding: [2, 4]
                },
                value: {
                  fontSize: 12,
                  color: '#ffffff',
                  padding: [2, 4]
                },
                price: {
                  fontSize: 12,
                  color: '#ffffff',
                  padding: [2, 4]
                }
              }
            },
            tooltip: {
              formatter: () => {
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
            }
          };
        })
      };
    });

    const option = {
      tooltip: {
        formatter: (params: any) => {
          if (params.data.children) {
            // Group tooltip
            const stats = groups.get(params.name);
            if (!stats) return '';

            return `
              <div style="font-weight: 500">${params.name}</div>
              <div style="margin-top: 4px">
                <div>Total Value: ${formatCurrency(stats.totalValue, currencyConfig)}</div>
                <div>Holdings: ${stats.holdings.length}</div>
              </div>
              <div style="margin-top: 4px; color: ${stats.profitLossPercentage >= 0 ? '#34d399' : '#f87171'}">
                ${stats.profitLossPercentage >= 0 ? '+' : ''}${stats.profitLossPercentage.toFixed(2)}%
                (${formatCurrency(stats.profitLoss, currencyConfig)})
              </div>
            `;
          }
          return params.data.tooltip?.formatter() || '';
        }
      },
      series: [{
        type: 'treemap',
        data: data,
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        levels: [
          {
            itemStyle: {
              borderColor: isDark ? '#374151' : '#e5e7eb',
              borderWidth: 2,
              gapWidth: 4
            }
          },
          {
            itemStyle: {
              borderColor: isDark ? '#374151' : '#e5e7eb',
              borderWidth: 1,
              gapWidth: 2
            }
          }
        ],
        label: {
          show: true
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
            <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
              Portfolio Performance Heatmap
            </h2>
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

        <div ref={chartRef} style={{ height: '400px' }} className="mt-4" />
      </div>
    </div>
  );
}