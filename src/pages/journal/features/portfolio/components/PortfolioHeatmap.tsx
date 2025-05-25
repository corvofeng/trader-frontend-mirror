import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Theme, themes } from '../../../../../lib/theme';
import type { Holding } from '../../../../../lib/services/types';
import { formatCurrency } from '../../../../../lib/types';
import type { CurrencyConfig } from '../../../../../lib/types';
import { Filter, X } from 'lucide-react';

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
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());

  // Get all available categories and tags
  const allCategories = Array.from(new Set(holdings.map(h => h.category || 'Other')));
  const allTags = Array.from(new Set(holdings.flatMap(h => h.tags || ['Untagged'])));

  const updateChart = () => {
    if (!chartRef.current || holdings.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const isDark = theme === 'dark';

    // Filter holdings based on selected filters
    const filteredHoldings = holdings.filter(holding => {
      if (selectedFilters.size === 0) return true;
      
      if (groupingDimension === 'category') {
        return selectedFilters.has(holding.category || 'Other');
      } else {
        const holdingTags = holding.tags || ['Untagged'];
        return holdingTags.some(tag => selectedFilters.has(tag));
      }
    });

    // Group holdings based on selected dimension
    const groups = new Map<string, Holding[]>();
    
    if (groupingDimension === 'category') {
      filteredHoldings.forEach(holding => {
        const category = holding.category || 'Other';
        if (!groups.has(category)) {
          groups.set(category, []);
        }
        groups.get(category)?.push(holding);
      });
    } else {
      filteredHoldings.forEach(holding => {
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
    const maxValue = Math.max(...filteredHoldings.map(h => Math.abs(h.profit_loss_percentage)));

    // Prepare treemap data
    const data = Array.from(groups.entries()).map(([groupName, groupHoldings]) => ({
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
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 1
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
    }));

    const option = {
      tooltip: {
        formatter: (params: any) => {
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
  };

  useEffect(() => {
    updateChart();

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
  }, [holdings, theme, currencyConfig, groupingDimension, selectedFilters]);

  const toggleFilter = (filter: string) => {
    setSelectedFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(filter)) {
        newFilters.delete(filter);
      } else {
        newFilters.add(filter);
      }
      return newFilters;
    });
  };

  const clearFilters = () => {
    setSelectedFilters(new Set());
  };

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
                  setSelectedFilters(new Set());
                }}
                className={`px-3 py-1.5 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="category">Group by Category</option>
                <option value="tags">Group by Tags</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <div className={`text-sm ${themes[theme].text} opacity-75`}>
              {groupingDimension === 'category' ? 'Categories:' : 'Tags:'}
            </div>
            {(groupingDimension === 'category' ? allCategories : allTags).map(filter => (
              <button
                key={filter}
                onClick={() => toggleFilter(filter)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedFilters.has(filter)
                    ? themes[theme].primary
                    : themes[theme].secondary
                }`}
              >
                {filter}
              </button>
            ))}
            {selectedFilters.size > 0 && (
              <button
                onClick={clearFilters}
                className={`inline-flex items-center px-2 py-1 rounded-full text-sm ${themes[theme].secondary}`}
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </button>
            )}
          </div>
        </div>

        <div ref={chartRef} style={{ height: '400px' }} className="mt-4" />
      </div>
    </div>
  );
}