import React from 'react';
import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Theme, themes } from '../../../../../lib/theme';
import type { TrendData } from '../../../../../lib/services/types';
import type { CurrencyConfig } from '../../../../../lib/types';
import { formatCurrency } from '../../../../../lib/types';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';

interface PortfolioTrendProps {
  trendData: TrendData[];
  theme: Theme;
}

export function PortfolioTrend({ trendData, theme }: PortfolioTrendProps) {
  const { currencyConfig, getThemedColors } = useCurrency();
  const themedColors = getThemedColors(theme);

  const lineChartData = {
    labels: trendData.map(point => format(new Date(point.date), 'MMM d, yyyy')),
    datasets: [
      {
        label: '总资产',
        data: trendData.map(point => point.value),
        borderColor: themedColors.chart.upColor,
        backgroundColor: themedColors.chart.upColor + '33',
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
      },
      {
        label: '持仓市值',
        data: trendData.map(point => point.position_value || 0),
        borderColor: themedColors.chart.downColor,
        backgroundColor: themedColors.chart.downColor + '33',
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
        borderDash: [5, 5], // 虚线样式
      }
    ]
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: theme === 'dark' ? '#e5e7eb' : '#374151',
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: theme === 'dark' ? '#374151' : '#ffffff',
        titleColor: theme === 'dark' ? '#e5e7eb' : '#374151',
        bodyColor: theme === 'dark' ? '#e5e7eb' : '#374151',
        borderColor: theme === 'dark' ? '#4b5563' : '#e5e7eb',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = formatCurrency(context.raw, currencyConfig);
            return `${label}: ${value}`;
          },
          afterBody: (tooltipItems: any[]) => {
            if (tooltipItems.length >= 2) {
              const assetValue = tooltipItems[0].raw;
              const positionValue = tooltipItems[1].raw;
              const ratio = assetValue > 0 ? ((positionValue / assetValue) * 100).toFixed(2) : '0.00';
              return [`持仓比例: ${ratio}%`];
            }
            return [];
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: theme === 'dark' ? '#374151' : '#e5e7eb'
        },
        ticks: {
          color: theme === 'dark' ? '#e5e7eb' : '#374151'
        }
      },
      y: {
        grid: {
          color: theme === 'dark' ? '#374151' : '#e5e7eb'
        },
        ticks: {
          color: theme === 'dark' ? '#e5e7eb' : '#374151',
          callback: (value: any) => formatCurrency(value, currencyConfig)
        }
      }
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    hover: {
      mode: 'index' as const,
      intersect: false,
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>Portfolio Trend</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500"></div>
            <span className={`text-sm ${themes[theme].text} opacity-75`}>总资产</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-green-500 border-dashed" style={{ borderTop: '1px dashed' }}></div>
            <span className={`text-sm ${themes[theme].text} opacity-75`}>持仓市值</span>
          </div>
          <TrendingUp className={`w-5 h-5 ${themes[theme].text} opacity-75`} />
        </div>
      </div>
      <div className="h-[300px]">
        <Line data={lineChartData} options={lineChartOptions} />
      </div>
    </div>
  );
}