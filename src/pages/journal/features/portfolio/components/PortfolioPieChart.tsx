import React from 'react';
import { Theme } from '../../../../../lib/theme';
import type { CurrencyConfig } from '../../../../../lib/types';
import { formatCurrency } from '../../../../../lib/types';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface PortfolioPieChartProps {
  holdings: Array<{ stock_code: string; total_value: number }>;
  totalValue: number;
  theme: Theme;
  currencyConfig: CurrencyConfig;
}

export function PortfolioPieChart({ holdings, totalValue, theme, currencyConfig }: PortfolioPieChartProps) {
  const data = {
    labels: holdings.map(h => h.stock_code),
    datasets: [
      {
        data: holdings.map(h => h.total_value),
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
          'rgba(255, 159, 64, 0.8)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(255, 206, 86, 0.8)',
        ],
        borderColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827',
          font: { size: 12 },
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw;
            const percentage = ((value / totalValue) * 100).toFixed(1);
            return `${formatCurrency(value, currencyConfig)} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Pie data={data} options={options} />
      </div>
    </div>
  );
}