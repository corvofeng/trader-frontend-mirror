import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Plus, Target, FileText, Calendar, RefreshCw } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, stockService } from '../../../lib/services';
import type { RatioSpreadPlanResult } from '../../../lib/services/types';

interface OptionsTradePlansProps {
  theme: Theme;
  selectedSymbol: string;
}

interface OptionsTradePlan {
  id: string;
  symbol: string;
  strategy: string;
  type: 'call' | 'put' | 'spread';
  strike: number;
  expiry: string;
  targetPrice: number;
  stopLoss?: number;
  quantity: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  notes: string;
  createdAt: string;
}

// Mock data for demonstration
const MOCK_TRADE_PLANS: OptionsTradePlan[] = [
  {
    id: '1',
    symbol: 'SPY',
    strategy: 'Long Call',
    type: 'call',
    strike: 450,
    expiry: '2024-03-15',
    targetPrice: 8.00,
    stopLoss: 3.00,
    quantity: 5,
    status: 'pending',
    notes: '看好市场短期上涨，买入看涨期权',
    createdAt: '2024-01-15T10:30:00Z'
  },
  {
    id: '2',
    symbol: 'QQQ',
    strategy: 'Protective Put',
    type: 'put',
    strike: 380,
    expiry: '2024-02-16',
    targetPrice: 6.50,
    quantity: 10,
    status: 'active',
    notes: '为现有QQQ持仓购买保护性看跌期权',
    createdAt: '2024-01-10T14:20:00Z'
  },
  {
    id: '3',
    symbol: 'AAPL',
    strategy: 'Bull Call Spread',
    type: 'spread',
    strike: 175,
    expiry: '2024-04-19',
    targetPrice: 2.50,
    stopLoss: 1.00,
    quantity: 8,
    status: 'completed',
    notes: '牛市看涨价差策略，限制风险和收益',
    createdAt: '2024-01-05T09:15:00Z'
  }
];

