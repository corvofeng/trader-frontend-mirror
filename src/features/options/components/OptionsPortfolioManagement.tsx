import React, { useState, useEffect } from 'react';
import { Calendar, TrendingUp, TrendingDown, Activity, Shield, Target, BarChart2, Layers, ChevronDown, ChevronUp, Edit2, Save, X, Plus } from 'lucide-react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Check,
  TrendingDown,
  Activity,
  Trash2,
  Edit2
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService } from '../../../lib/services';
import type { CustomOptionsStrategy, OptionsPosition, OptionStrategyLeg } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface OptionsPortfolioManagementProps {
  theme: Theme;
}

interface PositionSelection {
  position: OptionsPosition;
  isSelected: boolean;
  selectedQuantity: number;
}

  const [editingStrategy, setEditingStrategy] = useState<string | null>(null);
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    strategy_name: string;
    strategy_type: string;
    description: string;
    expiry: string;
  }>({
    strategy_name: '',
    strategy_type: '',
    description: '',
    expiry: ''
  });
  const [positionEditForm, setPositionEditForm] = useState<{
    leg_quantity: number;
    cost_price: number;
  }>({
    leg_quantity: 0,
    cost_price: 0
  });
const DEMO_USER_ID = 'mock-user-id';

// 预设策略模板
const PRESET_STRATEGIES = [
  {
    id: 'bull_call_spread',
    name: '牛市看涨价差',
    description: '买入低行权价看涨期权，卖出高行权价看涨期权',
    category: 'bullish' as const,
    minPositions: 2,
    maxPositions: 2,
    requiredTypes: ['call', 'call'],
    requiredActions: ['buy', 'sell']
  },
  {
    id: 'bear_put_spread',
    name: '熊市看跌价差',
    description: '买入高行权价看跌期权，卖出低行权价看跌期权',
    category: 'bearish' as const,
    minPositions: 2,
    maxPositions: 2,
    requiredTypes: ['put', 'put'],
    requiredActions: ['buy', 'sell']
  },
  {
    id: 'long_straddle',
    name: '买入跨式',
    description: '同时买入相同行权价的看涨和看跌期权',
    category: 'volatility' as const,
    minPositions: 2,
    maxPositions: 2,
    requiredTypes: ['call', 'put'],
    requiredActions: ['buy', 'buy']
  },
  {
    id: 'short_straddle',
    name: '卖出跨式',
    description: '同时卖出相同行权价的看涨和看跌期权',
    category: 'volatility' as const,
    minPositions: 2,
    maxPositions: 2,
    requiredTypes: ['call', 'put'],
    requiredActions: ['sell', 'sell']
  },
  {
    id: 'long_strangle',
    name: '买入宽跨式',
    description: '买入不同行权价的看涨和看跌期权',
    category: 'volatility' as const,
    minPositions: 2,
    maxPositions: 2,
    requiredTypes: ['call', 'put'],
    requiredActions: ['buy', 'buy']
  },
  {
    id: 'iron_condor',
    name: '铁鹰策略',
    description: '卖出跨式组合+买入保护性期权',
    category: 'neutral' as const,
    minPositions: 4,
    maxPositions: 4,
    requiredTypes: ['put', 'put', 'call', 'call'],
    requiredActions: ['buy', 'sell', 'sell', 'buy']
  },
  {
    id: 'custom',
    name: '自定义策略',
    description: '创建您自己的期权组合策略',
    category: 'neutral' as const,
    minPositions: 1,
    maxPositions: 10,
    requiredTypes: [],
    requiredActions: []
  }
];

// 转换期权持仓为策略腿部结构
const convertPositionToStrategyLeg = (position: OptionsPosition): OptionStrategyLeg => {
  const getContractTypeZh = (type: string) => {
    return type === 'call' ? '认购' : '认沽';
  };

  const getPositionTypeZh = (positionType: string, optionType: string) => {
    const isLong = positionType === 'buy';
    const isCall = optionType === 'call';
    
    if (isLong && isCall) return '权利';
    if (isLong && !isCall) return '权利';
    if (!isLong && isCall) return '义务';
    if (!isLong && !isCall) return '义务';
    return '未知';
  };

  return {
    contract_code: position.contract_code || '',
    contract_name: position.contract_name || '',
    contract_type: position.contract_type || getContractTypeZh(position.type),
    contract_type_zh: position.contract_type_zh || '',
    contract_strike_price: position.contract_strike_price || position.strike,
    position_type: position.position_type,
    position_type_zh: position.position_type_zh || getPositionTypeZh(position.position_type, position.type),
    leg_quantity: position.leg_quantity || position.selectedQuantity || position.quantity,
    cost_price: position.premium
  };
};

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

