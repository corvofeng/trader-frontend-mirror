import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService } from '../../../lib/services';
import type { CustomOptionsStrategy, OptionsPosition } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface StrategyEditModalProps {
  theme: Theme;
  strategy: CustomOptionsStrategy;
  onClose: () => void;
  onStrategyUpdated: (updatedStrategy: CustomOptionsStrategy) => void;
}

interface EditablePosition extends OptionsPosition {
  isNew?: boolean;
}

export function StrategyEditModal({ 
  theme, 
  strategy, 
  onClose, 
  onStrategyUpdated 
}: StrategyEditModalProps) {
  const [editedStrategy, setEditedStrategy] = useState<CustomOptionsStrategy>({ ...strategy });
  const [positions, setPositions] = useState<EditablePosition[]>([...strategy.positions]);
  const [isSaving, setIsSaving] = useState(false);
  const { currencyConfig } = useCurrency();

  // 生成默认到期日（30天后）
  const getDefaultExpiry = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  };

  const addPosition = () => {
    const newPosition: EditablePosition = {
      id: `pos-${Date.now()}`,
      symbol: positions[0]?.symbol || 'SPY',
      strategy: editedStrategy.name,
      strategy_id: editedStrategy.id,
      type: 'call',
      position_type: 'buy',
      strike: 450,
      expiry: getDefaultExpiry(),
      quantity: 1,
      selectedQuantity: 1,
      premium: 5.0,
      currentValue: 5.5,
      profitLoss: 50,
      profitLossPercentage: 10,
      impliedVolatility: 0.2,
      delta: 0.5,
      gamma: 0.02,
      theta: -0.05,
      vega: 0.12,
      status: 'open',
      openDate: new Date().toISOString(),
      notes: '新增腿部',
      isNew: true
    };
    setPositions([...positions, newPosition]);
  };

  const updatePosition = (id: string, field: keyof EditablePosition, value: any) => {
    setPositions(positions.map(pos => {
      if (pos.id === id) {
        const updatedPos = { ...pos, [field]: value };
        
        // 重新计算盈亏
        if (field === 'premium' || field === 'currentValue' || field === 'selectedQuantity') {
          const quantity = updatedPos.selectedQuantity || updatedPos.quantity;
          const cost = updatedPos.premium * quantity * 100;
          const currentVal = updatedPos.currentValue * quantity * 100;
          updatedPos.profitLoss = updatedPos.position_type === 'buy' 
            ? currentVal - cost 
            : cost - currentVal;
          updatedPos.profitLossPercentage = cost > 0 ? (updatedPos.profitLoss / cost) * 100 : 0;
        }
        
        return updatedPos;
      }
      return pos;
    }));
  };

  const removePosition = (id: string) => {
    if (positions.length <= 1) {
      toast.error('策略至少需要一个期权腿部');
      return;
    }
    setPositions(positions.filter(pos => pos.id !== id));
  };

  const calculateStrategyCost = () => {
    return positions.reduce((total, pos) => {
      const quantity = pos.selectedQuantity || pos.quantity;
      const cost = pos.premium * quantity * 100;
      return total + (pos.position_type === 'buy' ? cost : -cost);
    }, 0);
  };

  const calculateStrategyValue = () => {
    return positions.reduce((total, pos) => {
      const quantity = pos.selectedQuantity || pos.quantity;
      return total + (pos.currentValue * quantity * 100);
    }, 0);
  };

  const handleSave = async () => {
    if (!editedStrategy.name.trim()) {
      toast.error('请输入策略名称');
      return;
    }

    if (positions.length === 0) {
      toast.error('策略至少需要一个期权腿部');
      return;
    }

    setIsSaving(true);
    try {
      // 更新策略的基本信息
      const updatedStrategy: CustomOptionsStrategy = {
        ...editedStrategy,
        positions: positions.map(pos => {
          const { isNew, ...cleanPos } = pos;
          return cleanPos;
        }),
        updatedAt: new Date().toISOString()
      };

      // 这里应该调用更新API，目前使用保存API模拟
      const { data, error } = await optionsService.saveCustomStrategy(updatedStrategy);
      if (error) throw error;

      if (data) {
        toast.success('策略更新成功！');
        // 优先使用服务端返回的数据（包含真实ID与时间戳）
        onStrategyUpdated(data);
        onClose();
        return;
      }
      // 兜底：若未返回数据，回传本地更新对象
      toast.success('策略更新成功！');
      onStrategyUpdated(updatedStrategy);
      onClose();
    } catch (error) {
      console.error('Error updating strategy:', error);
      toast.error('更新策略失败');
    } finally {
      setIsSaving(false);
    }
  };

  const strategyCost = calculateStrategyCost();
  const strategyValue = calculateStrategyValue();
  const strategyPL = strategyValue - strategyCost;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themes[theme].card} rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto`}>
        {/* 头部 */}
        <div className="sticky top-0 bg-inherit border-b border-gray-200 p-6 flex justify-between items-center">
          <div>
            <h2 className={`text-2xl font-bold ${themes[theme].text}`}>
              编辑策略
            </h2>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>
              修改策略配置和期权腿部
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-md ${themes[theme].secondary}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 策略基本信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                策略名称 *
              </label>
              <input
                type="text"
                value={editedStrategy.name}
                onChange={(e) => setEditedStrategy(prev => ({ ...prev, name: e.target.value }))}
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
                value={editedStrategy.strategyCategory || 'neutral'}
                onChange={(e) => setEditedStrategy(prev => ({ 
                  ...prev, 
                  strategyCategory: e.target.value as 'bullish' | 'bearish' | 'neutral' | 'volatility'
                }))}
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
                value={editedStrategy.riskLevel || 'medium'}
                onChange={(e) => setEditedStrategy(prev => ({ 
                  ...prev, 
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

          <div>
            <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
              策略描述
            </label>
            <textarea
              value={editedStrategy.description}
              onChange={(e) => setEditedStrategy(prev => ({ ...prev, description: e.target.value }))}
              className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
              rows={3}
              placeholder="描述您的策略逻辑和预期..."
            />
          </div>

          {/* 期权腿部管理 */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className={`text-sm font-medium ${themes[theme].text}`}>
                期权腿部配置 ({positions.length} 个腿部)
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
                  className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} ${
                    position.isNew ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${themes[theme].text}`}>
                        腿部 {index + 1}
                      </span>
                      {position.isNew && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                          新增
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removePosition(position.id)}
                      className={`p-1 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
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
                        当前价值
                      </label>
                      <input
                        type="number"
                        value={position.currentValue}
                        onChange={(e) => updatePosition(position.id, 'currentValue', parseFloat(e.target.value) || 0)}
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
                        value={position.selectedQuantity || position.quantity}
                        onChange={(e) => updatePosition(position.id, 'selectedQuantity', parseInt(e.target.value) || 0)}
                        className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                      />
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className={`${themes[theme].text} opacity-75`}>成本: </span>
                        <span className={`font-medium ${themes[theme].text}`}>
                          {formatCurrency(position.premium * (position.selectedQuantity || position.quantity) * 100, currencyConfig)}
                        </span>
                      </div>
                      <div>
                        <span className={`${themes[theme].text} opacity-75`}>现值: </span>
                        <span className={`font-medium ${themes[theme].text}`}>
                          {formatCurrency(position.currentValue * (position.selectedQuantity || position.quantity) * 100, currencyConfig)}
                        </span>
                      </div>
                      <div>
                        <span className={`${themes[theme].text} opacity-75`}>盈亏: </span>
                        <span className={`font-medium ${
                          position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
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

                    {/* 备注编辑 */}
                    <div className="mt-3">
                      <label className={`block text-xs font-medium ${themes[theme].text} opacity-75 mb-1`}>
                        备注
                      </label>
                      <input
                        type="text"
                        value={position.notes || ''}
                        onChange={(e) => updatePosition(position.id, 'notes', e.target.value)}
                        className={`w-full px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                        placeholder="添加备注..."
                      />
                    </div>
                  </div>
                </div>
              ))}

              {positions.length === 0 && (
                <div className={`${themes[theme].background} rounded-lg p-8 text-center border-2 border-dashed ${themes[theme].border}`}>
                  <p className={`${themes[theme].text} opacity-75`}>
                    点击"添加腿部"开始构建策略
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
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || positions.length === 0 || !editedStrategy.name.trim()}
              className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary} ${
                (isSaving || positions.length === 0 || !editedStrategy.name.trim()) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSaving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              保存更改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}