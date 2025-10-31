import React, { useState, useEffect } from 'react';
import { logger } from '../../../shared/utils/logger';
import { Plus, Save, X, Target, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService } from '../../../lib/services';
import type { CustomOptionsStrategy, OptionsPosition } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface StrategyCreatorProps {
  theme: Theme;
  selectedSymbol: string;
  onStrategyCreated?: (strategy: CustomOptionsStrategy) => void;
}

interface NewPosition {
  id: string;
  type: 'call' | 'put';
  position_type: 'buy' | 'sell';
  strike: number;
  expiry: string;
  premium: number;
  quantity: number;
  currentValue: number;
}

interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'bullish' | 'bearish' | 'neutral' | 'volatility';
  riskLevel: 'low' | 'medium' | 'high';
  positions: Omit<NewPosition, 'id' | 'currentValue'>[];
}

const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'long_call',
    name: '买入看涨期权',
    description: '看好标的上涨，买入看涨期权获得上涨收益',
    category: 'bullish',
    riskLevel: 'medium',
    positions: [
      { type: 'call', position_type: 'buy', strike: 450, expiry: '', premium: 5.0, quantity: 1 }
    ]
  },
  {
    id: 'long_put',
    name: '买入看跌期权',
    description: '看空标的下跌，买入看跌期权获得下跌收益',
    category: 'bearish',
    riskLevel: 'medium',
    positions: [
      { type: 'put', position_type: 'buy', strike: 400, expiry: '', premium: 4.0, quantity: 1 }
    ]
  },
  {
    id: 'bull_call_spread',
    name: '牛市看涨价差',
    description: '买入低行权价看涨期权，卖出高行权价看涨期权',
    category: 'bullish',
    riskLevel: 'low',
    positions: [
      { type: 'call', position_type: 'buy', strike: 440, expiry: '', premium: 12.0, quantity: 1 },
      { type: 'call', position_type: 'sell', strike: 460, expiry: '', premium: 6.0, quantity: 1 }
    ]
  },
  {
    id: 'bear_put_spread',
    name: '熊市看跌价差',
    description: '买入高行权价看跌期权，卖出低行权价看跌期权',
    category: 'bearish',
    riskLevel: 'low',
    positions: [
      { type: 'put', position_type: 'buy', strike: 420, expiry: '', premium: 8.0, quantity: 1 },
      { type: 'put', position_type: 'sell', strike: 400, expiry: '', premium: 4.0, quantity: 1 }
    ]
  },
  {
    id: 'iron_condor',
    name: '铁鹰策略',
    description: '卖出跨式组合，同时买入保护腿，收取时间价值',
    category: 'neutral',
    riskLevel: 'medium',
    positions: [
      { type: 'put', position_type: 'buy', strike: 380, expiry: '', premium: 2.0, quantity: 1 },
      { type: 'put', position_type: 'sell', strike: 400, expiry: '', premium: 5.0, quantity: 1 },
      { type: 'call', position_type: 'sell', strike: 460, expiry: '', premium: 5.0, quantity: 1 },
      { type: 'call', position_type: 'buy', strike: 480, expiry: '', premium: 2.0, quantity: 1 }
    ]
  },
  {
    id: 'straddle',
    name: '跨式组合',
    description: '同时买入相同行权价的看涨和看跌期权，赌标的大幅波动',
    category: 'volatility',
    riskLevel: 'high',
    positions: [
      { type: 'call', position_type: 'buy', strike: 450, expiry: '', premium: 8.0, quantity: 1 },
      { type: 'put', position_type: 'buy', strike: 450, expiry: '', premium: 8.0, quantity: 1 }
    ]
  }
];

const DEMO_USER_ID = 'mock-user-id';

