import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import 'echarts-gl';
import { format, differenceInDays } from 'date-fns';
import { Theme, themes } from '../lib/theme';
import { optionsService } from '../lib/services';
import { useCurrency } from '../lib/context/CurrencyContext';
import { formatCurrency } from '../lib/types';
import { RelatedLinks } from '../components/common/RelatedLinks';

interface OptionsProps {
  theme: Theme;
}

export function Options({ theme }: OptionsProps) {
  const surfaceChartRef = useRef<HTMLDivElement>(null);
  const timeValueChartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const timeValueChartInstanceRef = useRef<echarts.ECharts | null>(null);
  const isMountedRef = useRef(true);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('SPY');
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeDisplayMode, setTimeDisplayMode] = useState<'days' | 'percentage'>('days');
  const { getThemedColors, currencyConfig } = useCurrency();
  // Fetch available symbols on component mount
  useEffect(() => {
    const fetchAvailableSymbols = async () => {
      try {
        setIsLoadingSymbols(true);
        const { data, error } = await optionsService.getAvailableSymbols();
        
        if (error) {
          throw error;
        }
        
        if (data && data.length > 0) {
          setAvailableSymbols(data);
          setSelectedSymbol(data[0]); // Set first symbol as default
        }
      } catch (err) {
        console.error('Error fetching available symbols:', err);
        // Fallback to default symbols if API fails
        const fallbackSymbols = ['SPY', 'QQQ', 'AAPL', 'TSLA'];
        setAvailableSymbols(fallbackSymbols);
        setSelectedSymbol(fallbackSymbols[0]);
      } finally {
        setIsLoadingSymbols(false);
      }
    };

    fetchAvailableSymbols();
  }, []);

  // Fetch options data when selected symbol changes
  useEffect(() => {
    const fetchOptionsData = async () => {
      if (!selectedSymbol) return;
      
      try {
        setIsLoading(true);
        setError(null);
        const { data, error } = await optionsService.getOptionsData(selectedSymbol);
        console.log(data);
        if (error) {
          throw error;
        }
        
        if (data) {
          setOptionsData(data);
          // Set the first expiry date as default
          const uniqueExpiryDates = Array.from(new Set(data.quotes.map(q => q.expiry)))
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          if (uniqueExpiryDates.length > 0) {
            setSelectedExpiry(uniqueExpiryDates[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching options data:', err);
        setError(err instanceof Error ? err.message : `Failed to load options data for ${selectedSymbol}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOptionsData();
  }, [selectedSymbol]);

  const uniqueExpiryDates = optionsData 
    ? Array.from(new Set(optionsData.quotes.map(q => q.expiry)))
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    : [];

  const quotesByExpiry = optionsData && selectedExpiry
    ? optionsData.quotes.filter(q => q.expiry === selectedExpiry)
        .sort((a, b) => a.strike - b.strike)
    : [];

  // 找到时间价值最大的期权合约作为平值合约
  const getAtTheMoneyStrike = (quotes: OptionQuote[]): number => {
    if (quotes.length === 0) return 0;
    
    let maxTimeValue = 0;
    let atmStrike = quotes[0].strike;
    
    quotes.forEach(quote => {
      const callTimeValue = quote.callTimeValue || 0;
      const putTimeValue = quote.putTimeValue || 0;
      const totalTimeValue = callTimeValue + putTimeValue;
      
      if (totalTimeValue > maxTimeValue) {
        maxTimeValue = totalTimeValue;
        atmStrike = quote.strike;
      }
    });
    
    return atmStrike;
  };

  const atmStrike = getAtTheMoneyStrike(quotesByExpiry);

  // 获取期权状态标识
  const getOptionStatus = (strike: number, isCall: boolean) => {
    if (strike === atmStrike) {
      return { label: 'ATM', color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900' };
    } else if (isCall) {
      // Call期权：执行价格低于平值为价内(ITM)，高于平值为价外(OTM)
      return strike < atmStrike 
        ? { label: 'ITM', color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900' }
        : { label: 'OTM', color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700' };
    } else {
      // Put期权：执行价格高于平值为价内(ITM)，低于平值为价外(OTM)
      return strike > atmStrike 
        ? { label: 'ITM', color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900' }
        : { label: 'OTM', color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700' };
    }
  };

  useEffect(() => {
    // Set mounted flag
    isMountedRef.current = true;

    // Cleanup function
    return () => {
      isMountedRef.current = false;
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      if (timeValueChartInstanceRef.current) {
        timeValueChartInstanceRef.current.dispose();
        timeValueChartInstanceRef.current = null;
      }
    };
  }, []); // Empty dependency array means this only runs on mount/unmount

  useEffect(() => {
    if (!surfaceChartRef.current || !isMountedRef.current) return;

    // Dispose of existing chart if it exists
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    // Create new chart instance
    chartInstanceRef.current = echarts.init(surfaceChartRef.current);
    const isDark = theme === 'dark';

    // Prepare data for the 3D surface
    if (!optionsData) return;
    
    const strikes = Array.from(new Set(optionsData.surface.map(p => p.strike))).sort((a, b) => a - b);
    const expiries = Array.from(new Set(optionsData.surface.map(p => p.expiry))).sort();
    
    const callData = strikes.map((strike, i) => 
      expiries.map((expiry, j) => {
        const point = optionsData.surface.find(p => p.strike === strike && p.expiry === expiry && p.type === 'call');
        return [i, j, point?.value || 0];
      })
    ).flat();

    const putData = strikes.map((strike, i) => 
      expiries.map((expiry, j) => {
        const point = optionsData.surface.find(p => p.strike === strike && p.expiry === expiry && p.type === 'put');
        return [i, j, point?.value || 0];
      })
    ).flat();

    const option = {
      title: {
        text: 'Option Price Surface',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      tooltip: {},
      backgroundColor: 'transparent',
      xAxis3D: {
        type: 'category',
        name: 'Strike',
        data: strikes.map(s => s.toFixed(2)),
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      yAxis3D: {
        type: 'category',
        name: 'Expiry',
        data: expiries.map(e => format(new Date(e), 'MMM d, yyyy')),
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      zAxis3D: {
        type: 'value',
        name: 'Price',
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      grid3D: {
        boxWidth: 100,
        boxHeight: 80,
        boxDepth: 80,
        viewControl: {
          projection: 'perspective',
          autoRotate: true,
          autoRotateSpeed: 10,
          distance: 200
        },
        light: {
          main: {
            intensity: 1.2
          },
          ambient: {
            intensity: 0.3
          }
        }
      },
      series: [
        {
          type: 'surface',
          name: 'Call Options',
          data: callData,
          shading: 'realistic',
          itemStyle: {
            color: getThemedColors(theme).chart.upColor
          }
        },
        {
          type: 'surface',
          name: 'Put Options',
          data: putData,
          shading: 'realistic',
          itemStyle: {
            color: getThemedColors(theme).chart.downColor
          }
        }
      ]
    };

    // Only set option and update loading state if component is still mounted
    if (isMountedRef.current && chartInstanceRef.current) {
      chartInstanceRef.current.setOption(option);
      setIsLoading(false);
    }

    // Handle resize
    const handleResize = () => {
      if (isMountedRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [theme, optionsData]);

  // Time Value Chart Effect
  useEffect(() => {
    if (!timeValueChartRef.current || !isMountedRef.current || !optionsData) return;

    // Dispose of existing chart if it exists
    if (timeValueChartInstanceRef.current) {
      timeValueChartInstanceRef.current.dispose();
      timeValueChartInstanceRef.current = null;
    }

    // Create new chart instance
    timeValueChartInstanceRef.current = echarts.init(timeValueChartRef.current);
    const isDark = theme === 'dark';

    // Get unique expiry dates and sort them
    const expiryDates = Array.from(new Set(optionsData.quotes.map(q => q.expiry)))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // Calculate time value data for each expiry
    const timeValueData = expiryDates.map(expiry => {
      const quotesForExpiry = optionsData.quotes.filter(q => q.expiry === expiry);
      
      // Find ATM strike (highest time value)
      let maxTimeValue = 0;
      let atmCallTimeValue = 0;
      
      quotesForExpiry.forEach(quote => {
        const totalTimeValue = (quote.callTimeValue || 0) + (quote.putTimeValue || 0);
        if (totalTimeValue > maxTimeValue) {
          maxTimeValue = totalTimeValue;
          atmCallTimeValue = quote.callTimeValue || 0;
        }
      });

      const now = new Date();
      const expiryDate = new Date(expiry);
      const daysToExpiry = differenceInDays(expiryDate, now);
      
      // Calculate percentage of time remaining (assuming max 365 days)
      const timePercentage = Math.max(0, Math.min(100, (daysToExpiry / 365) * 100));

      return {
        expiry,
        daysToExpiry,
        timePercentage,
        callTimeValue: atmCallTimeValue
      };
    });

    // Prepare chart data based on display mode
    const xAxisData = timeValueData.map(item => 
      timeDisplayMode === 'days' 
        ? `${item.daysToExpiry}天`
        : `${item.timePercentage.toFixed(1)}%`
    );
    
    const seriesData = timeValueData.map(item => item.callTimeValue);

    const option = {
      title: {
        text: `${selectedSymbol} 平值Call期权时间价值`,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#374151' : '#ffffff',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        formatter: (params: any) => {
          const dataIndex = params[0].dataIndex;
          const item = timeValueData[dataIndex];
          return `
            <div>
              <div style="font-weight: bold; margin-bottom: 4px;">
                到期日: ${format(new Date(item.expiry), 'yyyy-MM-dd')}
              </div>
              <div>剩余天数: ${item.daysToExpiry}天</div>
              <div>时间比例: ${item.timePercentage.toFixed(1)}%</div>
              <div>时间价值: ${formatCurrency(item.callTimeValue, currencyConfig)}</div>
            </div>
          `;
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '20%'
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        name: timeDisplayMode === 'days' ? '剩余天数' : '时间比例',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 12
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '时间价值',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 12
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value, currencyConfig)
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db'
          }
        },
        splitLine: {
          lineStyle: {
            color: isDark ? '#374151' : '#f3f4f6'
          }
        }
      },
      series: [
        {
          name: '时间价值',
          type: 'line',
          data: seriesData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            color: getThemedColors(theme).chart.upColor,
            width: 3
          },
          itemStyle: {
            color: getThemedColors(theme).chart.upColor
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: getThemedColors(theme).chart.upColor + '40'
                },
                {
                  offset: 1,
                  color: getThemedColors(theme).chart.upColor + '10'
                }
              ]
            }
          }
        }
      ]
    };

    // Only set option if component is still mounted
    if (isMountedRef.current && timeValueChartInstanceRef.current) {
      timeValueChartInstanceRef.current.setOption(option);
    }

    // Handle resize
    const handleResize = () => {
      if (isMountedRef.current && timeValueChartInstanceRef.current) {
        timeValueChartInstanceRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [theme, optionsData, selectedSymbol, timeDisplayMode, currencyConfig]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div className={`${themes[theme].card} rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${themes[theme].text}`}>
                Options Trading Analysis - {selectedSymbol}
              </h1>
              <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                Advanced options chain analysis and surface visualization
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  Symbol:
                </label>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  disabled={isLoadingSymbols || isLoading}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text} ${
                    (isLoadingSymbols || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {availableSymbols.map(symbol => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </div>
              {(isLoadingSymbols || isLoading) && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              )}
            </div>
          </div>
        </div>

        {(isLoading || isLoadingSymbols) && (
          <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className={`${themes[theme].text}`}>
                {isLoadingSymbols ? 'Loading available symbols...' : `Loading options data for ${selectedSymbol}...`}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
            <div className="p-6 text-center">
              <div className="text-red-500 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <p className={`${themes[theme].text} mb-4`}>{error}</p>
              <button
                onClick={() => setSelectedSymbol(selectedSymbol)} // Trigger re-fetch
                className={`px-4 py-2 rounded-md ${themes[theme].primary}`}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!isLoading && !isLoadingSymbols && !error && optionsData && (
          <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                Option Chain - {selectedSymbol}
              </h2>
              <select
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(e.target.value)}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                {uniqueExpiryDates.map(date => (
                  <option key={date} value={date}>
                    {format(new Date(date), 'MMM d, yyyy')}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${themes[theme].background}`}>
                  <tr>
                    <th colSpan={4} className={`text-center px-4 py-2 border-b border-r ${themes[theme].border} ${themes[theme].text}`}>
                      Calls
                    </th>
                    <th className={`px-4 py-2 border-b ${themes[theme].border} ${themes[theme].text} text-center font-bold`}>
                      标的行权价格
                    </th>
                    <th colSpan={4} className={`text-center px-4 py-2 border-b border-l ${themes[theme].border} ${themes[theme].text}`}>
                      Puts
                    </th>
                  </tr>
                  <tr>
                    <th className={`px-3 py-2 ${themes[theme].text} text-right text-sm`}>隐含波动率</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-right text-sm`}>内在价值</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-right text-sm`}>时间价值</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-right text-sm border-r ${themes[theme].border}`}>最新价</th>
                    <th className={`px-4 py-2 ${themes[theme].text} text-center font-bold`}>行权价</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-left text-sm border-l ${themes[theme].border}`}>最新价</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-left text-sm`}>时间价值</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-left text-sm`}>内在价值</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-left text-sm`}>隐含波动率</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${themes[theme].border}`}>
                  {quotesByExpiry.map((quote: OptionQuote) => {
                    const callStatus = getOptionStatus(quote.strike, true);
                    const putStatus = getOptionStatus(quote.strike, false);
                    
                    return (
                    <tr key={quote.strike} className={themes[theme].cardHover}>
                        {/* Call Options - 从右到左排列 */}
                        <td className={`px-3 py-3 text-right ${themes[theme].text} text-sm`}>
                          <div className="flex flex-col items-end">
                            <span>{(quote.callImpliedVol * 100).toFixed(1)}%</span>
                            <span className={`text-xs px-1 py-0.5 rounded ${callStatus.color} mt-1`}>
                              {callStatus.label}
                            </span>
                          </div>
                        </td>
                        <td className={`px-3 py-3 text-right ${themes[theme].text} text-sm`}>
                          {formatCurrency(quote.callIntrinsicValue || 0, currencyConfig)}
                        </td>
                        <td className={`px-3 py-3 text-right ${themes[theme].text} text-sm`}>
                          {formatCurrency(quote.callTimeValue || 0, currencyConfig)}
                        </td>
                        <td className={`px-3 py-3 text-right ${themes[theme].text} border-r ${themes[theme].border}`}>
                          {quote.callUrl ? (
                            <a 
                              href={quote.callUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            >
                              {formatCurrency(quote.callPrice, currencyConfig)}
                            </a>
                          ) : (
                            <span className="font-medium">
                              {formatCurrency(quote.callPrice, currencyConfig)}
                            </span>
                          )}
                        </td>
                        
                        {/* Strike Price - 中心位置 */}
                        <td className={`px-4 py-3 text-center font-bold ${themes[theme].text} bg-opacity-50 ${themes[theme].background}`}>
                          {formatCurrency(quote.strike, currencyConfig)}
                        </td>
                        
                        {/* Put Options - 从左到右排列 */}
                        <td className={`px-3 py-3 text-left ${themes[theme].text} border-l ${themes[theme].border}`}>
                          {quote.putUrl ? (
                            <a 
                              href={quote.putUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            >
                              {formatCurrency(quote.putPrice, currencyConfig)}
                            </a>
                          ) : (
                            <span className="font-medium">
                              {formatCurrency(quote.putPrice, currencyConfig)}
                            </span>
                          )}
                        </td>
                        <td className={`px-3 py-3 text-left ${themes[theme].text} text-sm`}>
                          {formatCurrency(quote.putTimeValue || 0, currencyConfig)}
                        </td>
                        <td className={`px-3 py-3 text-left ${themes[theme].text} text-sm`}>
                          {formatCurrency(quote.putIntrinsicValue || 0, currencyConfig)}
                        </td>
                        <td className={`px-3 py-3 text-left ${themes[theme].text} text-sm`}>
                          <div className="flex flex-col items-start">
                            <span>{(quote.putImpliedVol * 100).toFixed(1)}%</span>
                            <span className={`text-xs px-1 py-0.5 rounded ${putStatus.color} mt-1`}>
                              {putStatus.label}
                            </span>
                          </div>
                        </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}

        {!isLoading && !isLoadingSymbols && !error && optionsData && (
          <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
            <div className="p-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
                <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                  平值Call期权时间价值趋势 - {selectedSymbol}
                </h2>
                <div className="flex items-center gap-2">
                  <label className={`text-sm font-medium ${themes[theme].text}`}>
                    时间显示:
                  </label>
                  <select
                    value={timeDisplayMode}
                    onChange={(e) => setTimeDisplayMode(e.target.value as 'days' | 'percentage')}
                    className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                  >
                    <option value="days">按天数</option>
                    <option value="percentage">按比例</option>
                  </select>
                </div>
              </div>
              <div ref={timeValueChartRef} style={{ height: '400px' }} />
            </div>
          </div>
        )}

        {!isLoading && !isLoadingSymbols && !error && optionsData && (
          <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6">
            <h2 className={`text-xl font-bold mb-6 ${themes[theme].text}`}>
              Option Surface Visualization - {selectedSymbol}
            </h2>
            <div ref={surfaceChartRef} style={{ height: '600px' }} />
          </div>
        </div>
        )}

        <RelatedLinks 
          theme={theme} 
          currentPath="/options" 
          maxItems={4}
        />
      </div>
    </div>
  );
}