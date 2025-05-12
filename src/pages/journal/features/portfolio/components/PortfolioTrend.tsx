import React from 'react';
import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Theme, themes } from '../../../../../lib/theme';
import type { TrendData } from '../../../../../lib/services/types';
import type { CurrencyConfig } from '../../../../../lib/types';
import { formatCurrency } from '../../../../../lib/types';

interface PortfolioTrendProps {
  trendData: TrendData[];
  theme: Theme;
  currencyConfig: CurrencyConfig;
}

export function PortfolioTrend({ trendData, theme, currencyConfig }: PortfolioTrendProps) {
  const lineChartData = {
    labels: trendData.map(point => format(new Date(point.date), 'MMM d, yyyy')),
    datasets: [
      {
        label: 'Portfolio Value',
        data: trendData.map(point => point.value),
        borderColor: theme === 'dark' ? '#60a5fa' : '#3b82f6',
        backgroundColor: theme === 'dark' ? '#60a5fa33' : '#3b82f633',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      }
    ]
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `Value: ${formatCurrency(context.raw, currencyConfig)}`;
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
          callback: (value: number) => formatCurrency(value, currencyConfig)
        }
      }
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>Portfolio Trend</h3>
        <div className="flex items-center gap-2">
          <TrendingUp className={`w-5 h-5 ${themes[theme].text} opacity-75`} />
        </div>
      </div>
      <div className="h-[300px]">
        <Line data={lineChartData} options={lineChartOptions} />
      </div>
    </div>
  );
}