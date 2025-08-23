import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../lib/types';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import type { Position } from './PositionManager';

interface ProfitLossChartProps {
  theme: Theme;
  positions: Position[];
  currentPrice: number;
}

export function ProfitLossChart({ theme, positions, currentPrice }: ProfitLossChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const { currencyConfig, getThemedColors } = useCurrency();

  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
    }

    chartInstanceRef.current = echarts.init(chartRef.current);
    const isDark = theme === 'dark';
    const themedColors = getThemedColors(theme);

    // 计算单个期权在特定股价下的盈亏
    const calculateOptionProfit = (position: Position, stockPrice: number): number => {
      const { type, action, strike, premium, quantity } = position;
      let intrinsicValue = 0;

      if (type === 'call') {
        intrinsicValue = Math.max(0, stockPrice - strike);
      } else {
        intrinsicValue = Math.max(0, strike - stockPrice);
      }

      const optionValue = intrinsicValue;
      const costBasis = premium;

      if (action === 'buy') {
        return (optionValue - costBasis) * quantity * 100;
      } else {
        return (costBasis - optionValue) * quantity * 100;
      }
    };

    // 计算组合总盈亏
    const calculateTotalProfit = (stockPrice: number): number => {
      return positions.reduce((total, position) => {
        return total + calculateOptionProfit(position, stockPrice);
      }, 0);
    };

    // 生成盈亏数据和关键点位
    const generateProfitLossData = () => {
      if (positions.length === 0) {
        return { 
          data: [], 
          markers: [], 
          calculatedBreakEvenPoints: [], 
          extremePoints: [] 
        };
      }

      // 确定价格范围
      const strikes = positions.map(p => p.strike);
      const minStrike = Math.min(...strikes);
      const maxStrike = Math.max(...strikes);
      const priceRange = maxStrike - minStrike;
      const minPrice = Math.max(0, minStrike - priceRange * 0.3);
      const maxPrice = maxStrike + priceRange * 0.3;

      // 生成数据点（增加密度以提高精度）
      const dataPoints = 200;
      const priceStep = (maxPrice - minPrice) / dataPoints;
      const data: [number, number][] = [];
      
      for (let i = 0; i <= dataPoints; i++) {
        const price = minPrice + i * priceStep;
        const profit = calculateTotalProfit(price);
        data.push([price, profit]);
      }

      // 计算关键点位
      const markers: any[] = [];
      const calculatedBreakEvenPoints: { price: number; profit: number }[] = [];
      const extremePoints: { price: number; profit: number; type: 'max' | 'min' }[] = [];

      // 寻找盈亏平衡点（使用线性插值）
      for (let i = 0; i < data.length - 1; i++) {
        const [price1, profit1] = data[i];
        const [price2, profit2] = data[i + 1];
        
        if ((profit1 <= 0 && profit2 >= 0) || (profit1 >= 0 && profit2 <= 0)) {
          // 线性插值计算精确的零点
          const ratio = Math.abs(profit1) / (Math.abs(profit1) + Math.abs(profit2));
          const breakEvenPrice = price1 + (price2 - price1) * ratio;
          calculatedBreakEvenPoints.push({ price: breakEvenPrice, profit: 0 });
        }
      }

      // 寻找极值点
      for (let i = 1; i < data.length - 1; i++) {
        const [price, profit] = data[i];
        const [, prevProfit] = data[i - 1];
        const [, nextProfit] = data[i + 1];
        
        // 局部最大值
        if (profit > prevProfit && profit > nextProfit && profit > 10) {
          extremePoints.push({ price, profit, type: 'max' });
        }
        // 局部最小值
        if (profit < prevProfit && profit < nextProfit && profit < -10) {
          extremePoints.push({ price, profit, type: 'min' });
        }
      }

      // 添加行权价点位
      positions.forEach(position => {
        const strikeProfit = calculateTotalProfit(position.strike);
        markers.push({
          coord: [position.strike, strikeProfit],
          label: {
            show: true,
            position: strikeProfit >= 0 ? 'top' : 'bottom',
            formatter: `行权价 ${position.strike}\n${formatCurrency(position.strike, currencyConfig)}\n${formatCurrency(strikeProfit, currencyConfig)}`,
            backgroundColor: 'rgba(128, 90, 213, 0.8)',
            borderColor: '#805ad5',
            borderWidth: 2,
            borderRadius: 6,
            padding: [8, 12],
            textStyle: {
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 'bold'
            }
          },
          symbol: 'diamond',
          symbolSize: 8,
          itemStyle: {
            color: '#805ad5',
            borderColor: '#ffffff',
            borderWidth: 2
          }
        });
      });

      // 添加盈亏平衡点标记
      calculatedBreakEvenPoints.forEach(point => {
        markers.push({
          coord: [point.price, point.profit],
          label: {
            show: true,
            position: 'top',
            formatter: `盈亏平衡点\n${formatCurrency(point.price, currencyConfig)}\n${formatCurrency(point.profit, currencyConfig)}`,
            backgroundColor: 'rgba(34, 197, 94, 0.8)',
            borderColor: '#22c55e',
            borderWidth: 2,
            borderRadius: 6,
            padding: [8, 12],
            textStyle: {
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 'bold'
            }
          },
          symbol: 'triangle',
          symbolSize: 10,
          itemStyle: {
            color: '#22c55e',
            borderColor: '#ffffff',
            borderWidth: 2
          }
        });
      });

      // 添加极值点标记
      extremePoints.forEach(point => {
        markers.push({
          coord: [point.price, point.profit],
          label: {
            show: true,
            position: point.type === 'max' ? 'top' : 'bottom',
            formatter: `${point.type === 'max' ? '最大盈利' : '最大亏损'}\n${formatCurrency(point.price, currencyConfig)}\n${formatCurrency(point.profit, currencyConfig)}`,
            backgroundColor: point.type === 'max' ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)',
            borderColor: point.type === 'max' ? '#22c55e' : '#ef4444',
            borderWidth: 2,
            borderRadius: 6,
            padding: [8, 12],
            textStyle: {
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 'bold'
            }
          },
          symbol: 'rect',
          symbolSize: 8,
          itemStyle: {
            color: point.type === 'max' ? '#22c55e' : '#ef4444',
            borderColor: '#ffffff',
            borderWidth: 2
          }
        });
      });

      // 当前股价点（仅显示红点，不显示标签）
      if (currentPrice > 0) {
        const currentProfit = calculateTotalProfit(currentPrice);
        markers.push({
          coord: [currentPrice, currentProfit],
          label: {
            show: false
          },
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: {
            color: '#ff6347',
            borderColor: '#ffffff',
            borderWidth: 2
          }
        });
      }

      return { data, markers, calculatedBreakEvenPoints, extremePoints };
    };

    // 确定显示范围
    const strikes = positions.map(p => p.strike);
    const minStrike = strikes.length > 0 ? Math.min(...strikes) : currentPrice;
    const maxStrike = strikes.length > 0 ? Math.max(...strikes) : currentPrice;
    const priceRange = Math.max(maxStrike - minStrike, currentPrice * 0.2);
    const minDisplayPrice = Math.max(0, Math.min(minStrike, currentPrice) - priceRange * 0.3);
    const maxDisplayPrice = Math.max(maxStrike, currentPrice) + priceRange * 0.3;

    // 过滤数据到显示范围内
    const { data: profitLossData, markers, calculatedBreakEvenPoints, extremePoints } = generateProfitLossData();
    const filteredData = profitLossData.filter(([price, _]) =>
      price >= minDisplayPrice && price <= maxDisplayPrice
    );

    const hasValidData = positions.length > 0 && filteredData.some(([_, profit]) => profit !== 0);

    const option = {
      title: {
        text: hasValidData ? '到期盈亏分析' : '到期盈亏分析 - 请添加期权仓位',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16
        }
      },
      tooltip: {
        show: hasValidData,
        trigger: 'axis',
        backgroundColor: isDark ? '#374151' : '#ffffff',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        formatter: (params: any) => {
          // 确保params是数组格式
          const paramsArray = Array.isArray(params) ? params : [params];
          const param = paramsArray[0];
          
          if (!param || !param.data || !Array.isArray(param.data) || param.data.length < 2) {
            return '';
          }

          const [price, profit] = param.data;
          
          if (typeof price !== 'number' || typeof profit !== 'number' || 
              isNaN(price) || isNaN(profit)) {
            return '';
          }

          // 检查是否是当前股价点
          const isCurrentPrice = Math.abs(price - currentPrice) < 0.01;
          const priceLabel = isCurrentPrice ? '当前股价' : '股价';

          return `
            <div style="font-weight: bold; margin-bottom: 4px;">
              ${priceLabel}: ${formatCurrency(price, currencyConfig)}
            </div>
            <div>
              盈亏: ${formatCurrency(profit, currencyConfig)}
            </div>
          `;
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '15%'
      },
      xAxis: {
        type: 'value',
        name: '股价',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
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
        },
        min: minDisplayPrice,
        max: maxDisplayPrice
      },
      yAxis: {
        type: 'value',
        name: '盈亏',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
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
          name: '盈亏',
          type: 'line',
          data: filteredData,
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: themedColors.chart.upColor,
            width: 3
          },
          markPoint: {
            data: markers,
            silent: false
          },
          markLine: {
            data: [
              {
                yAxis: 0,
                lineStyle: {
                  color: isDark ? '#6b7280' : '#9ca3af',
                  type: 'dashed',
                  width: 2
                },
                label: {
                  show: false
                }
              }
            ]
          }
        }
      ]
    };

    chartInstanceRef.current.setOption(option);

    const handleResize = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [theme, positions, currentPrice, currencyConfig]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
        到期盈亏分析
      </h3>
      <div ref={chartRef} style={{ height: '400px' }} />
    </div>
  );
}