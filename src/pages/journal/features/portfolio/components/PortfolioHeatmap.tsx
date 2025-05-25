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
          // Divide by number of tags to avoid double counting
          const valuePerTag = holding.total_value / tags.length;
          const profitLossPerTag = holding.profit_loss / tags.length;
          stats.totalValue += valuePerTag;
          stats.profitLoss += profitLossPerTag;
          stats.holdings.push({
            ...holding,
            total_value: valuePerTag,
            profit_loss: profitLossPerTag
          });
        });
      });
    }

    // Calculate profit/loss percentages for groups
    groups.forEach(stats => {
      const costBasis = stats.totalValue - stats.profitLoss;
      stats.profitLossPercentage = costBasis !== 0 ? (stats.profitLoss / costBasis) * 100 : 0;
    });

    // Calculate max value for color scaling
    const maxValue = Math.max(...Array.from(groups.values()).map(stats => Math.abs(stats.profitLossPercentage)));

    // Prepare treemap data
    const data = Array.from(groups.entries()).map(([groupName, stats]) => {
      const intensity = Math.min(0.9, Math.abs(stats.profitLossPercentage) / maxValue) + 0.1;
      const baseColor = stats.profitLossPercentage >= 0 ? [38, 166, 154] : [239, 83, 80];
      const groupColor = `rgba(${baseColor.join(',')}, ${intensity})`;

      return {
        name: groupName,
        value: stats.totalValue,
        groupStats: stats,
        itemStyle: {
          color: groupColor,
          borderColor: isDark ? '#374151' : '#e5e7eb',
          borderWidth: 1,
          gapWidth: 2
        },
        label: {
          show: true,
          position: 'inside',
          formatter: (params: any) => {
            const stats = params.data.groupStats;
            return [
              `{title|${groupName}}`,
              `{value|${stats.profitLossPercentage >= 0 ? '+' : ''}${stats.profitLossPercentage.toFixed(2)}%}`,
              `{total|${formatCurrency(stats.totalValue, currencyConfig)}}`
            ].join('\n');
          },
          rich: {
            title: {
              fontSize: 16,
              fontWeight: 'bold',
              color: '#ffffff',
              padding: [8, 8, 4, 8],
              width: '100%',
              backgroundColor: groupColor
            },
            value: {
              fontSize: 14,
              color: '#ffffff',
              padding: [4, 8],
              align: 'left'
            },
            total: {
              fontSize: 12,
              color: '#ffffff',
              padding: [0, 8, 8, 8],
              align: 'left'
            }
          }
        },
        children: stats.holdings.map(holding => {
          const holdingIntensity = Math.min(0.9, Math.abs(holding.profit_loss_percentage) / maxValue) + 0.1;
          const holdingBaseColor = holding.profit_loss_percentage >= 0 ? [38, 166, 154] : [239, 83, 80];
          const holdingColor = `rgba(${holdingBaseColor.join(',')}, ${holdingIntensity})`;

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
                  padding: [4, 8, 0, 8]
                },
                value: {
                  fontSize: 12,
                  color: '#ffffff',
                  padding: [0, 8]
                },
                price: {
                  fontSize: 12,
                  color: '#ffffff',
                  padding: [0, 8, 4, 8]
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
          if (!params.data) return '';

          const isGroup = params.data.groupStats !== undefined;
          
          if (isGroup) {
            const stats = params.data.groupStats;
            return `
              <div style="font-weight: 500">${params.name}</div>
              <div style="margin-top: 4px">
                <div>Total Value: ${formatCurrency(stats.totalValue, currencyConfig)}</div>
                <div>Profit/Loss: ${formatCurrency(stats.profitLoss, currencyConfig)}</div>
                <div style="color: ${stats.profitLossPercentage >= 0 ? '#34d399' : '#f87171'}">
                  Return: ${stats.profitLossPercentage >= 0 ? '+' : ''}${stats.profitLossPercentage.toFixed(2)}%
                </div>
              </div>
            `;
          }

          const holding = holdings.find(h => h.stock_code === params.name);
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
        nodeClick: false,
        breadcrumb: {
          show: false
        },
        levels: [{
          itemStyle: {
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 1,
            gapWidth: 2
          }
        }],
        animation: true,
        animationDuration: 500,
        animationEasing: 'cubicOut',
        animationDelay: (idx: number) => idx * 100
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