import React, { useState, useEffect } from 'react';
import { format, differenceInDays } from 'date-fns';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Shield, 
  Activity,
  Filter,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService } from '../../../lib/services';
import type { OptionsPortfolioData, OptionsPosition } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface OptionsPortfolioProps {
  theme: Theme;
}

type ViewMode = 'expiry' | 'strategy';
type FilterStatus = 'all' | 'open' | 'closed' | 'expired';

const DEMO_USER_ID = 'mock-user-id';

const getPositionTypeInfo = (positionType: string, optionType: string) => {
  const isBuy = positionType === 'buy';
  const isCall = optionType === 'call';
  
  if (isBuy && isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      description: '有权买入标的',
      borderColor: 'border-blue-200 dark:border-blue-700'
    };
  } else if (isBuy && !isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      description: '有权卖出标的',
      borderColor: 'border-blue-200 dark:border-blue-700'
    };
  } else if (!isBuy && isCall) {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '义务方',
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
      description: '有义务卖出标的',
      borderColor: 'border-orange-200 dark:border-orange-700'
    };
  } else {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '义务方',
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
      description: '有义务买入标的',
      borderColor: 'border-orange-200 dark:border-orange-700'
    };
  }
};

export function OptionsPortfolio({ theme }: OptionsPortfolioProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('expiry');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<string>('expiry');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { currencyConfig } = useCurrency();

  useEffect(() => {
    const fetchPortfolioData = async () => {
      try {
        setIsLoading(true);
        const { data: { user } } = await authService.getUser();
        
        const userId = user?.id || DEMO_USER_ID;
        const { data, error } = await optionsService.getOptionsPortfolio(userId);
        
        if (error) throw error;
        if (data) {
          setPortfolioData(data);
        }
      } catch (error) {
        console.error('Error fetching options portfolio:', error);
        toast.error('获取期权投资组合失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPortfolioData();
  }, []);

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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (field !== sortField) {
      return <ArrowUp className="w-4 h-4 opacity-30" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="w-4 h-4" /> : 
      <ArrowDown className="w-4 h-4" />;
  };

  const getFilteredAndSortedPositions = () => {
    if (!portfolioData) return [];
    
    let allPositions: OptionsPosition[] = [];
    
    if (viewMode === 'expiry') {
      allPositions = portfolioData.expiryGroups.flatMap(group => group.positions);
    } else {
      allPositions = portfolioData.strategies.flatMap(strategy => strategy.positions);
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      allPositions = allPositions.filter(pos => pos.status === filterStatus);
    }

    // Apply sorting
    allPositions.sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1;
      
      switch (sortField) {
        case 'expiry':
          return multiplier * (new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
        case 'symbol':
          return multiplier * a.symbol.localeCompare(b.symbol);
        case 'profitLoss':
          return multiplier * (a.profitLoss - b.profitLoss);
        case 'profitLossPercentage':
          return multiplier * (a.profitLossPercentage - b.profitLossPercentage);
        default:
          return 0;
      }
    });

    return allPositions;
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

  const filteredPositions = getFilteredAndSortedPositions();

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <h2 className={`text-xl font-bold ${themes[theme].text} mb-4`}>
            期权投资组合概览
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <p className={`text-2xl font-bold mt-1 ${
                portfolioData.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {portfolioData.totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(portfolioData.totalProfitLoss), currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>收益率</h3>
              <p className={`text-2xl font-bold mt-1 ${
                portfolioData.totalProfitLossPercentage >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
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
                <button
                  onClick={() => setViewMode('expiry')}
                  className={`px-3 py-2 rounded-md text-sm ${
                    viewMode === 'expiry' ? themes[theme].primary : themes[theme].secondary
                  }`}
                >
                  按到期日
                </button>
                <button
                  onClick={() => setViewMode('strategy')}
                  className={`px-3 py-2 rounded-md text-sm ${
                    viewMode === 'strategy' ? themes[theme].primary : themes[theme].secondary
                  }`}
                >
                  按策略
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className={`w-4 h-4 ${themes[theme].text}`} />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="all">全部状态</option>
                  <option value="open">持仓中</option>
                  <option value="closed">已平仓</option>
                  <option value="expired">已到期</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6">
          <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
            期权持仓详情 ({filteredPositions.length})
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${themes[theme].background}`}>
                <tr>
                  <th 
                    className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleSort('symbol')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>合约</span>
                      <SortIcon field="symbol" />
                    </div>
                  </th>
                  <th className={`px-4 py-3 text-center text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    权利义务
                  </th>
                  <th 
                    className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleSort('expiry')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>到期日</span>
                      <SortIcon field="expiry" />
                    </div>
                  </th>
                  <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    数量
                  </th>
                  <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    权利金
                  </th>
                  <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    当前价值
                  </th>
                  <th 
                    className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleSort('profitLoss')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>盈亏</span>
                      <SortIcon field="profitLoss" />
                    </div>
                  </th>
                  <th className={`px-4 py-3 text-center text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    状态
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${themes[theme].border}`}>
                {filteredPositions.map((position) => {
                  const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const positionInfo = getPositionTypeInfo(position.position_type, position.type);
                  
                  return (
                    <tr 
                      key={position.id} 
                      className={`${themes[theme].cardHover} border-l-4 ${positionInfo.borderColor}`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(position.type)}
                          <div>
                            <div className={`text-sm font-medium ${themes[theme].text}`}>
                              {position.symbol} {position.strike} {position.type.toUpperCase()}
                            </div>
                            <div className={`text-xs ${themes[theme].text} opacity-75`}>
                              {position.strategy}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                            {positionInfo.icon}
                            <span className="ml-1">{positionInfo.label}</span>
                          </div>
                          <div className={`text-xs ${themes[theme].text} opacity-60 text-center`}>
                            {positionInfo.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <div className={`text-sm ${themes[theme].text}`}>
                            {format(new Date(position.expiry), 'yyyy-MM-dd')}
                          </div>
                          <div className={`text-xs px-1 py-0.5 rounded ${getDaysToExpiryColor(daysToExpiry)}`}>
                            {daysToExpiry > 0 ? `${daysToExpiry}天` : '已到期'}
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                        {position.quantity}
                      </td>
                      <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                        {formatCurrency(position.premium, currencyConfig)}
                      </td>
                      <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                        {formatCurrency(position.currentValue, currencyConfig)}
                      </td>
                      <td className={`px-4 py-4 text-right text-sm font-medium ${
                        position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        <div>
                          {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                        </div>
                        <div className="text-xs">
                          ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                          {position.status === 'open' ? '持仓中' : 
                           position.status === 'closed' ? '已平仓' : '已到期'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredPositions.length === 0 && (
            <div className="text-center py-8">
              <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>暂无期权持仓</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                {filterStatus === 'all' 
                  ? '您还没有任何期权持仓'
                  : `没有找到状态为"${filterStatus}"的期权持仓`
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Expiry Groups View */}
      {viewMode === 'expiry' && portfolioData.expiryGroups.length > 0 && (
        <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6">
            <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
              按到期日分组
            </h3>
            <div className="space-y-4">
              {portfolioData.expiryGroups.map((group) => {
                const daysToExpiry = Math.ceil((new Date(group.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                
                return (
                  <div key={group.expiry} className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-blue-500" />
                        <div>
                          <h4 className={`text-md font-semibold ${themes[theme].text}`}>
                            {format(new Date(group.expiry), 'yyyy年MM月dd日')}
                          </h4>
                          <p className={`text-xs ${themes[theme].text} opacity-75`}>
                            {daysToExpiry > 0 ? `${daysToExpiry}天后到期` : '已到期'} • {group.positions.length}个持仓
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          group.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {group.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(group.profitLoss), currencyConfig)}
                        </p>
                        <p className={`text-xs ${themes[theme].text} opacity-75`}>
                          总价值: {formatCurrency(group.totalValue, currencyConfig)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Strategy Groups View */}
      {viewMode === 'strategy' && portfolioData.strategies.length > 0 && (
        <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6">
            <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
              按策略分组
            </h3>
            <div className="space-y-4">
              {portfolioData.strategies.map((strategy) => (
                <div key={strategy.id} className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-3">
                      <Target className="w-5 h-5 text-purple-500" />
                      <div>
                        <h4 className={`text-md font-semibold ${themes[theme].text}`}>
                          {strategy.name}
                        </h4>
                        <p className={`text-xs ${themes[theme].text} opacity-75`}>
                          {strategy.description} • {strategy.positions.length}个持仓
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${
                        strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {strategy.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(strategy.profitLoss), currencyConfig)}
                      </p>
                      <p className={`text-xs ${themes[theme].text} opacity-75`}>
                        ({strategy.profitLossPercentage >= 0 ? '+' : ''}{strategy.profitLossPercentage.toFixed(2)}%)
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}