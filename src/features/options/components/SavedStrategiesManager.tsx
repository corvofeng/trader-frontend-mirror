import React, { useState, useEffect } from 'react';
import { format, differenceInDays } from 'date-fns';
import { Calendar, CreditCard as Edit, Trash2, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService } from '../../../lib/services';
import type { CustomOptionsStrategy, OptionsPosition } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface SavedStrategiesManagerProps {
  theme: Theme;
  onStrategyUpdated?: () => void;
}

interface StrategyGroup {
  month: string;
  strategies: CustomOptionsStrategy[];
  totalValue: number;
  totalCost: number;
  profitLoss: number;
  averageDaysToExpiry: number;
}

const DEMO_USER_ID = 'mock-user-id';

export function SavedStrategiesManager({ theme, onEditStrategy }: SavedStrategiesManagerProps) {
  const [savedStrategies, setSavedStrategies] = useState<CustomOptionsStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const { currencyConfig } = useCurrency();

  useEffect(() => {
    fetchSavedStrategies();
  }, []);

  const fetchSavedStrategies = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await optionsService.getCustomStrategies(DEMO_USER_ID);
      if (error) throw error;
      if (data) {
        setSavedStrategies(data);
        // 默认展开最近的月份
        const months = groupStrategiesByMonth(data);
        if (months.length > 0) {
          setExpandedMonths([months[0].month]);
        }
      }
    } catch (error) {
      console.error('Error fetching saved strategies:', error);
      toast.error('获取已保存策略失败');
    } finally {
      setIsLoading(false);
    }
  };

  const groupStrategiesByMonth = (strategies: CustomOptionsStrategy[]): StrategyGroup[] => {
    const groups = new Map<string, {
      strategies: CustomOptionsStrategy[];
      totalValue: number;
      totalCost: number;
      profitLoss: number;
      totalDaysToExpiry: number;
      count: number;
    }>();

    strategies.forEach(strategy => {
      // 找到策略中最近的到期日
      const nearestExpiry = strategy.positions.reduce((nearest, position) => {
        const positionExpiry = new Date(position.expiry);
        const nearestExpiry = new Date(nearest);
        return positionExpiry < nearestExpiry ? position.expiry : nearest;
      }, strategy.positions[0]?.expiry || new Date().toISOString());

      const expiryDate = new Date(nearestExpiry);
      const monthKey = format(expiryDate, 'yyyy-MM');
      const daysToExpiry = differenceInDays(expiryDate, new Date());

      if (!groups.has(monthKey)) {
        groups.set(monthKey, {
          strategies: [],
          totalValue: 0,
          totalCost: 0,
          profitLoss: 0,
          totalDaysToExpiry: 0,
          count: 0
        });
      }

      const group = groups.get(monthKey)!;
      group.strategies.push(strategy);
      
      // 计算策略价值
      const strategyValue = strategy.positions.reduce((sum, pos) => 
        sum + (pos.currentValue * (pos.selectedQuantity || pos.quantity) * 100), 0);
      const strategyCost = strategy.positions.reduce((sum, pos) => 
        sum + (pos.premium * (pos.selectedQuantity || pos.quantity) * 100), 0);
      const strategyPL = strategyValue - strategyCost;

      group.totalValue += strategyValue;
      group.totalCost += strategyCost;
      group.profitLoss += strategyPL;
      group.totalDaysToExpiry += daysToExpiry;
      group.count += 1;
    });

    return Array.from(groups.entries())
      .map(([month, group]) => ({
        month,
        strategies: group.strategies.sort((a, b) => {
          const aExpiry = new Date(a.positions[0]?.expiry || 0);
          const bExpiry = new Date(b.positions[0]?.expiry || 0);
          return aExpiry.getTime() - bExpiry.getTime();
        }),
        totalValue: group.totalValue,
        totalCost: group.totalCost,
        profitLoss: group.profitLoss,
        averageDaysToExpiry: Math.round(group.totalDaysToExpiry / group.count)
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  };

  const handleDeleteStrategy = async (strategyId: string) => {
    if (!confirm('确定要删除这个策略吗？')) return;

    try {
      const { error } = await optionsService.deleteCustomStrategy(strategyId);
      if (error) throw error;
      
      setSavedStrategies(prev => prev.filter(s => s.id !== strategyId));
      toast.success('策略已删除');
      onStrategyUpdated?.();
    } catch (error) {
      console.error('Error deleting strategy:', error);
      toast.error('删除策略失败');
    }
  };

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => 
      prev.includes(month) 
        ? prev.filter(m => m !== month)
        : [...prev, month]
    );
  };

  const getStrategyIcon = (category: string) => {
    switch (category) {
      case 'bullish': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'bearish': return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'volatility': return <Activity className="w-4 h-4 text-purple-500" />;
      default: return <Target className="w-4 h-4 text-blue-500" />;
    }
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100';
    }
  };

  const strategyGroups = groupStrategiesByMonth(savedStrategies);

  if (isLoading) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-6`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${themes[theme].text}`}>加载已保存策略...</p>
        </div>
      </div>
    );
  }

  if (savedStrategies.length === 0) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-8 text-center`}>
        <Target className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
        <p className={`text-lg font-medium ${themes[theme].text}`}>暂无已保存的策略</p>
        <p className={`text-sm ${themes[theme].text} opacity-75`}>
          创建并保存您的第一个期权策略
        </p>
      </div>
    );
  }

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              已保存策略 ({savedStrategies.length})
            </h2>
          </div>
          <div className="text-right">
            <p className={`text-sm ${themes[theme].text} opacity-75`}>
              按到期月份分组显示
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {strategyGroups.map((group) => (
          <div key={group.month}>
            {/* 月份组头部 */}
            <button
              onClick={() => toggleMonth(group.month)}
              className={`w-full p-4 flex items-center justify-between ${themes[theme].cardHover} transition-colors`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-blue-500" />
                <div className="text-left">
                  <h3 className={`font-semibold ${themes[theme].text}`}>
                    {format(new Date(group.month + '-01'), 'yyyy年MM月')}
                  </h3>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    {group.strategies.length} 个策略 • 平均 {group.averageDaysToExpiry} 天到期
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className={`text-sm font-medium ${themes[theme].text}`}>
                    {formatCurrency(group.totalValue, currencyConfig)}
                  </p>
                  <p className={`text-xs ${
                    group.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {group.profitLoss >= 0 ? '+' : ''}{formatCurrency(group.profitLoss, currencyConfig)}
                  </p>
                </div>
                {expandedMonths.includes(group.month) ? (
                  <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
                ) : (
                  <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
                )}
              </div>
            </button>

            {/* 月份组内容 */}
            {expandedMonths.includes(group.month) && (
              <div className="p-4 space-y-4">
                {group.strategies.map((strategy) => {
                  const nearestExpiry = strategy.positions.reduce((nearest, position) => {
                    const positionExpiry = new Date(position.expiry);
                    const nearestExpiry = new Date(nearest);
                    return positionExpiry < nearestExpiry ? position.expiry : nearest;
                  }, strategy.positions[0]?.expiry || new Date().toISOString());

                  const daysToExpiry = differenceInDays(new Date(nearestExpiry), new Date());
                  const strategyValue = strategy.positions.reduce((sum, pos) => 
                    sum + (pos.currentValue * (pos.selectedQuantity || pos.quantity) * 100), 0);
                  const strategyCost = strategy.positions.reduce((sum, pos) => 
                    sum + (pos.premium * (pos.selectedQuantity || pos.quantity) * 100), 0);
                  const strategyPL = strategyValue - strategyCost;
                  const strategyPLPercentage = strategyCost > 0 ? (strategyPL / strategyCost) * 100 : 0;

                  return (
                    <div
                      key={strategy.id}
                      className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3">
                          {getStrategyIcon(strategy.strategyCategory || 'neutral')}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                                {strategy.name}
                              </h3>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskLevelColor(strategy.riskLevel || 'medium')}`}>
                                {strategy.riskLevel === 'low' ? '低风险' : 
                                 strategy.riskLevel === 'high' ? '高风险' : '中风险'}
                              </span>
                            </div>
                            <p className={`text-sm ${themes[theme].text} opacity-75 mb-2`}>
                              {strategy.description}
                            </p>
                            <div className="flex items-center gap-4 text-sm">
                              <span className={`${themes[theme].text} opacity-75`}>
                                到期: {format(new Date(nearestExpiry), 'yyyy-MM-dd')} ({daysToExpiry}天)
                              </span>
                              <span className={`${themes[theme].text} opacity-75`}>
                                {strategy.positions.length} 个腿部
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-semibold ${themes[theme].text}`}>
                            {formatCurrency(strategyValue, currencyConfig)}
                          </p>
                          <p className={`text-sm ${
                            strategyPL >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {strategyPL >= 0 ? '+' : ''}{formatCurrency(strategyPL, currencyConfig)}
                            <span className="ml-1">
                              ({strategyPLPercentage >= 0 ? '+' : ''}{strategyPLPercentage.toFixed(2)}%)
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* 策略腿部概览 */}
                      <div className="mb-4">
                        <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>腿部构成</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {strategy.positions.map((position, index) => (
                            <div key={position.id} className={`${themes[theme].card} rounded p-2 text-sm`}>
                              <div className="flex justify-between items-center">
                                <span className={`font-medium ${themes[theme].text}`}>
                                  {position.position_type === 'buy' ? '买入' : '卖出'} {position.type.toUpperCase()} {position.strike}
                                </span>
                                <span className={`${themes[theme].text} opacity-75`}>
                                  {position.selectedQuantity || position.quantity} 手
                                </span>
                              </div>
                              <div className="flex justify-between text-xs mt-1">
                                <span className={`${themes[theme].text} opacity-60`}>
                                  成本: {formatCurrency(position.premium, currencyConfig)}
                                </span>
                                <span className={`${themes[theme].text} opacity-60`}>
                                  现值: {formatCurrency(position.currentValue, currencyConfig)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            // TODO: 实现编辑功能
                            toast.info('编辑功能开发中...');
                          }}
                          className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm ${themes[theme].secondary}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteStrategy(strategy.id)}
                          className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {strategyGroups.length === 0 && !isLoading && (
        <div className="p-8 text-center">
          <Target className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
          <p className={`text-lg font-medium ${themes[theme].text}`}>暂无已保存的策略</p>
          <p className={`text-sm ${themes[theme].text} opacity-75`}>
            创建并保存您的第一个期权策略
          </p>
        </div>
      )}
    </div>
  );
}