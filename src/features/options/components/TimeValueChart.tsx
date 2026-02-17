import React, { useEffect, useRef, useState } from 'react';
import { logger } from '../../../shared/utils/logger';
import * as echarts from 'echarts';
import type { CallbackDataParams } from 'echarts';
import { format, differenceInDays } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../shared/utils/format';
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
    if (!timeValueChartRef.current || !isMountedRef.current || !optionsData) {
      logger.debug('[TimeValueChart] Guard: chart not ready or data missing', {
        hasRef: !!timeValueChartRef.current,
        isMounted: !!isMountedRef.current,
        hasData: !!optionsData,
      });
      return;
    }

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

    if (expiryDates.length === 0) {
      logger.debug('[TimeValueChart] No expiry dates found, skipping chart render');
      return;
    }

    const now = new Date();

    // 基础维度：每个到期日对应的元数据（剩余天数、时间比例）
    const metaData = expiryDates.map(expiry => {
      const expiryDate = new Date(expiry);
      const daysToExpiry = differenceInDays(expiryDate, now);
      const timePercentage = Math.max(0, Math.min(100, (daysToExpiry / 365) * 100));
      return {
        expiry,
        daysToExpiry,
        timePercentage
      };
    });

    // X 轴：按配置展示“剩余天数 / 时间比例”
    const xAxisData = metaData.map(item =>
      timeDisplayMode === 'days'
        ? `${item.daysToExpiry}天`
        : `${item.timePercentage.toFixed(1)}%`
    );

    // 所有行权价集合（用于按行权价画多条时间价值曲线）
    const strikeSet = new Set<number>();
    optionsData.quotes.forEach(q => {
      if (typeof q.strike === 'number') {
        strikeSet.add(q.strike);
      }
    });
    const strikes = Array.from(strikeSet).sort((a, b) => a - b);

    if (strikes.length === 0) {
      logger.debug('[TimeValueChart] No strikes found, skipping chart render');
      return;
    }

    // 计算整体的“平值”行权价（总时间价值最大的合约，用于高亮）
    let globalAtmStrike = strikes[0];
    let globalMaxTimeValue = 0;
    optionsData.quotes.forEach(quote => {
      const callTimeValue = quote.callTimeValue || 0;
      const putTimeValue = quote.putTimeValue || 0;
      const totalTimeValue = callTimeValue + putTimeValue;
      if (totalTimeValue > globalMaxTimeValue) {
        globalMaxTimeValue = totalTimeValue;
        globalAtmStrike = quote.strike;
      }
    });

    // 只保留平值附近少量行权价，避免图表过于杂乱
    const MAX_SERIES = 7;
    let filteredStrikes = strikes;
    if (strikes.length > MAX_SERIES) {
      filteredStrikes = [...strikes]
        .sort((a, b) => Math.abs(a - globalAtmStrike) - Math.abs(b - globalAtmStrike))
        .slice(0, MAX_SERIES)
        .sort((a, b) => a - b);
    }

    // 为每个行权价构建一条时间价值曲线（随到期日变化）
    const series = filteredStrikes.map(strike => {
      const data = expiryDates.map(expiry => {
        const match = optionsData.quotes.find(q => q.expiry === expiry && q.strike === strike);
        if (!match) return null;
        return match.callTimeValue || 0;
      });

      const isAtm = strike === globalAtmStrike;

      return {
        name: `K=${strike}`,
        type: 'line',
        data,
        smooth: true,
        symbol: isAtm ? 'circle' : 'none',
        symbolSize: isAtm ? 6 : 3,
        lineStyle: {
          width: isAtm ? 3 : 1.5,
          opacity: isAtm ? 1 : 0.7
        },
        itemStyle: isAtm
          ? {
              color: getThemedColors(theme).chart.upColor
            }
          : undefined,
        emphasis: {
          focus: 'series'
        }
      };
    });

    const option = {
      title: {
        text: `${selectedSymbol} 平值附近Call期权时间价值（按行权价）`,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16
        }
      },
      legend: {
        type: 'scroll',
        top: 40,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#374151' : '#ffffff',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        formatter: (params: CallbackDataParams | CallbackDataParams[]) => {
          const paramsArray = Array.isArray(params) ? params : [params];
          const first = paramsArray[0];
          const dataIndex = first?.dataIndex ?? 0;
          const item = metaData[dataIndex];
          if (!item) return '';

          const lines = paramsArray
            .filter(p => p.data != null)
            .sort((a, b) => {
              const av = typeof a.data === 'number' ? a.data : Number(a.data || 0);
              const bv = typeof b.data === 'number' ? b.data : Number(b.data || 0);
              return bv - av;
            })
            .map(p => {
              const value = typeof p.data === 'number' ? p.data : Number(p.data || 0);
              return `<div>行权价 ${p.seriesName}: ${formatCurrency(value, currencyConfig)}</div>`;
            })
            .join('');

          return `
            <div>
              <div style="font-weight: bold; margin-bottom: 4px;">
                到期日: ${format(new Date(item.expiry), 'yyyy-MM-dd')}
              </div>
              <div>剩余天数: ${item.daysToExpiry}天</div>
              <div>时间比例: ${item.timePercentage.toFixed(1)}%</div>
              ${lines}
            </div>
          `;
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '25%'
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
        ...series
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
  }, [theme, optionsData, selectedSymbol, timeDisplayMode, currencyConfig, getThemedColors]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>
            平值附近Call期权时间价值趋势（按行权价） - {selectedSymbol}
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
