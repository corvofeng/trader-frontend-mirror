import React, { useState } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Target, Activity, Eye, EyeOff, Filter } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import type { OptionsStrategy, OptionsPosition } from '../../../lib/services/types';

interface StrategyDisplayProps {
  theme: Theme;
  strategies: OptionsStrategy[];
  title?: string;
  showFilters?: boolean;
  onStrategySelect?: (strategy: OptionsStrategy) => void;
}

interface StrategyFilters {
  category: 'all' | 'bullish' | 'bearish' | 'neutral' | 'volatility';
  riskLevel: 'all' | 'low' | 'medium' | 'high';
  status: 'all' | 'profitable' | 'losing';
}

export function StrategyDisplay({ 
  theme, 
  strategies, 
  title = "期权策略概览",
  showFilters = true,
  onStrategySelect 
}: StrategyDisplayProps) {
  const [filters, setFilters] = useState<StrategyFilters>({
    category: 'all',
    riskLevel: 'all',
    status: 'all'
  });
  const [expandedStrategies, setExpandedStrategies] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { currencyConfig } = useCurrency();

  const filteredStrategies = strategies.filter(strategy => {
    if (filters.category !== 'all' && strategy.category !== filters.category) return false;
    if (filters.riskLevel !== 'all' && strategy.riskLevel !== filters.riskLevel) return false;
    if (filters.status === 'profitable' && strategy.profitLoss <= 0) return false;
    if (filters.status === 'losing' && strategy.profitLoss >= 0) return false;
    return true;
  });

  const toggleStrategyExpansion = (strategyId: string) => {
    setExpandedStrategies(prev => 
      prev.includes(strategyId)
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bullish': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'bearish': return <TrendingDown className="w-5 h-5 text-red-500" />;
      case 'volatility': return <Activity className="w-5 h-5 text-purple-500" />;
      default: return <Target className="w-5 h-5 text-blue-500" />;
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'bullish': return '看涨';
      case 'bearish': return '看跌';
      case 'volatility': return '波动率';
      default: return '中性';
    }
  };

  const getRiskLevelLabel = (level: string) => {
    switch (level) {
      case 'low': return '低风险';
      case 'high': return '高风险';
      default: return '中风险';
    }
  };

  // 计算汇总统计
  const totalValue = filteredStrategies.reduce((sum, s) => sum + s.currentValue, 0);
  const totalCost = filteredStrategies.reduce((sum, s) => sum + s.totalCost, 0);
  const totalPL = filteredStrategies.reduce((sum, s) => sum + s.profitLoss, 0);
  const profitableCount = filteredStrategies.filter(s => s.profitLoss > 0).length;

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      {/* 头部 */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
          <div className="flex items-center gap-3">
            <BarChart2 className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                {title}
              </h2>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                {filteredStrategies.length} 个策略 • {profitableCount} 个盈利
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* 视图模式切换 */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md ${viewMode === 'grid' ? themes[theme].primary : themes[theme].secondary}`}
              >
                <BarChart2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md ${viewMode === 'list' ? themes[theme].primary : themes[theme].secondary}`}
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 汇总统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className={`${themes[theme].background} rounded-lg p-3 text-center`}>
            <p className={`text-lg font-bold ${themes[theme].text}`}>
              {formatCurrency(totalValue, currencyConfig)}
            </p>
            <p className={`text-xs ${themes[theme].text} opacity-75`}>总价值</p>
          </div>
          <div className={`${themes[theme].background} rounded-lg p-3 text-center`}>
            <p className={`text-lg font-bold ${themes[theme].text}`}>
              {formatCurrency(totalCost, currencyConfig)}
            </p>
            <p className={`text-xs ${themes[theme].text} opacity-75`}>总成本</p>
          </div>
          <div className={`${themes[theme].background} rounded-lg p-3 text-center`}>
            <p className={`text-lg font-bold ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPL >= 0 ? '+' : ''}{formatCurrency(totalPL, currencyConfig)}
            </p>
            <p className={`text-xs ${themes[theme].text} opacity-75`}>总盈亏</p>
          </div>
          <div className={`${themes[theme].background} rounded-lg p-3 text-center`}>
            <p className={`text-lg font-bold ${themes[theme].text}`}>
              {totalCost > 0 ? ((totalPL / totalCost) * 100).toFixed(1) : '0.0'}%
            </p>
            <p className={`text-xs ${themes[theme].text} opacity-75`}>收益率</p>
          </div>
        </div>
      </div>

      {/* 过滤器 */}
      {showFilters && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className={`text-sm font-medium ${themes[theme].text}`}>分类:</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value as any }))}
                className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="all">全部</option>
                <option value="bullish">看涨</option>
                <option value="bearish">看跌</option>
                <option value="neutral">中性</option>
                <option value="volatility">波动率</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className={`text-sm font-medium ${themes[theme].text}`}>风险:</label>
              <select
                value={filters.riskLevel}
                onChange={(e) => setFilters(prev => ({ ...prev, riskLevel: e.target.value as any }))}
                className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="all">全部</option>
                <option value="low">低风险</option>
                <option value="medium">中风险</option>
                <option value="high">高风险</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className={`text-sm font-medium ${themes[theme].text}`}>状态:</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="all">全部</option>
                <option value="profitable">盈利</option>
                <option value="losing">亏损</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 策略列表 */}
      <div className="p-6">
        {filteredStrategies.length === 0 ? (
          <div className="text-center py-12">
            <BarChart2 className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
            <p className={`text-lg font-medium ${themes[theme].text}`}>没有找到匹配的策略</p>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>
              尝试调整过滤条件或创建新策略
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-4'}>
            {filteredStrategies.map((strategy) => {
              const isExpanded = expandedStrategies.includes(strategy.id);
              
              return (
                <div
                  key={strategy.id}
                  className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} transition-all duration-200`}
                >
                  {/* 策略头部 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      {getCategoryIcon(strategy.category)}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                            {strategy.name}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskLevelColor(strategy.riskLevel)}`}>
                            {getRiskLevelLabel(strategy.riskLevel)}
                          </span>
                        </div>
                        <p className={`text-sm ${themes[theme].text} opacity-75 mb-2`}>
                          {strategy.description}
                        </p>
                        <div className="flex items-center gap-4 text-sm">
                          <span className={`${themes[theme].text} opacity-75`}>
                            分类: {getCategoryLabel(strategy.category)}
                          </span>
                          <span className={`${themes[theme].text} opacity-75`}>
                            {strategy.positions.length} 个腿部
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${themes[theme].text}`}>
                        {formatCurrency(strategy.currentValue, currencyConfig)}
                      </p>
                      <p className={`text-sm ${
                        strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {strategy.profitLoss >= 0 ? '+' : ''}{formatCurrency(strategy.profitLoss, currencyConfig)}
                        <span className="ml-1">
                          ({strategy.profitLossPercentage >= 0 ? '+' : ''}{strategy.profitLossPercentage.toFixed(2)}%)
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* 策略指标 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="text-center">
                      <p className={`text-sm font-medium ${themes[theme].text}`}>
                        {formatCurrency(strategy.totalCost, currencyConfig)}
                      </p>
                      <p className={`text-xs ${themes[theme].text} opacity-75`}>总成本</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-sm font-medium ${themes[theme].text}`}>
                        {strategy.maxRisk === Infinity ? '无限' : formatCurrency(strategy.maxRisk, currencyConfig)}
                      </p>
                      <p className={`text-xs ${themes[theme].text} opacity-75`}>最大风险</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-sm font-medium ${themes[theme].text}`}>
                        {strategy.maxReward === Infinity ? '无限' : formatCurrency(strategy.maxReward, currencyConfig)}
                      </p>
                      <p className={`text-xs ${themes[theme].text} opacity-75`}>最大收益</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-sm font-medium ${themes[theme].text}`}>
                        {strategy.maxRisk > 0 && strategy.maxReward !== Infinity 
                          ? (strategy.maxReward / strategy.maxRisk).toFixed(2) 
                          : 'N/A'}
                      </p>
                      <p className={`text-xs ${themes[theme].text} opacity-75`}>收益风险比</p>
                    </div>
                  </div>

                  {/* 展开/折叠按钮 */}
                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => toggleStrategyExpansion(strategy.id)}
                      className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm ${themes[theme].secondary}`}
                    >
                      {isExpanded ? (
                        <>
                          <EyeOff className="w-4 h-4 mr-1" />
                          隐藏详情
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-1" />
                          查看详情
                        </>
                      )}
                    </button>
                    
                    {onStrategySelect && (
                      <button
                        onClick={() => onStrategySelect(strategy)}
                        className={`px-3 py-1.5 rounded-md text-sm ${themes[theme].primary}`}
                      >
                        选择策略
                      </button>
                    )}
                  </div>

                  {/* 展开的详细信息 */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                      <h4 className={`text-sm font-medium ${themes[theme].text} mb-3`}>腿部详情</h4>
                      <div className="space-y-2">
                        {strategy.positions.map((position, index) => (
                          <div
                            key={position.id}
                            className={`${themes[theme].card} rounded-lg p-3 border ${themes[theme].border}`}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${themes[theme].text}`}>
                                  腿部 {index + 1}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  position.position_type === 'buy' 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                                }`}>
                                  {position.position_type === 'buy' ? '买入' : '卖出'}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${themes[theme].secondary}`}>
                                  {position.type.toUpperCase()}
                                </span>
                              </div>
                              <span className={`text-sm font-medium ${
                                position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(position.profitLoss, currencyConfig)}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>行权价: </span>
                                <span className={`font-medium ${themes[theme].text}`}>
                                  {formatCurrency(position.strike, currencyConfig)}
                                </span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>到期: </span>
                                <span className={`font-medium ${themes[theme].text}`}>
                                  {new Date(position.expiry).toLocaleDateString()}
                                </span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>数量: </span>
                                <span className={`font-medium ${themes[theme].text}`}>
                                  {position.quantity} 手
                                </span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                                <span className={`font-medium ${themes[theme].text}`}>
                                  {formatCurrency(position.premium, currencyConfig)}
                                </span>
                              </div>
                            </div>

                            {/* Greeks 显示 */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                              <div>
                                <span className={`${themes[theme].text} opacity-60`}>Delta: </span>
                                <span className={`${themes[theme].text}`}>{position.delta.toFixed(3)}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-60`}>Gamma: </span>
                                <span className={`${themes[theme].text}`}>{position.gamma.toFixed(3)}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-60`}>Theta: </span>
                                <span className={`${themes[theme].text}`}>{position.theta.toFixed(3)}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-60`}>Vega: </span>
                                <span className={`${themes[theme].text}`}>{position.vega.toFixed(3)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}