import React, { useState, useEffect } from 'react';
import { format, differenceInDays } from 'date-fns';
import { Calendar, TrendingUp, TrendingDown, Activity, Shield, Target, BarChart2, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Filter,
  TrendingUp,
  TrendingDown,
  Activity,
  Shield,
  Target,
  Clock,
  Hash,
  Layers
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService } from '../../../lib/services';
import type { OptionsPortfolioData, CustomOptionsStrategy, OptionsPosition } from '../../../lib/services/types';

interface OptionsPortfolioProps {
  theme: Theme;
}

type OptionsViewMode = 'expiry' | 'strategy' | 'grouped';

const DEMO_USER_ID = 'mock-user-id';

const getPositionTypeInfo = (positionType: string, optionType: string) => {
  const isLong = positionType === 'buy';
  const isCall = optionType === 'call';
  
  if (isLong && isCall) {
    return {
      icon: <TrendingUp className="w-3 h-3" />,
      label: '买入看涨',
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
      description: '看涨期权买方'
    };
  } else if (isLong && !isCall) {
    return {
      icon: <TrendingDown className="w-3 h-3" />,
      label: '买入看跌',
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
      description: '看跌期权买方'
    };
  } else if (!isLong && isCall) {
    return {
      icon: <TrendingUp className="w-3 h-3" />,
      label: '卖出看涨',
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
      description: '看涨期权卖方'
    };
  } else {
    return {
      icon: <TrendingDown className="w-3 h-3" />,
      label: '卖出看跌',
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
      description: '看跌期权卖方'
    };
  }
};

// 扩展OptionsPosition类型以包含策略ID
interface ExtendedOptionsPosition extends OptionsPosition {
  strategy_id?: string;
  is_single_leg?: boolean;
}

const getPositionTypeInfo2 = (positionType: string, optionType: string) => {
  const isLong = positionType === 'buy';
  const isCall = optionType === 'call';
  
  if (isLong && isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:text-blue-400 dark:bg-blue-900',
      description: '有权买入标的',
      borderColor: 'border-l-blue-500'
    };
  } else if (isLong && !isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:text-blue-400 dark:bg-blue-900',
      description: '有权卖出标的',
      borderColor: 'border-l-blue-500'
    };
  } else if (!isLong && isCall) {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '义务方',
      color: 'bg-orange-100 text-orange-800 dark:text-orange-400 dark:bg-orange-900',
      description: '有义务卖出标的',
      borderColor: 'border-l-orange-500'
    };
  } else {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '义务方',
      color: 'bg-orange-100 text-orange-800 dark:text-orange-400 dark:bg-orange-900',
      description: '有义务买入标的',
      borderColor: 'border-l-orange-500'
    };
  }
};

