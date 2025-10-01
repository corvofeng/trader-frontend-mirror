import React, { useState, useEffect } from 'react';
import { Calendar, CreditCard as Edit2, Trash2, Plus, Save, X, TrendingUp, TrendingDown, Target, DollarSign, Briefcase, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService } from '../../../lib/services';
import type { CustomOptionsStrategy, OptionsPosition } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface OptionsPortfolioManagementProps {
  theme: Theme;
}

interface EditingStrategy extends CustomOptionsStrategy {
  stockSupport?: number; // 股票支持数量
  cashSupport?: number; // 现金支持金额
  riskLimit?: number; // 风险限额
}

interface ExpiryGroup {
  expiry: string;
  daysToExpiry: number;
  strategies: EditingStrategy[];
  totalValue: number;
  totalRisk: number;
  totalCashRequired: number;
}

const DEMO_USER_ID = 'mock-user-id';

export function OptionsPortfolioManagement({ theme }: OptionsPortfolioManagementProps) {
  const [strategies, setStrategies] = useState<EditingStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingStrategy, setEditingStrategy] = useState<EditingStrategy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedExpiries, setExpandedExpiries] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'expiry' | 'strategy'>('expiry');
  const { currencyConfig } = useCurrency();

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await optionsService.getCustomStrategies(DEMO_USER_ID);
      if (error) throw error;
      if (data) {
        // 为策略添加风险管理字段
        const enhancedStrategies = data.map(strategy => ({
          ...strategy,
          stockSupport: Math.floor(Math.random() * 1000) + 100, // 模拟股票支持
          cashSupport: Math.floor(Math.random() * 50000) + 10000, // 模拟现金支持
          riskLimit: Math.floor(Math.random() * 20000) + 5000 // 模拟风险限额
        }));
        setStrategies(enhancedStrategies);
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
      toast.error('获取策略列表失败');
    } finally {
      setIsLoading(false);
    }
  };

  const groupStrategiesByExpiry = (): ExpiryGroup[] => {
    const expiryGroups = new Map<string, ExpiryGroup>();

    strategies.forEach(strategy => {
      // 获取策略中最近的到期日
      const expiries = strategy.positions.map(pos => pos.expiry);
      const nearestExpiry = expiries.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
      
      if (!nearestExpiry) return;

      const daysToExpiry = differenceInDays(new Date(nearestExpiry), new Date());
      
      if (!expiryGroups.has(nearestExpiry)) {
        expiryGroups.set(nearestExpiry, {
          expiry: nearestExpiry,
          daysToExpiry,
          strategies: [],
          totalValue: 0,
          totalRisk: 0,
          totalCashRequired: 0
        });
      }

      const group = expiryGroups.get(nearestExpiry)!;
      group.strategies.push(strategy);
      
      // 计算策略价值和风险
      const strategyValue = strategy.positions.reduce((sum, pos) => 
        sum + (pos.currentValue * (pos.selectedQuantity || pos.quantity) * 100), 0);
      const strategyRisk = strategy.riskLimit || 0;
      const cashRequired = strategy.cashSupport || 0;
      
      group.totalValue += strategyValue;
      group.totalRisk += strategyRisk;
      group.totalCashRequired += cashRequired;
    });

    return Array.from(expiryGroups.values())
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  };

  const handleEditStrategy = (strategy: EditingStrategy) => {
    setEditingStrategy({ ...strategy });
  };

  const handleSaveStrategy = async () => {
    if (!editingStrategy) return;

    try {
      setIsSaving(true);
      const { error } = await optionsService.saveCustomStrategy(editingStrategy);
      if (error) throw error;

      // 更新本地状态
      setStrategies(prev => prev.map(s => 
        s.id === editingStrategy.id ? editingStrategy : s
      ));
      
      setEditingStrategy(null);
      toast.success('策略更新成功');
    } catch (error) {
      console.error('Error saving strategy:', error);
      toast.error('保存策略失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStrategy = async (strategyId: string) => {
    if (!confirm('确定要删除这个策略吗？')) return;

    try {
      const { error } = await optionsService.deleteCustomStrategy(strategyId);
      if (error) throw error;

      setStrategies(prev => prev.filter(s => s.id !== strategyId));
      toast.success('策略删除成功');
    } catch (error) {
      console.error('Error deleting strategy:', error);
      toast.error('删除策略失败');
    }
  };

  const updateEditingStrategyPosition = (positionId: string, field: keyof OptionsPosition, value: any) => {
    if (!editingStrategy) return;

    setEditingStrategy(prev => ({
      ...prev!,
      positions: prev!.positions.map(pos => 
        pos.id === positionId ? { ...pos, [field]: value } : pos
      )
    }));
  };

  const addNewPosition = () => {
    if (!editingStrategy) return;

    const newPosition: OptionsPosition = {
      id: `pos-${Date.now()}`,
      symbol: 'SPY',
      strategy: editingStrategy.name,
      strategy_id: editingStrategy.id,
      type: 'call',
      position_type: 'buy',
      strike: 450,
      expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      quantity: 1,
      selectedQuantity: 1,
      premium: 5.0,
      currentValue: 5.0,
      profitLoss: 0,
      profitLossPercentage: 0,
      impliedVolatility: 0.2,
      delta: 0.5,
      gamma: 0.01,
      theta: -0.05,
      vega: 0.1,
      status: 'open',
      openDate: new Date().toISOString(),
      notes: '',
      contract_code: 'SPY20240315C450',
      contract_name: 'SPY 450 认购',
      contract_type: '认购',
      contract_type_zh: 'call',
      contract_strike_price: 450,
      position_type_zh: '权利',
      leg_quantity: 1,
      cost_price: 5.0
    };

    setEditingStrategy(prev => ({
      ...prev!,
      positions: [...prev!.positions, newPosition]
    }));
  };

  const removePosition = (positionId: string) => {
    if (!editingStrategy) return;

    setEditingStrategy(prev => ({
      ...prev!,
      positions: prev!.positions.filter(pos => pos.id !== positionId)
    }));
  };

  const toggleExpiryExpansion = (expiry: string) => {
    setExpandedExpiries(prev => 
      prev.includes(expiry) 
        ? prev.filter(e => e !== expiry)
        : [...prev, expiry]
    );
  };

  const getStrategyTypeIcon = (category: string) => {
    switch (category) {
      case 'bullish': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'bearish': return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'volatility': return <Target className="w-4 h-4 text-purple-500" />;
      default: return <Target className="w-4 h-4 text-gray-500" />;
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

  const calculateStrategyMetrics = (strategy: EditingStrategy) => {
    const totalCost = strategy.positions.reduce((sum, pos) => 
      sum + (pos.cost_price || pos.premium) * (pos.selectedQuantity || pos.quantity) * 100, 0);
    const currentValue = strategy.positions.reduce((sum, pos) => 
      sum + pos.currentValue * (pos.selectedQuantity || pos.quantity) * 100, 0);
    const profitLoss = currentValue - totalCost;
    const profitLossPercentage = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;

    return { totalCost, currentValue, profitLoss, profitLossPercentage };
  };

  if (isLoading) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-6`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${themes[theme].text}`}>加载策略管理...</p>
        </div>
      </div>
    );
  }

  const expiryGroups = groupBy === 'expiry' ? groupStrategiesByExpiry() : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-3">
              <Briefcase className="w-6 h-6 text-purple-500" />
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                策略投资组合管理
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as 'expiry' | 'strategy')}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="expiry">按到期日分组</option>
                <option value="strategy">按策略类型分组</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {groupBy === 'expiry' ? (
            // 按到期日分组显示
            <div className="space-y-4">
              {expiryGroups.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
                  <p className={`text-lg font-medium ${themes[theme].text}`}>暂无保存的策略</p>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    在交易计划中创建策略后，可以在这里进行管理
                  </p>
                </div>
              ) : (
                expiryGroups.map((group) => (
                  <div key={group.expiry} className={`${themes[theme].background} rounded-lg border ${themes[theme].border}`}>
                    <button
                      onClick={() => toggleExpiryExpansion(group.expiry)}
                      className={`w-full p-4 flex items-center justify-between ${themes[theme].cardHover} transition-colors rounded-lg`}
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-blue-500" />
                        <div className="text-left">
                          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                            {format(new Date(group.expiry), 'yyyy年MM月dd日')} 到期
                          </h3>
                          <p className={`text-sm ${themes[theme].text} opacity-75`}>
                            剩余 {group.daysToExpiry} 天 • {group.strategies.length} 个策略
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={`text-sm font-medium ${themes[theme].text}`}>
                            总价值: {formatCurrency(group.totalValue, currencyConfig)}
                          </p>
                          <p className={`text-xs ${themes[theme].text} opacity-75`}>
                            风险: {formatCurrency(group.totalRisk, currencyConfig)}
                          </p>
                        </div>
                        {expandedExpiries.includes(group.expiry) ? (
                          <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
                        ) : (
                          <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
                        )}
                      </div>
                    </button>

                    {expandedExpiries.includes(group.expiry) && (
                      <div className="p-4 pt-0 space-y-3">
                        {group.strategies.map((strategy) => {
                          const metrics = calculateStrategyMetrics(strategy);
                          return (
                            <div key={strategy.id} className={`${themes[theme].card} rounded-lg p-4 border ${themes[theme].border}`}>
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-start gap-3">
                                  {getStrategyTypeIcon(strategy.strategyCategory || 'neutral')}
                                  <div>
                                    <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                      {strategy.name}
                                    </h4>
                                    <p className={`text-sm ${themes[theme].text} opacity-75`}>
                                      {strategy.description}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskLevelColor(strategy.riskLevel || 'medium')}`}>
                                        {strategy.riskLevel === 'low' ? '低风险' : strategy.riskLevel === 'high' ? '高风险' : '中风险'}
                                      </span>
                                      <span className={`text-xs ${themes[theme].text} opacity-60`}>
                                        {strategy.positions.length} 个腿部
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleEditStrategy(strategy)}
                                    className={`p-2 rounded-md ${themes[theme].secondary}`}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteStrategy(strategy.id)}
                                    className={`p-2 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* 策略指标 */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>当前价值</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>
                                    {formatCurrency(metrics.currentValue, currencyConfig)}
                                  </p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>盈亏</p>
                                  <p className={`text-sm font-medium ${metrics.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {metrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.profitLoss, currencyConfig)}
                                  </p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>股票支持</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>
                                    {strategy.stockSupport || 0} 股
                                  </p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>现金支持</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>
                                    {formatCurrency(strategy.cashSupport || 0, currencyConfig)}
                                  </p>
                                </div>
                              </div>

                              {/* 风险指标 */}
                              <div className={`${themes[theme].background} rounded-lg p-3`}>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <span className={`${themes[theme].text} opacity-75`}>风险限额: </span>
                                    <span className={`font-medium ${themes[theme].text}`}>
                                      {formatCurrency(strategy.riskLimit || 0, currencyConfig)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className={`${themes[theme].text} opacity-75`}>风险利用率: </span>
                                    <span className={`font-medium ${themes[theme].text}`}>
                                      {strategy.riskLimit ? ((Math.abs(metrics.profitLoss) / strategy.riskLimit) * 100).toFixed(1) : 0}%
                                    </span>
                                  </div>
                                  <div>
                                    <span className={`${themes[theme].text} opacity-75`}>收益风险比: </span>
                                    <span className={`font-medium ${themes[theme].text}`}>
                                      {strategy.riskLimit && strategy.riskLimit > 0 ? (metrics.profitLoss / strategy.riskLimit).toFixed(2) : 'N/A'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            // 按策略类型分组显示
            <div className="space-y-4">
              {strategies.length === 0 ? (
                <div className="text-center py-12">
                  <Target className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
                  <p className={`text-lg font-medium ${themes[theme].text}`}>暂无保存的策略</p>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    在交易计划中创建策略后，可以在这里进行管理
                  </p>
                </div>
              ) : (
                strategies.map((strategy) => {
                  const metrics = calculateStrategyMetrics(strategy);
                  return (
                    <div key={strategy.id} className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3">
                          {getStrategyTypeIcon(strategy.strategyCategory || 'neutral')}
                          <div>
                            <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                              {strategy.name}
                            </h4>
                            <p className={`text-sm ${themes[theme].text} opacity-75`}>
                              {strategy.description}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskLevelColor(strategy.riskLevel || 'medium')}`}>
                                {strategy.riskLevel === 'low' ? '低风险' : strategy.riskLevel === 'high' ? '高风险' : '中风险'}
                              </span>
                              <span className={`text-xs ${themes[theme].text} opacity-60`}>
                                {strategy.positions.length} 个腿部
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditStrategy(strategy)}
                            className={`p-2 rounded-md ${themes[theme].secondary}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStrategy(strategy.id)}
                            className={`p-2 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* 策略指标 */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className={`text-xs ${themes[theme].text} opacity-75`}>当前价值</p>
                          <p className={`text-sm font-medium ${themes[theme].text}`}>
                            {formatCurrency(metrics.currentValue, currencyConfig)}
                          </p>
                        </div>
                        <div>
                          <p className={`text-xs ${themes[theme].text} opacity-75`}>盈亏</p>
                          <p className={`text-sm font-medium ${metrics.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {metrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.profitLoss, currencyConfig)}
                          </p>
                        </div>
                        <div>
                          <p className={`text-xs ${themes[theme].text} opacity-75`}>股票支持</p>
                          <p className={`text-sm font-medium ${themes[theme].text}`}>
                            {strategy.stockSupport || 0} 股
                          </p>
                        </div>
                        <div>
                          <p className={`text-xs ${themes[theme].text} opacity-75`}>现金支持</p>
                          <p className={`text-sm font-medium ${themes[theme].text}`}>
                            {formatCurrency(strategy.cashSupport || 0, currencyConfig)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* 编辑策略模态框 */}
      {editingStrategy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themes[theme].card} rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto`}>
            <div className="sticky top-0 bg-inherit border-b border-gray-200 p-6 flex justify-between items-center">
              <h3 className={`text-xl font-bold ${themes[theme].text}`}>
                编辑策略: {editingStrategy.name}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveStrategy}
                  disabled={isSaving}
                  className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary} ${
                    isSaving ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isSaving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  保存
                </button>
                <button
                  onClick={() => setEditingStrategy(null)}
                  className={`p-2 rounded-md ${themes[theme].secondary}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息编辑 */}
              <div className={`${themes[theme].background} rounded-lg p-4`}>
                <h4 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>基本信息</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                      策略名称
                    </label>
                    <input
                      type="text"
                      value={editingStrategy.name}
                      onChange={(e) => setEditingStrategy(prev => ({ ...prev!, name: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                      策略分类
                    </label>
                    <select
                      value={editingStrategy.strategyCategory || 'neutral'}
                      onChange={(e) => setEditingStrategy(prev => ({ 
                        ...prev!, 
                        strategyCategory: e.target.value as 'bullish' | 'bearish' | 'neutral' | 'volatility'
                      }))}
                      className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    >
                      <option value="bullish">看涨</option>
                      <option value="bearish">看跌</option>
                      <option value="neutral">中性</option>
                      <option value="volatility">波动率</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                      风险等级
                    </label>
                    <select
                      value={editingStrategy.riskLevel || 'medium'}
                      onChange={(e) => setEditingStrategy(prev => ({ 
                        ...prev!, 
                        riskLevel: e.target.value as 'low' | 'medium' | 'high'
                      }))}
                      className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    >
                      <option value="low">低风险</option>
                      <option value="medium">中风险</option>
                      <option value="high">高风险</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                    策略描述
                  </label>
                  <textarea
                    value={editingStrategy.description}
                    onChange={(e) => setEditingStrategy(prev => ({ ...prev!, description: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    rows={3}
                  />
                </div>
              </div>

              {/* 风险管理设置 */}
              <div className={`${themes[theme].background} rounded-lg p-4`}>
                <h4 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>风险管理</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                      股票支持 (股)
                    </label>
                    <input
                      type="number"
                      value={editingStrategy.stockSupport || 0}
                      onChange={(e) => setEditingStrategy(prev => ({ 
                        ...prev!, 
                        stockSupport: parseInt(e.target.value) || 0 
                      }))}
                      className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                      min="0"
                    />
                    <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                      用于备兑策略的股票数量
                    </p>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                      现金支持
                    </label>
                    <input
                      type="number"
                      value={editingStrategy.cashSupport || 0}
                      onChange={(e) => setEditingStrategy(prev => ({ 
                        ...prev!, 
                        cashSupport: parseFloat(e.target.value) || 0 
                      }))}
                      className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                      min="0"
                      step="0.01"
                    />
                    <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                      可用于保证金的现金金额
                    </p>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                      风险限额
                    </label>
                    <input
                      type="number"
                      value={editingStrategy.riskLimit || 0}
                      onChange={(e) => setEditingStrategy(prev => ({ 
                        ...prev!, 
                        riskLimit: parseFloat(e.target.value) || 0 
                      }))}
                      className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                      min="0"
                      step="0.01"
                    />
                    <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                      策略最大可承受损失
                    </p>
                  </div>
                </div>
              </div>

              {/* 腿部编辑 */}
              <div className={`${themes[theme].background} rounded-lg p-4`}>
                <div className="flex justify-between items-center mb-4">
                  <h4 className={`text-lg font-semibold ${themes[theme].text}`}>策略腿部</h4>
                  <button
                    onClick={addNewPosition}
                    className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].primary}`}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    添加腿部
                  </button>
                </div>

                <div className="space-y-4">
                  {editingStrategy.positions.map((position, index) => (
                    <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border ${themes[theme].border}`}>
                      <div className="flex justify-between items-center mb-3">
                        <h5 className={`text-md font-medium ${themes[theme].text}`}>
                          腿部 {index + 1}: {position.contract_name || `${position.symbol} ${position.strike} ${position.type.toUpperCase()}`}
                        </h5>
                        <button
                          onClick={() => removePosition(position.id)}
                          className={`p-1 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            标的
                          </label>
                          <input
                            type="text"
                            value={position.symbol}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'symbol', e.target.value)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            类型
                          </label>
                          <select
                            value={position.type}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'type', e.target.value)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                          >
                            <option value="call">Call</option>
                            <option value="put">Put</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            操作
                          </label>
                          <select
                            value={position.position_type}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'position_type', e.target.value)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                          >
                            <option value="buy">买入</option>
                            <option value="sell">卖出</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            行权价
                          </label>
                          <input
                            type="number"
                            value={position.strike}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'strike', parseFloat(e.target.value) || 0)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                            step="0.01"
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            到期日
                          </label>
                          <input
                            type="date"
                            value={position.expiry}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'expiry', e.target.value)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            数量
                          </label>
                          <input
                            type="number"
                            value={position.selectedQuantity || position.quantity}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'selectedQuantity', parseInt(e.target.value) || 0)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                            min="0"
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            成本价格
                          </label>
                          <input
                            type="number"
                            value={position.cost_price || position.premium}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'cost_price', parseFloat(e.target.value) || 0)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                            step="0.01"
                            min="0"
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            当前价值
                          </label>
                          <input
                            type="number"
                            value={position.currentValue}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'currentValue', parseFloat(e.target.value) || 0)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                            step="0.01"
                            min="0"
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                            隐含波动率
                          </label>
                          <input
                            type="number"
                            value={(position.impliedVolatility * 100).toFixed(1)}
                            onChange={(e) => updateEditingStrategyPosition(position.id, 'impliedVolatility', (parseFloat(e.target.value) || 0) / 100)}
                            className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                            step="0.1"
                            min="0"
                            max="200"
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                          备注
                        </label>
                        <textarea
                          value={position.notes || ''}
                          onChange={(e) => updateEditingStrategyPosition(position.id, 'notes', e.target.value)}
                          className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                          rows={2}
                        />
                      </div>

                      {/* 腿部指标显示 */}
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>腿部成本: </span>
                            <span className={`font-medium ${themes[theme].text}`}>
                              {formatCurrency((position.cost_price || position.premium) * (position.selectedQuantity || position.quantity) * 100, currencyConfig)}
                            </span>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>当前价值: </span>
                            <span className={`font-medium ${themes[theme].text}`}>
                              {formatCurrency(position.currentValue * (position.selectedQuantity || position.quantity) * 100, currencyConfig)}
                            </span>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>盈亏: </span>
                            <span className={`font-medium ${
                              position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(position.profitLoss, currencyConfig)}
                            </span>
                          </div>
                          <div>
                            <span className={`${themes[theme].text} opacity-75`}>Delta: </span>
                            <span className={`font-medium ${themes[theme].text}`}>
                              {position.delta.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {editingStrategy.positions.length === 0 && (
                    <div className={`${themes[theme].card} rounded-lg p-8 text-center border-2 border-dashed ${themes[theme].border}`}>
                      <p className={`${themes[theme].text} opacity-75`}>
                        暂无策略腿部，点击"添加腿部"开始构建策略
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 策略风险评估 */}
              {editingStrategy.positions.length > 0 && (
                <div className={`${themes[theme].background} rounded-lg p-4`}>
                  <h4 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>风险评估</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={`${themes[theme].card} rounded-lg p-3`}>
                      <h5 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总成本</h5>
                      <p className={`text-lg font-bold ${themes[theme].text}`}>
                        {formatCurrency(calculateStrategyMetrics(editingStrategy).totalCost, currencyConfig)}
                      </p>
                    </div>
                    <div className={`${themes[theme].card} rounded-lg p-3`}>
                      <h5 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>当前价值</h5>
                      <p className={`text-lg font-bold ${themes[theme].text}`}>
                        {formatCurrency(calculateStrategyMetrics(editingStrategy).currentValue, currencyConfig)}
                      </p>
                    </div>
                    <div className={`${themes[theme].card} rounded-lg p-3`}>
                      <h5 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>盈亏</h5>
                      <p className={`text-lg font-bold ${
                        calculateStrategyMetrics(editingStrategy).profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {calculateStrategyMetrics(editingStrategy).profitLoss >= 0 ? '+' : ''}
                        {formatCurrency(calculateStrategyMetrics(editingStrategy).profitLoss, currencyConfig)}
                      </p>
                    </div>
                    <div className={`${themes[theme].card} rounded-lg p-3`}>
                      <h5 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>风险利用率</h5>
                      <p className={`text-lg font-bold ${themes[theme].text}`}>
                        {editingStrategy.riskLimit && editingStrategy.riskLimit > 0 
                          ? ((Math.abs(calculateStrategyMetrics(editingStrategy).profitLoss) / editingStrategy.riskLimit) * 100).toFixed(1)
                          : '0'
                        }%
                      </p>
                    </div>
                  </div>

                  {/* 风险警告 */}
                  {editingStrategy.riskLimit && Math.abs(calculateStrategyMetrics(editingStrategy).profitLoss) > editingStrategy.riskLimit * 0.8 && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        <span className={`text-sm font-medium text-red-600 dark:text-red-400`}>
                          风险警告: 当前损失接近风险限额
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}