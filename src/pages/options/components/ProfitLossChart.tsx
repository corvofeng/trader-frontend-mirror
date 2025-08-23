import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../lib/types';
import type { Position } from './OptionsCalculator';

interface ProfitLossChartProps {
  positions: Position[];
  currentStockPrice: number;
  theme: Theme;
}

interface KeyPoint {
  price: number;
  profit: number;
  type: 'current' | 'strike' | 'breakeven' | 'maxProfit' | 'maxLoss';
  label: string;
}

export function ProfitLossChart({ positions, currentStockPrice, theme }: ProfitLossChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { currencyConfig, regionalColors } = useCurrency();

  const calculateOptionValue = (
    stockPrice: number,
    strike: number,
    type: 'call' | 'put',
    action: 'buy' | 'sell',
    premium: number,
    quantity: number
  ) => {
    let intrinsicValue = 0;
    
    if (type === 'call') {
      intrinsicValue = Math.max(0, stockPrice - strike);
    } else {
      intrinsicValue = Math.max(0, strike - stockPrice);
    }
    
    const contractValue = intrinsicValue * quantity * 100;
    const premiumPaid = premium * quantity * 100;
    
    if (action === 'buy') {
      return contractValue - premiumPaid;
    } else {
      return premiumPaid - contractValue;
    }
  };

  const generateProfitLossData = () => {
    if (positions.length === 0) {
      return { 
        data: [], 
        keyPoints: [],
        minPrice: currentStockPrice * 0.8,
        maxPrice: currentStockPrice * 1.2
      };
    }

    const strikes = positions.map(p => p.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const priceRange = maxStrike - minStrike;
    const buffer = Math.max(priceRange * 0.3, currentStockPrice * 0.2);
    
    const minPrice = Math.max(0.01, minStrike - buffer);
    const maxPrice = maxStrike + buffer;
    const numPoints = 200;
    const step = (maxPrice - minPrice) / (numPoints - 1);

    const data: [number, number][] = [];
    const keyPoints: KeyPoint[] = [];

    // 生成盈亏数据
    for (let i = 0; i < numPoints; i++) {
      const price = minPrice + i * step;
      let totalProfit = 0;

      positions.forEach(position => {
        totalProfit += calculateOptionValue(
          price,
          position.strike,
          position.type,
          position.action,
          position.premium,
          position.quantity
        );
      });

      data.push([price, totalProfit]);
    }

    // 收集关键点位
    // 1. 当前股价点
    let currentProfit = 0;
    positions.forEach(position => {
      currentProfit += calculateOptionValue(
        currentStockPrice,
        position.strike,
        position.type,
        position.action,
        position.premium,
        position.quantity
      );
    });

    keyPoints.push({
      price: currentStockPrice,
      profit: currentProfit,
      type: 'current',
      label: '当前股价'
    });

    // 2. 行权价点
    positions.forEach(position => {
      let strikeProfit = 0;
      positions.forEach(pos => {
        strikeProfit += calculateOptionValue(
          position.strike,
          pos.strike,
          pos.type,
          pos.action,
          pos.premium,
          pos.quantity
        );
      });

      keyPoints.push({
        price: position.strike,
        profit: strikeProfit,
        type: 'strike',
        label: `行权价 ${formatCurrency(position.strike, currencyConfig)}`
      });
    });

    // 3. 盈亏平衡点（使用线性插值）
    for (let i = 0; i < data.length - 1; i++) {
      const [price1, profit1] = data[i];
      const [price2, profit2] = data[i + 1];
      
      if ((profit1 <= 0 && profit2 >= 0) || (profit1 >= 0 && profit2 <= 0)) {
        if (profit1 !== profit2) {
          const ratio = -profit1 / (profit2 - profit1);
          const breakEvenPrice = price1 + ratio * (price2 - price1);
          
          keyPoints.push({
            price: breakEvenPrice,
            profit: 0,
            type: 'breakeven',
            label: '盈亏平衡点'
          });
        }
      }
    }

    // 4. 极值点
    let maxProfit = -Infinity;
    let maxLoss = Infinity;
    let maxProfitPrice = 0;
    let maxLossPrice = 0;

    data.forEach(([price, profit]) => {
      if (profit > maxProfit) {
        maxProfit = profit;
        maxProfitPrice = price;
      }
      if (profit < maxLoss) {
        maxLoss = profit;
        maxLossPrice = price;
      }
    });

    if (maxProfit > 10) {
      keyPoints.push({
        price: maxProfitPrice,
        profit: maxProfit,
        type: 'maxProfit',
        label: '最大盈利点'
      });
    }

    if (maxLoss < -10) {
      keyPoints.push({
        price: maxLossPrice,
        profit: maxLoss,
        type: 'maxLoss',
        label: '最大亏损点'
      });
    }

    return { 
      data, 
      keyPoints,
      minPrice,
      maxPrice
    };
  };

  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const isDark = theme === 'dark';
    const { data: profitLossData, keyPoints, minPrice, maxPrice } = generateProfitLossData();

    // 过滤数据到显示范围内
    const minDisplayPrice = minPrice;
    const maxDisplayPrice = maxPrice;
    const filteredData = profitLossData.filter(([price, _]) =>
      price >= minDisplayPrice && price <= maxDisplayPrice
    );

    // 准备标记点数据
    const markPointData = keyPoints.map(point => {
      const getPointStyle = (type: string) => {
        switch (type) {
          case 'current':
            return { 
              symbol: 'circle', 
              symbolSize: 12, 
              itemStyle: { color: '#ef4444', borderColor: '#dc2626', borderWidth: 2 }
            };
          case 'strike':
            return { 
              symbol: 'diamond', 
              symbolSize: 10, 
              itemStyle: { color: '#8b5cf6', borderColor: '#7c3aed', borderWidth: 2 }
            };
          case 'breakeven':
            return { 
              symbol: 'triangle', 
              symbolSize: 10, 
              itemStyle: { color: '#06b6d4', borderColor: '#0891b2', borderWidth: 2 }
            };
          case 'maxProfit':
            return { 
              symbol: 'rect', 
              symbolSize: 10, 
              itemStyle: { color: regionalColors.upColor, borderColor: regionalColors.upColor, borderWidth: 2 }
            };
          case 'maxLoss':
            return { 
              symbol: 'rect', 
              symbolSize: 10, 
              itemStyle: { color: regionalColors.downColor, borderColor: regionalColors.downColor, borderWidth: 2 }
            };
          default:
            return { 
              symbol: 'circle', 
              symbolSize: 8, 
              itemStyle: { color: '#6b7280' }
            };
        }
      };

      const pointStyle = getPointStyle(point.type);
      
      return {
        coord: [point.price, point.profit],
        ...pointStyle,
        label: {
          show: true,
          position: point.profit >= 0 ? 'top' : 'bottom',
          distance: 15,
          formatter: `${point.label}\n${formatCurrency(point.price, currencyConfig)}\n${point.profit >= 0 ? '+' : ''}${formatCurrency(point.profit, currencyConfig)}`,
          backgroundColor: isDark ? 'rgba(55, 65, 81, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderColor: pointStyle.itemStyle.color,
          borderWidth: 1,
          borderRadius: 4,
          padding: [4, 8],
          textStyle: {
            color: isDark ? '#e5e7eb' : '#111827',
            fontSize: 11,
            fontWeight: 500
          }
        }
      };
    });

    const option = {
      title: {
        text: positions.length > 0 ? '到期盈亏分析' : '到期盈亏分析 - 请添加期权仓位',
        left: 'center',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16
        }
      },
      tooltip: {
        show: false // 禁用默认tooltip
      },
      grid: {
        left: '12%',
        right: '8%',
        bottom: '25%',
        top: '15%'
      },
      xAxis: {
        type: 'value',
        name: '股价',
        nameLocation: 'middle',
        nameGap: 30,
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
      dataZoom: [
        {
          type: 'inside',
          start: 50,
          end: 100
        },
        {
          show: true,
          type: 'slider',
          top: '90%',
          start: 50,
          end: 100
        }
      ],
      series: [
        {
          name: '盈亏',
          type: 'line',
          data: filteredData,
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color: regionalColors.upColor,
            width: 3
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
                  color: regionalColors.upColor + '40'
                },
                {
                  offset: 1,
                  color: regionalColors.upColor + '10'
                }
              ]
            }
          },
          markPoint: positions.length > 0 ? {
            data: markPointData,
            silent: false
          } : undefined,
          markLine: {
            silent: true,
            lineStyle: {
              color: isDark ? '#6b7280' : '#9ca3af',
              type: 'dashed',
              width: 1
            },
            data: [
              {
                yAxis: 0,
                label: {
                  show: false
                }
              }
            ]
          }
        }
      ]
    };

    chart.setOption(option);

    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }
    };
  }, [positions, currentStockPrice, theme, currencyConfig, regionalColors]);

  return (
    <div>
      <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
        到期盈亏图
      </h3>
      <div ref={chartRef} style={{ height: '500px' }} />
    </div>
  );
}