export function OptionsTradePlans({ theme, selectedSymbol }: OptionsTradePlansProps) {
  const [tradePlans] = useState<OptionsTradePlan[]>(MOCK_TRADE_PLANS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'completed' | 'cancelled'>('all');
  const { currencyConfig } = useCurrency();
  const [symbol, setSymbol] = useState<string>(selectedSymbol);
  const [ratioPlans, setRatioPlans] = useState<RatioSpreadPlanResult[]>([]);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [isLoadingRatio, setIsLoadingRatio] = useState(false);
  const [ratioError, setRatioError] = useState<string | null>(null);
  const [underlyingPrice, setUnderlyingPrice] = useState<number | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const [atmFilter, setAtmFilter] = useState<'all' | 'itm' | 'atm' | 'otm'>('all');
  const [optionTypeFilter, setOptionTypeFilter] = useState<'all' | 'call' | 'put'>('all');
  const [savedFilter, setSavedFilter] = useState<'all' | 'saved' | 'unsaved'>('all');
  const [sortKey, setSortKey] = useState<'leverage' | 'net' | 'buy' | 'sell'>('leverage');
  const groupedByExpiry: Record<string, RatioSpreadPlanResult[]> = ratioPlans.reduce((acc, rp) => {
    const key = rp.plan.expiry;
    if (!acc[key]) acc[key] = [];
    acc[key].push(rp);
    return acc;
  }, {} as Record<string, RatioSpreadPlanResult[]>);
  const sortedExpiries = Object.keys(groupedByExpiry).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const getMoneyness = (rp: RatioSpreadPlanResult): 'itm' | 'atm' | 'otm' => {
    const strike = rp.analysis.buy_strike_price;
    const type = rp.plan.option_type;
    const threshold = 0.005;
    if (underlyingPrice != null) {
      const diffRatio = Math.abs(underlyingPrice - strike) / Math.max(strike, 1);
      if (diffRatio <= threshold) return 'atm';
      if (type === 'call') return underlyingPrice > strike ? 'itm' : 'otm';
      return underlyingPrice < strike ? 'itm' : 'otm';
    }
    const mid = (rp.plan.lower_strike + rp.plan.upper_strike) / 2;
    const diffRatio = Math.abs(mid - strike) / Math.max(strike, 1);
    if (diffRatio <= threshold) return 'atm';
    if (type === 'call') return mid > strike ? 'itm' : 'otm';
    return mid < strike ? 'itm' : 'otm';
  };

  const getPlanColor = (rp: RatioSpreadPlanResult) => {
    const m = getMoneyness(rp);
    if (m === 'atm') return theme === 'dark' ? 'border-blue-400 bg-blue-900/30' : 'border-blue-300 bg-blue-50';
    if (m === 'itm') return theme === 'dark' ? 'border-green-400 bg-green-900/30' : 'border-green-300 bg-green-50';
    return theme === 'dark' ? 'border-amber-400 bg-amber-900/30' : 'border-amber-300 bg-amber-50';
  };

  const filterPlan = (rp: RatioSpreadPlanResult) => {
    if (savedFilter === 'saved' && !rp.saved) return false;
    if (savedFilter === 'unsaved' && rp.saved) return false;
    if (optionTypeFilter !== 'all' && rp.plan.option_type !== optionTypeFilter) return false;
    if (atmFilter !== 'all') {
      if (getMoneyness(rp) !== atmFilter) return false;
    }
    return true;
  };

  const sortPlans = (a: RatioSpreadPlanResult, b: RatioSpreadPlanResult) => {
    switch (sortKey) {
      case 'leverage':
        return (b.leverage ?? 0) - (a.leverage ?? 0);
      case 'net':
        return (b.best_net_premium ?? 0) - (a.best_net_premium ?? 0);
      case 'buy':
        return (b.buy_price ?? 0) - (a.buy_price ?? 0);
      case 'sell':
        return (b.sell_price ?? 0) - (a.sell_price ?? 0);
      default:
        return 0;
    }
  };

  const refreshRatioPlans = async () => {
    if (!symbol) {
      setRatioPlans([]);
      setRatioError(null);
      return;
    }
    try {
      setIsLoadingRatio(true);
      setRatioError(null);
      const { data, error } = await optionsService.getRatioSpreadPlans(symbol);
      if (error) throw error;
      setRatioPlans(data || []);
    } catch (e: unknown) {
      setRatioError(e instanceof Error ? e.message : '获取比率价差计划失败');
      setRatioPlans([]);
    } finally {
      setIsLoadingRatio(false);
    }
  };

  const handleSavePlan = async (rp: RatioSpreadPlanResult) => {
    const id = `${rp.plan.label}-${rp.plan.expiry}`;
    setSavingIds(prev => ({ ...prev, [id]: true }));
    try {
      const { data, error } = await optionsService.saveRatioSpreadPlan(rp);
      if (error) throw error;
      if (data) {
        setRatioPlans(prev => prev.map(p => {
          const pid = `${p.plan.label}-${p.plan.expiry}`;
          return pid === id ? { ...p, saved: true } : p;
        }));
      }
    } catch (e) {
      console.error('save ratio plan failed', e);
    } finally {
      setSavingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  useEffect(() => {
    const fetchRatioPlans = async () => {
      if (!symbol) {
        setRatioPlans([]);
        setRatioError(null);
        return;
      }
      try {
        setIsLoadingRatio(true);
        setRatioError(null);
        const { data, error } = await optionsService.getRatioSpreadPlans(symbol);
        if (error) throw error;
        setRatioPlans(data || []);
      } catch (e: unknown) {
        setRatioError(e instanceof Error ? e.message : '获取比率价差计划失败');
        setRatioPlans([]);
      } finally {
        setIsLoadingRatio(false);
      }
    };
    fetchRatioPlans();
  }, [symbol]);

  useEffect(() => {
    const fetchUnderlying = async () => {
      if (!symbol) {
        setUnderlyingPrice(null);
        return;
      }
      try {
        const { data } = await stockService.getCurrentPrice(symbol);
        setUnderlyingPrice(data?.price ?? null);
      } catch {
        setUnderlyingPrice(null);
      }
    };
    fetchUnderlying();
  }, [symbol]);

  useEffect(() => {
    let active = true;
    const fetchSymbols = async () => {
      try {
        setIsLoadingSymbols(true);
        const { data } = await optionsService.getAvailableSymbols();
        if (active) {
          const list = Array.isArray(data) ? data : [];
          setAvailableSymbols(list);
        }
      } finally {
        if (active) setIsLoadingSymbols(false);
      }
    };
    fetchSymbols();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (availableSymbols.length > 0) {
      setSymbol(prev => prev || availableSymbols[0]);
    }
  }, [availableSymbols]);

  const filteredPlans = tradePlans.filter(plan => 
    filter === 'all' || plan.status === filter
  );

  const getStatusColor = (status: OptionsTradePlan['status']) => {
    switch (status) {
      case 'pending':
        return theme === 'dark' 
          ? 'bg-yellow-900 text-yellow-100' 
          : 'bg-yellow-100 text-yellow-800';
      case 'active':
        return theme === 'dark' 
          ? 'bg-blue-900 text-blue-100' 
          : 'bg-blue-100 text-blue-800';
      case 'completed':
        return theme === 'dark' 
          ? 'bg-green-900 text-green-100' 
          : 'bg-green-100 text-green-800';
      case 'cancelled':
        return theme === 'dark'
          ? 'bg-red-900 text-red-100'
          : 'bg-red-100 text-red-800';
      default:
        return theme === 'dark'
          ? 'bg-gray-700 text-gray-100'
          : 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: OptionsTradePlan['type']) => {
    switch (type) {
      case 'call':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'put':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'spread':
        return <Target className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-purple-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>比率价差计划</h2>
            <div className="ml-auto flex items-center gap-2">
              <label className={`text-sm ${themes[theme].text}`}>标的</label>
              {availableSymbols.length > 0 ? (
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                  disabled={isLoadingSymbols}
                >
                  <option value="">请选择标的</option>
                  {availableSymbols.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.trim())}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                  placeholder="例如: SPY"
                />
              )}
              <button
                type="button"
                onClick={refreshRatioPlans}
                disabled={isLoadingRatio || !symbol}
                className={`inline-flex items-center px-2 py-1 rounded ${themes[theme].secondary}`}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新
              </button>
            </div>
          </div>
        </div>
        <div className="p-6">
          {isLoadingRatio && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>加载中...</p>
            </div>
          )}
          {!isLoadingRatio && ratioError && (
            <div className={`rounded-lg p-4 border ${themes[theme].border}`}>
              <p className={`text-sm ${themes[theme].text}`}>{ratioError}</p>
            </div>
          )}
          {!isLoadingRatio && !ratioError && ratioPlans.length > 0 && (
            <div className="space-y-6">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>类型</span>
                  <select value={optionTypeFilter} onChange={(e) => setOptionTypeFilter(e.target.value as typeof optionTypeFilter)} className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="all">全部</option>
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>价内/平值/价外</span>
                  <select value={atmFilter} onChange={(e) => setAtmFilter(e.target.value as typeof atmFilter)} className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="all">全部</option>
                    <option value="itm">仅ITM</option>
                    <option value="atm">仅ATM</option>
                    <option value="otm">仅OTM</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>保存</span>
                  <select value={savedFilter} onChange={(e) => setSavedFilter(e.target.value as typeof savedFilter)} className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="all">全部</option>
                    <option value="saved">已保存</option>
                    <option value="unsaved">未保存</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>排序</span>
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="leverage">杠杆</option>
                    <option value="net">净权利金</option>
                    <option value="buy">买价</option>
                    <option value="sell">卖价</option>
                  </select>
                </div>
                {underlyingPrice != null && (
                  <div className={`ml-auto text-sm ${themes[theme].text}`}>标的价 {underlyingPrice}</div>
                )}
              </div>
              {sortedExpiries.map((exp) => (
                <div key={`exp-${exp}`} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span className={`text-sm font-semibold ${themes[theme].text}`}>
                      到期 {new Date(exp).toLocaleDateString()} · {groupedByExpiry[exp].length} 条计划
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        <span className={`text-sm font-medium ${themes[theme].text}`}>Call ({groupedByExpiry[exp].filter(p => p.plan.option_type === 'call').length})</span>
                      </div>
                      <div className="space-y-3">
                        {groupedByExpiry[exp]
                          .filter((rp) => rp.plan.option_type === 'call')
                          .filter(filterPlan)
                          .sort(sortPlans)
                          .map((rp, idx) => (
                          <div key={`ratio-call-${exp}-${idx}`} className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} relative group ${getPlanColor(rp)}`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <Target className="w-4 h-4 text-purple-500" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className={`text-sm font-semibold ${themes[theme].text}`}>{rp.plan.label}</h3>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rp.action === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : rp.action === 'close' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'}`}>{rp.action}</span>
                                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${(() => { const m = getMoneyness(rp); return m === 'atm' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' : m === 'itm' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'; })()}`}>{(() => { const m = getMoneyness(rp); return m.toUpperCase(); })()}</span>
                                  </div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>净权利金 {formatCurrency(rp.best_net_premium, currencyConfig)}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-xs ${themes[theme].text} opacity-75`}>杠杆</p>
                                <p className={`text-sm font-semibold ${themes[theme].text}`}>{rp.leverage}</p>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  onClick={() => handleSavePlan(rp)}
                                  disabled={savingIds[`${rp.plan.label}-${rp.plan.expiry}`] || rp.saved}
                                  className={`px-2 py-1 rounded text-xs ${rp.saved ? 'bg-green-600 text-white' : themes[theme].primary}`}
                                >
                                  {rp.saved ? '已保存' : (savingIds[`${rp.plan.label}-${rp.plan.expiry}`] ? '保存中...' : '保存计划')}
                                </button>
                              </div>
                            </div>
                            <div className={`${themes[theme].card} rounded-lg shadow-lg border ${themes[theme].border} absolute z-10 top-2 left-2 w-[24rem] max-w-[90vw] hidden group-hover:block p-4 pointer-events-none`}>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入腿</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis.buy_strike.name}</p>
                                  <p className={`text-xs ${themes[theme].text} opacity-60`}>代码 {rp.analysis.buy_strike.code}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出腿</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis.sell_strike.name}</p>
                                  <p className={`text-xs ${themes[theme].text} opacity-60`}>代码 {rp.analysis.sell_strike.code}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入价格</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{formatCurrency(rp.buy_price, currencyConfig)}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出价格</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{formatCurrency(rp.sell_price, currencyConfig)}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入合约数</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis.buy_count}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出合约数</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis.sell_count}</p>
                                </div>
                              </div>
                              <div className={`mt-3 ${themes[theme].card} rounded p-3 border ${themes[theme].border}`}>
                                <p className={`text-sm ${themes[theme].text}`}>{rp.reason}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-red-500" />
                        <span className={`text-sm font-medium ${themes[theme].text}`}>Put ({groupedByExpiry[exp].filter(p => p.plan.option_type === 'put').length})</span>
                      </div>
                      <div className="space-y-3">
                        {groupedByExpiry[exp]
                          .filter((rp) => rp.plan.option_type === 'put')
                          .filter(filterPlan)
                          .sort(sortPlans)
                          .map((rp, idx) => (
                          <div key={`ratio-put-${exp}-${idx}`} className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border} relative group ${getPlanColor(rp)}`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <Target className="w-4 h-4 text-purple-500" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className={`text-sm font-semibold ${themes[theme].text}`}>{rp.plan.label}</h3>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rp.action === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : rp.action === 'close' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'}`}>{rp.action}</span>
                                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${(() => { const m = getMoneyness(rp); return m === 'atm' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' : m === 'itm' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'; })()}`}>{(() => { const m = getMoneyness(rp); return m.toUpperCase(); })()}</span>
                                  </div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>净权利金 {formatCurrency(rp.best_net_premium, currencyConfig)}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-xs ${themes[theme].text} opacity-75`}>杠杆</p>
                                <p className={`text-sm font-semibold ${themes[theme].text}`}>{rp.leverage}</p>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  onClick={() => handleSavePlan(rp)}
                                  disabled={savingIds[`${rp.plan.label}-${rp.plan.expiry}`] || rp.saved}
                                  className={`px-2 py-1 rounded text-xs ${rp.saved ? 'bg-green-600 text-white' : themes[theme].primary}`}
                                >
                                  {rp.saved ? '已保存' : (savingIds[`${rp.plan.label}-${rp.plan.expiry}`] ? '保存中...' : '保存计划')}
                                </button>
                              </div>
                            </div>
                            <div className={`${themes[theme].card} rounded-lg shadow-lg border ${themes[theme].border} absolute z-10 top-2 left-2 w-[24rem] max-w-[90vw] hidden group-hover:block p-4 pointer-events-none`}>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入腿</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis.buy_strike.name}</p>
                                  <p className={`text-xs ${themes[theme].text} opacity-60`}>代码 {rp.analysis.buy_strike.code}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出腿</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis.sell_strike.name}</p>
                                  <p className={`text-xs ${themes[theme].text} opacity-60`}>代码 {rp.analysis.sell_strike.code}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入价格</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{formatCurrency(rp.buy_price, currencyConfig)}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出价格</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{formatCurrency(rp.sell_price, currencyConfig)}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入合约数</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis.buy_count}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出合约数</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis.sell_count}</p>
                                </div>
                              </div>
                              <div className={`mt-3 ${themes[theme].card} rounded p-3 border ${themes[theme].border}`}>
                                <p className={`text-sm ${themes[theme].text}`}>{rp.reason}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoadingRatio && !ratioError && ratioPlans.length === 0 && (
            <div className="text-center py-12">
              <FileText className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>暂无比率价差计划</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>请调整参数或稍后重试</p>
            </div>
          )}
        </div>
      </div>
      {/* Header */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-blue-500" />
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                Options Trade Plans
              </h2>
            </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>标的</span>
                {availableSymbols.length > 0 ? (
                  <select
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                    disabled={isLoadingSymbols}
                  >
                    <option value="">请选择标的</option>
                    {availableSymbols.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.trim())}
                    className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="例如: SPY"
                  />
                )}
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary}`}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Plan
              </button>
            </div>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="p-6 border-b border-gray-200">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
                Create New Trade Plan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Symbol
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedSymbol}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="SPY"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Strategy
                  </label>
                  <select className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="long_call">Long Call</option>
                    <option value="long_put">Long Put</option>
                    <option value="covered_call">Covered Call</option>
                    <option value="protective_put">Protective Put</option>
                    <option value="bull_call_spread">Bull Call Spread</option>
                    <option value="bear_put_spread">Bear Put Spread</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Strike Price
                  </label>
                  <input
                    type="number"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="450"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Target Price
                  </label>
                  <input
                    type="number"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="8.00"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Quantity
                  </label>
                  <input
                    type="number"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="5"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                  Notes
                </label>
                <textarea
                  className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  rows={3}
                  placeholder="Enter your trading strategy notes..."
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowAddForm(false)}
                  className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
                >
                  Cancel
                </button>
                <button className={`px-4 py-2 rounded-md ${themes[theme].primary}`}>
                  Create Plan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trade Plans List */}
        <div className="p-6">
          <div className="space-y-4">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    {getTypeIcon(plan.type)}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                          {plan.symbol} {plan.strike} {plan.type.toUpperCase()}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(plan.status)}`}>
                          {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                        </span>
                      </div>
                      <p className={`text-sm ${themes[theme].text} opacity-75`}>
                        {plan.strategy} • Exp: {new Date(plan.expiry).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm ${themes[theme].text} opacity-75`}>
                      Created: {new Date(plan.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>Target Price</p>
                    <p className={`text-sm font-medium ${themes[theme].text}`}>
                      {formatCurrency(plan.targetPrice, currencyConfig)}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>Stop Loss</p>
                    <p className={`text-sm font-medium ${themes[theme].text}`}>
                      {plan.stopLoss ? formatCurrency(plan.stopLoss, currencyConfig) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>Quantity</p>
                    <p className={`text-sm font-medium ${themes[theme].text}`}>
                      {plan.quantity} contracts
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>Total Value</p>
                    <p className={`text-sm font-medium ${themes[theme].text}`}>
                      {formatCurrency(plan.targetPrice * plan.quantity * 100, currencyConfig)}
                    </p>
                  </div>
                </div>

                {plan.notes && (
                  <div className={`${themes[theme].card} rounded-lg p-3 mt-3`}>
                    <p className={`text-sm ${themes[theme].text}`}>{plan.notes}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-3">
                  {plan.status === 'pending' && (
                    <>
                      <button className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}>
                        Edit
                      </button>
                      <button className={`px-3 py-1 rounded-md text-sm bg-green-600 text-white hover:bg-green-700`}>
                        Execute
                      </button>
                    </>
                  )}
                  {plan.status === 'active' && (
                    <button className={`px-3 py-1 rounded-md text-sm bg-red-600 text-white hover:bg-red-700`}>
                      Close Position
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filteredPlans.length === 0 && (
              <div className="text-center py-12">
                <FileText className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
                <p className={`text-lg font-medium ${themes[theme].text}`}>No trade plans found</p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>
                  {filter === 'all' 
                    ? 'Create your first options trade plan'
                    : `No ${filter} trade plans found`
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}