import React, { useState, useEffect } from 'react';
import { format, differenceInDays, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { 
  Calendar, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Target, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Shield,
  Lightbulb,
  Copy,
  Check,
  Edit2,
  Save,
  X,
  CheckSquare,
  Square
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService } from '../../../lib/services';
import type { OptionsPosition, OptionsStrategy } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface OptionsPortfolioManagementProps {
  theme: Theme;
}

interface CustomStrategy {
  id: string;
  name: string;
  description: string;
  positions: OptionsPosition[];
  createdAt: string;
  isCustom: true;
}

interface RecommendedStrategy {
  id: string;
  name: string;
  description: string;
  category: 'bullish' | 'bearish' | 'neutral' | 'volatility';
  riskLevel: 'low' | 'medium' | 'high';
  suggestedPositions: Array<{
    symbol: string;
    type: 'call' | 'put';
    action: 'buy' | 'sell';
    strike: number;
    expiry: string;
    quantity: number;
    estimatedPremium: number;
  }>;
  expectedReturn: number;
  maxRisk: number;
  reasoning: string;
}

const DEMO_USER_ID = 'mock-user-id';

// Mock recommended strategies based on current market conditions
const generateRecommendedStrategies = (currentPositions: OptionsPosition[]): RecommendedStrategy[] => {
  const symbols = Array.from(new Set(currentPositions.map(p => p.symbol)));
  const recommendations: RecommendedStrategy[] = [];

  // Generate recommendations for each symbol
  symbols.forEach(symbol => {
    const symbolPositions = currentPositions.filter(p => p.symbol === symbol);
    const hasCallPositions = symbolPositions.some(p => p.type === 'call');
    const hasPutPositions = symbolPositions.some(p => p.type === 'put');

    // Recommend protective strategies if only long positions exist
    if (hasCallPositions && !hasPutPositions) {
      recommendations.push({
        id: `protective-put-${symbol}`,
        name: `${symbol} 保护性看跌期权`,
        description: `为您的${symbol}看涨持仓添加保护性看跌期权，降低下行风险`,
        category: 'neutral',
        riskLevel: 'low',
        suggestedPositions: [
          {
            symbol,
            type: 'put',
            action: 'buy',
            strike: 380,
            expiry: '2024-03-15',
            quantity: 5,
            estimatedPremium: 8.50
          }
        ],
        expectedReturn: 5.2,
        maxRisk: 4250,
        reasoning: '当前持有看涨期权，建议添加保护性看跌期权以对冲下行风险'
      });
    }

    // Recommend covered call if no call positions
    if (!hasCallPositions) {
      recommendations.push({
        id: `covered-call-${symbol}`,
        name: `${symbol} 备兑看涨期权`,
        description: `卖出${symbol}看涨期权获取权利金收入`,
        category: 'neutral',
        riskLevel: 'low',
        suggestedPositions: [
          {
            symbol,
            type: 'call',
            action: 'sell',
            strike: 460,
            expiry: '2024-02-16',
            quantity: 3,
            estimatedPremium: 12.30
          }
        ],
        expectedReturn: 8.7,
        maxRisk: 0,
        reasoning: '通过卖出虚值看涨期权获取额外收入，适合中性市场预期'
      });
    }
  });

  // Add general market strategies
  recommendations.push(
    {
      id: 'iron-condor-spy',
      name: 'SPY 铁鹰策略',
      description: '中性策略，适合低波动市场环境',
      category: 'neutral',
      riskLevel: 'medium',
      suggestedPositions: [
        {
          symbol: 'SPY',
          type: 'put',
          action: 'buy',
          strike: 440,
          expiry: '2024-03-15',
          quantity: 2,
          estimatedPremium: 3.20
        },
        {
          symbol: 'SPY',
          type: 'put',
          action: 'sell',
          strike: 450,
          expiry: '2024-03-15',
          quantity: 2,
          estimatedPremium: 5.80
        },
        {
          symbol: 'SPY',
          type: 'call',
          action: 'sell',
          strike: 470,
          expiry: '2024-03-15',
          quantity: 2,
          estimatedPremium: 6.10
        },
        {
          symbol: 'SPY',
          type: 'call',
          action: 'buy',
          strike: 480,
          expiry: '2024-03-15',
          quantity: 2,
          estimatedPremium: 3.50
        }
      ],
      expectedReturn: 12.4,
      maxRisk: 1560,
      reasoning: '当前市场波动率较低，铁鹰策略可以收取时间价值'
    },
    {
      id: 'bull-call-spread-qqq',
      name: 'QQQ 牛市看涨价差',
      description: '看好科技股短期上涨的有限风险策略',
      category: 'bullish',
      riskLevel: 'medium',
      suggestedPositions: [
        {
          symbol: 'QQQ',
          type: 'call',
          action: 'buy',
          strike: 380,
          expiry: '2024-04-19',
          quantity: 5,
          estimatedPremium: 15.20
        },
        {
          symbol: 'QQQ',
          type: 'call',
          action: 'sell',
          strike: 400,
          expiry: '2024-04-19',
          quantity: 5,
          estimatedPremium: 8.90
        }
      ],
      expectedReturn: 18.5,
      maxRisk: 3150,
      reasoning: '科技股基本面强劲，适合构建牛市价差策略'
    }
  );

  return recommendations;
};

export function OptionsPortfolioManagement({ theme }: OptionsPortfolioManagementProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [positions, setPositions] = useState<OptionsPosition[]>([]);
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
  const [recommendedStrategies, setRecommendedStrategies] = useState<RecommendedStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddStrategy, setShowAddStrategy] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyDescription, setNewStrategyDescription] = useState('');
  const [editingStrategy, setEditingStrategy] = useState<string | null>(null);
  const [copiedStrategy, setCopiedStrategy] = useState<string | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [availableMonths, setAvailableMonths] = useState<Date[]>([]);
  const [isSavingStrategy, setIsSavingStrategy] = useState(false);
  const { currencyConfig } = useCurrency();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await optionsService.getOptionsPortfolio(DEMO_USER_ID);
        if (error) throw error;
        
        if (data) {
          // Flatten all positions from strategies
          const allPositions = data.strategies.flatMap(strategy => strategy.positions);
          setPositions(allPositions);
          
          // Calculate available months based on positions
          const months = new Set<string>();
          allPositions.forEach(position => {
            const expiryDate = new Date(position.expiry);
            const monthKey = format(startOfMonth(expiryDate), 'yyyy-MM');
            months.add(monthKey);
          });
          
          const sortedMonths = Array.from(months)
            .map(monthKey => new Date(monthKey + '-01'))
            .sort((a, b) => a.getTime() - b.getTime());
          
          setAvailableMonths(sortedMonths);
          
          // Set current month to the first available month if current month has no positions
          if (sortedMonths.length > 0) {
            const currentMonthKey = format(startOfMonth(currentMonth), 'yyyy-MM');
            if (!months.has(currentMonthKey)) {
              setCurrentMonth(sortedMonths[0]);
            }
          }
          
          // Generate recommendations based on current positions
          const recommendations = generateRecommendedStrategies(allPositions);
          setRecommendedStrategies(recommendations);
        }
      } catch (error) {
        console.error('Error fetching portfolio data:', error);
        toast.error('获取投资组合数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const getPositionsForMonth = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    
    return positions.filter(position => {
      const expiryDate = new Date(position.expiry);
      return expiryDate >= monthStart && expiryDate <= monthEnd;
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const currentIndex = availableMonths.findIndex(month => 
      format(month, 'yyyy-MM') === format(currentMonth, 'yyyy-MM')
    );
    
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentMonth(availableMonths[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < availableMonths.length - 1) {
      setCurrentMonth(availableMonths[currentIndex + 1]);
    }
    
    // Clear selections when changing months
    setSelectedPositions(new Set());
  };

  const handleCreateCustomStrategy = async () => {
    if (!newStrategyName.trim()) {
      toast.error('请输入策略名称');
      return;
    }

    if (selectedPositions.size === 0) {
      toast.error('请至少选择一个期权持仓');
      return;
    }

    setIsSavingStrategy(true);
    
    try {
      const selectedPositionsList = positions.filter(pos => selectedPositions.has(pos.id));
      
      const newStrategy: CustomStrategy = {
        id: `custom-${Date.now()}`,
        name: newStrategyName.trim(),
        description: newStrategyDescription.trim() || '自定义期权策略',
        positions: selectedPositionsList,
        createdAt: new Date().toISOString(),
        isCustom: true
      };

      // TODO: 这里应该调用后端API保存策略
      // const { error } = await optionsService.saveCustomStrategy(newStrategy);
      // if (error) throw error;

      // 模拟API调用延迟
      await new Promise(resolve => setTimeout(resolve, 1000));

      setCustomStrategies(prev => [...prev, newStrategy]);
      setNewStrategyName('');
      setNewStrategyDescription('');
      setShowAddStrategy(false);
      setSelectedPositions(new Set());
      toast.success('策略创建并保存成功');
    } catch (error) {
      console.error('Error saving strategy:', error);
      toast.error('保存策略失败，请重试');
    } finally {
      setIsSavingStrategy(false);
    }
  };

  const handleDeleteCustomStrategy = async (strategyId: string) => {
    try {
      // TODO: 这里应该调用后端API删除策略
      // const { error } = await optionsService.deleteCustomStrategy(strategyId);
      // if (error) throw error;

      setCustomStrategies(prev => prev.filter(s => s.id !== strategyId));
      toast.success('策略已删除');
    } catch (error) {
      console.error('Error deleting strategy:', error);
      toast.error('删除策略失败');
    }
  };

  const handleCopyRecommendedStrategy = (strategy: RecommendedStrategy) => {
    const customStrategy: CustomStrategy = {
      id: `custom-${Date.now()}`,
      name: strategy.name,
      description: strategy.description,
      positions: strategy.suggestedPositions.map((pos, index) => ({
        id: `pos-${Date.now()}-${index}`,
        symbol: pos.symbol,
        strategy: strategy.name,
        type: pos.type,
        strike: pos.strike,
        expiry: pos.expiry,
        quantity: pos.quantity,
        premium: pos.estimatedPremium,
        currentValue: pos.estimatedPremium, // Assume current value equals premium for new positions
        profitLoss: 0,
        profitLossPercentage: 0,
        impliedVolatility: 0.20,
        delta: pos.type === 'call' ? 0.5 : -0.5,
        gamma: 0.02,
        theta: -0.05,
        vega: 0.12,
        status: 'open',
        openDate: new Date().toISOString(),
        notes: strategy.reasoning
      })),
      createdAt: new Date().toISOString(),
      isCustom: true
    };

    setCustomStrategies(prev => [...prev, customStrategy]);
    setCopiedStrategy(strategy.id);
    setTimeout(() => setCopiedStrategy(null), 2000);
    toast.success(`已添加策略: ${strategy.name}`);
  };

  const togglePositionSelection = (positionId: string) => {
    setSelectedPositions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(positionId)) {
        newSet.delete(positionId);
      } else {
        newSet.add(positionId);
      }
      return newSet;
    });
  };

  const selectAllPositions = () => {
    const monthPositions = getPositionsForMonth(currentMonth);
    const allIds = new Set(monthPositions.map(pos => pos.id));
    setSelectedPositions(allIds);
  };

  const clearAllSelections = () => {
    setSelectedPositions(new Set());
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

  const getCategoryColor = (category: RecommendedStrategy['category']) => {
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

  const getRiskLevelColor = (riskLevel: RecommendedStrategy['riskLevel']) => {
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

  const monthPositions = getPositionsForMonth(currentMonth);
  const monthTotal = monthPositions.reduce((sum, pos) => sum + pos.currentValue * pos.quantity * 100, 0);
  const monthProfitLoss = monthPositions.reduce((sum, pos) => sum + pos.profitLoss, 0);

  const currentMonthIndex = availableMonths.findIndex(month => 
    format(month, 'yyyy-MM') === format(currentMonth, 'yyyy-MM')
  );

  if (isLoading) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md p-8`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${themes[theme].text}`}>正在加载期权组合管理...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Monthly Portfolio View */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-blue-500" />
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                期权持仓月度视图
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateMonth('prev')}
                disabled={currentMonthIndex <= 0}
                className={`p-2 rounded-md ${themes[theme].secondary} ${
                  currentMonthIndex <= 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className={`px-4 py-2 font-semibold ${themes[theme].text}`}>
                {format(currentMonth, 'yyyy年MM月')}
              </span>
              <button
                onClick={() => navigateMonth('next')}
                disabled={currentMonthIndex >= availableMonths.length - 1}
                className={`p-2 rounded-md ${themes[theme].secondary} ${
                  currentMonthIndex >= availableMonths.length - 1 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {availableMonths.length > 0 && (
            <div className="mt-4">
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                可用月份: {availableMonths.map(month => format(month, 'yyyy年MM月')).join(', ')}
              </p>
            </div>
          )}
        </div>

        <div className="p-6">
          {/* Month Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className={`${themes[theme].background} rounded-lg p-4 text-center`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>本月持仓数量</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {monthPositions.length}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4 text-center`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>本月持仓价值</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(monthTotal, currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4 text-center`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>本月盈亏</h3>
              <p className={`text-2xl font-bold mt-1 ${monthProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {monthProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(monthProfitLoss), currencyConfig)}
              </p>
            </div>
          </div>

          {/* Position Selection Controls */}
          {monthPositions.length > 0 && (
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${themes[theme].text}`}>
                    选择期权组成策略:
                  </span>
                  <span className={`text-sm ${themes[theme].text} opacity-75`}>
                    已选择 {selectedPositions.size} 个持仓
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllPositions}
                    className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                  >
                    全选
                  </button>
                  <button
                    onClick={clearAllSelections}
                    className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                  >
                    清空
                  </button>
                  {selectedPositions.size > 0 && (
                    <button
                      onClick={() => setShowAddStrategy(true)}
                      className={`px-3 py-1 rounded-md text-sm ${themes[theme].primary}`}
                    >
                      创建策略
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Monthly Positions */}
          {monthPositions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${themes[theme].background}`}>
                  <tr>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                      选择
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                      合约
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                      策略
                    </th>
                    <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                      到期日
                    </th>
                    <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                      数量
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
                  {monthPositions.map((position) => {
                    const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const isSelected = selectedPositions.has(position.id);
                    
                    return (
                      <tr 
                        key={position.id} 
                        className={`${themes[theme].cardHover} ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <td className="px-4 py-4">
                          <button
                            onClick={() => togglePositionSelection(position.id)}
                            className={`p-1 rounded ${themes[theme].secondary}`}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-blue-600" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        </td>
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
                          <span className={`text-sm ${themes[theme].text}`}>
                            {position.strategy}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div>
                            <div className={`text-sm ${themes[theme].text}`}>
                              {format(new Date(position.expiry), 'MM-dd')}
                            </div>
                            <div className={`text-xs ${
                              daysToExpiry <= 7 ? 'text-red-600' : 
                              daysToExpiry <= 30 ? 'text-yellow-600' : 'text-green-600'
                            }`}>
                              {daysToExpiry > 0 ? `${daysToExpiry}天` : '已到期'}
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                          {position.quantity}
                        </td>
                        <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                          {formatCurrency(position.currentValue * position.quantity * 100, currencyConfig)}
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
          ) : (
            <div className="text-center py-12">
              <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>
                {format(currentMonth, 'yyyy年MM月')}无期权持仓
              </p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                {availableMonths.length > 0 ? '选择其他月份查看持仓情况' : '您还没有任何期权持仓'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Strategies Management */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Target className="w-6 h-6 text-purple-500" />
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                自定义策略组合
              </h2>
            </div>
            <button
              onClick={() => setShowAddStrategy(!showAddStrategy)}
              disabled={selectedPositions.size === 0}
              className={`inline-flex items-center px-4 py-2 rounded-md ${
                selectedPositions.size > 0 ? themes[theme].primary : themes[theme].secondary + ' opacity-50 cursor-not-allowed'
              }`}
            >
              <Plus className="w-4 h-4 mr-2" />
              创建策略 {selectedPositions.size > 0 && `(${selectedPositions.size})`}
            </button>
          </div>
        </div>

        {/* Add Strategy Form */}
        {showAddStrategy && (
          <div className="p-6 border-b border-gray-200">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
                创建新策略
              </h3>
              
              {/* Selected Positions Preview */}
              <div className="mb-4">
                <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>
                  已选择的期权持仓 ({selectedPositions.size} 个):
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {positions
                    .filter(pos => selectedPositions.has(pos.id))
                    .map(position => (
                      <div key={position.id} className={`${themes[theme].card} rounded p-2 flex justify-between items-center text-sm`}>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(position.type)}
                          <span className={themes[theme].text}>
                            {position.symbol} {position.strike} {position.type.toUpperCase()} x{position.quantity}
                          </span>
                        </div>
                        <span className={`${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    策略名称 *
                  </label>
                  <input
                    type="text"
                    value={newStrategyName}
                    onChange={(e) => setNewStrategyName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="输入策略名称"
                    disabled={isSavingStrategy}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    策略描述
                  </label>
                  <textarea
                    value={newStrategyDescription}
                    onChange={(e) => setNewStrategyDescription(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    rows={3}
                    placeholder="描述您的策略思路和目标"
                    disabled={isSavingStrategy}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAddStrategy(false);
                      setNewStrategyName('');
                      setNewStrategyDescription('');
                    }}
                    disabled={isSavingStrategy}
                    className={`px-4 py-2 rounded-md ${themes[theme].secondary} ${
                      isSavingStrategy ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreateCustomStrategy}
                    disabled={isSavingStrategy || !newStrategyName.trim()}
                    className={`px-4 py-2 rounded-md ${themes[theme].primary} ${
                      isSavingStrategy || !newStrategyName.trim() ? 'opacity-50 cursor-not-allowed' : ''
                    } inline-flex items-center`}
                  >
                    {isSavingStrategy ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        保存中...
                      </>
                    ) : (
                      '创建策略'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custom Strategies List */}
        <div className="p-6">
          {customStrategies.length > 0 ? (
            <div className="space-y-4">
              {customStrategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {editingStrategy === strategy.id ? (
                          <input
                            type="text"
                            value={strategy.name}
                            onChange={(e) => {
                              setCustomStrategies(prev => 
                                prev.map(s => s.id === strategy.id ? { ...s, name: e.target.value } : s)
                              );
                            }}
                            className={`text-lg font-semibold bg-transparent border-b-2 border-blue-500 ${themes[theme].text} focus:outline-none`}
                          />
                        ) : (
                          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                            {strategy.name}
                          </h3>
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100`}>
                          自定义
                        </span>
                      </div>
                      {editingStrategy === strategy.id ? (
                        <textarea
                          value={strategy.description}
                          onChange={(e) => {
                            setCustomStrategies(prev => 
                              prev.map(s => s.id === strategy.id ? { ...s, description: e.target.value } : s)
                            );
                          }}
                          className={`mt-2 w-full px-2 py-1 rounded border ${themes[theme].input} ${themes[theme].text}`}
                          rows={2}
                        />
                      ) : (
                        <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                          {strategy.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {editingStrategy === strategy.id ? (
                        <>
                          <button
                            onClick={() => {
                              setEditingStrategy(null);
                              toast.success('策略已更新');
                            }}
                            className={`p-2 rounded-md ${themes[theme].primary}`}
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingStrategy(null)}
                            className={`p-2 rounded-md ${themes[theme].secondary}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingStrategy(strategy.id)}
                            className={`p-2 rounded-md ${themes[theme].secondary}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomStrategy(strategy.id)}
                            className={`p-2 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="text-sm">
                      <p className={`${themes[theme].text} opacity-75`}>
                        创建时间: {format(new Date(strategy.createdAt), 'yyyy-MM-dd HH:mm')}
                      </p>
                      <p className={`${themes[theme].text} opacity-75`}>
                        持仓数量: {strategy.positions.length} 个
                      </p>
                    </div>
                    
                    {/* Strategy Positions */}
                    <div>
                      <h5 className={`text-sm font-medium ${themes[theme].text} mb-2`}>策略持仓:</h5>
                      <div className="space-y-1">
                        {strategy.positions.map(position => (
                          <div key={position.id} className={`${themes[theme].card} rounded p-2 flex justify-between items-center text-sm`}>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(position.type)}
                              <span className={themes[theme].text}>
                                {position.symbol} {position.strike} {position.type.toUpperCase()} x{position.quantity}
                              </span>
                            </div>
                            <span className={`${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Target className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>暂无自定义策略</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                在月度视图中选择期权持仓，然后点击"创建策略"开始构建您的期权组合
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recommended Strategies */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Lightbulb className="w-6 h-6 text-yellow-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              推荐策略组合
            </h2>
          </div>
          <p className={`text-sm ${themes[theme].text} opacity-75 mt-2`}>
            基于您当前的持仓和市场条件生成的策略建议
          </p>
        </div>

        <div className="p-6">
          <div className="grid gap-6">
            {recommendedStrategies.map((strategy) => (
              <div
                key={strategy.id}
                className={`${themes[theme].background} rounded-lg p-6 border ${themes[theme].border}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                        {strategy.name}
                      </h3>
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
                    <p className={`text-sm ${themes[theme].text} opacity-75 mb-3`}>
                      {strategy.description}
                    </p>
                    <p className={`text-sm ${themes[theme].text} mb-4`}>
                      {strategy.reasoning}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyRecommendedStrategy(strategy)}
                    className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].primary}`}
                  >
                    {copiedStrategy === strategy.id ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        已添加
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        添加策略
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className={`${themes[theme].card} rounded-lg p-3 text-center`}>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>预期收益</p>
                    <p className={`text-lg font-semibold text-green-600`}>
                      +{strategy.expectedReturn.toFixed(1)}%
                    </p>
                  </div>
                  <div className={`${themes[theme].card} rounded-lg p-3 text-center`}>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>最大风险</p>
                    <p className={`text-lg font-semibold text-red-600`}>
                      {formatCurrency(strategy.maxRisk, currencyConfig)}
                    </p>
                  </div>
                  <div className={`${themes[theme].card} rounded-lg p-3 text-center`}>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>持仓数量</p>
                    <p className={`text-lg font-semibold ${themes[theme].text}`}>
                      {strategy.suggestedPositions.length}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className={`text-sm font-medium ${themes[theme].text} mb-3`}>建议持仓:</h4>
                  <div className="space-y-2">
                    {strategy.suggestedPositions.map((position, index) => (
                      <div
                        key={index}
                        className={`${themes[theme].card} rounded-lg p-3 flex justify-between items-center`}
                      >
                        <div className="flex items-center gap-3">
                          {getTypeIcon(position.type)}
                          <div>
                            <span className={`text-sm font-medium ${themes[theme].text}`}>
                              {position.action === 'buy' ? '买入' : '卖出'} {position.quantity} 手 
                              {position.symbol} {position.strike} {position.type.toUpperCase()}
                            </span>
                            <div className={`text-xs ${themes[theme].text} opacity-75`}>
                              到期: {format(new Date(position.expiry), 'yyyy-MM-dd')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${themes[theme].text}`}>
                            {formatCurrency(position.estimatedPremium, currencyConfig)}
                          </p>
                          <p className={`text-xs ${themes[theme].text} opacity-75`}>
                            预估权利金
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}