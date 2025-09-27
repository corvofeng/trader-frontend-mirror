import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { Pie } from 'react-chartjs-2';
import { Theme, themes } from '../../../../../lib/theme';
import { formatCurrency } from '../../../../../shared/utils/format';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';
import type { Holding } from '../../../../../lib/services/types';

interface PortfolioHoldingsProps {
  holdings: Holding[];
  theme: Theme;
  onAnalyzeStock: (stock: { code: string; name: string }) => void;
}

export function PortfolioHoldings({ holdings, theme, onAnalyzeStock }: PortfolioHoldingsProps) {
  const [holdingsPage, setHoldingsPage] = useState(1);
  const [holdingsPerPage, setHoldingsPerPage] = useState(5);
  const [holdingsSort, setHoldingsSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ 
    field: 'total_value', 
    direction: 'desc' 
  });
  const { currencyConfig } = useCurrency();

  const totalHoldingsValue = holdings.reduce((sum, holding) => sum + holding.total_value, 0);

  const sortHoldings = (holdings: Holding[]) => {
    return [...holdings].sort((a, b) => {
      const multiplier = holdingsSort.direction === 'asc' ? 1 : -1;
      switch (holdingsSort.field) {
        case 'stock_code':
          return multiplier * a.stock_code.localeCompare(b.stock_code);
        case 'total_value':
          return multiplier * (a.total_value - b.total_value);
        case 'profit_loss_percentage':
          return multiplier * (a.profit_loss_percentage - b.profit_loss_percentage);
        default:
          return 0;
      }
    });
  };

  const handleHoldingsSort = (field: string) => {
    setHoldingsSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ field, currentSort }: { field: string, currentSort: { field: string; direction: 'asc' | 'desc' } }) => {
    if (field !== currentSort.field) {
      return <ArrowUp className="w-4 h-4 opacity-30" />;
    }
    return currentSort.direction === 'asc' ? 
      <ArrowUp className="w-4 h-4" /> : 
      <ArrowDown className="w-4 h-4" />;
  };

  const sortedHoldings = sortHoldings(holdings);
  const paginatedHoldings = sortedHoldings.slice(
    (holdingsPage - 1) * holdingsPerPage,
    holdingsPage * holdingsPerPage
  );
  const totalHoldingsPages = Math.ceil(holdings.length / holdingsPerPage);

  const sortedHoldingsForPie = [...holdings].sort((a, b) => b.total_value - a.total_value);

  const pieChartData = {
    labels: sortedHoldingsForPie.map(h => h.stock_name),
    datasets: [
      {
        data: sortedHoldingsForPie.map(h => h.total_value),
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

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827',
          font: { size: 12 },
          boxWidth: 12,
          padding: 10,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw;
            const percentage = ((value / totalHoldingsValue) * 100).toFixed(1);
            return `${context.label}: ${formatCurrency(value, currencyConfig)} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <>
      <div className="order-2 md:order-1">
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>Holdings</h3>
          <select
            value={holdingsPerPage}
            onChange={(e) => setHoldingsPerPage(Number(e.target.value))}
            className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          >
            <option value={5}>5 per page</option>
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`${themes[theme].background}`}>
              <tr>
                <th 
                  className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                  onClick={() => handleHoldingsSort('stock_code')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Stock</span>
                    <SortIcon field="stock_code" currentSort={holdingsSort} />
                  </div>
                </th>
                <th 
                  className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                  onClick={() => handleHoldingsSort('total_value')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Value</span>
                    <SortIcon field="total_value" currentSort={holdingsSort} />
                  </div>
                </th>
                <th 
                  className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                  onClick={() => handleHoldingsSort('profit_loss_percentage')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>P/L %</span>
                    <SortIcon field="profit_loss_percentage" currentSort={holdingsSort} />
                  </div>
                </th>
                <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${themes[theme].border}`}>
              {paginatedHoldings.map((holding) => (
                <tr key={holding.stock_code} className={themes[theme].cardHover}>
                  <td className="px-6 py-4">
                    <div>
                      <div className={`text-sm font-medium ${themes[theme].text}`}>{holding.stock_code}</div>
                      <div className={`text-sm ${themes[theme].text} opacity-75`}>{holding.stock_name}</div>
                    </div>
                  </td>
                  <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                    {formatCurrency(holding.total_value, currencyConfig)}
                  </td>
                  <td className={`px-6 py-4 text-right text-sm font-medium ${
                    holding.profit_loss_percentage >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {holding.profit_loss_percentage >= 0 ? '+' : ''}{holding.profit_loss_percentage.toFixed(2)}%
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onAnalyzeStock({ code: holding.stock_code, name: holding.stock_name })}
                      className={`px-3 py-1 rounded-md text-xs ${themes[theme].secondary}`}
                    >
                      分析
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className={`text-sm ${themes[theme].text}`}>
            Showing {Math.min(holdings.length, (holdingsPage - 1) * holdingsPerPage + 1)} to {Math.min(holdings.length, holdingsPage * holdingsPerPage)} of {holdings.length} holdings
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setHoldingsPage(Math.max(1, holdingsPage - 1))}
              disabled={holdingsPage === 1}
              className={`p-1 rounded-md ${themes[theme].secondary} ${
                holdingsPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setHoldingsPage(Math.min(totalHoldingsPages, holdingsPage + 1))}
              disabled={holdingsPage === totalHoldingsPages}
              className={`p-1 rounded-md ${themes[theme].secondary} ${
                holdingsPage === totalHoldingsPages ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="order-1 md:order-2">
        <div className="h-[300px] md:h-[400px] relative">
          <Pie data={pieChartData} options={pieChartOptions} />
        </div>
      </div>
    </>
  );
}