export default function OptionsPortfolioManagement({ theme }: OptionsPortfolioManagementProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [customStrategies, setCustomStrategies] = useState<CustomOptionsStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<string>('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Map<string, PositionSelection>>(new Map());
  const [showCreateStrategy, setShowCreateStrategy] = useState(false);
  const [strategyName, setStrategyName] = useState('');
  const [strategyDescription, setStrategyDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [sortBy, setSortBy] = useState<'expiry' | 'rights_obligations' | 'strike' | 'symbol'>('expiry');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedPresetStrategy, setSelectedPresetStrategy] = useState<string>('custom');
  const { currencyConfig } = useCurrency();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const { data: { user } } = await authService.getUser();
        
        const userId = user?.id || DEMO_USER_ID;
        const { data, error } = await optionsService.getOptionsPortfolio(userId);
        
        if (error) throw error;
        if (data) {
          setPortfolioData(data);
          
          // 计算可用月份（仅包含有持仓的月份）
          const months = new Set<string>();
          data.expiryGroups.forEach(group => {
            if (group.positions.length > 0) {
              const monthKey = format(new Date(group.expiry), 'yyyy-MM');
              months.add(monthKey);
            }
          });
          
          const sortedMonths = Array.from(months).sort();
          setAvailableMonths(sortedMonths);
          
          // 设置当前月份为最近的有持仓的月份
          if (sortedMonths.length > 0) {
            setCurrentMonth(sortedMonths[0]);
  const startEditingStrategy = (strategy: CustomOptionsStrategy) => {
    setEditingStrategy(strategy.id);
    setEditForm({
      strategy_name: strategy.strategy_name || strategy.name,
      strategy_type: strategy.strategy_type || '',
      description: strategy.description,
      expiry: strategy.expiry || ''
    });
  };

  const startEditingPosition = (position: OptionsPosition) => {
    setEditingPosition(position.id);
    setPositionEditForm({
      leg_quantity: position.leg_quantity || position.quantity,
      cost_price: position.cost_price || position.premium
    });
  };

  const saveStrategyEdit = async (strategyId: string) => {
    try {
      const strategy = customStrategies.find(s => s.id === strategyId);
      if (!strategy) return;

      const updatedStrategy = {
        ...strategy,
        strategy_name: editForm.strategy_name,
        strategy_type: editForm.strategy_type,
        description: editForm.description,
        expiry: editForm.expiry,
        name: editForm.strategy_name, // 保持兼容性
        updatedAt: new Date().toISOString()
      };

      // 这里应该调用API更新策略
      // const { error } = await optionsService.updateCustomStrategy(updatedStrategy);
      // if (error) throw error;

      setCustomStrategies(prev => 
        prev.map(s => s.id === strategyId ? updatedStrategy : s)
      );
      setEditingStrategy(null);
      toast.success('策略信息已更新');
    } catch (error) {
      console.error('Error updating strategy:', error);
      toast.error('更新策略失败');
    }
  };

  const savePositionEdit = async (strategyId: string, positionId: string) => {
    try {
      const strategy = customStrategies.find(s => s.id === strategyId);
      if (!strategy) return;

      const updatedPositions = strategy.positions.map(pos => 
        pos.id === positionId 
          ? {
              ...pos,
              leg_quantity: positionEditForm.leg_quantity,
              cost_price: positionEditForm.cost_price,
              quantity: positionEditForm.leg_quantity, // 保持兼容性
              premium: positionEditForm.cost_price // 保持兼容性
            }
          : pos
      );

      const updatedStrategy = {
        ...strategy,
        positions: updatedPositions,
        updatedAt: new Date().toISOString()
      };

      // 这里应该调用API更新策略
      // const { error } = await optionsService.updateCustomStrategy(updatedStrategy);
      // if (error) throw error;

      setCustomStrategies(prev => 
        prev.map(s => s.id === strategyId ? updatedStrategy : s)
      );
      setEditingPosition(null);
      toast.success('腿部信息已更新');
    } catch (error) {
      console.error('Error updating position:', error);
      toast.error('更新腿部信息失败');
    }
  };

  const cancelEdit = () => {
    setEditingStrategy(null);
    setEditingPosition(null);
  };

          }
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

  const sortPositions = (positions: OptionsPosition[]) => {
    return [...positions].sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1;
      
      switch (sortBy) {
        case 'expiry':
          return multiplier * (new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
        case 'rights_obligations':
          const aType = `${a.position_type}_${a.type}`;
          const bType = `${b.position_type}_${b.type}`;
          return multiplier * aType.localeCompare(bType);
        case 'strike':
          return multiplier * (a.strike - b.strike);
        case 'symbol':
          return multiplier * a.symbol.localeCompare(b.symbol);
        default:
          return 0;
      }
    });
  };

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  const getPresetStrategyInfo = (strategyId: string) => {
    return PRESET_STRATEGIES.find(s => s.id === strategyId) || PRESET_STRATEGIES.find(s => s.id === 'custom')!;
  };

  const validatePresetStrategy = (selectedPositions: PositionSelection[], presetStrategy: any) => {
    if (presetStrategy.id === 'custom') return { valid: true, message: '' };
    
    const positions = selectedPositions.map(s => s.position);
    
    // 检查数量
    if (positions.length < presetStrategy.minPositions || positions.length > presetStrategy.maxPositions) {
      return { 
        valid: false, 
        message: `${presetStrategy.name}需要${presetStrategy.minPositions}${presetStrategy.minPositions !== presetStrategy.maxPositions ? `-${presetStrategy.maxPositions}` : ''}个期权持仓` 
      };
    }
    
    // 检查类型和操作（如果有要求）
    if (presetStrategy.requiredTypes.length > 0) {
      const positionTypes = positions.map(p => p.type);
      const positionActions = positions.map(p => p.position_type);
      
      // 简单验证：检查是否包含所需的类型
      const hasRequiredTypes = presetStrategy.requiredTypes.every((type: string) => 
        positionTypes.includes(type)
      );
      
      if (!hasRequiredTypes) {
        return { 
          valid: false, 
          message: `${presetStrategy.name}需要特定的期权类型组合` 
        };
      }
    }
    
    return { valid: true, message: '' };
  };

  const getCurrentMonthPositions = () => {
    if (!portfolioData || !currentMonth) return [];
    
    const positions = portfolioData.expiryGroups
      .filter(group => {
        const groupMonth = format(new Date(group.expiry), 'yyyy-MM');
        return groupMonth === currentMonth;
      })
      .flatMap(group => group.positions);
    
    return sortPositions(positions);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const currentIndex = availableMonths.indexOf(currentMonth);
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentMonth(availableMonths[currentIndex - 1]);
      setSelectedPositions(new Map()); // 清空选择
    } else if (direction === 'next' && currentIndex < availableMonths.length - 1) {
      setCurrentMonth(availableMonths[currentIndex + 1]);
      setSelectedPositions(new Map()); // 清空选择
    }
  };

  const handlePositionSelect = (position: OptionsPosition, isSelected: boolean) => {
    const newSelections = new Map(selectedPositions);
    
    if (isSelected) {
      newSelections.set(position.id, {
        position,
        isSelected: true,
        selectedQuantity: 1 // 默认选择1个合约
      });
    } else {
      newSelections.delete(position.id);
    }
    
    setSelectedPositions(newSelections);
  };

  const handleQuantityChange = (positionId: string, quantity: number) => {
    const selection = selectedPositions.get(positionId);
    if (selection) {
      const maxQuantity = selection.position.quantity;
      const validQuantity = Math.max(1, Math.min(quantity, maxQuantity));
      
      setSelectedPositions(new Map(selectedPositions.set(positionId, {
        ...selection,
        selectedQuantity: validQuantity
      })));
    }
  };

  const handleSelectAll = () => {
    const positions = getCurrentMonthPositions();
    const newSelections = new Map<string, PositionSelection>();
    
    positions.forEach(position => {
      newSelections.set(position.id, {
        position,
        isSelected: true,
        selectedQuantity: 1
      });
    });
    
    setSelectedPositions(newSelections);
  };

  const handleClearAll = () => {
    setSelectedPositions(new Map());
  };

  const getSelectedPositionsArray = () => {
    return Array.from(selectedPositions.values()).filter(selection => selection.isSelected);
  };

  const SortIcon = ({ field }: { field: typeof sortBy }) => {
    if (sortBy !== field) {
      return <span className="text-gray-400">↕</span>;
    }
    return sortDirection === 'asc' ? <span className="text-blue-500">↑</span> : <span className="text-blue-500">↓</span>;
  };

  const calculateStrategyMetrics = () => {
    const selections = getSelectedPositionsArray();
    const totalCost = selections.reduce((sum, selection) => {
      return sum + (selection.position.premium * selection.selectedQuantity * 100);
    }, 0);
    
    const currentValue = selections.reduce((sum, selection) => {
      return sum + (selection.position.currentValue * selection.selectedQuantity * 100);
    }, 0);
    
    const profitLoss = currentValue - totalCost;
    
    return { totalCost, currentValue, profitLoss };
  };

  const handleCreateStrategy = async () => {
    if (!strategyName.trim()) {
      toast.error('请输入策略名称');
      return;
    }
    
    const selections = getSelectedPositionsArray();
    if (selections.length === 0) {
      toast.error('请至少选择一个期权持仓');
      return;
    }
    
    // 验证预设策略
    const presetStrategy = getPresetStrategyInfo(selectedPresetStrategy);
    const validation = validatePresetStrategy(selections, presetStrategy);
    
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await authService.getUser();
      const userId = user?.id || DEMO_USER_ID;

      // 创建策略的期权持仓数据
      const strategyPositions = selections.map(selection => ({
        ...selection.position,
        quantity: selection.selectedQuantity, // 使用选择的数量
        selectedQuantity: selection.selectedQuantity,
        profitLoss: (selection.position.currentValue - selection.position.premium) * selection.selectedQuantity * 100,
        profitLossPercentage: selection.position.premium > 0 
          ? (((selection.position.currentValue - selection.position.premium) / selection.position.premium) * 100)
          : 0
      }));

      // 准备传递给后端的策略数据，包含策略类型信息
      const strategyData = {
        userId,
        name: strategyName || presetStrategy.name,
        description: strategyDescription || presetStrategy.description,
        positions: strategyPositions,
        // 新增：策略类型相关信息
        strategyType: selectedPresetStrategy,
        strategyCategory: presetStrategy.category,
        riskLevel: getRiskLevel(presetStrategy.category),
        isPresetStrategy: selectedPresetStrategy !== 'custom',
        presetStrategyInfo: selectedPresetStrategy !== 'custom' ? {
          id: presetStrategy.id,
          name: presetStrategy.name,
          description: presetStrategy.description,
          category: presetStrategy.category,
          minPositions: presetStrategy.minPositions,
          maxPositions: presetStrategy.maxPositions,
          requiredTypes: presetStrategy.requiredTypes,
          requiredActions: presetStrategy.requiredActions
        } : null
      };

      const { data, error } = await optionsService.saveCustomStrategy(strategyData);

      if (error) throw error;
      if (data) {
        setCustomStrategies(prev => [data, ...prev]);
        toast.success('策略创建成功');
        
        // 重置表单
        setStrategyName('');
        setStrategyDescription('');
        setSelectedPresetStrategy('custom');
        setSelectedPositions(new Map());
        setShowCreateStrategy(false);
      }
    } catch (error) {
      console.error('Error creating strategy:', error);
      toast.error('创建策略失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 根据策略类别确定风险等级
  const getRiskLevel = (category: string): 'low' | 'medium' | 'high' => {
    switch (category) {
      case 'bullish':
      case 'bearish':
        return 'medium';
      case 'neutral':
        return 'low';
      case 'volatility':
        return 'high';
      default:
        return 'medium';
    }
  };

  const handleDeleteStrategy = async (strategyId: string) => {
    if (!confirm('确定要删除这个策略吗？')) return;
    
    try {
      const { error } = await optionsService.deleteCustomStrategy(strategyId);
      if (error) throw error;
      
      setCustomStrategies(prev => prev.filter(s => s.id !== strategyId));
      toast.success('策略删除成功');
    } catch (error) {
      console.error('Error deleting strategy:', error);
      toast.error('删除策略失败');
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
        return <Shield className="w-4 h-4 text-gray-500" />;
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
          <p className={`${themes[theme].text}`}>正在加载投资组合管理...</p>
        </div>
      </div>
    );
  }

  if (!portfolioData || availableMonths.length === 0) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md p-8`}>
        <div className="text-center">
          <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
          <p className={`text-lg font-medium ${themes[theme].text}`}>暂无期权持仓</p>
          <p className={`text-sm ${themes[theme].text} opacity-75`}>
            您还没有任何期权持仓可以管理
          </p>
        </div>
      </div>
    );
  }

  const currentMonthPositions = getCurrentMonthPositions();
  const selectedArray = getSelectedPositionsArray();
  const strategyMetrics = calculateStrategyMetrics();

  return (
    <div className="space-y-6">
      {/* 月度导航 */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-blue-500" />
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                期权投资组合管理
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateMonth('prev')}
                  disabled={availableMonths.indexOf(currentMonth) === 0}
                  className={`p-2 rounded-md ${themes[theme].secondary} ${
                    availableMonths.indexOf(currentMonth) === 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="text-center min-w-[120px]">
                  <div className={`text-lg font-semibold ${themes[theme].text}`}>
                    {currentMonth ? format(new Date(currentMonth + '-01'), 'yyyy年MM月') : ''}
                  </div>
                  <div className={`text-xs ${themes[theme].text} opacity-60`}>
                    {currentMonthPositions.length} 个持仓
                  </div>
                </div>
                
                <button
                  onClick={() => navigateMonth('next')}
                  disabled={availableMonths.indexOf(currentMonth) === availableMonths.length - 1}
                  className={`p-2 rounded-md ${themes[theme].secondary} ${
                    availableMonths.indexOf(currentMonth) === availableMonths.length - 1 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              
              <div className={`text-sm ${themes[theme].text} opacity-75`}>
                可用月份: {availableMonths.map(month => format(new Date(month + '-01'), 'MM月')).join(', ')}
              </div>
            </div>
          </div>
        </div>

        {/* 月度持仓表格 */}
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
              {currentMonth ? format(new Date(currentMonth + '-01'), 'yyyy年MM月') : ''} 持仓
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
              >
                全选
              </button>
              <button
                onClick={handleClearAll}
                className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
              >
                清空
              </button>
              {selectedArray.length > 0 && (
                <button
                  onClick={() => setShowCreateStrategy(true)}
                  className={`px-3 py-1 rounded-md text-sm ${themes[theme].primary}`}
                >
                  创建策略 ({selectedArray.length})
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${themes[theme].background}`}>
                <tr>
                  <th className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    选择
                  </th>
                  <th 
                    className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleSort('symbol')}
                  >
                    <div className="flex items-center gap-1">
                      <span>合约</span>
                      <SortIcon field="symbol" />
                    </div>
                  </th>
                  <th 
                    className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleSort('rights_obligations')}
                  >
                    <div className="flex items-center gap-1">
                      <span>权利义务</span>
                      <SortIcon field="rights_obligations" />
                    </div>
                  </th>
                  <th 
                    className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleSort('expiry')}
                  >
                    <div className="flex items-center gap-1">
                      <span>到期日</span>
                      <SortIcon field="expiry" />
                    </div>
                  </th>
                  <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    持仓数量
                  </th>
                  <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    选择数量
                  </th>
                  <th 
                    className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider cursor-pointer`}
                    onClick={() => handleSort('strike')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>权利金</span>
                      <SortIcon field="strike" />
                    </div>
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
                {currentMonthPositions.map((position) => {
                  const selection = selectedPositions.get(position.id);
                  const isSelected = selection?.isSelected || false;
                  const selectedQuantity = selection?.selectedQuantity || 1;
                  const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  
                  return (
                    <tr 
                      key={position.id} 
                      className={`${themes[theme].cardHover} ${
                        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handlePositionSelect(position, e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(position.type)}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`text-sm font-medium ${themes[theme].text}`}>
                                {position.symbol} {position.strike} {position.type.toUpperCase()}
                              </div>
                            </div>
                            <div className={`text-xs ${themes[theme].text} opacity-75`}>
                              {position.strategy}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          const positionInfo = getPositionTypeInfo(position.position_type, position.type);
                          return (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                {positionInfo.icon}
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                  {positionInfo.label}
                                </span>
                              </div>
                              <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                {positionInfo.description}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <div className={`text-sm ${themes[theme].text}`}>
                            {format(new Date(position.expiry), 'MM-dd')}
                          </div>
                          <div className={`text-xs px-1 py-0.5 rounded ${getDaysToExpiryColor(daysToExpiry)}`}>
                            {daysToExpiry > 0 ? `${daysToExpiry}天` : '已到期'}
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                        {position.quantity}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {isSelected ? (
                          <div className="flex flex-col items-end gap-1">
                            <input
                              type="number"
                              min="1"
                              max={position.quantity}
                              value={selectedQuantity}
                              onChange={(e) => handleQuantityChange(position.id, parseInt(e.target.value) || 1)}
                              className={`w-16 px-2 py-1 rounded text-sm text-center ${themes[theme].input} ${themes[theme].text}`}
                            />
                            <div className={`text-xs ${themes[theme].text} opacity-60`}>
                              成本: {formatCurrency(position.premium * selectedQuantity * 100, currencyConfig)}
                            </div>
                          </div>
                        ) : (
                          <span className={`text-sm ${themes[theme].text} opacity-50`}>-</span>
                        )}
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

          {currentMonthPositions.length === 0 && (
            <div className="text-center py-8">
              <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>
                {currentMonth ? format(new Date(currentMonth + '-01'), 'yyyy年MM月') : ''} 暂无持仓
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 策略创建面板 */}
      {showCreateStrategy && selectedArray.length > 0 && (
        <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                创建自定义策略
                <span className={`text-sm font-normal ${themes[theme].text} opacity-60 ml-2`}>
                  (共 {selectedArray.length} 个)
                </span>
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className={`text-sm ${themes[theme].text}`}>排序:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                  >
                    <option value="expiry">到期日</option>
                    <option value="rights_obligations">权利义务</option>
                    <option value="strike">行权价</option>
                    <option value="symbol">标的</option>
                  </select>
                  <button
                    onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className={`px-2 py-1 rounded text-sm ${themes[theme].secondary}`}
                  >
                    <SortIcon field={sortBy} />
                  </button>
                </div>
                <button
                  onClick={() => setShowCreateStrategy(false)}
                  className={`p-2 rounded-md ${themes[theme].secondary}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* 预设策略选择 */}
            <div>
              <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                策略类型
              </label>
              <select
                value={selectedPresetStrategy}
                onChange={(e) => setSelectedPresetStrategy(e.target.value)}
                className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
              >
                {PRESET_STRATEGIES.map(strategy => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name} - {strategy.description}
                  </option>
                ))}
              </select>
              {selectedPresetStrategy !== 'custom' && (
                <div className={`mt-2 p-3 rounded-md ${themes[theme].background}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      getPresetStrategyInfo(selectedPresetStrategy).category === 'bullish' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                      getPresetStrategyInfo(selectedPresetStrategy).category === 'bearish' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                      getPresetStrategyInfo(selectedPresetStrategy).category === 'volatility' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                    }`}>
                      {getPresetStrategyInfo(selectedPresetStrategy).category === 'bullish' ? '看涨策略' :
                       getPresetStrategyInfo(selectedPresetStrategy).category === 'bearish' ? '看跌策略' :
                       getPresetStrategyInfo(selectedPresetStrategy).category === 'volatility' ? '波动率策略' : '中性策略'}
                    </span>
                    <span className={`text-sm ${themes[theme].text} opacity-75`}>
                      需要 {getPresetStrategyInfo(selectedPresetStrategy).minPositions}
                      {getPresetStrategyInfo(selectedPresetStrategy).minPositions !== getPresetStrategyInfo(selectedPresetStrategy).maxPositions 
                        ? `-${getPresetStrategyInfo(selectedPresetStrategy).maxPositions}` : ''} 个期权
                    </span>
                  </div>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    {getPresetStrategyInfo(selectedPresetStrategy).description}
                  </p>
                </div>
              )}
            </div>

            {/* 策略基本信息 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                  策略名称 *
                </label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  placeholder={selectedPresetStrategy !== 'custom' ? getPresetStrategyInfo(selectedPresetStrategy).name : '输入策略名称'}
                  className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                  策略描述
                </label>
                <input
                  type="text"
                  value={strategyDescription}
                  onChange={(e) => setStrategyDescription(e.target.value)}
                  placeholder={selectedPresetStrategy !== 'custom' ? getPresetStrategyInfo(selectedPresetStrategy).description : '输入策略描述'}
                  className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                />
              </div>
            </div>

            {/* 策略摘要 */}
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h4 className={`text-md font-semibold ${themes[theme].text} mb-3`}>策略摘要</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className={`text-lg font-bold ${themes[theme].text}`}>
                    {formatCurrency(strategyMetrics.totalCost, currencyConfig)}
                  </p>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>总成本</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold ${themes[theme].text}`}>
                    {formatCurrency(strategyMetrics.currentValue, currencyConfig)}
                  </p>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>当前价值</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold ${
                    strategyMetrics.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {strategyMetrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(strategyMetrics.profitLoss), currencyConfig)}
                  </p>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>总盈亏</p>
                </div>
              </div>
            </div>

            {/* 选择的期权预览 */}
            <div>
              <h4 className={`text-md font-semibold ${themes[theme].text} mb-3`}>
                包含的期权持仓 ({selectedArray.length})
              </h4>
              <div className="space-y-3">
                {selectedArray.map((selection) => {
                  const position = selection.position;
                  const strategyLeg = convertPositionToStrategyLeg(position);
                  const adjustedCost = position.premium * selection.selectedQuantity * 100;
                  const adjustedValue = position.currentValue * selection.selectedQuantity * 100;
                  const adjustedProfitLoss = adjustedValue - adjustedCost;
                  
                  return (
                    <div key={position.id} className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
                      <div className="space-y-3">
                        {/* 合约基本信息 */}
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(position.type)}
                            <div>
                              <div className={`text-sm font-medium ${themes[theme].text}`}>
                                {strategyLeg.contract_name}
                              </div>
                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                合约代码: {strategyLeg.contract_code}
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
                              盈亏
                            </div>
                          </div>
                        </div>
                        
                        {/* 详细信息网格 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className={`${themes[theme].text} opacity-60`}>合约类型:</span>
                            <div className={`font-medium ${themes[theme].text}`}>
                              {strategyLeg.contract_type}
                            </div>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-60`}>权利义务:</span>
                            <div className={`font-medium ${themes[theme].text}`}>
                              {strategyLeg.position_type_zh}
                            </div>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-60`}>行权价格:</span>
                            <div className={`font-medium ${themes[theme].text}`}>
                              {formatCurrency(strategyLeg.contract_strike_price, currencyConfig)}
                            </div>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-60`}>到期日:</span>
                            <div className={`font-medium ${themes[theme].text}`}>
                              {format(new Date(position.expiry), 'MM-dd')}
                            </div>
                          </div>
                        </div>
                        
                        {/* 数量和成本信息 */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className={`${themes[theme].text} opacity-60`}>腿部数量:</span>
                            <div className={`font-medium ${themes[theme].text}`}>
                              {strategyLeg.leg_quantity}
                              {strategyLeg.leg_quantity !== position.quantity && (
                                <span className="text-blue-600 ml-1">
                                  (总持仓: {position.quantity})
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-60`}>成本价格:</span>
                            <div className={`font-medium ${themes[theme].text}`}>
                              {formatCurrency(strategyLeg.cost_price, currencyConfig)}
                            </div>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-60`}>总成本:</span>
                            <div className={`font-medium ${themes[theme].text}`}>
                              {formatCurrency(adjustedCost, currencyConfig)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateStrategy(false)}
                className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
              >
                取消
              </button>
              <button
                onClick={handleCreateStrategy}
                disabled={isSaving || (!strategyName.trim() && selectedPresetStrategy === 'custom') || selectedArray.length === 0}
                className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary} ${
                  isSaving || (!strategyName.trim() && selectedPresetStrategy === 'custom') || selectedArray.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isSaving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                保存策略
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 已保存的策略 */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
            已保存的策略 ({customStrategies.length})
          </h3>
        </div>

        <div className="p-6">
          {isLoadingStrategies ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className={`${themes[theme].text}`}>正在加载策略...</p>
            </div>
          ) : customStrategies.length === 0 ? (
            <div className="text-center py-8">
              <Target className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>暂无保存的策略</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                选择期权持仓创建您的第一个自定义策略
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {customStrategies.map((strategy) => {
                // 转换策略中的期权为腿部结构
                const strategyLegs = strategy.positions.map(position => convertPositionToStrategyLeg(position));
                
                return (
                  <div key={strategy.id} className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                            {strategy.name}
                          </h4>
                          {strategy.strategyCategory && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              strategy.strategyCategory === 'bullish' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                              strategy.strategyCategory === 'bearish' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                              strategy.strategyCategory === 'volatility' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                            }`}>
                              {strategy.strategyCategory === 'bullish' ? '看涨策略' :
                               strategy.strategyCategory === 'bearish' ? '看跌策略' :
                               strategy.strategyCategory === 'volatility' ? '波动率策略' : '中性策略'}
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
                        <p className={`text-sm ${themes[theme].text} opacity-75`}>
                          {strategy.description}
                        </p>
                        <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                          创建时间: {new Date(strategy.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteStrategy(strategy.id)}
                          className={`p-2 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h5 className={`text-sm font-medium ${themes[theme].text}`}>
                        策略腿部详情 ({strategyLegs.length} 个腿部)
                      </h5>
                      <div className="space-y-2">
                        {strategyLegs.map((leg, index) => (
                          <div key={index} className={`${themes[theme].card} rounded-lg p-3 border ${themes[theme].border}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                              {/* 合约信息 */}
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  {getTypeIcon(leg.contract_type_zh as any)}
                                  <span className={`text-sm font-medium ${themes[theme].text}`}>
                                    {leg.contract_name}
                                  </span>
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                  {leg.contract_code}
                                </div>
                              </div>
                              
                              {/* 权利义务 */}
                              <div>
                                <div className={`text-xs ${themes[theme].text} opacity-60 mb-1`}>
                                  权利义务
                                </div>
                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const positionInfo = getPositionTypeInfo(leg.position_type, leg.contract_type_zh);
                                    return (
                                      <>
                                        {positionInfo.icon}
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                          {leg.position_type_zh}
                                        </span>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                              
                              {/* 数量和价格 */}
                              <div>
                                <div className={`text-xs ${themes[theme].text} opacity-60 mb-1`}>
                                  腿部数量
                                </div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {leg.leg_quantity} 手
                                </div>
                              </div>
                              
                              {/* 成本信息 */}
                              <div>
                                <div className={`text-xs ${themes[theme].text} opacity-60 mb-1`}>
                                  成本价格
                                </div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {formatCurrency(leg.cost_price, currencyConfig)}
                                </div>
                              </div>
                            </div>
                            
                            {/* 行权价格和合约类型 */}
                            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                              <div className="flex justify-between items-center text-xs">
                                <span className={`${themes[theme].text} opacity-60`}>
                                  行权价格: {formatCurrency(leg.contract_strike_price, currencyConfig)}
                                </span>
                                <span className={`${themes[theme].text} opacity-60`}>
                                  总成本: {formatCurrency(leg.cost_price * leg.leg_quantity * 100, currencyConfig)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}