import React, { useState, useEffect } from 'react';
import { format, differenceInDays } from 'date-fns';
import { 
  Briefcase, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
  Target,
  Shield,
  Activity,
  Clock,
  BarChart3,
  PieChart
} from 'lucide-react';
import { Theme, themes } from '../../../shared/constants/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService } from '../../../lib/services';
import type { OptionsPortfolioData, OptionsPosition, OptionsStrategy } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface OptionsPortfolioProps {
  theme: Theme;
}

type ViewMode = 'expiry' | 'strategy';
type FilterMode = 'all' | 'open' | 'closed' | 'expired';

const DEMO_USER_ID = 'mock-user-id';

export function OptionsPortfolio({ theme }: OptionsPortfolioProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('expiry');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('all');
  const { currencyConfig, regionalColors } = useCurrency();

  useEffect(() => {
    const fetchPortfolioData = async () => {
      try {
        setIsLoading(true);
        const { data: { user } } = await authService.getUser();
        
        if (user) {
          const { data, error } = await optionsService.getOptionsPortfolio(user.id);
          if (error) throw error;
          if (data) {
            setPortfolioData(data);
            // 默认展开最近到期的组
            if (data.expiryGroups.length > 0) {
              setExpandedGroups([data.expiryGroups[0].expiry]);
            }
          }
        } else {
          // 使用demo用户数据
          const { data, error } = await optionsService.getOptionsPortfolio(DEMO_USER_ID);
          if (error) throw error;
          if (data) {
            setPortfolioData(data);
            if (data.expiryGroups.length > 0) {
              setExpandedGroups([data.expiryGroups[0].expiry]);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching options portfolio:', error);
        toast.error('获取期权投资组合数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPortfolioData();
  }, []);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const getFilteredPositions = (positions: OptionsPosition[]) => {
    return positions.filter(position => {
      if (filterMode === 'all') return true;
      return position.status === filterMode;
    });
  };

  const getFilteredExpiryGroups = () => {
    if (!portfolioData) return [];
    
    let groups = portfolioData.expiryGroups;
    
    if (selectedExpiry !== 'all') {
      groups = groups.filter(group => group.expiry === selectedExpiry);
    }
    
    return groups.map(group => ({
      ...group,
      positions: getFilteredPositions(group.positions)
    })).filter(group => group.positions.length > 0);
  };

  const getFilteredStrategies = () => {
    if (!portfolioData) return [];
    
    return portfolioData.strategies.map(strategy => ({
      ...strategy,
      positions: getFilteredPositions(strategy.positions)
    })).filter(strategy => strategy.positions.length > 0);
  };

  const getPositionTypeInfo = (positionType: 'buy' | 'sell', optionType: 'call' | 'put') => {
    if (positionType === 'buy') {
      return {
        label: '权利方',
        description: optionType === 'call' ? '有权买入标的' : '有权卖出标的',
        color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900',
        icon: <Shield className="w-3 h-3" />
      };
    } else {
      return {
        label: '义务方',
        description: optionType === 'call' ? '有义务卖出标的' : '有义务买入标的',
        color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900',
        icon: <Target className="w-3 h-3" />
      };
    }
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
        return <BarChart3 className="w-4 h-4 text-gray-500" />;
    }
  };

  const getCategoryColor = (category: OptionsStrategy['category']) => {
    switch (category) {
      case 'bullish':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900';
      case 'bearish':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900';
      case 'neutral':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900';
      case 'volatility':
        return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700';
    }
  };

  const getRiskLevelColor = (riskLevel: OptionsStrategy['riskLevel']) => {
    switch (riskLevel) {
      case 'low':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900';
      case 'high':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700';
    }
  };

  const getDaysToExpiryColor = (days: number) => {
    if (days <= 7) return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900';
    if (days <= 30) return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900';
    return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900';
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
          <Briefcase className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
          <p className={`text-lg font-medium ${themes[theme].text}`}>无法加载期权投资组合</p>
          <p className={`text-sm ${themes[theme].text} opacity-75`}>
            请稍后重试或联系技术支持
          </p>
        </div>
      </div>
    );
  }

  const uniqueExpiries = portfolioData.expiryGroups.map(group => group.expiry);

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <Briefcase className="w-6 h-6 text-blue-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              期权投资组合概览
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总持仓价值</h3>
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
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总收益率</h3>
              <p className={`text-2xl font-bold mt-1 ${portfolioData.totalProfitLossPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolioData.totalProfitLossPercentage >= 0 ? '+' : ''}{portfolioData.totalProfitLossPercentage.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* View Controls */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${themes[theme].text}`}>视图模式:</span>
                <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                  <button
                    onClick={() => setViewMode('expiry')}
                    className={`px-3 py-1 text-sm flex items-center gap-2 ${
                      viewMode === 'expiry' ? themes[theme].primary : themes[theme].secondary
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    按到期日
                  </button>
                  <button
                    onClick={() => setViewMode('strategy')}
                    className={`px-3 py-1 text-sm flex items-center gap-2 ${
                      viewMode === 'strategy' ? themes[theme].primary : themes[theme].secondary
                    }`}
                  >
                    <Target className="w-4 h-4" />
                    按策略
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Filter className={`w-4 h-4 ${themes[theme].text}`} />
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                  className={`px-3 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="all">全部状态</option>
                  <option value="open">持仓中</option>
                  <option value="closed">已平仓</option>
                  <option value="expired">已到期</option>
                </select>
              </div>
            </div>

            {viewMode === 'expiry' && (
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${themes[theme].text}`}>到期日:</span>
                <select
                  value={selectedExpiry}
                  onChange={(e) => setSelectedExpiry(e.target.value)}
                  className={`px-3 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="all">全部到期日</option>
                  {uniqueExpiries.map(expiry => (
                    <option key={expiry} value={expiry}>
                      {format(new Date(expiry), 'yyyy-MM-dd')}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Content based on view mode */}
        <div className="p-6">
          {viewMode === 'expiry' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-blue-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  按到期日分组 ({getFilteredExpiryGroups().length} 个到期日)
                </h3>
              </div>

              {getFilteredExpiryGroups().map((group) => (
                <div
                  key={group.expiry}
                  className={`${themes[theme].background} rounded-lg border ${themes[theme].border}`}
                >
                  <button
                    onClick={() => toggleGroup(group.expiry)}
                    className={`w-full p-4 flex items-center justify-between ${themes[theme].cardHover} transition-colors rounded-lg`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-500" />
                        <span className={`font-semibold ${themes[theme].text}`}>
                          {format(new Date(group.expiry), 'yyyy年MM月dd日')}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDaysToExpiryColor(group.daysToExpiry)}`}>
                          {group.daysToExpiry > 0 ? `${group.daysToExpiry}天后到期` : '已到期'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className={`${themes[theme].text} opacity-75`}>
                          {group.positions.length} 个持仓
                        </span>
                        <span className={`font-medium ${group.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {group.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(group.profitLoss), currencyConfig)}
                        </span>
                      </div>
                    </div>
                    {expandedGroups.includes(group.expiry) ? (
                      <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
                    ) : (
                      <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
                    )}
                  </button>

                  {expandedGroups.includes(group.expiry) && (
                    <div className="px-4 pb-4">
                      {/* 按策略分组显示 */}
                      <div className="space-y-4">
                        {/* 构建组合策略 */}
                        {(() => {
                          const strategiesInGroup = new Map<string, OptionsPosition[]>();
                          const singleLegPositions: OptionsPosition[] = [];
                          
                          group.positions.forEach(position => {
                            const isComplexStrategy = ['Bull Call Spread', 'Bear Put Spread', 'Iron Condor', 'Butterfly Spread', 'Straddle', 'Strangle'].includes(position.strategy);
                            
                            if (isComplexStrategy) {
                              if (!strategiesInGroup.has(position.strategy)) {
                                strategiesInGroup.set(position.strategy, []);
                              }
                              strategiesInGroup.get(position.strategy)!.push(position);
                            } else {
                              singleLegPositions.push(position);
                            }
                          });
                          
                          return (
                            <>
                              {/* 构建组合策略 */}
                              {strategiesInGroup.size > 0 && (
                                <div>
                                  <h4 className={`text-md font-semibold ${themes[theme].text} mb-3 flex items-center gap-2`}>
                                    <Target className="w-5 h-5 text-purple-500" />
                                    构建组合策略
                                  </h4>
                                  <div className="space-y-3">
                                    {Array.from(strategiesInGroup.entries()).map(([strategyName, positions]) => {
                                      const strategyTotalCost = positions.reduce((sum, pos) => sum + pos.premium * pos.quantity * 100, 0);
                                      const strategyCurrentValue = positions.reduce((sum, pos) => sum + pos.currentValue * pos.quantity * 100, 0);
                                      const strategyProfitLoss = positions.reduce((sum, pos) => sum + pos.profitLoss, 0);
                                      const strategyProfitLossPercentage = strategyTotalCost > 0 ? (strategyProfitLoss / strategyTotalCost) * 100 : 0;
                                      
                                      return (
                                        <div key={strategyName} className={`${themes[theme].card} rounded-lg p-4 border ${themes[theme].border}`}>
                                          <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-2">
                                              <Target className="w-4 h-4 text-purple-500" />
                                              <span className={`font-semibold ${themes[theme].text}`}>{strategyName}</span>
                                              <span className={`px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100`}>
                                                {positions.length} 腿
                                              </span>
                                            </div>
                                            <div className="text-right">
                                              <div className={`text-sm font-medium ${strategyProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {strategyProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(strategyProfitLoss), currencyConfig)}
                                              </div>
                                              <div className={`text-xs ${strategyProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                ({strategyProfitLossPercentage >= 0 ? '+' : ''}{strategyProfitLossPercentage.toFixed(2)}%)
                                              </div>
                                            </div>
                                          </div>
                                          
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                                            <div className="text-center">
                                              <p className={`text-xs ${themes[theme].text} opacity-75`}>总成本</p>
                                              <p className={`text-sm font-medium ${themes[theme].text}`}>
                                                {formatCurrency(strategyTotalCost, currencyConfig)}
                                              </p>
                                            </div>
                                            <div className="text-center">
                                              <p className={`text-xs ${themes[theme].text} opacity-75`}>当前价值</p>
                                              <p className={`text-sm font-medium ${themes[theme].text}`}>
                                                {formatCurrency(strategyCurrentValue, currencyConfig)}
                                              </p>
                                            </div>
                                            <div className="text-center">
                                              <p className={`text-xs ${themes[theme].text} opacity-75`}>持仓数量</p>
                                              <p className={`text-sm font-medium ${themes[theme].text}`}>
                                                {positions.reduce((sum, pos) => sum + pos.quantity, 0)} 手
                                              </p>
                                            </div>
                                          </div>
                                          
                                          <div className="space-y-2">
                                            {positions.map((position) => (
                                              <div key={position.id} className={`${themes[theme].background} rounded p-2 flex justify-between items-center`}>
                                                <div className="flex items-center gap-2">
                                                  {getTypeIcon(position.type)}
                                                  <span className={`text-sm ${themes[theme].text}`}>
                                                    {position.symbol} {position.strike} {position.type.toUpperCase()}
                                                  </span>
                                                  <span className={`text-xs ${themes[theme].text} opacity-75`}>
                                                    x{position.quantity}
                                                  </span>
                                                </div>
                                                <div className="text-right">
                                                  <div className={`text-sm font-medium ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* 单腿期权 - 左右分栏显示 */}
                              {singleLegPositions.length > 0 && (
                                <div>
                                  <h4 className={`text-md font-semibold ${themes[theme].text} mb-3 flex items-center gap-2`}>
                                    <TrendingUp className="w-5 h-5 text-blue-500" />
                                    单腿期权持仓
                                  </h4>
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Call期权 */}
                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <TrendingUp className="w-4 h-4 text-green-500" />
                                        <h5 className={`text-sm font-semibold ${themes[theme].text}`}>
                                          Call期权 ({singleLegPositions.filter(p => p.type === 'call').length})
                                        </h5>
                                      </div>
                                      <div className="space-y-2">
                                        {singleLegPositions
                                          .filter(position => position.type === 'call')
                                          .sort((a, b) => a.strike - b.strike)
                                          .map((position) => (
                                            <div key={position.id} className={`${themes[theme].background} rounded-lg p-3 border-l-4 border-green-500`}>
                                              <div className="flex justify-between items-start mb-2">
                                                <div>
                                                  <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                    {position.symbol} {position.strike} CALL
                                                  </div>
                                                  <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                    {position.strategy} • {position.quantity} 手
                                                  </div>
                                                </div>
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                                                  {position.status === 'open' ? '持仓中' : 
                                                   position.status === 'closed' ? '已平仓' : '已到期'}
                                                </span>
                                              </div>
                                              <div className="grid grid-cols-2 gap-4 text-xs">
                                                <div>
                                                  <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                                                  <span className={`font-medium ${themes[theme].text}`}>
                                                    {formatCurrency(position.premium, currencyConfig)}
                                                  </span>
                                                </div>
                                                <div>
                                                  <span className={`${themes[theme].text} opacity-75`}>当前价值: </span>
                                                  <span className={`font-medium ${themes[theme].text}`}>
                                                    {formatCurrency(position.currentValue, currencyConfig)}
                                                  </span>
                                                </div>
                                                <div>
                                                  <span className={`${themes[theme].text} opacity-75`}>盈亏: </span>
                                                  <span className={`font-medium ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                                  </span>
                                                </div>
                                                <div>
                                                  <span className={`${themes[theme].text} opacity-75`}>Delta: </span>
                                                  <span className={`font-medium ${themes[theme].text}`}>
                                                    {position.delta.toFixed(3)}
                                                  </span>
                                                </div>
                                              </div>
                                              {position.notes && (
                                                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>{position.notes}</p>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        {singleLegPositions.filter(p => p.type === 'call').length === 0 && (
                                          <div className={`${themes[theme].background} rounded-lg p-4 text-center border-2 border-dashed ${themes[theme].border}`}>
                                            <TrendingUp className={`w-8 h-8 mx-auto mb-2 ${themes[theme].text} opacity-40`} />
                                            <p className={`text-sm ${themes[theme].text} opacity-75`}>暂无Call期权持仓</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Put期权 */}
                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <TrendingDown className="w-4 h-4 text-red-500" />
                                        <h5 className={`text-sm font-semibold ${themes[theme].text}`}>
                                          Put期权 ({singleLegPositions.filter(p => p.type === 'put').length})
                                        </h5>
                                      </div>
                                      <div className="space-y-2">
                                        {singleLegPositions
                                          .filter(position => position.type === 'put')
                                          .sort((a, b) => b.strike - a.strike)
                                          .map((position) => (
                                            <div key={position.id} className={`${themes[theme].background} rounded-lg p-3 border-l-4 border-red-500`}>
                                              <div className="flex justify-between items-start mb-2">
                                                <div>
                                                  <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                    {position.symbol} {position.strike} PUT
                                                  </div>
                                                  <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                    {position.strategy} • {position.quantity} 手
                                                  </div>
                                                </div>
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                                                  {position.status === 'open' ? '持仓中' : 
                                                   position.status === 'closed' ? '已平仓' : '已到期'}
                                                </span>
                                              </div>
                                              <div className="grid grid-cols-2 gap-4 text-xs">
                                                <div>
                                                  <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                                                  <span className={`font-medium ${themes[theme].text}`}>
                                                    {formatCurrency(position.premium, currencyConfig)}
                                                  </span>
                                                </div>
                                                <div>
                                                  <span className={`${themes[theme].text} opacity-75`}>当前价值: </span>
                                                  <span className={`font-medium ${themes[theme].text}`}>
                                                    {formatCurrency(position.currentValue, currencyConfig)}
                                                  </span>
                                                </div>
                                                <div>
                                                  <span className={`${themes[theme].text} opacity-75`}>盈亏: </span>
                                                  <span className={`font-medium ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                                  </span>
                                                </div>
                                                <div>
                                                  <span className={`${themes[theme].text} opacity-75`}>Delta: </span>
                                                  <span className={`font-medium ${themes[theme].text}`}>
                                                    {position.delta.toFixed(3)}
                                                  </span>
                                                </div>
                                              </div>
                                              {position.notes && (
                                                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>{position.notes}</p>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        {singleLegPositions.filter(p => p.type === 'put').length === 0 && (
                                          <div className={`${themes[theme].background} rounded-lg p-4 text-center border-2 border-dashed ${themes[theme].border}`}>
                                            <TrendingDown className={`w-8 h-8 mx-auto mb-2 ${themes[theme].text} opacity-40`} />
                                            <p className={`text-sm ${themes[theme].text} opacity-75`}>暂无Put期权持仓</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {getFilteredExpiryGroups().length === 0 && (
                <div className="text-center py-12">
                  <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
                  <p className={`text-lg font-medium ${themes[theme].text}`}>没有找到期权持仓</p>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    {filterMode === 'all' 
                      ? '您还没有任何期权持仓'
                      : `没有找到状态为"${filterMode}"的持仓`
                    }
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-purple-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  按策略分组 ({getFilteredStrategies().length} 种策略)
                </h3>
              </div>

              {getFilteredStrategies().map((strategy) => (
                <div
                  key={strategy.id}
                  className={`${themes[theme].background} rounded-lg border ${themes[theme].border}`}
                >
                  <button
                    onClick={() => toggleGroup(strategy.id)}
                    className={`w-full p-4 flex items-center justify-between ${themes[theme].cardHover} transition-colors rounded-lg`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-purple-500" />
                        <span className={`font-semibold ${themes[theme].text}`}>
                          {strategy.name}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(strategy.category)}`}>
                          {strategy.category === 'bullish' ? '看涨' :
                           strategy.category === 'bearish' ? '看跌' :
                           strategy.category === 'neutral' ? '中性' : '波动率'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskLevelColor(strategy.riskLevel)}`}>
                          {strategy.riskLevel === 'low' ? '低风险' :
                           strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className={`${themes[theme].text} opacity-75`}>
                          {strategy.positions.length} 个持仓
                        </span>
                        <span className={`font-medium ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {strategy.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(strategy.profitLoss), currencyConfig)}
                        </span>
                      </div>
                    </div>
                    {expandedGroups.includes(strategy.id) ? (
                      <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
                    ) : (
                      <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
                    )}
                  </button>

                  {expandedGroups.includes(strategy.id) && (
                    <div className="px-4 pb-4">
                      <div className={`${themes[theme].card} rounded-lg p-4 mb-4`}>
                        <p className={`text-sm ${themes[theme].text} opacity-75 mb-3`}>
                          {strategy.description}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <span className={`text-xs ${themes[theme].text} opacity-75`}>总成本</span>
                            <p className={`text-sm font-medium ${themes[theme].text}`}>
                              {formatCurrency(strategy.totalCost, currencyConfig)}
                            </p>
                          </div>
                          <div>
                            <span className={`text-xs ${themes[theme].text} opacity-75`}>当前价值</span>
                            <p className={`text-sm font-medium ${themes[theme].text}`}>
                              {formatCurrency(strategy.currentValue, currencyConfig)}
                            </p>
                          </div>
                          <div>
                            <span className={`text-xs ${themes[theme].text} opacity-75`}>最大风险</span>
                            <p className={`text-sm font-medium text-red-600`}>
                              {formatCurrency(strategy.maxRisk, currencyConfig)}
                            </p>
                          </div>
                          <div>
                            <span className={`text-xs ${themes[theme].text} opacity-75`}>最大收益</span>
                            <p className={`text-sm font-medium text-green-600`}>
                              {strategy.maxReward === Infinity ? '无限' : formatCurrency(strategy.maxReward, currencyConfig)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className={`${themes[theme].card}`}>
                            <tr>
                              <th className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                                合约
                              </th>
                              <th className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                                到期日
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
                              <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                                盈亏
                              </th>
                              <th className={`px-4 py-3 text-center text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                                状态
                              </th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${themes[theme].border}`}>
                            {strategy.positions.map((position) => {
                              const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                              return (
                                <tr key={position.id} className={themes[theme].cardHover}>
                                  <td className="px-4 py-4">
                                    <div className="flex items-center gap-2">
                                      {getTypeIcon(position.type)}
                                      <div>
                                        <div className={`text-sm font-medium ${themes[theme].text}`}>
                                          {position.symbol} {position.strike} {position.type.toUpperCase()}
                                        </div>
                                        <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                          IV: {(position.impliedVolatility * 100).toFixed(1)}%
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div>
                                      <div className={`text-sm ${themes[theme].text}`}>
                                        {format(new Date(position.expiry), 'MM-dd')}
                                      </div>
                                      <div className={`text-xs ${getDaysToExpiryColor(daysToExpiry).replace('bg-', 'text-').replace('-100', '-600')}`}>
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
                    </div>
                  )}
                </div>
              ))}

              {getFilteredStrategies().length === 0 && (
                <div className="text-center py-12">
                  <Target className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
                  <p className={`text-lg font-medium ${themes[theme].text}`}>没有找到期权策略</p>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    {filterMode === 'all' 
                      ? '您还没有任何期权策略'
                      : `没有找到状态为"${filterMode}"的策略`
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Position Button */}
      <div className="flex justify-center">
        <button className={`inline-flex items-center px-6 py-3 rounded-lg ${themes[theme].primary} shadow-md`}>
          <Plus className="w-5 h-5 mr-2" />
          添加新持仓
        </button>
      </div>
    </div>
  );
}