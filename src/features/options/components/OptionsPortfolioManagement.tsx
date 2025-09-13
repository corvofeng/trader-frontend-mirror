import React, { useState } from 'react';
import {
  Plus,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService } from '../../../lib/services';
import type { OptionsPosition, OptionsStrategy, CustomOptionsStrategy } from '../../../lib/services/types';

interface OptionsPortfolioManagementProps {
  theme: Theme;
}

const DEMO_USER_ID = 'mock-user-id';

export default function OptionsPortfolioManagement({ theme }: OptionsPortfolioManagementProps) {
  const [customStrategies, setCustomStrategies] = useState<CustomOptionsStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<CustomOptionsStrategy | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { currencyConfig } = useCurrency();

  // Fetch custom strategies on component mount
  React.useEffect(() => {
    const fetchCustomStrategies = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await optionsService.getCustomStrategies(DEMO_USER_ID);
        
        if (error) {
          throw error;
        }
        
        if (data) {
          setCustomStrategies(data);
        }
      } catch (err) {
        console.error('Error fetching custom strategies:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomStrategies();
  }, []);

  const handleDeleteStrategy = async (strategyId: string) => {
    try {
      const { error } = await optionsService.deleteCustomStrategy(strategyId);
      
      if (error) {
        throw error;
      }
      
      // Remove from local state
      setCustomStrategies(prev => prev.filter(s => s.id !== strategyId));
      
      // Close details if this strategy was selected
      if (selectedStrategy?.id === strategyId) {
        setSelectedStrategy(null);
      }
    } catch (err) {
      console.error('Error deleting strategy:', err);
    }
  };

  if (isLoading) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${themes[theme].text}`}>加载自定义策略...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                期权组合管理
              </h2>
              <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                管理和分析您的自定义期权策略
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary}`}
            >
              <Plus className="w-4 h-4 mr-2" />
              创建策略
            </button>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="p-6 border-b border-gray-200">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
                创建新策略
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    策略名称
                  </label>
                  <input
                    type="text"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="输入策略名称"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    策略类型
                  </label>
                  <select className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="bull_call_spread">牛市看涨价差</option>
                    <option value="bear_put_spread">熊市看跌价差</option>
                    <option value="iron_condor">铁鹰策略</option>
                    <option value="butterfly">蝶式价差</option>
                    <option value="straddle">跨式组合</option>
                    <option value="strangle">宽跨式组合</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                  策略描述
                </label>
                <textarea
                  className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  rows={3}
                  placeholder="描述您的策略..."
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
                >
                  取消
                </button>
                <button className={`px-4 py-2 rounded-md ${themes[theme].primary}`}>
                  创建策略
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Strategies List */}
        <div className="p-6">
          {customStrategies.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>暂无自定义策略</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                点击"创建策略"开始构建您的期权组合
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {customStrategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                          {strategy.name || strategy.strategy_name}
                        </h3>
                        {strategy.isPresetStrategy && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                            预设策略
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${themes[theme].text} opacity-75`}>
                        {strategy.description}
                      </p>
                      <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                        创建时间: {new Date(strategy.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedStrategy(
                          selectedStrategy?.id === strategy.id ? null : strategy
                        )}
                        className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                      >
                        {selectedStrategy?.id === strategy.id ? '收起' : '详情'}
                      </button>
                      <button
                        onClick={() => handleDeleteStrategy(strategy.id)}
                        className={`p-2 rounded-md ${themes[theme].secondary} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Strategy Details */}
                  {selectedStrategy?.id === strategy.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>
                            策略信息
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className={`${themes[theme].text} opacity-75`}>策略类型:</span>
                              <span className={`${themes[theme].text}`}>{strategy.strategy_type || '自定义'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={`${themes[theme].text} opacity-75`}>到期日:</span>
                              <span className={`${themes[theme].text}`}>
                                {strategy.expiry ? new Date(strategy.expiry).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className={`${themes[theme].text} opacity-75`}>腿数:</span>
                              <span className={`${themes[theme].text}`}>{strategy.positions.length}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>
                            策略腿部
                          </h4>
                          <div className="space-y-2">
                            {strategy.positions.map((position, index) => (
                              <div key={position.id || index} className={`${themes[theme].card} rounded p-2 text-xs`}>
                                <div className="flex justify-between items-center">
                                  <span className={`${themes[theme].text}`}>
                                    {position.contract_name || `${position.type.toUpperCase()} ${position.contract_strike_price || position.strike}`}
                                  </span>
                                  <span className={`font-medium ${
                                    position.position_type === 'buy' ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {position.position_type_zh || (position.position_type === 'buy' ? '权利' : '义务')}
                                  </span>
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className={`${themes[theme].text} opacity-75`}>
                                    数量: {position.leg_quantity || position.quantity}
                                  </span>
                                  <span className={`${themes[theme].text} opacity-75`}>
                                    成本: {formatCurrency(position.cost_price || position.premium, currencyConfig)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}