export function OptionsPortfolio({ theme }: OptionsPortfolioProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [customStrategies, setCustomStrategies] = useState<CustomOptionsStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState(false);
  const [viewMode, setViewMode] = useState<OptionsViewMode>('expiry');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'expiry' | 'profitLoss' | 'symbol'>('expiry');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedStrategies, setExpandedStrategies] = useState<string[]>([]);
  const { currencyConfig } = useCurrency();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const { data: { user } } = await authService.getUser();
        
        const userId = user?.id || DEMO_USER_ID;
        const { data, error } = await optionsService.getOptionsPortfolio(userId);
        if (error) throw error;
        if (data) setPortfolioData(data);
      } catch (error) {
        console.error('Error fetching portfolio data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const fetchCustomStrategies = async () => {
      try {
        setIsLoadingStrategies(true);
        const { data: { user } } = await authService.getUser();
        
        const userId = user?.id || DEMO_USER_ID;
        const { data, error } = await optionsService.getCustomStrategies(userId);
        
        if (error) throw error;
        if (data) {
          setCustomStrategies(data);
        }
      } catch (error) {
        console.error('Error fetching custom strategies:', error);
      } finally {
        setIsLoadingStrategies(false);
      }
    };

    fetchCustomStrategies();
  }, []);

  const toggleStrategyExpansion = (strategyId: string) => {
    setExpandedStrategies(prev => 
      prev.includes(strategyId) 
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  // 生成策略ID的逻辑
  const getStrategyId = (position: OptionsPosition, index: number): string => {
    // 根据策略类型生成ID
    if (position.strategy.includes('Spread') || position.strategy.includes('Condor') || position.strategy.includes('Butterfly')) {
      return `STR-${position.strategy.replace(/\s+/g, '').toUpperCase()}-${Math.floor(index / 2) + 1}`;
    } else if (position.strategy.includes('Straddle') || position.strategy.includes('Strangle')) {
      return `VOL-${position.strategy.replace(/\s+/g, '').toUpperCase()}-${Math.floor(index / 2) + 1}`;
    } else {
      return `SINGLE-${position.type.toUpperCase()}-${index + 1}`;
    }
  };

  // 判断是否为单腿期权
  const isSingleLegPosition = (position: OptionsPosition): boolean => {
    return position.strategy === 'Long Call' || 
           position.strategy === 'Long Put' || 
           position.strategy === 'Covered Call' || 
           position.strategy === 'Protective Put';
  };

  // 按策略分组期权持仓
  const groupPositionsByStrategy = (positions: ExtendedOptionsPosition[]) => {
    const strategies = new Map<string, ExtendedOptionsPosition[]>();
    const singleLegs: ExtendedOptionsPosition[] = [];

    positions.forEach(position => {
      if (position.is_single_leg) {
        singleLegs.push(position);
      } else {
        const strategyId = position.strategy_id!;
        if (!strategies.has(strategyId)) {
          strategies.set(strategyId, []);
        }
        strategies.get(strategyId)!.push(position);
      }
    });

    return { strategies, singleLegs };
  };

  const getStatusColor = (status: OptionsPosition['status']) => {
    switch (status) {
      case 'open':
        return theme === 'dark' 
          ? 'bg-green-900 text-green-100' 
          : 'bg-green-100 text-green-800';
      case 'closed':
        return theme === 'dark' 
          ? 'bg-blue-900 text-blue-100' 
          : 'bg-blue-100 text-blue-800';
      case 'expired':
        return theme === 'dark'
          ? 'bg-red-900 text-red-100'
          : 'bg-red-100 text-red-800';
      default:
        return theme === 'dark'
          ? 'bg-gray-700 text-gray-100'
          : 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: OptionsPosition['type']) => {
    switch (type) {
      case 'call':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'put':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'spread':
      case 'iron_condor':
      case 'butterfly':
        return <Target className="w-4 h-4 text-purple-500" />;
      case 'straddle':
      case 'strangle':
        return <Activity className="w-4 h-4 text-orange-500" />;
      default:
        return <Shield className="w-4 h-4 text-gray-500" />;
    }
  };

  const getDaysToExpiryColor = (days: number) => {
    if (days <= 7) return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900';
    if (days <= 30) return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900';
    return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900';
  };

  const filterAndSortPositions = (positions: OptionsPosition[]) => {
    let filtered = positions;
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(pos => pos.status === statusFilter);
    }
    
    return filtered.sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'expiry':
          return multiplier * (new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
        case 'profitLoss':
          return multiplier * (a.profitLoss - b.profitLoss);
        case 'symbol':
          return multiplier * a.symbol.localeCompare(b.symbol);
        default:
          return 0;
      }
    });
  };

  if (isLoading) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md p-8`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${themes[theme].text}`}>正在加载期权投资组合...</p>
        </div>
      </div>
    );
  }

  if (!portfolioData) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md p-8`}>
        <div className="text-center">
          <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
          <p className={`text-lg font-medium ${themes[theme].text}`}>暂无期权持仓</p>
          <p className={`text-sm ${themes[theme].text} opacity-75`}>
            您还没有任何期权持仓
          </p>
        </div>
      </div>
    );
  }

  // 获取所有持仓并添加策略ID
  const allPositions = portfolioData.expiryGroups
    .flatMap(group => group.positions)
    .filter(position => statusFilter === 'all' || position.status === statusFilter)
    .map((position, index) => {
      const extendedPosition: ExtendedOptionsPosition = {
        ...position,
        strategy_id: getStrategyId(position, index),
        is_single_leg: isSingleLegPosition(position)
      };
      return extendedPosition;
    });

  const { strategies: groupedStrategies, singleLegs } = groupPositionsByStrategy(allPositions);

  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>
            期权投资组合概览
          </h2>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总价值</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(portfolioData.totalValue, currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总成本</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(portfolioData.totalCost, currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总盈亏</h3>
              <p className={`text-2xl font-bold mt-1 ${portfolioData.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolioData.totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(portfolioData.totalProfitLoss), currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>盈亏比例</h3>
              <p className={`text-2xl font-bold mt-1 ${portfolioData.totalProfitLossPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolioData.totalProfitLossPercentage >= 0 ? '+' : ''}{portfolioData.totalProfitLossPercentage.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  视图:
                </label>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as 'expiry' | 'strategy' | 'grouped')}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="expiry">按到期日</option>
                  <option value="strategy">按策略</option>
                  <option value="grouped">策略分组</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  状态:
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="all">全部</option>
                  <option value="open">持仓中</option>
                  <option value="closed">已平仓</option>
                  <option value="expired">已到期</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className={`text-sm font-medium ${themes[theme].text}`}>
                排序:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="expiry">到期日</option>
                <option value="profitLoss">盈亏</option>
                <option value="symbol">标的</option>
              </select>
              <button
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].secondary}`}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Content */}
      {viewMode === 'grouped' && (
        <div className="space-y-8">
          {/* 策略组合 */}
          {groupedStrategies.size > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-5 h-5 text-purple-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  策略组合 ({groupedStrategies.size} 个策略)
                </h3>
              </div>
              <div className="space-y-6">
                {Array.from(groupedStrategies.entries()).map(([strategyId, positions]) => (
                  <div key={strategyId} className={`${themes[theme].background} rounded-lg p-4 border-l-4 border-purple-500`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-purple-500" />
                        <span className={`text-sm font-mono ${themes[theme].text} bg-purple-100 dark:bg-purple-900 px-2 py-1 rounded`}>
                          {strategyId}
                        </span>
                        <span className={`text-sm ${themes[theme].text} opacity-75`}>
                          {positions[0].strategy} ({positions.length} 腿)
                        </span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${themes[theme].text}`}>
                          总成本: {formatCurrency(positions.reduce((sum, p) => sum + p.premium * p.quantity * 100, 0), currencyConfig)}
                        </div>
                        <div className={`text-sm ${
                          positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          盈亏: {positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? '+' : ''}
                          {formatCurrency(Math.abs(positions.reduce((sum, p) => sum + p.profitLoss, 0)), currencyConfig)}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {positions.map((position) => {
                        const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                        const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        
                        return (
                          <div key={position.id} className={`${themes[theme].card} rounded-lg p-3 border ${themes[theme].border}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  {positionInfo.icon}
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                    {positionInfo.label}
                                  </span>
                                </div>
                                <div>
                                  <div className={`text-sm font-medium ${themes[theme].text}`}>
                                    {position.symbol} {position.strike} {position.type.toUpperCase()}
                                  </div>
                                  <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                    到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                  数量: {position.quantity} | 成本: {formatCurrency(position.premium * position.quantity * 100, currencyConfig)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 单腿期权 */}
          {singleLegs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-blue-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  单腿期权 ({singleLegs.length} 个持仓)
                </h3>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Call期权列 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <h4 className={`text-md font-medium ${themes[theme].text}`}>
                      Call期权 ({singleLegs.filter(p => p.type === 'call').length})
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {singleLegs.filter(p => p.type === 'call').map((position) => {
                      const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                      const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      
                      return (
                        <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border-l-4 ${
                          position.position_type === 'buy' ? 'border-blue-500' : 'border-orange-500'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-mono ${themes[theme].text} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>
                                {position.strategy_id}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                {positionInfo.label}
                              </span>
                            </div>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                              {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {position.symbol} {position.strike} CALL
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                  到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                  ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>数量: </span>
                                <span className={`${themes[theme].text}`}>{position.quantity}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                                <span className={`${themes[theme].text}`}>{formatCurrency(position.premium, currencyConfig)}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>当前值: </span>
                                <span className={`${themes[theme].text}`}>{formatCurrency(position.currentValue, currencyConfig)}</span>
                              </div>
                            </div>
                            {position.notes && (
                              <div className={`text-xs ${themes[theme].text} opacity-75 mt-2 p-2 ${themes[theme].background} rounded`}>
                                {position.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {singleLegs.filter(p => p.type === 'call').length === 0 && (
                      <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                        <TrendingUp className={`w-8 h-8 mx-auto mb-2 ${themes[theme].text} opacity-40`} />
                        <p className={`text-sm ${themes[theme].text} opacity-75`}>暂无Call期权持仓</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Put期权列 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <h4 className={`text-md font-medium ${themes[theme].text}`}>
                      Put期权 ({singleLegs.filter(p => p.type === 'put').length})
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {singleLegs.filter(p => p.type === 'put').map((position) => {
                      const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                      const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      
                      return (
                        <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border-l-4 ${
                          position.position_type === 'buy' ? 'border-blue-500' : 'border-orange-500'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-mono ${themes[theme].text} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>
                                {position.strategy_id}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                {positionInfo.label}
                              </span>
                            </div>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                              {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {position.symbol} {position.strike} PUT
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                  到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                  ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>数量: </span>
                                <span className={`${themes[theme].text}`}>{position.quantity}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                                <span className={`${themes[theme].text}`}>{formatCurrency(position.premium, currencyConfig)}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>当前值: </span>
                                <span className={`${themes[theme].text}`}>{formatCurrency(position.currentValue, currencyConfig)}</span>
                              </div>
                            </div>
                            {position.notes && (
                              <div className={`text-xs ${themes[theme].text} opacity-75 mt-2 p-2 ${themes[theme].background} rounded`}>
                                {position.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {singleLegs.filter(p => p.type === 'put').length === 0 && (
                      <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                        <TrendingDown className={`w-8 h-8 mx-auto mb-2 ${themes[theme].text} opacity-40`} />
                        <p className={`text-sm ${themes[theme].text} opacity-75`}>暂无Put期权持仓</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 自定义策略显示 */}
          {customStrategies.length > 0 && (
            <div className="mt-8">
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4 flex items-center gap-2`}>
                <Layers className="w-5 h-5 text-purple-500" />
                自定义策略 ({customStrategies.length})
              </h3>
              <div className="space-y-4">
                {customStrategies.map((strategy) => {
                  const isExpanded = expandedStrategies.includes(strategy.id);
                  const totalCost = strategy.positions.reduce((sum, pos) => 
                    sum + (pos.premium * (pos.selectedQuantity || pos.quantity) * 100), 0);
                  const currentValue = strategy.positions.reduce((sum, pos) => 
                    sum + (pos.currentValue * (pos.selectedQuantity || pos.quantity) * 100), 0);
                  const profitLoss = currentValue - totalCost;
                  const profitLossPercentage = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;
                  
                  return (
                    <div key={strategy.id} className={`${themes[theme].background} rounded-lg border ${themes[theme].border}`}>
                      <div 
                        className={`p-4 cursor-pointer ${themes[theme].cardHover}`}
                        onClick={() => toggleStrategyExpansion(strategy.id)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              {strategy.strategyCategory && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  strategy.strategyCategory === 'bullish' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                                  strategy.strategyCategory === 'bearish' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                                  strategy.strategyCategory === 'volatility' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100' :
                                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                                }`}>
                                  {strategy.strategyCategory === 'bullish' ? '看涨' :
                                   strategy.strategyCategory === 'bearish' ? '看跌' :
                                   strategy.strategyCategory === 'volatility' ? '波动率' : '中性'}
                                </span>
                              )}
                              {strategy.riskLevel && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  strategy.riskLevel === 'low' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' :
                                  strategy.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' :
                                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                                }`}>
                                  {strategy.riskLevel === 'low' ? '低风险' :
                                   strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                                </span>
                              )}
                            </div>
                            <div>
                              <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                {strategy.name}
                              </h4>
                              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                                {strategy.description}
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                                {strategy.positions.length} 个期权 • 创建于 {new Date(strategy.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className={`text-lg font-semibold ${
                                profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(profitLoss), currencyConfig)}
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-75`}>
                                ({profitLossPercentage >= 0 ? '+' : ''}{profitLossPercentage.toFixed(2)}%)
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-60`}>
                                成本: {formatCurrency(totalCost, currencyConfig)}
                              </p>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
                            ) : (
                              <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-4 pb-4">
                          <div className="space-y-2">
                            <h5 className={`text-sm font-medium ${themes[theme].text} mb-3`}>
                              包含的期权持仓
                            </h5>
                            {strategy.positions.map((position) => {
                              const adjustedCost = position.premium * (position.selectedQuantity || position.quantity) * 100;
                              const adjustedValue = position.currentValue * (position.selectedQuantity || position.quantity) * 100;
                              const adjustedProfitLoss = adjustedValue - adjustedCost;
                              const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                              
                              return (
                                <div key={position.id} className={`${themes[theme].card} rounded p-3 border ${themes[theme].border}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      {getTypeIcon(position.type)}
                                      <div>
                                        <div className={`text-sm font-medium ${themes[theme].text}`}>
                                          {position.symbol} {position.strike} {position.type.toUpperCase()}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                          <div className="flex items-center gap-1">
                                            {positionInfo.icon}
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                              {positionInfo.label}
                                            </span>
                                          </div>
                                          <span className={`text-xs ${themes[theme].text} opacity-75`}>
                                            到期: {format(new Date(position.expiry), 'MM-dd')}
                                          </span>
                                        </div>
                                        <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                                          数量: {position.selectedQuantity || position.quantity}
                                          {position.selectedQuantity && position.selectedQuantity !== position.quantity && (
                                            <span className="text-blue-600 ml-1">
                                              (原始: {position.quantity})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className={`text-sm font-medium ${
                                        adjustedProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {adjustedProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(adjustedProfitLoss), currencyConfig)}
                                      </div>
                                      <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                        成本: {formatCurrency(adjustedCost, currencyConfig)}
                                      </div>
                                      <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                        当前: {formatCurrency(adjustedValue, currencyConfig)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === 'expiry' ? (
        <div className="space-y-6">
          {portfolioData.expiryGroups.map((group) => {
            const filteredPositions = filterAndSortPositions(group.positions);
            if (filteredPositions.length === 0) return null;

            return (
              <div key={group.expiry} className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                        到期日: {format(new Date(group.expiry), 'yyyy年MM月dd日')}
                      </h3>
                      <div className="flex items-center gap-4 mt-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDaysToExpiryColor(group.daysToExpiry)}`}>
                          {group.daysToExpiry > 0 ? `${group.daysToExpiry}天后到期` : '已到期'}
                        </span>
                        <span className={`text-sm ${themes[theme].text} opacity-75`}>
                          {filteredPositions.length} 个持仓
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${group.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {group.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(group.profitLoss), currencyConfig)}
                      </p>
                      <p className={`text-sm ${themes[theme].text} opacity-75`}>
                        总价值: {formatCurrency(group.totalValue, currencyConfig)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="space-y-4">
                    {(() => {
                      const callPositions = filteredPositions.filter(pos => pos.type === 'call');
                      const putPositions = filteredPositions.filter(pos => pos.type === 'put');
                      const spreadPositions = filteredPositions.filter(pos => !['call', 'put'].includes(pos.type));
                      
                      return (
                        <div className="space-y-6">
                          {/* Call和Put期权两列展示 */}
                          {(callPositions.length > 0 || putPositions.length > 0) && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Call期权列 */}
                              <div>
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                                  <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                    Call期权 ({callPositions.length})
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  {callPositions.map((position) => {
                                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                                    
                                    return (
                                      <div 
                                        key={position.id} 
                                        className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div className="flex items-start space-x-3">
                                            {getTypeIcon(position.type)}
                                            <div>
                                              <div className="flex items-center gap-2 mb-1">
                                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                  {position.symbol} {position.strike}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  {positionInfo.icon}
                                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                {position.strategy} • {positionInfo.description}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  数量: {position.quantity}
                                                </span>
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                            </div>
                                            <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                              {position.status === 'open' ? '持仓中' : 
                                               position.status === 'closed' ? '已平仓' : '已到期'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {callPositions.length === 0 && (
                                    <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                                      <p className={`${themes[theme].text} opacity-75`}>
                                        暂无Call期权持仓
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Put期权列 */}
                              <div>
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                                  <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                    Put期权 ({putPositions.length})
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  {putPositions.map((position) => {
                                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                                    
                                    return (
                                      <div 
                                        key={position.id} 
                                        className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div className="flex items-start space-x-3">
                                            {getTypeIcon(position.type)}
                                            <div>
                                              <div className="flex items-center gap-2 mb-1">
                                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                  {position.symbol} {position.strike}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  {positionInfo.icon}
                                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                {position.strategy} • {positionInfo.description}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  数量: {position.quantity}
                                                </span>
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                            </div>
                                            <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                              {position.status === 'open' ? '持仓中' : 
                                               position.status === 'closed' ? '已平仓' : '已到期'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {putPositions.length === 0 && (
                                    <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                                      <p className={`${themes[theme].text} opacity-75`}>
                                        暂无Put期权持仓
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 复杂策略期权（价差、跨式等）单独展示 */}
                          {spreadPositions.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                                <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                  复杂策略 ({spreadPositions.length})
                                </h4>
                              </div>
                              <div className="space-y-3">
                                {spreadPositions.map((position) => {
                                  const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                                  
                                  return (
                                    <div 
                                      key={position.id} 
                                      className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                    >
                                      <div className="flex justify-between items-start">
                                        <div className="flex items-start space-x-3">
                                          {getTypeIcon(position.type)}
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                {position.symbol} {position.strike} {position.type.toUpperCase()}
                                              </div>
                                              <div className="flex items-center gap-1">
                                                {positionInfo.icon}
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                  {positionInfo.label}
                                                </span>
                                              </div>
                                            </div>
                                            <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                              {position.strategy} • {positionInfo.description}
                                            </div>
                                            <div className="flex items-center gap-3 mt-2 text-xs">
                                              <span className={`${themes[theme].text} opacity-75`}>
                                                数量: {position.quantity}
                                              </span>
                                              <span className={`${themes[theme].text} opacity-75`}>
                                                权利金: {formatCurrency(position.premium, currencyConfig)}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                          </div>
                                          <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                          </div>
                                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                            {position.status === 'open' ? '持仓中' : 
                                             position.status === 'closed' ? '已平仓' : '已到期'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {portfolioData.strategies.map((strategy) => {
            const filteredPositions = filterAndSortPositions(strategy.positions);
            if (filteredPositions.length === 0) return null;

            return (
              <div key={strategy.id} className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                        {strategy.name}
                      </h3>
                      <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                        {strategy.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          strategy.category === 'bullish' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                          strategy.category === 'bearish' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                          strategy.category === 'neutral' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100' :
                          'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100'
                        }`}>
                          {strategy.category === 'bullish' ? '看涨' :
                           strategy.category === 'bearish' ? '看跌' :
                           strategy.category === 'neutral' ? '中性' : '波动'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          strategy.riskLevel === 'low' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                          strategy.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' :
                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                        }`}>
                          {strategy.riskLevel === 'low' ? '低风险' :
                           strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                        </span>
                        <span className={`text-sm ${themes[theme].text} opacity-75`}>
                          {filteredPositions.length} 个持仓
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {strategy.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(strategy.profitLoss), currencyConfig)}
                      </p>
                      <p className={`text-sm ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ({strategy.profitLossPercentage >= 0 ? '+' : ''}{strategy.profitLossPercentage.toFixed(2)}%)
                      </p>
                      <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                        当前价值: {formatCurrency(strategy.currentValue, currencyConfig)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="space-y-4">
                    {(() => {
                      const callPositions = filteredPositions.filter(pos => pos.type === 'call');
                      const putPositions = filteredPositions.filter(pos => pos.type === 'put');
                      const spreadPositions = filteredPositions.filter(pos => !['call', 'put'].includes(pos.type));
                      
                      return (
                        <div className="space-y-6">
                          {/* Call和Put期权两列展示 */}
                          {(callPositions.length > 0 || putPositions.length > 0) && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Call期权列 */}
                              <div>
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                                  <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                    Call期权 ({callPositions.length})
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  {callPositions.map((position) => {
                                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                                    
                                    return (
                                      <div 
                                        key={position.id} 
                                        className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div className="flex items-start space-x-3">
                                            {getTypeIcon(position.type)}
                                            <div>
                                              <div className="flex items-center gap-2 mb-1">
                                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                  {position.symbol} {position.strike}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  {positionInfo.icon}
                                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  数量: {position.quantity}
                                                </span>
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                            </div>
                                            <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                              {position.status === 'open' ? '持仓中' : 
                                               position.status === 'closed' ? '已平仓' : '已到期'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {callPositions.length === 0 && (
                                    <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                                      <p className={`${themes[theme].text} opacity-75`}>
                                        暂无Call期权持仓
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Put期权列 */}
                              <div>
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                                  <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                    Put期权 ({putPositions.length})
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  {putPositions.map((position) => {
                                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                                    
                                    return (
                                      <div 
                                        key={position.id} 
                                        className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div className="flex items-start space-x-3">
                                            {getTypeIcon(position.type)}
                                            <div>
                                              <div className="flex items-center gap-2 mb-1">
                                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                  {position.symbol} {position.strike}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  {positionInfo.icon}
                                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  数量: {position.quantity}
                                                </span>
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                            </div>
                                            <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                              {position.status === 'open' ? '持仓中' : 
                                               position.status === 'closed' ? '已平仓' : '已到期'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {putPositions.length === 0 && (
                                    <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                                      <p className={`${themes[theme].text} opacity-75`}>
                                        暂无Put期权持仓
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 复杂策略期权（价差、跨式等）单独展示 */}
                          {spreadPositions.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                                <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                  复杂策略 ({spreadPositions.length})
                                </h4>
                              </div>
                              <div className="space-y-3">
                                {spreadPositions.map((position) => {
                                  const positionInfo = getPositionTypeInfo2(position.position_type, position.type);
                                  
                                  return (
                                    <div 
                                      key={position.id} 
                                      className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                    >
                                      <div className="flex justify-between items-start">
                                        <div className="flex items-start space-x-3">
                                          {getTypeIcon(position.type)}
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                {position.symbol} {position.strike} {position.type.toUpperCase()}
                                              </div>
                                              <div className="flex items-center gap-1">
                                                {positionInfo.icon}
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                  {positionInfo.label}
                                                </span>
                                              </div>
                                            </div>
                                            <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                              到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                            </div>
                                            <div className="flex items-center gap-3 mt-2 text-xs">
                                              <span className={`${themes[theme].text} opacity-75`}>
                                                数量: {position.quantity}
                                              </span>
                                              <span className={`${themes[theme].text} opacity-75`}>
                                                权利金: {formatCurrency(position.premium, currencyConfig)}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                          </div>
                                          <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                          </div>
                                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                            {position.status === 'open' ? '持仓中' : 
                                             position.status === 'closed' ? '已平仓' : '已到期'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}