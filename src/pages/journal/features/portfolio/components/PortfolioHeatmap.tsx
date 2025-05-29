import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Filter, X } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';
import type { Holding, StockConfig } from '../../../../../lib/services/types';
import { formatCurrency } from '../../../../../lib/types';
import type { CurrencyConfig } from '../../../../../lib/types';
import { stockConfigService } from '../../../../../lib/services';

interface PortfolioHeatmapProps {
  holdings: Holding[];
  theme: Theme;
  currencyConfig: CurrencyConfig;
}

type GroupingDimension = 'category' | 'tags';

interface GroupStats {
  totalValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  dailyProfitLoss: number;
  dailyProfitLossPercentage: number;
  holdings: Holding[];
}

function getColorByPercentage(percentage: number, isDark: boolean): string {
  const colors = {
    positive: {
      strong: isDark ? '#059669' : '#10b981',
      medium: isDark ? '#34d399' : '#6ee7b7',
      weak: isDark ? '#6ee7b7' : '#a7f3d0',
    },
    negative: {
      strong: isDark ? '#dc2626' : '#ef4444',
      medium: isDark ? '#f87171' : '#fca5a5',
      weak: isDark ? '#fca5a5' : '#fee2e2',
    },
    neutral: isDark ? '#374151' : '#f3f4f6'
  };

  const thresholds = {
    strong: 2.5,
    medium: 1.5,
    weak: 0.5,
    neutral: 0.5
  };

  const getOpacity = (value: number): number => {
    const absValue = Math.abs(value);
    if (absValue >= thresholds.strong) return 0.9;
    if (absValue >= thresholds.medium) return 0.7;
    if (absValue >= thresholds.weak) return 0.5;
    return 0.3;
  };

  let baseColor: string;
  const absPercentage = Math.abs(percentage);

  if (absPercentage < thresholds.neutral) {
    return colors.neutral;
  } else if (percentage > 0) {
    if (absPercentage >= thresholds.strong) baseColor = colors.positive.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.positive.medium;
    else baseColor = colors.positive.weak;
  } else {
    if (absPercentage >= thresholds.strong) baseColor = colors.negative.strong;
    else if (absPercentage >= thresholds.medium) baseColor = colors.negative.medium;
    else baseColor = colors.negative.weak;
  }

  const opacity = getOpacity(percentage);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(baseColor);
  if (!result) return baseColor;
  
  const rgb = {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

export function PortfolioHeatmap({ holdings, theme, currencyConfig }: PortfolioHeatmapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [groupingDimension, setGroupingDimension] = useState<GroupingDimension>('category');
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [stockConfigs, setStockConfigs] = useState<StockConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const fetchStockConfigs = async () => {
      try {
        const { data, error } = await stockConfigService.getStockConfigs();
        if (error) throw error;
        if (data) {
          setStockConfigs(data);
        }
      } catch (error) {
        console.error('Failed to fetch stock configs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStockConfigs();
  }, []);

  useEffect(() => {
    if (!chartRef.current || holdings.length === 0 || isLoading) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const isDark = theme === 'dark';

    const groups = new Map<string, GroupStats>();
    
    if (groupingDimension === 'category') {
      holdings.forEach(holding => {
        const config = stockConfigs.find(c => c.stock_code === holding.stock_code);
        const category = config?.category || 'Other';
        if (!groups.has(category)) {
          groups.set(category, {
            totalValue: 0,
            profitLoss: 0,
            profitLossPercentage: 0,
            dailyProfitLoss: 0,
            dailyProfitLossPercentage: 0,
            holdings: []
          });
        }
        const stats = groups.get(category)!;
        stats.totalValue += holding.total_value;
        stats.profitLoss += holding.profit_loss;
        stats.dailyProfitLoss += holding.daily_profit_loss;
        stats.holdings.push(holding);
      });
    } else {
      holdings.forEach(holding => {
        const config = stockConfigs.find(c => c.stock_code === holding.stock_code);
        const tags = config?.tags || ['Untagged'];
        tags.forEach(tag => {
          if (!groups.has(tag)) {
            groups.set(tag, {
              totalValue: 0,
              profitLoss: 0,
              profitLossPercentage: 0,
              dailyProfitLoss: 0,
              dailyProfitLossPercentage: 0,
              holdings: []
            });
          }
          const stats = groups.get(tag)!;
          stats.totalValue += holding.total_value;
          stats.profitLoss += holding.profit_loss;
          stats.dailyProfitLoss += holding.daily_profit_loss;
          stats.holdings.push(holding);
        });
      });
    }

    groups.forEach(stats => {
      const costBasis = stats.totalValue - stats.profitLoss;
      stats.profitLossPercentage = (stats.profitLoss / costBasis) * 100;
      stats.dailyProfitLossPercentage = (stats.dailyProfitLoss / stats.totalValue) * 100;
    });

    const sortedGroups = Array.from(groups.entries()).sort((a, b) => 
      b[1].dailyProfitLossPercentage - a[1].dailyProfitLossPercentage
    );

    const data = sortedGroups.map(([groupName, stats]) => {
      const groupColor = getColorByPercentage(stats.dailyProfitLossPercentage, isDark);

      return {
        name: groupName,
        value: stats.totalValue,
        dailyProfitLoss: stats.dailyProfitLoss,
        dailyProfitLossPercentage: stats.dailyProfitLossPercentage,
        itemStyle: {
          color: groupColor,
          borderWidth: 4,
          borderRadius: 8,
          borderColor: isDark ? '#4b5563' : '#e5e7eb',
          shadowBlur: 10,
          shadowColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'
        },
        label: {
          show: true,
          position: 'inside',
          formatter: (params: any) => {
            const stats = groups.get(params.name)!;
            const holdingsCount = stats.holdings.length;
            const formattedValue = formatCurrency(params.value, currencyConfig)
              .replace(/,(\d{3})+$/, 'M')
              .replace(/,(\d{3})/, 'K');
            
            const dailyPL = stats.dailyProfitLoss >= 0 
              ? `+${formatCurrency(stats.dailyProfitLoss, currencyConfig)}`
              : `-${formatCurrency(stats.dailyProfitLoss, currencyConfig)}`;

            if (isMobile) {
              return [
                `${params.name}`,
                `${stats.dailyProfitLossPercentage >= 0 ? '+' : ''}${stats.dailyProfitLossPercentage.toFixed(1)}%`,
                `${holdingsCount}`
              ].join('\n');
            }
            
            return [
              `${params.name}`,
              `${stats.dailyProfitLossPercentage >= 0 ? '▲' : '▼'} ${stats.dailyProfitLossPercentage >= 0 ? '+' : ''}${stats.dailyProfitLossPercentage.toFixed(2)}%`,
              dailyPL,
              `(${holdingsCount} holdings)`
            ].join('\n');
          },
          rich: {
            sectionStyle: {
              fontSize: isMobile ? 10 : 16,
              color: isDark ? '#9ca3af' : '#6b7280',
              padding: [0, 0, isMobile ? 4 : 8, 0],
              align: 'center',
              width: '100%'
            },
            titleStyle: {
              fontSize: isMobile ? 12 : 24,
              fontWeight: 'bold',
              color: isDark ? '#e5e7eb' : '#111827',
              padding: [0, 0, isMobile ? 6 : 12, 0],
              align: 'center',
              width: '100%',
              lineHeight: isMobile ? 16 : 32
            },
            percentStyle: {
              fontSize: isMobile ? 11 : 20,
              fontWeight: 'bold',
              color: (params: any) => {
                const stats = groups.get(params.name)!;
                return stats.dailyProfitLossPercentage >= 0 ? '#34d399' : '#f87171';
              },
              padding: [0, 0, isMobile ? 4 : 8, 0],
              align: 'center',
              width: '100%'
            },
            valueStyle: {
              fontSize: isMobile ? 10 : 16,
              color: isDark ? '#9ca3af' : '#6b7280',
              align: 'center',
              width: '100%'
            }
          }
        },
        children: stats.holdings
          .sort((a, b) => b.daily_profit_loss_percentage - a.daily_profit_loss_percentage)
          .map(holding => {
            const color = getColorByPercentage(holding.daily_profit_loss_percentage, isDark);

            return {
              name: holding.stock_code,
              value: holding.total_value,
              dailyProfitLoss: holding.daily_profit_loss,
              dailyProfitLossPercentage: holding.daily_profit_loss_percentage,
              itemStyle: {
                color,
                borderWidth: 1,
                borderColor: isDark ? '#374151' : '#e5e7eb'
              },
              label: {
                show: true,
                position: 'inside',
                formatter: (params: any) => {
                  const value = formatCurrency(params.value, currencyConfig);
                  const percentage = holding.daily_profit_loss_percentage;
                  const dailyPL = holding.daily_profit_loss >= 0 
                    ? `+${formatCurrency(holding.daily_profit_loss, currencyConfig)}`
                    : formatCurrency(holding.daily_profit_loss, currencyConfig);
                  const percentageStr = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
                  
                  if (isMobile) {
                    return [
                      `${params.name}`,
                      `${percentageStr}`,
                    ].join('\n');
                  }

                  return [
                    `{titleStyle|${params.name}}`,
                    `{nameStyle|${holding.stock_name}}`,
                    `{percentStyle|${percentageStr}}`,
                    `{valueStyle|${dailyPL}}`
                  ].join('\n');
                },
                rich: {
                  titleStyle: {
                    fontSize: isMobile ? 11 : 16,
                    fontWeight: 'bold',
                    color: isDark ? '#e5e7eb' : '#111827',
                    padding: [0, 0, isMobile ? 4 : 8, 0],
                    align: 'center',
                    width: '100%'
                  },
                  nameStyle: {
                    fontSize: isMobile ? 10 : 14,
                    color: isDark ? '#9ca3af' : '#6b7280',
                    padding: [0, 0, isMobile ? 4 : 8, 0],
                    align: 'center',
                    width: '100%'
                  },
                  percentStyle: {
                    fontSize: isMobile ? 10 : 14,
                    fontWeight: 'bold',
                    color: holding.daily_profit_loss_percentage >= 0 ? '#34d399' : '#f87171',
                    padding: [0, 0, isMobile ? 4 : 8, 0],
                    align: 'center',
                    width: '100%'
                  },
                  valueStyle: {
                    fontSize: isMobile ? 9 : 14,
                    color: isDark ? '#9ca3af' : '#6b7280',
                    align: 'center',
                    width: '100%'
                  }
                }
              }
            };
          })
      };
    });

    const option = {
      tooltip: {
        formatter: (params: any) => {
          if (!params || !params.name) return '';

          const holding = holdings.find(h => h.stock_code === params.name);
          
          if (!holding && params.data) {
            const { value, dailyProfitLoss, dailyProfitLossPercentage } = params.data;
            const profitLossColor = dailyProfitLossPercentage >= 0 ? '#34d399' : '#f87171';
            const stats = groups.get(params.name)!;
            
            return `
              <div style="font-weight: 500; font-size: ${isMobile ? '14px' : '16px'}">${groupingDimension === 'category' ? 'Category' : 'Tag'}: ${params.name}</div>
              <div style="margin-top: 8px">
                <div>Holdings: ${stats.holdings.length}</div>
                <div>Total Value: ${formatCurrency(value, currencyConfig)}</div>
                <div>Daily P/L: ${dailyProfitLoss >= 0 ? '+' : '-'}${formatCurrency(Math.abs(dailyProfitLoss), currencyConfig)}</div>
                <div style="color: ${profitLossColor}; font-weight: 500">
                  Daily Return: ${dailyProfitLossPercentage >= 0 ? '+' : ''}${dailyProfitLossPercentage.toFixed(2)}%
                </div>
              </div>
            `;
          }
          
          if (!holding) return '';

          const config = stockConfigs.find(c => c.stock_code === holding.stock_code);
          const groupInfo = groupingDimension === 'category'
            ? `Category: ${config?.category || 'Other'}`
            : `Tags: ${config?.tags?.join(', ') || 'Untagged'}`;

          return `
            <div style="font-weight: 500">${holding.stock_code} - ${holding.stock_name}</div>
            <div style="margin-top: 4px">
              <div>${groupInfo}</div>
              <div>Current Price: ${formatCurrency(holding.current_price, currencyConfig)}</div>
              <div>Total Value: ${formatCurrency(holding.total_value, currencyConfig)}</div>
              <div>Daily P/L: ${holding.daily_profit_loss >= 0 ? '+' : ''}${formatCurrency(holding.daily_profit_loss, currencyConfig)}</div>
            </div>
            <div style="margin-top: 4px; color: ${holding.daily_profit_loss_percentage >= 0 ? '#34d399' : '#f87171'}">
              Daily Return: ${holding.daily_profit_loss_percentage >= 0 ? '+' : ''}${holding.daily_profit_loss_percentage.toFixed(2)}%
            </div>
          `;
        }
      },
      series: [{
        type: 'treemap',
        data: data,
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: {
          show: true,
          height: isMobile ? 24 : 30,
          top: 'bottom',
          itemStyle: {
            color: isDark ? '#374151' : '#f3f4f6',
            borderColor: isDark ? '#4b5563' : '#e5e7eb',
            textStyle: {
              color: isDark ? '#e5e7eb' : '#111827',
              fontWeight: 'bold',
              fontSize: isMobile ? 12 : 14
            }
          },
          emphasis: {
            itemStyle: {
              color: isDark ? '#4b5563' : '#e5e7eb'
            }
          }
        },
        levels: [{
          itemStyle: {
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 4,
            gapWidth: isMobile ? 4 : 8,
            borderRadius: 8
          },
          emphasis: {
            itemStyle: {
              borderColor: isDark ? '#60a5fa' : '#3b82f6',
              borderWidth: 4
            }
          }
        }],
        label: {
          show: true,
          position: 'inside'
        },
        upperLabel: {
          show: true,
          height: isMobile ? 30 : 40,
          color: isDark ? '#e5e7eb' : '#111827'
        }
      }]
    };

    chart.setOption(option);

    chart.on('click', (params: any) => {
      if (params.data && params.data.children) {
        setSelectedPath(prev => [...prev, params.name]);
      }
    });

    chart.on('treeMapRootToNode', (params: any) => {
      if (params.targetNode && params.targetNode.path) {
        const path = params.targetNode.path.slice(1);
        setSelectedPath(path);
      }
    });

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
  }, [holdings, theme, currencyConfig, groupingDimension, stockConfigs, isLoading, isMobile]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
              Daily Performance Heatmap
            </h2>
            <div className="flex items-center gap-2">
              <Filter className={`w-4 h-4 ${themes[theme].text}`} />
              <select
                value={groupingDimension}
                onChange={(e) => setGroupingDimension(e.target.value as GroupingDimension)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="category">Group by Category</option>
                <option value="tags">Group by Tags</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="h-[400px] sm:h-[600px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div ref={chartRef} style={{ height: isMobile ? '400px' : '600px' }} className="mt-4" />
        )}
      </div>
    </div>
  );
}