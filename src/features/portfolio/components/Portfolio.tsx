import React, { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { ArrowUpCircle, ArrowDownCircle, Calendar, Filter, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, BarChart2, Briefcase, ExternalLink } from 'lucide-react';
import { Theme, themes } from '../../../shared/constants/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { Holding, Trade, TrendData } from '../../../lib/services/types';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { portfolioService } from '../../../lib/services';
import { PortfolioTrend } from './PortfolioTrend';
import { PortfolioHeatmap } from './PortfolioHeatmap';
import { StockAnalysisModal } from './StockAnalysisModal';
import { PortfolioAnalysisPanel } from './PortfolioAnalysisPanel';
import { AccountSelector } from '../../../shared/components';

ChartJS.register(
  ArcElement, 
  Tooltip, 
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement
);

interface PortfolioProps {
  holdings: Holding[];
  theme: Theme;
  recentTrades?: Trade[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  isSharedView?: boolean;
  userId?: string;
  selectedAccountId?: string | null;
  onAccountChange?: (accountId: string) => void;
}

const DEMO_USER_ID = 'mock-user-id';
const DEMO_ACCOUNT_ID = 'mock-account-id';

export function Portfolio({ 
  holdings, 
  theme, 
  recentTrades = [], 
  dateRange, 
  onDateRangeChange,
  isSharedView = false,
  userId,
  selectedAccountId,
  onAccountChange
}: PortfolioProps) {
  const [showRecentTrades, setShowRecentTrades] = useState(true);
  const [holdingsPage, setHoldingsPage] = useState(1);
  const [holdingsPerPage, setHoldingsPerPage] = useState(5);
  const [holdingsSort, setHoldingsSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'total_value', direction: 'desc' });
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPerPage, setTradesPerPage] = useState(5);
  const [tradesSort, setTradesSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'created_at', direction: 'desc' });
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [selectedStockForAnalysis, setSelectedStockForAnalysis] = useState<{ code: string; name: string } | null>(null);
  const [showPortfolioAnalysis, setShowPortfolioAnalysis] = useState(false);
  const { currencyConfig } = useCurrency();
  
  // Calculate portfolio metrics
  const totalHoldingsValue = holdings.reduce((sum, holding) => sum + holding.total_value, 0);
  const totalProfitLoss = holdings.reduce((sum, holding) => sum + holding.profit_loss, 0);
  
  // Get latest trend value for total market value
  const latestTrendValue = trendData.length > 0 ? trendData[trendData.length - 1].value : totalHoldingsValue;
  
  // Calculate position ratio
  const positionRatio = latestTrendValue > 0 ? (totalHoldingsValue / latestTrendValue) * 100 : 0;

  // Get UUID from URL params for portfolio sharing
  const portfolioUuid = new URLSearchParams(window.location.search).get('uuid');

  useEffect(() => {
    const fetchTrendData = async () => {
      try {
        let response;
        if (portfolioUuid) {
          // Use UUID-based API for shared portfolios
          response = await portfolioService.getTrendDataByUuid(
            portfolioUuid,
            dateRange.startDate,
            dateRange.endDate
          );
        } else if (!isSharedView) {
          // 使用账户ID作为主要参数，用户ID作为查询参数
          response = await portfolioService.getTrendData(
            userId || DEMO_USER_ID,
            dateRange.startDate,
            dateRange.endDate,
            selectedAccountId || DEMO_ACCOUNT_ID
          );
        }
        
        if (response?.data) {
          setTrendData(response.data);
        }
      } catch (error) {
        console.error('Error fetching trend data:', error);
      }
    };

    fetchTrendData();
  }, [dateRange, isSharedView, portfolioUuid, selectedAccountId, userId]);

  const setQuickDateRange = (days: number) => {
    if (isSharedView && !portfolioUuid) return; // Disable date range changes in shared view without UUID
    
    const endDate = new Date();
    const startDate = subDays(endDate, days);
    onDateRangeChange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
  };

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

  const sortTrades = (trades: Trade[]) => {
    return [...trades].sort((a, b) => {
      const multiplier = tradesSort.direction === 'asc' ? 1 : -1;
      switch (tradesSort.field) {
        case 'created_at':
          return multiplier * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        case 'stock_code':
          return multiplier * a.stock_code.localeCompare(b.stock_code);
        case 'operation':
          return multiplier * a.operation.localeCompare(b.operation);
        case 'target_price':
          return multiplier * (a.target_price - b.target_price);
        case 'quantity':
          return multiplier * (a.quantity - b.quantity);
        default:
          return 0;
      }
    });
  };

  const sortedHoldings = sortHoldings(holdings);
  const sortedTrades = sortTrades(recentTrades);

  const paginatedHoldings = sortedHoldings.slice(
    (holdingsPage - 1) * holdingsPerPage,
    holdingsPage * holdingsPerPage
  );
  
  const paginatedTrades = sortedTrades.slice(
    (tradesPage - 1) * tradesPerPage,
    tradesPage * tradesPerPage
  );

  const totalHoldingsPages = Math.ceil(holdings.length / holdingsPerPage);
  const totalTradesPages = Math.ceil(recentTrades.length / tradesPerPage);

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

  const SortIcon = ({ field, currentSort }: { field: string, currentSort: { field: string; direction: 'asc' | 'desc' } }) => {
    if (field !== currentSort.field) {
      return <ArrowUp className="w-4 h-4 opacity-30" />;
    }
    return currentSort.direction === 'asc' ? 
      <ArrowUp className="w-4 h-4" /> : 
      <ArrowDown className="w-4 h-4" />;
  };

  const handleHoldingsSort = (field: string) => {
    setHoldingsSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleTradesSort = (field: string) => {
    setTradesSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <div className="space-y-6">
      {isSharedView && (
        <div className={`${themes[theme].card} rounded-lg p-4 border-l-4 border-blue-500`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ExternalLink className="w-5 h-5 text-blue-500" />
              <span className={`text-sm font-medium ${themes[theme].text}`}>
                This is a shared portfolio view
              </span>
            </div>
            <span className={`text-xs ${themes[theme].text} opacity-60`}>
              Read-only access
            </span>
          </div>
        </div>
      )}

      {/* Portfolio Analysis Panel */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>智能分析</h3>
          <button
            onClick={() => setShowPortfolioAnalysis(!showPortfolioAnalysis)}
            className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
          >
            {showPortfolioAnalysis ? '隐藏分析' : '查看分析'}
          </button>
        </div>
        {showPortfolioAnalysis && <PortfolioAnalysisPanel theme={theme} portfolioUuid={portfolioUuid} userId={userId} selectedAccountId={selectedAccountId} />}
      </div>

      {/* Stock Analysis Modal */}
      {selectedStockForAnalysis && (
        <StockAnalysisModal
          stockCode={selectedStockForAnalysis.code}
          stockName={selectedStockForAnalysis.name}
          theme={theme}
          onClose={() => setSelectedStockForAnalysis(null)}
        />
      )}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
            <div className="flex items-center gap-4">
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                Portfolio Overview
              </h2>
              {userId && onAccountChange && (
                <AccountSelector
                  userId={userId}
                  theme={theme}
                  selectedAccountId={selectedAccountId || null}
                  onAccountChange={onAccountChange}
                />
              )}
            </div>
            {(!isSharedView || portfolioUuid) && (
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => setQuickDateRange(7)}
                    className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                  >
                    1W
                  </button>
                  <button
                    onClick={() => setQuickDateRange(30)}
                    className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                  >
                    1M
                  </button>
                  <button
                    onClick={() => setQuickDateRange(90)}
                    className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                  >
                    3M
                  </button>
                  <button
                    onClick={() => setQuickDateRange(180)}
                    className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                  >
                    6M
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
                    className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                  />
                  <span className={`text-sm ${themes[theme].text}`}>to</span>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
                    className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总市值</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(latestTrendValue, currencyConfig)}
              </p>
              <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                {trendData.length > 0 ? 'Based on latest trend data' : 'Based on holdings value'}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总仓位</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(totalHoldingsValue, currencyConfig)}
              </p>
              <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                Sum of all holdings market value
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>持仓比例</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {positionRatio.toFixed(2)}%
              </p>
              <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                Holdings / Total market value
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>持仓盈亏</h3>
              <p className={`text-2xl font-bold mt-1 ${totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}
              </p>
              <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                Sum of all holdings P/L
              </p>
            </div>
          </div>
        </div>

        {trendData.length > 0 && (
          <PortfolioTrend 
            trendData={trendData}
            theme={theme}
            dateRange={dateRange}
          />
        )}

        <PortfolioHeatmap 
          holdings={holdings}
          theme={theme}
        />

        <div className="grid md:grid-cols-2 gap-6 p-6">
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
                          onClick={() => setSelectedStockForAnalysis({ code: holding.stock_code, name: holding.stock_name })}
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
        </div>
      </div>

      {recentTrades.length > 0 && (
        <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <h2 className={`text-lg font-semibold ${themes[theme].text}`}>Recent Trades</h2>
              <button
                onClick={() => setShowRecentTrades(!showRecentTrades)}
                className={`p-2 rounded-md ${themes[theme].secondary}`}
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {showRecentTrades && (
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <div className={`text-sm ${themes[theme].text}`}>
                  Showing {Math.min(recentTrades.length, (tradesPage - 1) * tradesPerPage + 1)} to {Math.min(recentTrades.length, tradesPage * tradesPerPage)} of {recentTrades.length} trades
                </div>
                <select
                  value={tradesPerPage}
                  onChange={(e) => setTradesPerPage(Number(e.target.value))}
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
                        onClick={() => handleTradesSort('created_at')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Date</span>
                          <SortIcon field="created_at" currentSort={tradesSort} />
                        </div>
                      </th>
                      <th 
                        className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleTradesSort('stock_code')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Stock</span>
                          <SortIcon field="stock_code" currentSort={tradesSort} />
                        </div>
                      </th>
                      <th 
                        className={`px-6 py-3 text-center text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleTradesSort('operation')}
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>Operation</span>
                          <SortIcon field="operation" currentSort={tradesSort} />
                        </div>
                      </th>
                      <th 
                        className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleTradesSort('target_price')}
                      >
                        <div className="flex items-center justify-end space-x-1">
                          <span>Price</span>
                          <SortIcon field="target_price" currentSort={tradesSort} />
                        </div>
                      </th>
                      <th 
                        className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleTradesSort('quantity')}
                      >
                        <div className="flex items-center justify-end space-x-1">
                          <span>Quantity</span>
                          <SortIcon field="quantity" currentSort={tradesSort} />
                        </div>
                      </th>
                      <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${themes[theme].border}`}>
                    {paginatedTrades.map((trade) => (
                      <tr key={trade.id} className={themes[theme].cardHover}>
                        <td className={`px-6 py-4 text-sm ${themes[theme].text}`}>
                          {format(new Date(trade.created_at), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <div className={`text-sm font-medium ${themes[theme].text}`}>{trade.stock_code}</div>
                            <div className={`text-sm ${themes[theme].text} opacity-75`}>{trade.stock_name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center">
                            {trade.operation === 'buy' ? (
                              <ArrowUpCircle className="w-5 h-5" style={{ color: currencyConfig.region === 'CN' || currencyConfig.region === 'JP' ? '#ef5350' : '#26a69a' }} />
                            ) : (
                              <ArrowDownCircle className="w-5 h-5" style={{ color: currencyConfig.region === 'CN' || currencyConfig.region === 'JP' ? '#26a69a' : '#ef5350' }} />
                            )}
                          </div>
                        </td>
                        <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                          {formatCurrency(trade.target_price, currencyConfig)}
                        </td>
                        <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                          {trade.quantity}
                        </td>
                        <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                          {formatCurrency(trade.target_price * trade.quantity, currencyConfig)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mt-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => setTradesPage(Math.max(1, tradesPage - 1))}
                    disabled={tradesPage === 1}
                    className={`p-1 rounded-md ${themes[theme].secondary} ${
                      tradesPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setTradesPage(Math.min(totalTradesPages, tradesPage + 1))}
                    disabled={tradesPage === totalTradesPages}
                    className={`p-1 rounded-md ${themes[theme].secondary} ${
                      tradesPage === totalTradesPages ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}