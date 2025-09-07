import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { format, differenceInDays } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../lib/types';
import type { OptionsData } from '../../../lib/services/types';

interface TimeValueChartProps {
  theme: Theme;
  optionsData: OptionsData;
  selectedSymbol: string;
}

export function TimeValueChart({ theme, optionsData, selectedSymbol }: TimeValueChartProps) {
  const timeValueChartRef = useRef<HTMLDivElement>(null);
  const timeValueChartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [timeDisplayMode, setTimeDisplayMode] = useState<'days' | 'percentage'>('days');
  const { currencyConfig, getThemedColors } = useCurrency();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeValueChartInstanceRef.current) {
        timeValueChartInstanceRef.current.dispose();
        timeValueChartInstanceRef.current = null;
      }
    };
  }, []);

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
  );
}