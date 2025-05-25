import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Theme, themes } from '../../../../../lib/theme';
import type { Holding } from '../../../../../lib/services/types';
import { formatCurrency } from '../../../../../lib/types';
import type { CurrencyConfig } from '../../../../../lib/types';

interface PortfolioHeatmapProps {
  holdings: Holding[];
  theme: Theme;
  currencyConfig: CurrencyConfig;
}

export function PortfolioHeatmap({ holdings, theme, currencyConfig }: PortfolioHeatmapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || holdings.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const isDark = theme === 'dark';

    // Group holdings by category
    const categories = new Map<string, Holding[]>();
    holdings.forEach(holding => {
      const category = holding.category || 'Other';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)?.push(holding);
    });

    // Calculate max value for color scaling
    const maxValue = Math.max(...holdings.map(h => Math.abs(h.profit_loss_percentage)));

    // Prepare treemap data
    const data = Array.from(categories.entries()).map(([category, categoryHoldings]) => ({
      name: category,
      value: categoryHoldings.reduce((sum, h) => sum + h.total_value, 0),
      children: categoryHoldings.map(holding => {
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

          return `
            <div style="font-weight: 500">${holding.stock_code} - ${holding.stock_name}</div>
            <div style="margin-top: 4px">
              <div>Current Price: ${formatCurrency(holding.current_price, currencyConfig)}</div>
              <div>Total Value: ${formatCurrency(holding.total_value, currencyConfig)}</div>
              <div>Quantity: ${holding.quantity}</div>
            </div>
            <div style="margin-top: 4px; color: ${holding.profit_loss_percentage >= 0 ? '#34d399' : '#f87171'}">
              ${holding.profit_loss_percentage >= 0 ? '+' : ''}${holding.profit_loss_percentage.toFixed(2)}%
              (${formatCurrency(holding.profit_loss, currencyConfig)})
            </div>
            ${holding.tags ? `
            <div style="margin-top: 4px; font-size: 12px; opacity: 0.8">
              Tags: ${holding.tags.join(', ')}
            </div>
            ` : ''}
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
          show: true,
          height: 30,
          top: 10,
          itemStyle: {
            color: isDark ? '#374151' : '#f3f4f6',
            borderColor: isDark ? '#4b5563' : '#e5e7eb',
            textStyle: {
              color: isDark ? '#e5e7eb' : '#111827'
            }
          }
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
  }, [holdings, theme, currencyConfig]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6">
        <h2 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
          Portfolio Performance Heatmap
        </h2>
        <div ref={chartRef} style={{ height: '400px' }} />
      </div>
    </div>
  );
}