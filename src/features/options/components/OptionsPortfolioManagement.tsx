import React, { useState, useEffect } from 'react';
import { Calculator, Settings, Briefcase, Plus } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { optionsService } from '../../../lib/services';
import type { OptionsPortfolioData, CustomOptionsStrategy } from '../../../lib/services/types';
import { StrategyCreator } from './StrategyCreator';
import { StrategyDisplay } from './StrategyDisplay';
import { SavedStrategiesManager } from './SavedStrategiesManager';

interface OptionsPortfolioManagementProps {
  theme: Theme;
}

type ManagementTab = 'overview' | 'create' | 'saved' | 'settings';

const DEMO_USER_ID = 'mock-user-id';

export function OptionsPortfolioManagement({ theme }: OptionsPortfolioManagementProps) {
  const [activeTab, setActiveTab] = useState<ManagementTab>('overview');
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [savedStrategies, setSavedStrategies] = useState<CustomOptionsStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState('SPY');

  useEffect(() => {
    fetchPortfolioData();
    fetchSavedStrategies();
  }, []);

  const fetchPortfolioData = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await optionsService.getOptionsPortfolio(DEMO_USER_ID);
      if (error) throw error;
      if (data) {
        setPortfolioData(data);
      }
    } catch (error) {
      console.error('Error fetching portfolio data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSavedStrategies = async () => {
    try {
      const { data, error } = await optionsService.getCustomStrategies(DEMO_USER_ID);
      if (error) throw error;
      if (data) {
        setSavedStrategies(data);
      }
    } catch (error) {
      console.error('Error fetching saved strategies:', error);
    }
  };

  const handleStrategyCreated = (strategy: CustomOptionsStrategy) => {
    setSavedStrategies(prev => [strategy, ...prev]);
    setActiveTab('saved'); // 切换到已保存策略页面
  };

  const handleStrategyUpdated = () => {
    fetchSavedStrategies(); // 重新获取已保存策略
  };

  const tabs = [
    { id: 'overview' as ManagementTab, name: '策略概览', icon: Briefcase },
    { id: 'create' as ManagementTab, name: '创建策略', icon: Plus },
    { id: 'saved' as ManagementTab, name: '已保存策略', icon: Calculator },
    { id: 'settings' as ManagementTab, name: '设置', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex space-x-2 min-w-max sm:min-w-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? themes[theme].primary
                    : themes[theme].secondary
                }`}
              >
                <Icon className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{tab.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">加载投资组合数据...</p>
            </div>
          ) : portfolioData ? (
            <StrategyDisplay
              theme={theme}
              strategies={portfolioData.strategies}
              title="当前期权策略"
              showFilters={true}
            />
          ) : (
            <div className={`${themes[theme].card} rounded-lg p-8 text-center`}>
              <Briefcase className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>暂无期权策略</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                创建您的第一个期权策略开始交易
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'create' && (
        <StrategyCreator
          theme={theme}
          selectedSymbol={selectedSymbol}
          onStrategyCreated={handleStrategyCreated}
        />
      )}

      {activeTab === 'saved' && (
        <SavedStrategiesManager
          theme={theme}
          onStrategyUpdated={handleStrategyUpdated}
        />
      )}

      {activeTab === 'settings' && (
        <div className={`${themes[theme].card} rounded-lg p-6`}>
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-6 h-6 text-blue-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              期权交易设置
            </h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                默认标的
              </label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className={`w-full md:w-auto px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="SPY">SPY - SPDR S&P 500 ETF</option>
                <option value="QQQ">QQQ - Invesco QQQ Trust</option>
                <option value="AAPL">AAPL - Apple Inc.</option>
                <option value="TSLA">TSLA - Tesla Inc.</option>
                <option value="MSFT">MSFT - Microsoft Corporation</option>
              </select>
            </div>

            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-3`}>风险管理设置</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    单策略最大风险限额
                  </label>
                  <input
                    type="number"
                    defaultValue={10000}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="10000"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    总投资组合风险限额
                  </label>
                  <input
                    type="number"
                    defaultValue={50000}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="50000"
                  />
                </div>
              </div>
            </div>

            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-3`}>通知设置</h3>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`ml-2 text-sm ${themes[theme].text}`}>
                    到期提醒（到期前7天）
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`ml-2 text-sm ${themes[theme].text}`}>
                    盈亏警告（损失超过20%）
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`ml-2 text-sm ${themes[theme].text}`}>
                    每日盈亏报告
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}