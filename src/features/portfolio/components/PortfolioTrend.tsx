import React from 'react';
import { format } from 'date-fns';
import { TrendingUp, BarChart3, RefreshCw } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Theme, themes } from '../../../shared/constants/theme';
import { stockService } from '../../../lib/services';
import type { TrendData } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types';
import { formatCurrency } from '../../../shared/constants/currency';
import { useCurrency } from '../../../lib/context/CurrencyContext';

interface PortfolioTrendProps {
  trendData: TrendData[];
  theme: Theme;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export function PortfolioTrend({ trendData, theme, dateRange }: PortfolioTrendProps) {
  const { currencyConfig, getThemedColors } = useCurrency();
  const themedColors = getThemedColors(theme);
  const [sseData, setSseData] = React.useState<any[]>([]);
  const [showComparison, setShowComparison] = React.useState(true);
  const [isLoadingSSE, setIsLoadingSSE] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'absolute' | 'return'>('absolute');

  // Fetch SSE data for comparison
  React.useEffect(() => {
    const fetchSSEData = async () => {
      setIsLoadingSSE(true);
      try {
        const { data } = await stockService.getStockData('^SSEC');
        if (data) {
          // Filter SSE data to match the date range
          const startDate = new Date(dateRange.startDate);
          const endDate = new Date(dateRange.endDate);
          
          const filteredData = data.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate && itemDate <= endDate;
          });
          
          // Helper function to fill missing trading days for SSE data
          const fillMissingSSEDays = (data: any[]): any[] => {
            if (data.length === 0) return data;
            
            const filledData: any[] = [];
            const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            for (let i = 0; i < sortedData.length; i++) {
              filledData.push(sortedData[i]);
              
              // Fill gaps between current and next data point
              if (i < sortedData.length - 1) {
                const currentDate = new Date(sortedData[i].date);
                const nextDate = new Date(sortedData[i + 1].date);
                const daysDiff = Math.ceil((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                
                // If there's a gap of more than 1 day, fill with interpolated values
                if (daysDiff > 1) {
                  const currentPoint = sortedData[i];
                  const nextPoint = sortedData[i + 1];
                  
                  for (let j = 1; j < daysDiff; j++) {
                    const interpolationRatio = j / daysDiff;
                    const interpolatedDate = new Date(currentDate);
                    interpolatedDate.setDate(currentDate.getDate() + j);
                    
                    // Linear interpolation for smooth transitions
                    const interpolatedClose = currentPoint.close + 
                      (nextPoint.close - currentPoint.close) * interpolationRatio;
                    
                    filledData.push({
                      date: interpolatedDate.toISOString().split('T')[0],
                      close: interpolatedClose,
                      returnRate: 0 // Will be calculated later
                    });
                  }
                }
              }
            }
            
            return filledData;
          };
          
          // Calculate SSE return rates
          if (filteredData.length > 0) {
            // First fill missing days, then calculate returns
            const smoothedSSEData = fillMissingSSEDays(filteredData);
            const basePrice = filteredData[0].close;
            const sseReturnData = smoothedSSEData.map(item => ({
              date: item.date,
              close: item.close,
              returnRate: ((item.close - basePrice) / basePrice) * 100
            }));
            setSseData(sseReturnData);
          }
        }
      } catch (error) {
        console.error('Error fetching SSE data:', error);
      } finally {
        setIsLoadingSSE(false);
      }
    };

    if (showComparison && trendData.length > 0) {
      fetchSSEData();
    }
  }, [dateRange, showComparison, trendData.length]);

  // Prepare chart data based on view mode
  const getChartData = () => {
    if (viewMode === 'return') {
      // Return rate view
      // Calculate portfolio returns based on first data point as baseline
      const portfolioReturns = trendData.length > 0 
        ? trendData.map(point => {
            const baseValue = trendData[0].value;
            return baseValue > 0 ? ((point.value - baseValue) / baseValue) * 100 : 0;
          })
        : [];
      
      const positionReturns = trendData.map(point => {
        if (!point.position_value || !trendData[0]?.position_value) return 0;
        return ((point.position_value - trendData[0].position_value) / trendData[0].position_value) * 100;
      });
      
      const datasets = [
        {
          label: '总资产收益率',
          data: portfolioReturns,
          borderColor: themedColors.chart.upColor,
          backgroundColor: themedColors.chart.upColor + '33',
          fill: false,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 6,
          borderWidth: 2,
        }
      ];

      // Add SSE comparison if available
      if (showComparison && sseData.length > 0) {
        // Match SSE data points with portfolio data points
        const matchedSSEReturns = trendData.map(portfolioPoint => {
          const portfolioDate = new Date(portfolioPoint.date).toISOString().split('T')[0];
          const ssePoint = sseData.find(sse => sse.date === portfolioDate);
          return ssePoint ? ssePoint.returnRate : null;
        });

        datasets.push({
          label: '上证指数收益率',
          data: matchedSSEReturns,
          borderColor: '#9ca3af',
          backgroundColor: '#9ca3af33',
          fill: false,
          tension: 0.4,
          pointRadius: 1,
          pointHoverRadius: 4,
          borderWidth: 1.5,
          borderDash: [3, 3],
        });
      }

      return {
        labels: trendData.map(point => format(new Date(point.date), 'MMM d, yyyy')),
        datasets
      };
    } else {
      // Absolute value view (original)
      return {
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
            borderDash: [5, 5],
          }
        ]
      };
    }
  };

  const lineChartData = getChartData();

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
            if (viewMode === 'return') {
              const value = context.raw;
              return `${label}: ${value !== null ? (value >= 0 ? '+' : '') + value.toFixed(2) + '%' : 'N/A'}`;
            } else {
              const value = formatCurrency(context.raw, currencyConfig);
              return `${label}: ${value}`;
            }
          },
          afterBody: (tooltipItems: any[]) => {
            if (viewMode === 'absolute' && tooltipItems.length >= 2) {
              const assetValue = tooltipItems[0].raw;
              const positionValue = tooltipItems[1].raw;
              if (assetValue > 0 && positionValue > 0) {
                const ratio = ((positionValue / assetValue) * 100).toFixed(2);
                return [`持仓比例: ${ratio}%`];
              }
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
          callback: (value: any) => {
            if (viewMode === 'return') {
              return value.toFixed(1) + '%';
            } else {
              return formatCurrency(value, currencyConfig);
            }
          }
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
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
            {viewMode === 'return' ? '收益率趋势' : '资产趋势'}
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('absolute')}
                className={`px-3 py-1 rounded-md text-sm ${
                  viewMode === 'absolute' ? themes[theme].primary : themes[theme].secondary
                }`}
              >
                绝对值
              </button>
              <button
                onClick={() => setViewMode('return')}
                className={`px-3 py-1 rounded-md text-sm ${
                  viewMode === 'return' ? themes[theme].primary : themes[theme].secondary
                }`}
              >
                收益率
              </button>
            </div>
            
            {viewMode === 'return' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowComparison(!showComparison)}
                  disabled={isLoadingSSE}
                  className={`px-3 py-1 rounded-md text-sm ${
                    showComparison ? themes[theme].primary : themes[theme].secondary
                  } ${isLoadingSSE ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isLoadingSSE ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <BarChart3 className="w-4 h-4 mr-1" />
                      上证对比
                    </>
                  )}
                </button>
              </div>
            )}
            <div className="flex items-center gap-4">
            {viewMode === 'absolute' ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5" style={{ backgroundColor: themedColors.chart.upColor }}></div>
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>总资产</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 border-dashed" style={{ 
                    borderTop: `1px dashed ${themedColors.chart.downColor}` 
                  }}></div>
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>持仓市值</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5" style={{ backgroundColor: themedColors.chart.upColor }}></div>
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>总资产收益率</span>
                </div>
                {showComparison && sseData.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 border-dashed" style={{ 
                      borderTop: '1px dashed #9ca3af' 
                    }}></div>
                    <span className={`text-sm ${themes[theme].text} opacity-75`}>上证指数</span>
                  </div>
                )}
              </>
            )}
            </div>
            <TrendingUp className={`w-5 h-5 ${themes[theme].text} opacity-75`} />
          </div>
        </div>
        <div className="h-[300px]">
          <Line data={lineChartData} options={lineChartOptions} />
        </div>
      </div>
    </>
  );
}