export function StrategyCreator({ theme, selectedSymbol, onStrategyCreated }: StrategyCreatorProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [strategyName, setStrategyName] = useState('');
  const [strategyDescription, setStrategyDescription] = useState('');
  const [strategyCategory, setStrategyCategory] = useState<'bullish' | 'bearish' | 'neutral' | 'volatility'>('neutral');
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [positions, setPositions] = useState<NewPosition[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { currencyConfig } = useCurrency();

  // 生成默认到期日（30天后）
  const getDefaultExpiry = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = STRATEGY_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    logger.debug('[StrategyCreator] Guard: template missing');
    return;
  }

    setSelectedTemplate(templateId);
    setStrategyName(template.name);
    setStrategyDescription(template.description);
    setStrategyCategory(template.category);
    setRiskLevel(template.riskLevel);
    
    const defaultExpiry = getDefaultExpiry();
    const newPositions: NewPosition[] = template.positions.map((pos, index) => ({
      id: `pos-${Date.now()}-${index}`,
      ...pos,
      expiry: defaultExpiry,
      currentValue: pos.premium * 1.1 // 模拟当前价值
    }));
    
    setPositions(newPositions);
  };

  const addPosition = () => {
    const newPosition: NewPosition = {
      id: `pos-${Date.now()}`,
      type: 'call',
      position_type: 'buy',
      strike: 450,
      expiry: getDefaultExpiry(),
      premium: 5.0,
      quantity: 1,
      currentValue: 5.5
    };
    setPositions([...positions, newPosition]);
  };

  const updatePosition = (id: string, field: keyof NewPosition, value: any) => {
    setPositions(positions.map(pos => 
      pos.id === id ? { ...pos, [field]: value } : pos
    ));
  };

  const removePosition = (id: string) => {
    setPositions(positions.filter(pos => pos.id !== id));
  };

  const calculateStrategyCost = () => {
    return positions.reduce((total, pos) => {
      const cost = pos.premium * pos.quantity * 100;
      return total + (pos.position_type === 'buy' ? cost : -cost);
    }, 0);
  };

  const calculateStrategyValue = () => {
    return positions.reduce((total, pos) => 
      total + (pos.currentValue * pos.quantity * 100), 0);
  };

  const handleSaveStrategy = async () => {
    if (!strategyName.trim()) {
      toast.error('请输入策略名称');
      return;
    }

    if (positions.length === 0) {
      toast.error('请至少添加一个期权腿部');
      return;
    }

    setIsSaving(true);
    try {
      const strategyPositions: OptionsPosition[] = positions.map(pos => ({
        id: pos.id,
        symbol: selectedSymbol,
        strategy: strategyName,
        type: pos.type === 'call' || pos.type === 'put' ? pos.type : 'call',
        position_type: pos.position_type,
        strike: pos.strike,
        expiry: pos.expiry,
        quantity: pos.quantity,
        premium: pos.premium,
        currentValue: pos.currentValue,
        profitLoss: (pos.currentValue - pos.premium) * pos.quantity * 100,
        profitLossPercentage: pos.premium > 0 ? ((pos.currentValue - pos.premium) / pos.premium) * 100 : 0,
        impliedVolatility: 0.2 + Math.random() * 0.3,
        delta: Math.random() * 0.8 - 0.4,
        gamma: Math.random() * 0.02,
        theta: -Math.random() * 0.1,
        vega: Math.random() * 0.15,
        status: 'open',
        openDate: new Date().toISOString(),
        notes: `${pos.position_type === 'buy' ? '买入' : '卖出'} ${pos.type.toUpperCase()} ${pos.strike}`
      }));

      const newStrategy: Omit<CustomOptionsStrategy, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: DEMO_USER_ID,
        name: strategyName,
        description: strategyDescription,
        positions: strategyPositions,
        strategyCategory,
        riskLevel,
        isPresetStrategy: false
      };

      const { data, error } = await optionsService.saveCustomStrategy(newStrategy);
      if (error) throw error;

      if (data) {
        toast.success('策略保存成功！');
        onStrategyCreated?.(data);
        resetForm();
      }
    } catch (error) {
      console.error('Error saving strategy:', error);
      toast.error('保存策略失败');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setShowCreateForm(false);
    setSelectedTemplate('');
    setStrategyName('');
    setStrategyDescription('');
    setStrategyCategory('neutral');
    setRiskLevel('medium');
    setPositions([]);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bullish': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'bearish': return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'volatility': return <Activity className="w-4 h-4 text-purple-500" />;
      default: return <Target className="w-4 h-4 text-blue-500" />;
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    }
  };

  const strategyCost = calculateStrategyCost();
  const strategyValue = calculateStrategyValue();
  const strategyPL = strategyValue - strategyCost;

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plus className="w-6 h-6 text-blue-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              创建期权策略
            </h2>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={`px-4 py-2 rounded-md ${themes[theme].primary}`}
          >
            {showCreateForm ? '取消创建' : '新建策略'}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="p-6 space-y-6">
          {/* 策略模板选择 */}
          <div>
            <label className={`block text-sm font-medium ${themes[theme].text} mb-3`}>
              选择策略模板（可选）
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {STRATEGY_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedTemplate === template.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : `${themes[theme].border} ${themes[theme].cardHover}`
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {getCategoryIcon(template.category)}
                    <span className={`font-medium ${themes[theme].text}`}>
                      {template.name}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${getRiskLevelColor(template.riskLevel)}`}>
                      {template.riskLevel === 'low' ? '低风险' : 
                       template.riskLevel === 'high' ? '高风险' : '中风险'}
                    </span>
                  </div>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* 策略基本信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                策略名称 *
              </label>
              <input
                type="text"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                placeholder="输入策略名称"
                required
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                策略分类
              </label>
              <select
                value={strategyCategory}
                onChange={(e) => setStrategyCategory(e.target.value as typeof strategyCategory)}
                className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="bullish">看涨策略</option>
                <option value="bearish">看跌策略</option>
                <option value="neutral">中性策略</option>
                <option value="volatility">波动率策略</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                风险等级
              </label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}
                className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="low">低风险</option>
                <option value="medium">中风险</option>
                <option value="high">高风险</option>
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
              策略描述
            </label>
            <textarea
              value={strategyDescription}
              onChange={(e) => setStrategyDescription(e.target.value)}
              className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
              rows={3}
              placeholder="描述您的策略逻辑和预期..."
            />
          </div>

          {/* 期权腿部管理 */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className={`text-sm font-medium ${themes[theme].text}`}>
                期权腿部配置
              </label>
              <button
                onClick={addPosition}
                className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm ${themes[theme].secondary}`}
              >
                <Plus className="w-4 h-4 mr-1" />
                添加腿部
              </button>
            </div>

            <div className="space-y-3">
              {positions.map((position, index) => (
                <div
                  key={position.id}
                  className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className={`font-medium ${themes[theme].text}`}>
                      腿部 {index + 1}
                    </span>
                    <button
                      onClick={() => removePosition(position.id)}
                      className={`p-1 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div>
                      <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                        类型
                      </label>
                      <select
                        value={position.type}
                        onChange={(e) => updatePosition(position.id, 'type', e.target.value)}
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
                        onChange={(e) => updatePosition(position.id, 'position_type', e.target.value)}
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
                        onChange={(e) => updatePosition(position.id, 'strike', parseFloat(e.target.value) || 0)}
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
                        onChange={(e) => updatePosition(position.id, 'expiry', e.target.value)}
                        className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                      />
                    </div>

                    <div>
                      <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                        权利金
                      </label>
                      <input
                        type="number"
                        value={position.premium}
                        onChange={(e) => updatePosition(position.id, 'premium', parseFloat(e.target.value) || 0)}
                        className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                        step="0.01"
                      />
                    </div>

                    <div>
                      <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                        数量
                      </label>
                      <input
                        type="number"
                        value={position.quantity}
                        onChange={(e) => updatePosition(position.id, 'quantity', parseInt(e.target.value) || 0)}
                        className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                      />
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className={`${themes[theme].text} opacity-75`}>成本: </span>
                        <span className={`font-medium ${themes[theme].text}`}>
                          {formatCurrency(position.premium * position.quantity * 100, currencyConfig)}
                        </span>
                      </div>
                      <div>
                        <span className={`${themes[theme].text} opacity-75`}>现值: </span>
                        <span className={`font-medium ${themes[theme].text}`}>
                          {formatCurrency(position.currentValue * position.quantity * 100, currencyConfig)}
                        </span>
                      </div>
                      <div>
                        <span className={`${themes[theme].text} opacity-75`}>方向: </span>
                        <span className={`font-medium ${
                          position.position_type === 'buy' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {position.position_type === 'buy' ? '做多' : '做空'} {position.type.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {positions.length === 0 && (
                <div className={`${themes[theme].background} rounded-lg p-8 text-center border-2 border-dashed ${themes[theme].border}`}>
                  <p className={`${themes[theme].text} opacity-75`}>
                    选择策略模板或手动添加期权腿部
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 策略摘要 */}
          {positions.length > 0 && (
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h4 className={`text-sm font-medium ${themes[theme].text} mb-3`}>策略摘要</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>总成本: </span>
                  <span className={`font-medium ${strategyCost >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(Math.abs(strategyCost), currencyConfig)}
                    <span className="text-xs ml-1">
                      ({strategyCost >= 0 ? '净支出' : '净收入'})
                    </span>
                  </span>
                </div>
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>当前价值: </span>
                  <span className={`font-medium ${themes[theme].text}`}>
                    {formatCurrency(strategyValue, currencyConfig)}
                  </span>
                </div>
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>盈亏: </span>
                  <span className={`font-medium ${strategyPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {strategyPL >= 0 ? '+' : ''}{formatCurrency(strategyPL, currencyConfig)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 保存按钮 */}
          <div className="flex justify-end gap-2">
            <button
              onClick={resetForm}
              className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
            >
              取消
            </button>
            <button
              onClick={handleSaveStrategy}
              disabled={isSaving || positions.length === 0 || !strategyName.trim()}
              className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary} ${
                (isSaving || positions.length === 0 || !strategyName.trim()) ? 'opacity-50 cursor-not-allowed' : ''
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
      )}
    </div>
  );
}