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

interface TreemapData {
  name: string;
  value: number[];
  children?: TreemapData[];
  itemStyle?: {
    color: string;
  };
  label?: {
    formatter: string;
  };
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

    // Group holdings by sector/category
    const sectors = new Map<string, Holding[]>();
    holdings.forEach(holding => {
      const sector = 'Stocks'; // You can add sector categorization here
      if (!sectors.has(sector)) {
        sectors.set(sector, []);
      }
      sectors.get(sector)?.push(holding);
    });

    // Prepare treemap data
    const data: TreemapData[] = Array.from(sectors.entries()).map(([sector, sectorHoldings]) => ({
      name: sector,
      value: [0], // Placeholder for sector total value
      children: sectorHoldings.map(holding => {
        const color = holding.profit_loss_percentage >= 0 
          ? `rgba(38, 166, 154, ${Math.min(1, Math.abs(holding.profit_loss_percentage) / 10)})`
          : `rgba(239, 83, 80, ${Math.min(1, Math.abs(holding.profit_loss_percentage) / 10)})`;

        return {
          name: holding.stock_code,
          value: [
            holding.total_value,
            holding.profit_loss_percentage
          ],
          itemStyle: {
            color
          },
          label: {
            formatter: [
              `{name|${holding.stock_code}}`,
              `{value|${holding.profit_loss_percentage >= 0 ? '+' : ''}${holding.profit_loss_percentage.toFixed(2)}%}`,
              `{price|${formatCurrency(holding.current_price, currencyConfig)}}`
            ].join('\n')
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
            <div class="font-medium">${holding.stock_code} - ${holding.stock_name}</div>
            <div class="mt-1">Current Price: ${formatCurrency(holding.current_price, currencyConfig)}</div>
            <div>Total Value: ${formatCurrency(holding.total_value, currencyConfig)}</div>
            <div class="mt-1 ${holding.profit_loss_percentage >= 0 ? 'text-green-500' : 'text-red-500'}">
              ${holding.profit_loss_percentage >= 0 ? '+' : ''}${holding.profit_loss_percentage.toFixed(2)}%
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
        breadcrumb: { show: false },
        label: {
          show: true,
          position: 'inside',
          rich: {
            name: {
              fontSize: 16,
              lineHeight: 24,
              color: isDark ? '#e5e7eb' : '#111827'
            },
            value: {
              fontSize: 14,
              lineHeight: 20,
              color: isDark ? '#e5e7eb' : '#111827'
            },
            price: {
              fontSize: 12,
              lineHeight: 16,
              color: isDark ? '#9ca3af' : '#6b7280'
            }
          }
        },
        levels: [{
          itemStyle: {
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 1,
            gapWidth: 2
          }
        }]
      }]
    };

    chart.setOption(option);

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
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